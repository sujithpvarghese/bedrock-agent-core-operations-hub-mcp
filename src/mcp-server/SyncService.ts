import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";
import { DynamoDBService } from "../services/DynamoDBService";
import { config } from "../config";

const IS_MOCK = process.env.USE_MOCKS !== "false";

// Module-level state for mock retries. 
// Keyed by correlationId to prevent state leakage across different user requests.
const syncAttempts = new Map<string, number>();

export const logic = async ({ productId, skuId, syncType }: any, { correlationId }: { correlationId: string }) => {
  const target = productId ?? skuId ?? "unknown";
  logger.info(`MCP_TOOL_CALL_triggerAutoSync_${syncType}`, { target, correlationId });
  const syncId = `sync-${syncType}-${Date.now()}`;

  // Session-scoped keying
  const sessionKey = `${correlationId}:${target}`;
  const attempt = (syncAttempts.get(sessionKey) || 0) + 1;
  syncAttempts.set(sessionKey, attempt);

  // Auto-cleanup to prevent memory leaks on warm containers
  if (attempt === 1) {
    setTimeout(() => syncAttempts.delete(sessionKey), 60000); // Clear after 1 minute
  }

  if (IS_MOCK) {
    if (target === "prod777" && attempt === 1) {
      throw new Error("HTTP_503_SERVICE_UNAVAILABLE: Upstream sync-bus is temporarily overwhelmed.");
    }

    if ((target === "prod_dlq" || target === "prod_l2") && attempt >= 3) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          syncId,
          status: "SYNC_FAILED",
          errorCode: "PERSISTENT_DB_LOCK",
          message: "Sync failed critically after multiple retries. Systemic infrastructure issue suspected."
        })}],
        isError: true
      };
    }
    await new Promise(r => setTimeout(r, 500));

    const isSimulatedFailure = target === "prod-failure";

    if (isSimulatedFailure) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          syncId,
          status: "SYNC_FAILED",
          syncType,
          target,
          errorCode: "CONSUMERDATABASETIMEOUTEXCEPTION",
          message: "Sync failed — DLQ message detected. Call queryGuide for resolution.",
        })}],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify({
        syncId,
        status: "SYNC_TRIGGERED",
        syncType,
        target,
        estimatedCompletionMs: 500,
        message: "Sync job dispatched. Call verifyWebState after ~1 second to confirm.",
      })}]
    };
  }

  // Live sync logic for Production
  try {
    const webItem = await DynamoDBService.getItem<any>(config.DDB_TABLE_WEB, { productId });
    if (!webItem) {
      return { 
        content: [{ type: "text", text: JSON.stringify({ syncId, status: "SYNC_FAILED", error: "Product not found on Web Store" }) }],
        isError: true 
      };
    }

    let updatedFields: Record<string, any> = {};

    if (syncType === "price") {
      const source = await DynamoDBService.getItem<any>(config.DDB_TABLE_PRICING, { productId });
      if (source) updatedFields.webPrice = source.authoritativePrice;
    } 
    else if (syncType === "inventory") {
      // Inventory is per SKU, but we update the product-level webInventory for simplicity in this prototype
      const lookupId = skuId || (webItem.associatedSkus?.[0]);
      if (lookupId) {
        const source = await DynamoDBService.getItem<any>(config.DDB_TABLE_INVENTORY, { skuId: lookupId });
        if (source) updatedFields.webInventory = source.upstreamInventory;
      }
    }
    else if (syncType === "pim") {
      const source = await DynamoDBService.getItem<any>(config.DDB_TABLE_PIM, { productId });
      if (source) {
        // If it's now published and has images, we assume it's recoverable
        if (source.isPublished && source.imageStatus === "COMPLETE") {
           updatedFields.status = "SELLABLE";
           updatedFields.reason = [];
        }
      }
    }

    // Merge changes
    const newItem = { ...webItem, ...updatedFields };

    // Post-Sync Self-Healing Logic: 
    // If the product was NOT_SELLABLE but now has price and inventory, promote it.
    if (newItem.status === "NOT_SELLABLE" && newItem.webPrice > 0 && newItem.webInventory > 0) {
      newItem.status = "SELLABLE";
      newItem.reason = [];
    }

    await DynamoDBService.putItem(config.DDB_TABLE_WEB, newItem);

    return {
      content: [{ type: "text", text: JSON.stringify({
        syncId,
        status: "SYNC_COMPLETE",
        message: `Successfully synchronized ${syncType} for ${productId}. Product is now ${newItem.status}.`,
        updatedFields: Object.keys(updatedFields)
      })}]
    };
  } catch (err: any) {
    logger.error("SYNC_OPERATION_FAILED", err, { productId, syncType });
    return {
      content: [{ type: "text", text: JSON.stringify({
        syncId,
        status: "SYNC_FAILED",
        error: err.message
      })}],
      isError: true
    };
  }
};

export const handler = createToolHandler(TOOL_METADATA.syncService, logic);

import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";
import { DynamoDBService } from "../services/DynamoDBService";
import { config } from "../config";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ skuId, productId }: any, { correlationId }: { correlationId: string }) => {
  logger.info("MCP_TOOL_CALL_checkInventory", { skuId, productId, correlationId });
  
  // Accept either skuId or productId — use whichever is provided
  const lookupId = skuId ?? productId ?? "unknown";

  if (IS_MOCK) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        skuId: lookupId,
        parentProductId: "prod_mock_generic",
        upstreamInventory: 150,
        status: "MATCH_DISPARITY",
        lastSync: new Date().toISOString(),
      })}]
    };
  }

  // Production: Query DynamoDB
  const item = await DynamoDBService.getItem<any>(config.DDB_TABLE_INVENTORY, { skuId: lookupId });
  
  if (!item) {
    return { content: [{ type: "text", text: JSON.stringify({ skuId: lookupId, status: "NOT_FOUND", error: "SKU not found in Inventory system" })}] };
  }

  return { content: [{ type: "text", text: JSON.stringify(item)}] };
};

export const handler = createToolHandler(TOOL_METADATA.inventoryService, logic);

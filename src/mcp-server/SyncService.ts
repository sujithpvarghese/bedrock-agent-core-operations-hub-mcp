import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";

const IS_MOCK = process.env.USE_MOCKS !== "false";

const syncAttempts = new Map<string, number>();

export const logic = async ({ productId, skuId, syncType }: any) => {
  const target = productId ?? skuId ?? "unknown";
  logger.info(`MCP_TOOL_CALL_triggerAutoSync_${syncType}`, { target });
  const syncId = `sync-${syncType}-${Date.now()}`;

  // Track attempts to simulate persistent failures for L2 Detective tests
  const attempt = (syncAttempts.get(target) || 0) + 1;
  syncAttempts.set(target, attempt);

  if (IS_MOCK) {
    // If it's prod777 and it's the 1st attempt, throw a transient 503
    if (target === "prod777" && attempt === 1) {
      throw new Error("HTTP_503_SERVICE_UNAVAILABLE: Upstream sync-bus is temporarily overwhelmed.");
    }

    // If it's prod_dlq and it's the 3rd+ attempt, keep failing to trigger L2
    if ((target === "prod_dlq" || target === "prod_l2") && attempt >= 3) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          syncId,
          status: "SYNC_FAILED",
          errorCode: "PERSISTENT_DB_LOCK",
          message: "Sync failed critically after multiple retries. Systemic infrastructure issue suspected."
        })}]
      };
    }
    // Simulate a realistic async sync delay (500ms) so the Agent doesn't
    // call verifyWebState immediately before sync could possibly complete.
    await new Promise(r => setTimeout(r, 500));

    // Simulate a SUCCESS on first call, FAILURE on specific test product
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
        })}]
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

  // TODO: Replace with real Step Functions startExecution or SQS enqueue
  return {
    content: [{ type: "text", text: JSON.stringify({
      syncId,
      status: "SYNC_TRIGGERED",
      syncType,
      target,
    })}]
  };
};

export const handler = createToolHandler(TOOL_METADATA.syncService, logic);

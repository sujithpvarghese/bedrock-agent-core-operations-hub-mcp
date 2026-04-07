import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ productId, skuId, syncType }: any) => {
  const target = productId ?? skuId ?? "unknown";
  const syncId = `sync-${syncType}-${Date.now()}`;

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "INFO",
    event: "SYNC_TRIGGERED",
    syncId,
    syncType,
    target,
  }));

  if (IS_MOCK) {
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

import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ skuId, productId }: any, { correlationId }: { correlationId: string }) => {
  logger.info("MCP_TOOL_CALL_checkInventory", { skuId, productId, correlationId });
  // Accept either skuId or productId — use whichever is provided
  const lookupId = skuId ?? productId ?? "unknown";

  if (IS_MOCK) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        skuId: lookupId,
        upstreamInventory: 150,
        status: "MATCH_DISPARITY",
        lastSync: new Date().toISOString(),
      })}]
    };
  }
  // Production: Replace with actual Inventory Management System (IMS) API call
  return { content: [{ type: "text", text: JSON.stringify({ skuId: lookupId, status: "AVAILABLE" })}] };
};

export const handler = createToolHandler(TOOL_METADATA.inventoryService, logic);

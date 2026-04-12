import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ productId }: any, { correlationId }: { correlationId: string }) => {
  logger.info("MCP_TOOL_CALL_verifyWebState", { productId, correlationId });
  if (IS_MOCK) {
    // Return the "corrected" state for verification
    const webPrice = (productId === "prod666" || productId === "prod_9982" || productId === "prod000") ? 24.99 : 199.99;
    const webInventory = (productId === "prod000" || productId === "prod_dlq" || productId === "prod_9982" || productId === "prod777") ? 150 : 100;
    
    // Scenario 7 Handoff: If it's prod_l2, it stays NOT_SELLABLE despite sync
    if (productId === "prod_l2") {
      return {
        content: [{ type: "text", text: JSON.stringify({
          productId,
          status: "NOT_SELLABLE",
          reason: ["inventory", "persistent_lock"],
          note: "Web remains out of sync due to persistent infrastructure locks."
        })}]
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({
        productId,
        status: "SELLABLE",
        webPrice,
        webInventory,
        verifiedAt: new Date().toISOString(),
        note: "Post-sync verification successful."
      })}]
    };
  }
  return { content: [{ type: "text", text: JSON.stringify({ productId, status: "SELLABLE" })}] };
};

export const handler = createToolHandler(TOOL_METADATA.verificationService, logic);

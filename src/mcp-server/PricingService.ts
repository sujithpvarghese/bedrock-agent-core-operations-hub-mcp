import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ productId }: any) => {
  logger.info("MCP_TOOL_CALL_checkPricing", { productId });
  if (IS_MOCK) {
    if (productId === "GFT-404") {
      return { content: [{ type: "text", text: JSON.stringify({ productId, authoritativePrice: 0, note: "Valid Gift", currency: "USD" }) }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({
        productId,
        authoritativePrice: 24.99,
        lastUpdated: new Date().toISOString(),
        currency: "USD",
        status: "MATCH_DISPARITY"
      })}]
    };
  }
  return { content: [{ type: "text", text: JSON.stringify({ productId, price: 199.99 }) }] };
};

export const handler = createToolHandler(TOOL_METADATA.pricingService, logic);

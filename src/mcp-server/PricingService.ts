import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ productId }: any) => {
  if (IS_MOCK) {
    return {
      content: [{
        type: "text", text: JSON.stringify({
          productId,
          authoritativePrice: 199.99,
          lastUpdated: new Date().toISOString(),
          currency: "USD",
        })
      }]
    };
  }
  return { content: [{ type: "text", text: JSON.stringify({ productId, price: 199.99 }) }] };
};

export const handler = createToolHandler(TOOL_METADATA.pricingService, logic);

import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ productId }: any) => {
  if (IS_MOCK) {
    const inventory = productId === "prod-002" ? 0 : 100;
    const status = inventory > 0 ? "SELLABLE" : "NOT_SELLABLE";
    return {
      content: [{ type: "text", text: JSON.stringify({
        productId,
        webInventory: inventory,
        webPrice: 199.99,
        status,
        reason: status === "NOT_SELLABLE" ? ["inventory"] : [],
      })}]
    };
  }
  return { content: [{ type: "text", text: JSON.stringify({ productId, status: "SELLABLE", note: "Real logic TBD" })}] };
};

export const handler = createToolHandler(TOOL_METADATA.webDatabaseService, logic);

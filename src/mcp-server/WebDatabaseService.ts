import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ productId }: any, { correlationId }: { correlationId: string }) => {
  logger.info("MCP_TOOL_CALL_checkWebDatabase", { productId, correlationId });
  if (IS_MOCK) {
    if (productId === "prod000") return { content: [{ type: "text", text: JSON.stringify({ productId, webInventory: 0, webPrice: 0, status: "NOT_SELLABLE", reason: ["inventory", "pricing"] })}] };
    if (productId === "prod666") return { content: [{ type: "text", text: JSON.stringify({ productId, webInventory: 100, webPrice: 9.99, status: "SELLABLE", note: "User says price is wrong" }) }] };
    if (productId === "SKU 1029") return { content: [{ type: "text", text: JSON.stringify({ productId, status: "SELLABLE", note: "Recently fixed" }) }] };
    if (productId === "prod_9982") return { content: [{ type: "text", text: JSON.stringify({ productId, webInventory: 0, webPrice: 0, status: "NOT_SELLABLE", reason: ["inventory", "pricing", "pim"] }) }] };
    if (productId === "prod_dlq" || productId === "prod_l2") return { content: [{ type: "text", text: JSON.stringify({ productId, status: "NOT_SELLABLE", reason: ["inventory"] }) }] };
    if (productId === "GFT-404") return { content: [{ type: "text", text: JSON.stringify({ productId, status: "SELLABLE", webPrice: 0, note: "Promotional Gift" }) }] };
    if (productId === "prod777") return { content: [{ type: "text", text: JSON.stringify({ productId, status: "NOT_SELLABLE", reason: ["inventory"] }) }] };
    
    return {
      content: [{ type: "text", text: JSON.stringify({
        productId,
        webInventory: 100,
        webPrice: 199.99,
        status: "SELLABLE",
        reason: [],
      })}]
    };
  }
  return { content: [{ type: "text", text: JSON.stringify({ productId, status: "SELLABLE", note: "Real logic TBD" })}] };
};

export const handler = createToolHandler(TOOL_METADATA.webDatabaseService, logic);

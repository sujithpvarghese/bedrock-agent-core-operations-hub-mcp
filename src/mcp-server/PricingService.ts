import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";
import { DynamoDBService } from "../services/DynamoDBService";
import { config } from "../config";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ productId }: any, { correlationId }: { correlationId: string }) => {
  logger.info("MCP_TOOL_CALL_checkPricing", { productId, correlationId });
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
  
  // Production: Query DynamoDB
  const item = await DynamoDBService.getItem<any>(config.DDB_TABLE_PRICING, { productId });
  
  if (!item) {
    return { content: [{ type: "text", text: JSON.stringify({ productId, status: "NOT_FOUND", error: "Product not found in Pricing system" })}] };
  }

  return { content: [{ type: "text", text: JSON.stringify(item)}] };
};

export const handler = createToolHandler(TOOL_METADATA.pricingService, logic);

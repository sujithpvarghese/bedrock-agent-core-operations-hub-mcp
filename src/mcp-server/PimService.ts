import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";
import { DynamoDBService } from "../services/DynamoDBService";
import { config } from "../config";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ styleId, productId }: any, { correlationId }: { correlationId: string }) => {
  const lookId = styleId ?? productId ?? "unknown";
  logger.info("MCP_TOOL_CALL_checkPimService", { lookId, correlationId });
  if (IS_MOCK) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        productId: lookId,
        isPublished: true,
        productName: "Premium Cotton T-Shirt",
        color: "Blue",
        imageStatus: "COMPLETE",
        status: "MATCH_DISPARITY",
        associatedSkus: ["SKU_MOCK_1", "SKU_MOCK_2"]
      })}]
    };
  }
  
  // Production: Query DynamoDB
  const item = await DynamoDBService.getItem<any>(config.DDB_TABLE_PIM, { productId: lookId });
  
  if (!item) {
    return { content: [{ type: "text", text: JSON.stringify({ productId: lookId, status: "NOT_FOUND", error: "Product not found in PIM system" })}] };
  }

  return { content: [{ type: "text", text: JSON.stringify(item)}] };
};

export const handler = createToolHandler(TOOL_METADATA.pimService, logic);

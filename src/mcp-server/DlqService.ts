import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ productId }: any) => {
  logger.info("MCP_TOOL_CALL_checkDeadLetterQueue", { productId });
  if (IS_MOCK) {
    if (productId === "prod_dlq" || productId === "prod_l2") {
      return { content: [{ type: "text", text: JSON.stringify({ inDLQ: true, errorCode: "ConsumerDatabaseTimeoutException" }) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify({ inDLQ: false }) }] };
  }
  // TODO: SQS/DLQ check
  return { content: [{ type: "text", text: JSON.stringify({ productId, inDLQ: false })}] };
};

export const handler = createToolHandler(TOOL_METADATA.dlqService, logic);

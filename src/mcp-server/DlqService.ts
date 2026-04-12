import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ productId }: any, { correlationId }: { correlationId: string }) => {
  logger.info("MCP_TOOL_CALL_checkDeadLetterQueue", { productId, correlationId });
  if (IS_MOCK) {
    if (productId === "prod_dlq" || productId === "prod_l2") {
      return { content: [{ type: "text", text: JSON.stringify({ inDLQ: true, errorCode: "ConsumerDatabaseTimeoutException" }) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify({ inDLQ: false }) }] };
  }
  // Production: Replace with actual Amazon SQS ReceiveMessage or CloudWatch Metrics check
  return { content: [{ type: "text", text: JSON.stringify({ productId, inDLQ: false })}] };
};

export const handler = createToolHandler(TOOL_METADATA.dlqService, logic);

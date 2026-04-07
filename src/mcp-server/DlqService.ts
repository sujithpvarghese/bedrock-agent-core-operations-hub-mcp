import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const handler = createToolHandler(TOOL_METADATA.dlqService, async ({ productId }) => {
  if (IS_MOCK) {
    const inDLQ = productId === "prod-002";
    return {
      content: [{ type: "text", text: JSON.stringify({
        productId,
        inDLQ,
        errorCode: inDLQ ? "CONSUMERDATABASETIMEOUTEXCEPTION" : null,
        messageId: inDLQ ? "msg-88721" : null,
      })}]
    };
  }
  // TODO: SQS/DLQ check
  return { content: [{ type: "text", text: JSON.stringify({ productId, inDLQ: false })}] };
});

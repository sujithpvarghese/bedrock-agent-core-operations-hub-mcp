import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";
import { deleteMemory } from "../memory";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ productId }: any, { correlationId }: { correlationId: string }) => {
  logger.info("MCP_TOOL_CALL_deleteMemoryByProductId", { productId, correlationId });
  if (IS_MOCK) {
    return {
      content: [{ type: "text", text: JSON.stringify({ memoryContentId: productId, deleted: true, note: "Mock mode — no real memory was deleted" })}]
    };
  }
  const deleted = await deleteMemory(productId);
  return { content: [{ type: "text", text: JSON.stringify({ memoryRecordId: productId, deleted })}] };
};

export const handler = createToolHandler(TOOL_METADATA.memoryDeleteService, logic);

import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { listAllMemories } from "../memory";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const handler = createToolHandler(TOOL_METADATA.memoryListService, async ({ productId }) => {
  if (IS_MOCK) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        productId: productId ?? "ALL",
        memories: productId === "prod000" ? [
          { memoryRecordId: "mem-1", content: "Product: prod000 | Outcome: SELLABLE", createdAt: "2024-03-20T12:00:00Z" }
        ] : [],
        count: productId === "prod000" ? 1 : 0,
      })}]
    };
  }
  const memories = await listAllMemories(productId);
  return { content: [{ type: "text", text: JSON.stringify({ productId: productId ?? "ALL", memories, count: memories.length })}] };
});

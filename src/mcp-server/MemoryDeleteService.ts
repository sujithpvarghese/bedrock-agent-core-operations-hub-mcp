import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { deleteMemory } from "../memory";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const handler = createToolHandler(TOOL_METADATA.memoryDeleteService, async ({ memoryContentId }) => {
  if (IS_MOCK) {
    return {
      content: [{ type: "text", text: JSON.stringify({ memoryContentId, deleted: true, note: "Mock mode — no real memory was deleted" })}]
    };
  }
  const deleted = await deleteMemory(memoryContentId);
  return { content: [{ type: "text", text: JSON.stringify({ memoryContentId, deleted })}] };
});

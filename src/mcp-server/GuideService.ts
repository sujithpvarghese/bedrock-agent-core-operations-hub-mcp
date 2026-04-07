import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const handler = createToolHandler(TOOL_METADATA.guideService, async ({ errorCode }) => {
  if (IS_MOCK) {
    if (errorCode === "CONSUMERDATABASETIMEOUTEXCEPTION") {
      return {
        content: [{ type: "text", text: JSON.stringify({
          errorCode,
          resolution: "The consumer database was overwhelmed. Traces show a lock contention. Resolution: Trigger a manual PIM sync to refresh the state cache then verify.",
          confidence: 0.98,
        })}]
      };
    }
  }
  // TODO: RAG-based guide search
  return { content: [{ type: "text", text: JSON.stringify({ errorCode, resolution: "Standard retry recommended." })}] };
});

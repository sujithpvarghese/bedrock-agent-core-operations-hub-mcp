import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const handler = createToolHandler(TOOL_METADATA.pimService, async ({ styleId }) => {
  if (IS_MOCK) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        styleId,
        isPublished: true,
        productName: "Sample Product",
        color: "Blue",
        imageStatus: "COMPLETE",
      })}]
    };
  }
  // TODO: Real PIM lookup
  return { content: [{ type: "text", text: JSON.stringify({ styleId, status: "PUBLISHED" })}] };
});

import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const handler = createToolHandler(TOOL_METADATA.verificationService, async ({ productId }) => {
  if (IS_MOCK) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        productId,
        status: "SELLABLE",
        verifiedAt: new Date().toISOString(),
      })}]
    };
  }
  // TODO: Live DB status check
  return { content: [{ type: "text", text: JSON.stringify({ productId, status: "SELLABLE" })}] };
});

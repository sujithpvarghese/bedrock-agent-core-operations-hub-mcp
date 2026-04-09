import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ styleId, productId }: any) => {
  const lookId = styleId ?? productId ?? "unknown";
  if (IS_MOCK) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        styleId: lookId,
        isPublished: true,
        productName: "Premium Cotton T-Shirt", // Matching the agent's old mock
        color: "Blue",
        imageStatus: "COMPLETE",
        status: "MATCH_DISPARITY"
      })}]
    };
  }
  // TODO: Real PIM lookup
  return { content: [{ type: "text", text: JSON.stringify({ styleId: lookId, status: "PUBLISHED" })}] };
};

export const handler = createToolHandler(TOOL_METADATA.pimService, logic);

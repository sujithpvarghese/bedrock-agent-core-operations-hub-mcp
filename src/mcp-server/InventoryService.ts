import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ skuId, productId }: any) => {
  // Accept either skuId or productId — use whichever is provided
  const lookupId = skuId ?? productId ?? "unknown";

  if (IS_MOCK) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        skuId: lookupId,
        globalStock: 50,
        status: "AVAILABLE",
        fulfillmentCenters: ["FC-01", "FC-05"],
      })}]
    };
  }
  // TODO: Real inventory service call using lookupId
  return { content: [{ type: "text", text: JSON.stringify({ skuId: lookupId, status: "AVAILABLE" })}] };
};

export const handler = createToolHandler(TOOL_METADATA.inventoryService, logic);

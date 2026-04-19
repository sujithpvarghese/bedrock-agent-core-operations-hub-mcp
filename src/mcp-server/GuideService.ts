import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";

const IS_MOCK = process.env.USE_MOCKS !== "false";

export const logic = async ({ errorCode, query }: any, { correlationId }: { correlationId: string }) => {
  logger.info("MCP_TOOL_CALL_queryGuide", { query, correlationId });
  if (IS_MOCK) {
    if (errorCode?.toUpperCase().includes("TIMEOUT") || errorCode === "ConsumerDatabaseTimeoutException") {
      return {
        content: [{ type: "text", text: JSON.stringify({
          errorCode,
          resolution: "Transient DB lock. Safe to retry sync immediately.",
          confidence: 0.98,
        })}]
      };
    }

    if (errorCode === "OPERATIONAL_POLICY_ERROR") {
      return {
        content: [{ type: "text", text: JSON.stringify({
          errorCode,
          resolution: "Automated syncs are forbidden from Friday 4PM through Monday morning. DO NOT RETRY. Escalate to manual ops or schedule for Monday.",
          confidence: 1.0,
        })}],
        isError: true,
      };
    }
  }
  return { content: [{ type: "text", text: JSON.stringify({ errorCode, resolution: "Standard retry recommended." })}] };
};

export const handler = createToolHandler(TOOL_METADATA.guideService, logic);

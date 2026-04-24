import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";
import { ApprovalService } from "../services/ApprovalService";

export const logic = async ({ approvalId }: any, { correlationId }: { correlationId: string }) => {
  logger.info("MCP_TOOL_CALL_approveAction", { approvalId, correlationId });

  try {
    await ApprovalService.updateStatus(approvalId, "APPROVED");
    return {
      content: [{ 
        type: "text", 
        text: JSON.stringify({
          status: "SUCCESS",
          message: `Action ${approvalId} has been successfully APPROVED. You may now proceed with the original tool execution.`
        })
      }]
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `ERROR: ${err.message}` }],
      isError: true
    };
  }
};

export const handler = createToolHandler(TOOL_METADATA.approvalUpdateService, logic);

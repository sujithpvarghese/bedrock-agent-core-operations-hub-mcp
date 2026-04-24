import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { logger } from "../logger";
import { ApprovalService } from "../services/ApprovalService";

export const logic = async (_args: any, { correlationId }: { correlationId: string }) => {
  logger.info("MCP_TOOL_CALL_listPendingApprovals", { correlationId });

  const pending = await ApprovalService.listPendingForSession(correlationId);

  return {
    content: [{ 
      type: "text", 
      text: JSON.stringify({
        count: pending.length,
        approvals: pending.map(a => ({
          approvalId: a.approvalId,
          action: a.action,
          productId: a.productId,
          summary: `Pending ${a.action} for ${a.productId} (Created: ${a.createdAt})`
        }))
      })
    }]
  };
};

export const handler = createToolHandler(TOOL_METADATA.approvalListService, logic);

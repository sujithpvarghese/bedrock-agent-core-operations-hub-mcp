import { createToolHandler } from "../mcp-server-factory";
import { TOOL_METADATA } from "../mcp-tools";
import { Agent, BedrockModel, FunctionTool } from "@strands-agents/sdk";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { logger } from "../logger";
import { config } from "../config";


/**
 * L2 Detective Sub-Agent — MCP Server
 *
 * Exposes a single MCP tool: `delegateToL2Detective`
 * The main OpsHub agent calls this when sync fails twice.
 * The L2 Detective internally uses CloudTrail + Jira tools
 * to find the infrastructure root cause.
 *
 * Keeping this as a separate Lambda means:
 * - L2 investigations don't affect main agent timeout budget
 * - Can be scaled / updated independently
 * - Clear separation — L2 is a specialist, not part of triage
 */


// ─────────────────────────────────────────────
// Sub-Agent interfaces
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// L2 Detective's internal tools
// ─────────────────────────────────────────────
const cwClient = new CloudWatchLogsClient({ region: process.env.AWS_REGION || "us-east-1" });
const IS_MOCK = process.env.USE_MOCKS !== "false";

const checkCloudTrailLogs = new FunctionTool({
  name: "checkCloudTrailLogs",
  description: "Queries AWS CloudWatch Logs for systemic infrastructure errors. Searches the last 15 minutes by default.",
  inputSchema: { 
    type: "object", 
    properties: { 
      targetId: { type: "string", description: "The product ID or target identifier to search for." },
      logGroupName: { type: "string", description: "Optional log group to search. Defaults to standard operations hub logs." }
    } 
  },
  callback: async ({ targetId, logGroupName }: any) => {
    logger.info("LOG_QUERY_START", { targetId, logGroupName });

    if (IS_MOCK) {
      return {
        logs: "WARNING: DynamoDB write throttling detected on Table WebSystemProd. TargetId: " + targetId,
      };
    }

    try {
      const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
      // Default to searching the current service's log groups if not provided
      const targetLogGroup = logGroupName || process.env.WEB_DB_LOG_GROUP || "/aws/lambda/bedrock-agent-core-ops-mcp-dev-checkWebDatabase";
      
      const response = await cwClient.send(new FilterLogEventsCommand({
        logGroupName: targetLogGroup,
        startTime: fifteenMinutesAgo,
        filterPattern: targetId ? `"${targetId}" ERROR` : "ERROR",
        limit: 5
      }));

      const events = response.events || [];
      if (events.length === 0) {
        return { logs: "No error logs found for target in the last 15 minutes." };
      }

      return {
        logs: events.map(e => `[${new Date(e.timestamp || 0).toISOString()}] ${e.message || ""}`).join("\n"),
        count: events.length
      } as any;
    } catch (err: any) {
      logger.error("LOG_QUERY_FAILED", err);
      return { logs: "Failed to query CloudWatch logs: " + err.message };
    }
  },
});

const checkJiraCommits = new FunctionTool({
  name: "checkJiraCommits",
  description: "Queries Jira for recent deployments or config changes that may have caused the issue.",
  inputSchema: { type: "object", properties: { component: { type: "string" } } },
  callback: async () => ({
    recentCommits: "PR #404 merged: Lowered DynamoDB WCU limits to save costs.",
  }),
});

// ─────────────────────────────────────────────
// L2 Detective Agent
// ─────────────────────────────────────────────
const l2DetectiveAgent = new Agent({
  name: "L2Detective",
  model: new BedrockModel({
    modelId: config.L2_MODEL_ID,
    region: config.AWS_REGION,
  }),
  tools: [checkCloudTrailLogs, checkJiraCommits],
  systemPrompt: `You are an L2 Cloud Infrastructure Detective. You find the root cause of systemic outages.
  Check CloudWatch Logs for infrastructure errors, then check Jira for recent code changes that might explain them.
  Log groups follow the convention: "/aws/lambda/bedrock-agent-core-ops-mcp-dev-<toolName>".
  For Web System issues, search "/aws/lambda/bedrock-agent-core-ops-mcp-dev-checkWebDatabase".
  Return a 2-sentence definitive root-cause diagnosis.`,
});

// ─────────────────────────────────────────────
// MCP Server — exposes delegateToL2Detective
// ─────────────────────────────────────────────
export const logic = async (input: any) => {
  const { errorCode, targetProduct } = input;
  logger.info("MCP_TOOL_CALL_delegateToL2Detective", { errorCode, targetProduct });
  logger.info("A2A_HANDOFF", { to: "L2Detective", errorCode, targetProduct });
  const investigation = await l2DetectiveAgent.invoke(
    `Find root cause for error: ${errorCode} on ${targetProduct ?? "system"}`
  );
  logger.info("A2A_COMPLETE", { verdict: investigation.toString().slice(0, 100) });
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ l2Verdict: investigation.toString() }),
    }],
  };
};

export const handler = createToolHandler(TOOL_METADATA.l2DetectiveService, logic);

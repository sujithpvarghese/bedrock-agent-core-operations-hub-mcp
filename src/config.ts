import { z } from "zod";

/**
 * Validates and exports environment configuration.
 * Hardcoded defaults allow for "Zero-Config" local development/evaluation.
 * Values can be overridden by environment variables in AWS Lambda.
 */

const envSchema = z.object({
  AWS_REGION: z.string().default("us-east-1"),
  USE_MOCKS: z.string().transform((v) => v !== "false").default("true"),
  DEBUG_LOGS: z.string().transform((v) => v !== "false").default("true"),
  AGENTCORE_MEMORY_ID: z.string().default("mock-valid-id-1234567890"),
  AGENTCORE_NAMESPACE: z.string().default("operations-hub"),
  MCP_SERVER_URLS: z.string().optional().transform((v) => {
    if (!v) return new Map<string, string>();
    const mapping = new Map<string, string>();
    v.split(",").map(i => i.trim()).forEach(item => {
      const [key, ...urlParts] = item.split(":");
      if (key && urlParts.length > 0) {
        mapping.set(key, urlParts.join(":"));
      }
    });
    return mapping;
  }),
  WEB_DB_LOG_GROUP: z.string().optional(),
  AGENT_MODEL_ID: z.string().default("us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
  MAX_TOOL_CALLS: z.string().transform((v) => parseInt(v, 10)).default("15"),
  INTERNAL_KEY: z.string().optional(),
  L2_MODEL_ID: z.string().default("us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
  EVAL_CLAUDE_MODEL_ID: z.string().default("us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
  EVAL_NOVA_MODEL_ID: z.string().default("us.amazon.nova-pro-v1:0"),
  ANTHROPIC_VERSION: z.string().default("bedrock-2023-05-31"),
});

export const config = envSchema.parse(process.env);

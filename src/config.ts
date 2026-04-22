import { z } from "zod";

/**
 * Validates and exports environment configuration.
 * Hardcoded defaults allow for "Zero-Config" local development/evaluation.
 * Values can be overridden by environment variables in AWS Lambda.
 */

const envSchema = z.object({
  AWS_REGION: z.string().default("us-east-1"),
  USE_MOCKS: z.string().transform((v) => v.toLowerCase() === "true").default("true"),
  DEBUG_LOGS: z.string().transform((v) => v.toLowerCase() === "true").default("true"),
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
  CLASSIFIER_MODEL_ID: z.string().default("us.anthropic.claude-3-haiku-20240307-v1:0"),
  INTERNAL_KEY:      z.string().optional(),
  GUARDRAIL_ID:      z.string().optional(),       // Bedrock Guardrail ID — omit to skip guardrail checks
  GUARDRAIL_VERSION: z.string().default("DRAFT"), // "DRAFT" targets the latest saved version
  L2_MODEL_ID: z.string().default("us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
  EVAL_CLAUDE_MODEL_ID: z.string().default("us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
  EVAL_NOVA_MODEL_ID: z.string().default("us.amazon.nova-pro-v1:0"),
  ANTHROPIC_VERSION: z.string().default("bedrock-2023-05-31"),
  DDB_TABLE_INVENTORY: z.string().default("DiagInventory-dev"),
  DDB_TABLE_PRICING: z.string().default("DiagPricing-dev"),
  DDB_TABLE_PIM: z.string().default("DiagPim-dev"),
  DDB_TABLE_WEB: z.string().default("DiagWeb-dev"),
});

export const config = envSchema.parse(process.env);

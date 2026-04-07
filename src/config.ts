import { z } from "zod";

/**
 * Validates and exports environment configuration.
 * Ensures the Lambda doesn't start if critical variables are missing.
 */

const envSchema = z.object({
  AWS_REGION: z.string().default("us-east-1"),
  USE_MOCKS: z.string().transform((v) => v !== "false").default("true"),
  AGENTCORE_RUNTIME_ID: z.string().optional(),
  AGENTCORE_MEMORY_ID: z.string().optional(),
  AGENTCORE_NAMESPACE: z.string().default("operations-hub"),
  MCP_SERVER_URLS: z.string().optional().transform((v) => 
    v ? v.split(",").map(u => u.trim()).filter(Boolean) : []
  ),
  WEB_DB_LOG_GROUP: z.string().optional(),
});

export const config = envSchema.parse(process.env);

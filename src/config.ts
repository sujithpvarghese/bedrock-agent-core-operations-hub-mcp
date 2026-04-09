import { z } from "zod";

import * as fs from "fs";
import * as path from "path";

/**
 * Validates and exports environment configuration.
 * Ensures the Lambda doesn't start if critical variables are missing.
 */

// Manual .env loading if not already in process.env
try {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, "utf-8");
    envFile.split("\n").forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        if (!process.env[key]) process.env[key] = value;
      }
    });
  }
} catch (e) {
  // Ignore env loading errors
}

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
  AGENT_MODEL_ID: z.string().default("us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
  L2_MODEL_ID: z.string().default("us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
});

export const config = envSchema.parse(process.env);

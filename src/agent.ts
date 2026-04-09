import {
  Agent,
  BedrockModel,
  FunctionTool,
  MessageAddedEvent,
  BeforeToolCallEvent,
  AfterToolCallEvent,
} from "@strands-agents/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  getRelevantMemories,
  storeMemory,
  extractProductId,
} from "./memory";
import { config } from "./config";
import { logger } from "./logger";
import { TOOL_METADATA } from "./mcp-tools";


// ─────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────
const model = new BedrockModel({
  modelId: config.AGENT_MODEL_ID,
  region: config.AWS_REGION,
  stream: false,
});

// ─────────────────────────────────────────────
// Base system prompt — reasoning cycle only
// ─────────────────────────────────────────────
const BASE_SYSTEM_PROMPT = `
  You are an autonomous e-commerce operations hub. Your goal is to diagnose and self-heal product data issues.
  Follow this strict reasoning cycle:

  0. EXTRACT INTENT: Before calling any tool, classify the user's complaint as either GENERIC or SPECIFIC.

     GENERIC complaints (vague availability issues — any system could be the cause):
     - e.g. "not showing on site", "not online", "can't find product", "not visible on web"
     - Action: Do NOT pre-mark any system. Proceed to Step 1 and let checkWebDatabase + its reason array fully drive the investigation.

     SPECIFIC complaints (user has identified a particular data problem):
     - "price is wrong" or "price looks off"     → pre-mark 'pricing' as suspect.
     - "out of stock" or "inventory looks wrong"  → pre-mark 'inventory' as suspect.
     - "wrong name", "wrong image", "wrong description", "not published" → pre-mark 'pim' as suspect.
     - Action: Pre-marked systems MUST be investigated in Step 2, even if checkWebDatabase returns SELLABLE.

  1. CHECK WEB STATE: Call checkWebDatabase to get the current site state (webInventory, webPrice, status, reason).
     - If status is SELLABLE AND the user has NOT stated a specific concern → stop and inform the user, no fix needed.
     - If status is NOT_SELLABLE → use the 'reason' array to identify which systems to investigate.
     - If status is SELLABLE BUT the user stated a specific concern (e.g. "price is wrong") → proceed to step 2 using the user's stated concern as the triage signal instead of the reason array.

  2. INVESTIGATE UPSTREAM: Only call upstream systems that are flagged — either from the 'reason' array OR from the user's stated intent in step 0.
     - inventory flagged → call checkInventory and compare upstream stock vs webInventory.
     - pricing flagged   → call checkPricing and compare upstream price vs webPrice.
     - pim flagged       → call checkPimService and compare upstream metadata vs web metadata.
     - If multiple systems are flagged, call them in parallel.
     - After confirming a disparity, ALSO call checkDeadLetterQueue — a stuck DLQ message may explain WHY the web data is stale.
     - If checkDeadLetterQueue returns inDLQ=true with an errorCode, call queryGuide(errorCode) BEFORE attempting any sync.

  3. REMEDIATE: For each confirmed discrepancy, call triggerAutoSync with the specific syncType ('inventory', 'price', or 'pim'). Make a separate call per system.
     - If triggerAutoSync returns SYNC_FAILED with an errorCode: call queryGuide(errorCode) to get the resolution, then retry triggerAutoSync once.
     - If it fails a second time, do NOT retry again. Instead, escalate and report the error code and guide resolution to the user.

  4. VERIFY: After ALL syncs are complete, ALWAYS call verifyWebState to confirm the fix worked.

  5. SUMMARIZE: Report what the web showed, what the user flagged, what upstream confirmed, what was synced, and the final verified state. IMPORTANT: If you encountered a transient network error (like a 503 or timeout) that required an automatic retry, explicitly mention it in your summary to confirm the self-healing worked.

  MEMORY GUIDANCE: If episodic memory is provided below, use it to:
  - Skip investigation steps you already know the answer to
  - Anticipate which systems are likely broken based on history
  - Apply known resolutions for recurring error codes immediately
  - If memory says a product was recently fixed — go straight to Step 3 (sync) then Step 4 (verify)
`;

// ─────────────────────────────────────────────
// buildSystemPrompt
// Injects real retrieved memories into the prompt.
// ─────────────────────────────────────────────
function buildSystemPrompt(memories: string): string {
  if (!memories) return BASE_SYSTEM_PROMPT;

  return `${BASE_SYSTEM_PROMPT}

  ─────────────────────────────────────
  EPISODIC MEMORY — retrieved from past interactions with this product:
  ${memories}
  
  Use the above history to skip unnecessary steps and apply known fixes faster.
  ─────────────────────────────────────`;
}
// Simulation logic moved to src/mcp-server/ files.

// ─────────────────────────────────────────────
// buildAgent
// Static Discovery: Loads tools from registry, connects on-demand
// ─────────────────────────────────────────────
async function buildAgent(systemPrompt: string, toolsCalled: string[]): Promise<Agent> {
  const serverMap = config.MCP_SERVER_URLS;
  const serviceKeys = Object.keys(TOOL_METADATA);

  // Determine the best JSON Schema target based on the model ID
  // Claude = jsonSchema7, Nova = jsonSchema202012, Llama = openapi3
  let schemaTarget: any = "jsonSchema7";
  if (config.AGENT_MODEL_ID.includes("nova")) schemaTarget = "jsonSchema202012";
  else if (config.AGENT_MODEL_ID.includes("llama")) schemaTarget = "openapi3";

  const tools: FunctionTool[] = serviceKeys.map((serviceKey) => {
    const meta = TOOL_METADATA[serviceKey];
    const serviceUrl = serverMap.get(serviceKey);

    // Fail-fast validation for Production
    if (!config.USE_MOCKS && !serviceUrl) {
      logger.error("MISSING_SERVICE_URL", { serviceKey, toolName: meta.name });
    }

    const inputSchema = zodToJsonSchema(meta.inputSchema, {
      target: schemaTarget,
      additionalProperties: false
    } as any) as any;

    return new FunctionTool({
      name: meta.name,
      description: meta.description,
      inputSchema,
      callback: async (input: any) => {
        if (config.USE_MOCKS) {
          logger.info(`TOOL_SIMULATE_${meta.name}`, { input });
          // Dynamically import the logic from the service file
          // e.g. webDatabaseService -> ./mcp-server/WebDatabaseService
          const fileName = serviceKey.charAt(0).toUpperCase() + serviceKey.slice(1);
          const { logic } = await import(`./mcp-server/${fileName}`);
          const result = await logic(input);
          return result.content || [{ type: "text", text: JSON.stringify(result) }];
        }

        if (!serviceUrl) {
          logger.error(`TOOL_CONFIG_MISSING_${meta.name}`, { serviceKey });
          return [{
            type: "text",
            text: `Tool error: Service URL for ${meta.name} is not configured.`
          }];
        }
        try {
          const mcpUrl = new URL(serviceUrl);
          const transport = new StreamableHTTPClientTransport(mcpUrl);
          const client = new Client(
            { name: "ops-hub-agent", version: "1.0.0" },
            { capabilities: {} }
          );

          await client.connect(transport);
          const result = await client.callTool({
            name: meta.name,
            arguments: input,
          });

          return result.content as any;
        } catch (err: unknown) {
          logger.error(`TOOL_CALL_FAILED_${meta.name}`, err, { input, serviceUrl });
          return [{
            type: "text",
            text: `Tool execution error: ${err instanceof Error ? err.message : String(err)}`
          }];
        }
      }
    });
  });

  logger.info("AGENT_INIT_STATIC", { toolCount: tools.length, serverCount: serverMap.size, mode: config.USE_MOCKS ? "MOCK" : "MCP" });

  const agent = new Agent({
    name: "OperationsHub",
    systemPrompt: systemPrompt,
    model: model,
    tools: tools,
  });

  // Hooks
  agent.addHook(MessageAddedEvent, (event) => {
    logger.info("AGENT_MESSAGE_ADDED", { message: event.message });
  });

  agent.addHook(BeforeToolCallEvent, (event) => {
    toolsCalled.push(event.toolUse.name);
    logger.info("AGENT_TOOL_START", {
      tool: event.toolUse.name,
      id: event.toolUse.toolUseId,
      input: event.toolUse.input
    });

    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const isFridayAfterFour = (day === 5 && hour >= 16);
    const isWeekend = (day === 6 || day === 0);

    if (event.toolUse.name === "triggerAutoSync" && (isFridayAfterFour || isWeekend)) {
      event.cancel = "OPERATIONAL_POLICY_ERROR: Automated syncs are strictly forbidden from Friday 4 PM through Monday morning.";
    }
  });

  agent.addHook(AfterToolCallEvent, (event) => {
    logger.info("AGENT_TOOL_END", {
      tool: event.toolUse.name,
      id: event.toolUse.toolUseId,
      result: event.result
    });

    // Gift Item Logic
    if (event.toolUse.name === "checkPricing") {
      const resultText = JSON.stringify(event.result);
      const isZero = resultText.includes('"price": 0') || resultText.includes('"price": 0.0');
      const { productId } = (event.toolUse.input as any);
      const isGiftSku = productId?.startsWith("GFT-") || productId?.startsWith("SAMPLE-");

      if (isZero && isGiftSku) {
        (event.result as any).content[0].text +=
          "\n\n🚨 BUSINESS_HINT: This is a 'Gift Item'. A 0.00 price is EXPECTED. DO NOT sync.";
      }
    }

    // Transient Error Logic
    const isTransientError =
      event.error?.message.includes("TIMEOUT") ||
      event.error?.message.includes("504") ||
      event.error?.message.includes("503");

    if (isTransientError) {
      const retryKey = `retry_count_${event.toolUse.toolUseId}`;
      const currentRetries = (event.agent.appState.get(retryKey) as number) ?? 0;

      if (currentRetries < 3) {
        event.agent.appState.set(retryKey, currentRetries + 1);
        event.retry = true;
        // Inject a hint for the agent to report the retry
        if (event.result && (event.result as any).content) {
          (event.result as any).content.push({
            type: "text",
            text: `\n\n[SYSTEM_NOTE: This operation was retried due to a transient ${event.error?.message || "error"}. It has now succeeded.]`
          });
        }
      }
    }
  });

  return agent;
}

// Helpers
function extractErrorCodes(summary: string): string[] {
  const errorPattern = /\b(ERR_[A-Z_]+|CONSUMERDATABASETIMEOUTEXCEPTION|TIMEOUT|ERR_INV_\d+)\b/gi;
  const matches = summary.match(errorPattern) ?? [];
  return [...new Set(matches.map(e => e.toUpperCase()))];
}

function extractFinalStatus(summary: string): string {
  if (/SELLABLE/i.test(summary)) return "SELLABLE";
  if (/NOT_SELLABLE/i.test(summary)) return "NOT_SELLABLE";
  if (/escalat|L2|root cause/i.test(summary)) return "ESCALATED";
  return "UNKNOWN";
}

// ─────────────────────────────────────────────
// Public agent interface
// ─────────────────────────────────────────────
export const agent = {
  run: async ({ userPrompt }: { userPrompt: string }) => {
    const toolsCalled: string[] = [];
    const productId = extractProductId(userPrompt);
    const memories = await getRelevantMemories(productId);
    const systemPrompt = buildSystemPrompt(memories);
    const coreAgent = await buildAgent(systemPrompt, toolsCalled);
    const result = await coreAgent.invoke(userPrompt);
    const summary = result.toString();

    await storeMemory({
      productId,
      summary,
      toolsUsed: toolsCalled,
      finalStatus: extractFinalStatus(summary),
      errorCodes: extractErrorCodes(summary),
    });

    return { summary, steps: toolsCalled.map(t => ({ tool: t })) };
  },
};

export const handler = async (event: any) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    if (!body?.textMessage) return { statusCode: 400, body: JSON.stringify({ error: "Missing textMessage" }) };
    const result = await agent.run({ userPrompt: body.textMessage });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error: any) {
    logger.error("EXECUTION_FAILURE", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal Error", message: error.message }) };
  }
};

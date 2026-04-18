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
import { classify, formatHint } from "./classifier";


// Setting up the Bedrock language model configuration
const model = new BedrockModel({
  modelId: config.AGENT_MODEL_ID,
  region: config.AWS_REGION,
  stream: false,
});

// Base system prompt — reasoning cycle only
//
// Architecture Note: The "EXTRACT INTENT" step was deprecated.
// We use a Haiku Few-Shot Classifier to pre-diagnose the issue.
// The following "EXTRACT INTENT" step has been DEPRECATED and removed from the active prompt.
// Instead of passing heavy triage rules to Sonnet (which wastes tokens and risks attention-dilution), 
// we now use a lightweight Claude Haiku Few-Shot Classifier (see classifier.ts) to pre-diagnose the issue.
// Haiku injects a "Pre-Diagnosis Hint" into the context dynamically, saving ~60% in exploratory tool costs.
// 
// OLD STEP 0 (For historical portfolio reference):
// 0. EXTRACT INTENT: Before calling any tool, classify the user's complaint as either GENERIC or SPECIFIC.
//
//    GENERIC complaints (vague availability issues — any system could be the cause):
//    - e.g. "not showing on site", "not online", "can't find product", "not visible on web"
//    - Action: Do NOT pre-mark any system. Proceed to Step 1 and let checkWebDatabase + its reason array fully drive the investigation.
//
//    SPECIFIC complaints (user has identified a particular data problem):
//    - "price is wrong" or "price looks off"     → pre-mark 'pricing' as suspect.
//    - "out of stock" or "inventory looks wrong"  → pre-mark 'inventory' as suspect.
//    - "wrong name", "wrong image", "wrong description", "not published" → pre-mark 'pim' as suspect.
//    - Action: Pre-marked systems MUST be investigated in Step 2, even if checkWebDatabase returns SELLABLE.
// ────────────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `
  You are an autonomous e-commerce operations hub. Your goal is to diagnose and self-heal product data issues.
  
  ── DATA PRIORITY HIERARCHY ──
  When multiple signals conflict, resolve them in this strictly enforced order:
  1. VERIFIED TOOL OUTPUTS (Highest) → Empirical data from checkWebDatabase, checkInventory, etc.
  2. SYSTEM SIGNALS (High)         → The 'reason' array returned by checkWebDatabase.
  3. PRE-DIAGNOSIS HINT (Medium)   → The injected Haiku hint (used only for initial direction).
  4. USER INPUT (Lowest)           → User complaints can be inaccurate. Never trust the user over the tools!

  If a lower-priority signal contradicts a higher-priority signal, you MUST follow the higher-priority signal.

  Follow this strict reasoning cycle:

  1. CHECK WEB STATE: Call checkWebDatabase to get the current site state (webInventory, webPrice, status, reason).
     - If status is SELLABLE AND the user has NOT stated a specific concern → stop and inform the user, no fix needed.
     - If status is NOT_SELLABLE → use the 'reason' array to identify which systems to investigate.
     - If status is SELLABLE BUT the user stated a specific concern (e.g. "price is wrong") → proceed to step 2 using the user's stated concern as the triage signal instead of the reason array.

  2. INVESTIGATE UPSTREAM: Only call upstream systems that are flagged — either from the 'reason' array OR from the injected Pre-Diagnosis Hint.
     - inventory flagged → call checkInventory and compare upstream stock vs webInventory.
     - pricing flagged   → call checkPricing and compare upstream price vs webPrice.
     - pim flagged       → call checkPimService and compare upstream metadata vs web metadata.
     - If multiple systems are flagged, call them in parallel.
     - After confirming a disparity, ALSO call checkDeadLetterQueue — a stuck DLQ message may explain WHY the web data is stale.
     - If checkDeadLetterQueue returns inDLQ=true with an errorCode, call queryGuide(errorCode) BEFORE attempting any sync.
     - NOTE: Even when inDLQ=true, you MUST still call the flagged upstream system (e.g. checkInventory) to confirm the actual data disparity before syncing. The DLQ explains the cause; the upstream check confirms the scope.

  3. REMEDIATE: For each confirmed discrepancy, call triggerAutoSync with the specific syncType ('inventory', 'price', or 'pim'). Make a separate call per system.
     - MANDATORY: Always attempt triggerAutoSync at least once before escalating to delegateToL2Detective, regardless of the Pre-Diagnosis Hint.
     - If triggerAutoSync returns SYNC_FAILED with an errorCode: call queryGuide(errorCode) to get the resolution.
     - If the resolution is to retry, retry triggerAutoSync once.
     - If the errorCode is OPERATIONAL_POLICY_ERROR, do NOT retry. Instead, escalate immediately and report the specific policy restriction to the user.
     - If it fails a second time for other reasons, do NOT retry again. Instead, escalate and report the error code and guide resolution to the user.
     - ESCALATION NOTE: You must have at least one FAILED sync attempt in your history before calling delegateToL2Detective. Do not skip straight to L2.

  4. VERIFY: If and only if you triggered at least one sync in Step 3, call verifyWebState to confirm the fix worked. Skip this step entirely if no sync was triggered (e.g. when the product is already correct by design, like a gift item with a $0 price).

  5. SUMMARIZE: Report what the web showed, what the user flagged, what upstream confirmed, what was synced, and the final verified state.
     - MANDATORY RETRY DISCLOSURE: Scan all tool results for any [SYSTEM_NOTE] tags indicating a retry. If found, your summary MUST include a sentence describing which tool was retried and the transient error it encountered (e.g. '⚠️ RETRY NOTE: triggerAutoSync was automatically retried once due to a transient HTTP 503 error and succeeded.').
     - CONCLUSION: You MUST conclude your report with a separate line using this exact format: 'Final Status: <STATUS>' (where status is SELLABLE, NOT_SELLABLE, or ESCALATED).

  MEMORY GUIDANCE: If episodic memory is provided below, use it to:
  - Skip investigation steps you already know the answer to
  - Anticipate which systems are likely broken based on history
  - Apply known resolutions for recurring error codes immediately
  - If memory says a product was recently fixed — go straight to Step 3 (sync) then Step 4 (verify)
`;

// Injects actual retrieved episodic memories into the system prompt.
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

// Static Discovery: Loads tools from the registry and connects on-demand
async function buildAgent(systemPrompt: string, toolsCalled: string[], correlationId: string): Promise<Agent> {
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
          const result = await logic(input, { correlationId });
          return result.content || [{ type: "text", text: JSON.stringify(result) }];
        }

        if (!serviceUrl) {
          logger.error(`TOOL_CONFIG_MISSING_${meta.name}`, { serviceKey });
          return [{
            type: "text",
            text: `Tool error: Service URL for ${meta.name} is not configured.`
          }];
        }
        const mcpUrl = new URL(serviceUrl);
        const transport = new StreamableHTTPClientTransport(mcpUrl, {
          fetch: (url, init) => {
            const headers = new Headers(init?.headers);
            headers.set("x-correlation-id", correlationId);
            headers.set("Accept", "application/json, text/event-stream");
            return fetch(url, { ...init, headers });
          }
        });
        const client = new Client(
          { name: "ops-hub-agent", version: "1.0.0" },
          { capabilities: {} }
        );
        await client.connect(transport);
        try {
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
        } finally {
          // Always close the client to release HTTP connections on warm containers
          await client.close().catch(() => {});
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
    try {
      logger.info("AGENT_MESSAGE_ADDED", { message: event.message });
    } catch {
      // SDK message objects can contain internal ContentBlock types that don't serialize cleanly
      logger.info("AGENT_MESSAGE_ADDED", { role: (event.message as any)?.role ?? "unknown" });
    }
  });

  agent.addHook(BeforeToolCallEvent, (event) => {
    // Budget Circuit Breaker
    const totalCallsKey = "total_tool_calls_session";
    const currentTotal = (event.agent.appState.get(totalCallsKey) as number) ?? 0;
    const newTotal = currentTotal + 1;
    event.agent.appState.set(totalCallsKey, newTotal);

    if (newTotal > config.MAX_TOOL_CALLS) {
      const errorMsg = `COST_SAFETY_ERROR: Budget circuit breaker tripped! Total tool calls (${newTotal}) exceeded the session limit of ${config.MAX_TOOL_CALLS}. Stopping to prevent excessive Bedrock costs. Please investigate the logs for potential infinite loops.`;
      logger.error("CIRCUIT_BREAKER_TRIPPED", { newTotal, limit: config.MAX_TOOL_CALLS });
      event.cancel = errorMsg;
      return;
    }

    toolsCalled.push(event.toolUse.name);
    logger.info("AGENT_TOOL_START", {
      tool: event.toolUse.name,
      id: event.toolUse.toolUseId,
      input: event.toolUse.input,
      sessionTotal: newTotal
    });

    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const isFridayAfterFour = (day === 5 && hour >= 16);
    const isWeekend = (day === 6 || day === 0);

    if (!config.USE_MOCKS && event.toolUse.name === "triggerAutoSync" && (isFridayAfterFour || isWeekend)) {
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
        const resultContent = (event.result as any).content;
        if (Array.isArray(resultContent) && resultContent[0]?.text !== undefined) {
          resultContent[0].text += 
            "\n🚨 BUSINESS_HINT: This is a 'Gift Item'. A 0.00 price is EXPECTED. DO NOT sync.";
        }
      }
    }

    // Transient Error Logic — only retry networking blips
    const errorMessage = event.error?.message?.toUpperCase() ?? "";
    const isTransientError =
      errorMessage.includes("TIMEOUT") ||
      errorMessage.includes("504") ||
      errorMessage.includes("503") ||
      errorMessage.includes("502") ||
      errorMessage.includes("429"); // Rate limiting is transient

    // Protocol errors like "Not Acceptable" (406) should NEVER be retried
    const isProtocolError = errorMessage.includes("NOT ACCEPTABLE") || errorMessage.includes("406");
    const isPolicyError = errorMessage.includes("OPERATIONAL_POLICY_ERROR");

    if (isTransientError && !isProtocolError && !isPolicyError) {
      const retryKey = `retry_count_${event.toolUse.toolUseId}`;
      const currentRetries = (event.agent.appState.get(retryKey) as number) ?? 0;

      if (currentRetries < 3) {
        event.agent.appState.set(retryKey, currentRetries + 1);
        // Store the error reason so the SUCCESSFUL result can be annotated
        event.agent.appState.set(`retried_reason_${event.toolUse.toolUseId}`, event.error?.message || "transient error");
        event.retry = true;
      }
    }

    // If this is a successful result for a previously-retried tool, log the retry and inject system note
    const retryReason = event.agent.appState.get(`retried_reason_${event.toolUse.toolUseId}`) as string | undefined;
    if (!event.error && retryReason) {
      event.agent.appState.delete(`retried_reason_${event.toolUse.toolUseId}`);
      
      // Log before injection to ensure capture even if the push fails
      logger.info("AGENT_TOOL_RETRIED", {
        tool: event.toolUse.name,
        id: event.toolUse.toolUseId,
        reason: retryReason
      });

      // Inject disclosure into the tool result so the LLM is aware of the silent retry
      const resultContent = (event.result as any).content;
      if (Array.isArray(resultContent) && resultContent[0]?.text !== undefined) {
        resultContent[0].text += 
          `\n\n[SYSTEM_NOTE: This tool was automatically retried once due to a transient error (${retryReason}) and succeeded.]`;
        
        logger.info("RETRY_NOTE_INJECTED", {
          tool: event.toolUse.name,
          contentPreview: resultContent[0].text.slice(-100) 
        });
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
  const s = summary.toUpperCase();
  const statuses = [
    { key: "ESCALATED", pattern: /\bESCALAT[A-Z]*\b|L2|\bROOT CAUSE\b/g },
    { key: "NOT_SELLABLE", pattern: /\bNOT_SELLABLE\b/g },
    { key: "SELLABLE", pattern: /\bSELLABLE\b/g }
  ];

  let latestIndex = -1;
  let finalStatus = "UNKNOWN";

  for (const status of statuses) {
    // Use matchAll to find all occurrences and their indices
    const matches = [...s.matchAll(status.pattern)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const lastIdx = lastMatch.index ?? -1;
      
      if (lastIdx > latestIndex) {
        latestIndex = lastIdx;
        finalStatus = status.key;
      }
    }
  }

  return finalStatus;
}

// Public agent interface
export const agent = {
  run: async ({ userPrompt }: { userPrompt: string }) => {
    const correlationId = `corr-${Math.random().toString(36).substring(2, 10)}`;
    const toolsCalled: string[] = [];
    const productId = extractProductId(userPrompt);
    const memories = await getRelevantMemories(productId);

    // Phase 0: Lightweight Intent Classification (Haiku)
    let systemPromptHint = "";
    const classification = await classify(userPrompt, correlationId);
    if (classification) {
      systemPromptHint = formatHint(classification);
    }

    const systemPrompt = buildSystemPrompt(memories) + systemPromptHint;
    const coreAgent = await buildAgent(systemPrompt, toolsCalled, correlationId);
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
    const headers = event.headers || {};
    const clientKey = headers["x-api-key"] || headers["X-API-KEY"];

    // Basic validation matching SSM parameters
    if (config.INTERNAL_KEY && clientKey !== config.INTERNAL_KEY) {
      logger.warn("UNAUTHORIZED_ACCESS_ATTEMPT", { 
        hasHeader: !!clientKey,
        correlationId: `unauth-${Math.random().toString(36).substring(2, 6)}` 
      });
      return { 
        statusCode: 403, 
        body: JSON.stringify({ 
          error: "Forbidden", 
          message: "Unauthorized: Missing or invalid x-api-key header. Check SSM Parameter Store: /ops-hub/api-key" 
        }) 
      };
    }

    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    if (!body?.textMessage) return { statusCode: 400, body: JSON.stringify({ error: "Missing textMessage" }) };
    const result = await agent.run({ userPrompt: body.textMessage });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error: any) {
    logger.error("EXECUTION_FAILURE", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal Error", message: error.message }) };
  }
};

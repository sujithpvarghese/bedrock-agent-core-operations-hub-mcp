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
  modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  region: config.AWS_REGION,
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

  5. SUMMARIZE: Report what the web showed, what the user flagged, what upstream confirmed, what was synced, and the final verified state.

  MEMORY GUIDANCE: If episodic memory is provided below, use it to:
  - Skip investigation steps you already know the answer to
  - Anticipate which systems are likely broken based on history
  - Apply known resolutions for recurring error codes immediately
  - If memory says a product was recently fixed — go straight to Step 3 (sync) then Step 4 (verify)
`;

// ─────────────────────────────────────────────
// buildSystemPrompt
// Injects real retrieved memories into the prompt.
// If no memories exist — returns base prompt unchanged.
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

// ─────────────────────────────────────────────
// buildAgent
// Static Discovery: Loads tools from registry, connects on-demand
// ─────────────────────────────────────────────
async function buildAgent(systemPrompt: string): Promise<Agent> {
  const mcpUrls = config.MCP_SERVER_URLS;
  const serviceKeys = Object.keys(TOOL_METADATA);

  // 1. Build tool list from static metadata
  const tools: FunctionTool[] = serviceKeys.map((serviceKey, index) => {
    const meta = TOOL_METADATA[serviceKey];
    const serviceUrl = mcpUrls[index];

    return new FunctionTool({
      name: meta.name,
      description: meta.description,
      inputSchema: meta.inputSchema as any,
      callback: async (input: any) => {
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

  logger.info("AGENT_INIT_STATIC", { toolCount: tools.length, serverCount: mcpUrls.length });

  const agent = new Agent({
    name: "OperationsHub",
    systemPrompt: systemPrompt,
    model: model,
    tools: tools,
  });

  // 🕵️ ADD HOOKS TO PEEK INSIDE THE BLACK BOX
  agent.addHook(MessageAddedEvent, (event) => {
    logger.info("AGENT_MESSAGE_ADDED", { message: event.message });
  });

  agent.addHook(BeforeToolCallEvent, (event) => {
    // 🕵️ LOG EVERY TOOL START
    logger.info("AGENT_TOOL_START", {
      tool: event.toolUse.name,
      id: event.toolUse.toolUseId,
      input: event.toolUse.input
    });

    // 🛑 HARD-CORE SAFETY INTERLOCK: "No Change Weekend"
    // Block sync tools from Friday 4 PM through Monday morning
    const now = new Date();
    const day = now.getDay(); // Sunday=0, Friday=5, Saturday=6
    const hour = now.getHours();

    const isFridayAfterFour = (day === 5 && hour >= 16);
    const isWeekend = (day === 6 || day === 0);

    if (event.toolUse.name === "triggerAutoSync" && (isFridayAfterFour || isWeekend)) {
      logger.warn("SAFETY_BLOCK_TRIGGERED", { tool: event.toolUse.name, day, hour });

      // Setting 'cancel' to a string will stop the tool execution 
      // AND tell the AI WHY it was stopped so it can explain to the user.
      event.cancel = "OPERATIONAL_POLICY_ERROR: Automated syncs are strictly forbidden from Friday 4 PM through Monday morning to prevent unmonitored weekend changes. Inform the user of this policy.";
    }
  });

  agent.addHook(AfterToolCallEvent, (event) => {
    // 🕵️ LOG EVERY TOOL END
    logger.info("AGENT_TOOL_END", {
      tool: event.toolUse.name,
      id: event.toolUse.toolUseId,
      result: event.result
    });

    // 🎁 HARD-CORE ENRICHMENT: The "Gift Item" Pattern
    // ... (logic for gift item enrichment)
    if (event.toolUse.name === "checkPricing") {
      const resultText = JSON.stringify(event.result);
      const isZero = resultText.includes('"price": 0') || resultText.includes('"price": 0.0');
      const { productId } = (event.toolUse.input as any);
      const isGiftSku = productId?.startsWith("GFT-") || productId?.startsWith("SAMPLE-");

      if (isZero && isGiftSku) {
        logger.info("VALID_GIFT_ENRICHMENT_APPLIED", { productId });
        (event.result as any).content[0].text +=
          "\n\n🚨 BUSINESS_HINT: This product is confirmed as a 'Gift Item' or 'Sample'. A 0.00 price is EXPECTED. DO NOT trigger a sync or report this as a data discrepancy.";
      }
      else if (isZero && !isGiftSku) {
        logger.warn("POTENTIAL_PRICING_BUG_DETECTED", { productId });
      }
    }

    // 🔧 SELF-HEALING: Stateful Automatic Tool Retry (Max 3)
    // If a tool fails due to a transient network error, we retry without telling the AI.
    const isTransientError =
      event.error?.message.includes("TIMEOUT") ||
      event.error?.message.includes("504") ||
      event.error?.message.includes("503") ||
      JSON.stringify(event.result).includes("TIMEOUT");

    if (isTransientError) {
      // Use the internal 'appState' to track retries for this specific call ID
      const retryKey = `retry_count_${event.toolUse.toolUseId}`;
      const currentRetries = (event.agent.appState.get(retryKey) as number) ?? 0;

      if (currentRetries < 3) {
        logger.warn("AUTO_RETRY_TRIGGERED", {
          tool: event.toolUse.name,
          attempt: currentRetries + 1
        });

        // Increment the count in our internal state for the next turn
        event.agent.appState.set(retryKey, currentRetries + 1);

        // 🔄 Tell the SDK to re-run the tool!
        event.retry = true;
      } else {
        // 🛑 MAX RETRIES EXCEEDED
        logger.error("MAX_RETRIES_EXCEEDED", {
          tool: event.toolUse.name,
          productId: (event.toolUse.input as any).productId
        });

        // ONLY Trigger Auto Sync gets the "Escalation Instruction"
        if (event.toolUse.name === "triggerAutoSync") {
          const history = `ERROR: TOOL_CALL_FAILED after 3 automated internal retries.
History:
- Initial Attempt: Transient Error (Network/Timeout)
- Retry 1: Transient Error (Network/Timeout)
- Retry 2: Transient Error (Network/Timeout)
- Retry 3: Transient Error (Network/Timeout)

🛑 CRITICAL_INSTRUCTION: Distributed self-healing has been exhausted. You MUST now escalate this systemic failure to the 'delegateToL2Detective' tool for root cause analysis.`;

          // Inject the history so Claude understands the gravity of the situation
          (event.result as any).content = [{ type: "text", text: history }];
        }
      }
    }
  });

  return agent;
}

// ─────────────────────────────────────────────
// extractToolsUsed
// Parses which tools were called from agent message history
// ─────────────────────────────────────────────
function extractToolsUsed(messages: any[]): string[] {
  const toolNames: string[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "tool_use" && "name" in block) {
          toolNames.push(block.name);
        }
      }
    }
  }
  return [...new Set(toolNames)];
}

// ─────────────────────────────────────────────
// extractErrorCodes
// Parses any error codes from the agent summary
// Stored in memory so future runs can anticipate them
// ─────────────────────────────────────────────
function extractErrorCodes(summary: string): string[] {
  const errorPattern = /\b(ERR_[A-Z_]+|CONSUMERDATABASETIMEOUTEXCEPTION|TIMEOUT|ERR_INV_\d+)\b/gi;
  const matches = summary.match(errorPattern) ?? [];
  return [...new Set(matches.map(e => e.toUpperCase()))];
}

// ─────────────────────────────────────────────
// extractFinalStatus
// Determines if the agent resolved the issue
// ─────────────────────────────────────────────
function extractFinalStatus(summary: string): string {
  if (/SELLABLE/i.test(summary)) return "SELLABLE";
  if (/NOT_SELLABLE/i.test(summary)) return "NOT_SELLABLE";
  if (/escalat|L2|root cause/i.test(summary)) return "ESCALATED";
  return "UNKNOWN";
}

// ─────────────────────────────────────────────
// Public agent interface
// Used by Lambda handler + evaluator
// ─────────────────────────────────────────────
export const agent = {
  run: async ({ userPrompt }: { userPrompt: string }) => {

    // Step 1: Extract product ID from user message
    const productId = extractProductId(userPrompt);
    logger.info("PRODUCT_EXTRACTED", { productId, userPrompt });

    // Step 2: Retrieve real episodic memories from AgentCore
    // If this product was seen before — agent gets that context
    const memories = await getRelevantMemories(productId);
    if (memories) {
      logger.info("MEMORY_INJECTED", { productId, episodeCount: memories.split("[Episode").length - 1 });
    } else {
      logger.info("MEMORY_NONE", { productId, note: "First time seeing this product" });
    }

    // Step 3: Build dynamic system prompt with real memories
    const systemPrompt = buildSystemPrompt(memories);

    // Step 4: Build and run agent
    const coreAgent = await buildAgent(systemPrompt);
    const result = await coreAgent.invoke(userPrompt);
    const summary = result.toString();

    // Step 5: Store this interaction in AgentCore Memory
    // Future runs for this product will benefit from this episode
    await storeMemory({
      productId,
      summary,
      toolsUsed: extractToolsUsed(coreAgent.messages as Array<{ role: string; content: unknown }>),
      finalStatus: extractFinalStatus(summary),
      errorCodes: extractErrorCodes(summary),
    });

    logger.info("AGENT_COMPLETE", {
      productId,
      finalStatus: extractFinalStatus(summary),
      memoriesUsed: !!memories,
    });

    return {
      summary,
      steps: coreAgent.messages.length > 2 ? [{ tool: "called" }] : [],
    };
  },
};

// ─────────────────────────────────────────────
// Lambda handler
// ─────────────────────────────────────────────
export const handler = async (event: { body: string | Record<string, unknown> }) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;

    if (!body?.textMessage) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing textMessage in request body." }),
      };
    }

    // 5. RUN THE AGENT — The Reasoning Loop starts here
    const result = await agent.run({ userPrompt: body.textMessage as string });

    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error: unknown) {
    logger.error("EXECUTION_FAILURE", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal Agent Error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      }),
    };
  }
};

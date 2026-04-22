/**
 * guardrails.ts — Bedrock Guardrails Integration
 *
 * Two-stage AI safety gate for the Operations Hub:
 *
 *   Stage 1 · INPUT  (runs BEFORE the agent)
 *     - Topic Denial:       Rejects off-topic requests (non-e-commerce queries)
 *     - Prompt Injection:   Blocks jailbreak / instruction-override attempts
 *     - PII Detection:      Anonymizes/blocks customer email, phone, card numbers
 *
 *   Stage 2 · OUTPUT (runs AFTER the agent)
 *     - Contextual Grounding Check: verifies the agent's final summary is
 *       anchored in what the tools actually returned — not hallucinated.
 *       If the agent claims a product is SELLABLE but verifyWebState said
 *       NOT_SELLABLE, the grounding check catches it.
 *
 * Both stages fail OPEN on errors — a Guardrail service outage must
 * never take down the primary diagnostic flow.
 *
 * New API surface:
 *   @aws-sdk/client-bedrock-runtime → ApplyGuardrailCommand
 */

import {
  BedrockRuntimeClient,
  ApplyGuardrailCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { config } from "./config";
import { logger } from "./logger";

const client = new BedrockRuntimeClient({ region: config.AWS_REGION });

// ── Result type ───────────────────────────────────────────────────────────────

export interface GuardrailResult {
  /** true = request/response should proceed normally */
  allowed: boolean;
  /** Raw Guardrail action returned by Bedrock */
  action: "NONE" | "GUARDRAIL_INTERVENED" | "SKIPPED";
  /** Human-readable reason to return to the caller when blocked */
  blockedMessage?: string;
  /** Which policy categories triggered (for structured logging) */
  interventionReasons?: string[];
}

// ── Shared helper ─────────────────────────────────────────────────────────────

function isSkipped(): GuardrailResult {
  return { allowed: true, action: "SKIPPED" };
}

// ── Stage 1: Input Gate ───────────────────────────────────────────────────────

/**
 * Checks the raw user message BEFORE the agent processes it.
 * Returns { allowed: false } with a blockedMessage when Guardrail intervenes.
 */
export async function checkInput(
  userPrompt: string,
  correlationId: string
): Promise<GuardrailResult> {
  if (config.USE_MOCKS || !config.GUARDRAIL_ID) {
    logger.info("GUARDRAIL_INPUT_SKIPPED", {
      correlationId,
      reason: config.USE_MOCKS ? "mock_mode" : "no_guardrail_id",
    });
    return isSkipped();
  }

  try {
    logger.info("GUARDRAIL_INPUT_START", { correlationId });

    const response = await client.send(
      new ApplyGuardrailCommand({
        guardrailIdentifier: config.GUARDRAIL_ID,
        guardrailVersion:    config.GUARDRAIL_VERSION,
        source:              "INPUT",
        content:             [{ text: { text: userPrompt } }],
      })
    );

    if (response.action !== "GUARDRAIL_INTERVENED") {
      logger.info("GUARDRAIL_INPUT_PASSED", { correlationId, action: response.action });
      return { allowed: true, action: response.action ?? "NONE" };
    }

    // --- Build a structured list of intervention reasons ---
    const a   = response.assessments?.[0];
    const reasons: string[] = [];

    if (a?.topicPolicy?.topics?.some(t => t.action === "BLOCKED"))
      reasons.push("off-topic");
    if (a?.contentPolicy?.filters?.some(f => f.action === "BLOCKED"))
      reasons.push("content-policy");
    if (a?.sensitiveInformationPolicy?.piiEntities?.some(p => p.action === "BLOCKED"))
      reasons.push("pii-blocked");
    if (
      a?.wordPolicy?.customWords?.some(w => w.action === "BLOCKED") ||
      a?.wordPolicy?.managedWordLists?.some(w => w.action === "BLOCKED")
    ) reasons.push("word-policy");

    logger.warn("GUARDRAIL_INPUT_BLOCKED", undefined, { correlationId, reasons: reasons.join(",") });

    return {
      allowed:             false,
      action:              "GUARDRAIL_INTERVENED",
      blockedMessage:
        "Request blocked by the Operations Hub policy. Please submit a valid " +
        "e-commerce product operations query (e.g. 'Why is prod000 not showing on site?').",
      interventionReasons: reasons,
    };

  } catch (err) {
    // Fail open — guardrail outage must never block legitimate agent traffic
    logger.error("GUARDRAIL_INPUT_FAILED", err, { correlationId });
    return isSkipped();
  }
}

// ── Stage 2: Output Grounding Check ──────────────────────────────────────────

/**
 * Verifies the agent's final summary is grounded in the tool results.
 *
 * @param agentSummary   - The agent's final natural-language response
 * @param toolResultsLog - Concatenated raw tool outputs collected during the run
 * @param correlationId  - Tracing ID
 *
 * The Bedrock Guardrail `GROUNDING` filter scores how well the output is
 * supported by the provided grounding source. Scores below `threshold`
 * (set on the CloudFormation resource) trigger GUARDRAIL_INTERVENED.
 *
 * We intentionally WARN rather than hard-block on grounding failure — the
 * agent summary is already returned to the user, but an annotation is appended
 * so the operator knows to verify the result manually.
 */
export async function checkOutput(
  agentSummary:   string,
  toolResultsLog: string,
  correlationId:  string
): Promise<GuardrailResult> {
  if (config.USE_MOCKS || !config.GUARDRAIL_ID || !toolResultsLog) {
    logger.info("GUARDRAIL_OUTPUT_SKIPPED", {
      correlationId,
      reason: config.USE_MOCKS ? "mock_mode" : !config.GUARDRAIL_ID ? "no_guardrail_id" : "no_tool_results",
    });
    return isSkipped();
  }

  try {
    logger.info("GUARDRAIL_OUTPUT_START", { correlationId });

    const response = await client.send(
      new ApplyGuardrailCommand({
        guardrailIdentifier: config.GUARDRAIL_ID,
        guardrailVersion:    config.GUARDRAIL_VERSION,
        source:              "OUTPUT",
        content: [
          // The verified facts: what the tools actually returned
          { text: { text: toolResultsLog, qualifiers: ["grounding_source"] } },
          // The claim to verify: what the agent says happened
          { text: { text: agentSummary,   qualifiers: ["guard_content"]    } },
        ],
      })
    );

    if (response.action !== "GUARDRAIL_INTERVENED") {
      logger.info("GUARDRAIL_OUTPUT_PASSED", { correlationId, action: response.action });
      return { allowed: true, action: response.action ?? "NONE" };
    }

    // Extract the grounding score for structured logging
    const groundingFilter = response.assessments?.[0]
      ?.contextualGroundingPolicy?.filters
      ?.find(f => f.type === "GROUNDING");

    const score = groundingFilter?.score ?? 0;

    logger.warn("GUARDRAIL_OUTPUT_UNGROUNDED", undefined, { correlationId, groundingScore: score });

    return {
      allowed:             false,
      action:              "GUARDRAIL_INTERVENED",
      blockedMessage:
        `Agent summary failed grounding verification (score: ${score.toFixed(2)}). ` +
        `The response may not be fully supported by the tool data retrieved. ` +
        `Review the tool call log before acting on this recommendation.`,
      interventionReasons: ["grounding-check-failed"],
    };

  } catch (err) {
    // Fail open
    logger.error("GUARDRAIL_OUTPUT_FAILED", err, { correlationId });
    return isSkipped();
  }
}

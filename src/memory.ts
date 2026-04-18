import {
  BedrockAgentCoreClient,
  BatchCreateMemoryRecordsCommand,
  RetrieveMemoryRecordsCommand,
  ListMemoryRecordsCommand,
  BatchDeleteMemoryRecordsCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import { config } from "./config";
import { logger } from "./logger";

/**
 * AgentCore Memory Service (v3.1 — AWS SDK 3.1022.0 compliant)
 *
 * Wraps all AgentCore Memory API calls in one place.
 * Used by:
 *   - agent.ts        → getRelevantMemories, storeMemory, extractProductId
 *   - mcp-server.ts   → listMemories tool (new Tool 9), deleteMemory tool (new Tool 10)
 *
 * Two memory types:
 *   Session memory  → within one conversation (managed by AgentCore automatically)
 *   Episodic memory → across conversations (what we're wiring here)
 */

// Centralized logs now imported from logger.ts.

// Client setup

let _client: BedrockAgentCoreClient | null = null;

function getAgentCoreClient(): BedrockAgentCoreClient {
  if (!_client) {
    _client = new BedrockAgentCoreClient({
      region: config.AWS_REGION,
    });
  }
  return _client;
}

function getMemoryConfig(): { memoryId: string; namespace: string } {
  if (!config.AGENTCORE_MEMORY_ID) {
    throw new Error("AGENTCORE_MEMORY_ID must be set in environment.");
  }
  return { 
    memoryId: config.AGENTCORE_MEMORY_ID, 
    namespace: config.AGENTCORE_NAMESPACE 
  };
}

// Types
export interface MemoryEntry {
  memoryContentId: string;
  content: string;
  createdAt: string;
  productId?: string;
}

export interface StoreMemoryInput {
  productId: string;
  summary: string;         // what the agent found + did
  toolsUsed: string[];     // which tools were called
  finalStatus: string;     // SELLABLE or NOT_SELLABLE after fix
  errorCodes?: string[];   // any error codes encountered
}

/**
 * Retrieves past episodes relevant to a product.
 * Returns a formatted string ready to inject into the system prompt.
 */
export async function getRelevantMemories(productId: string): Promise<string> {
  try {
    const { memoryId, namespace } = getMemoryConfig();
    if (config.USE_MOCKS) {
      if (productId === "sku 1029" || productId === "1029") {
        return "[Episode 1] SKU 1029 previously had a persistent DynamoDB lock. MANDATORY ACTION: Even if the product appears SELLABLE, you MUST trigger one final inventory sync to permanently clear the infrastructure lock bit and verify.";
      }
      return "";
    }

    const response = await getAgentCoreClient().send(new RetrieveMemoryRecordsCommand({
      memoryId,
      namespace,
      searchCriteria: {
        searchQuery: `Previous issues, fixes, and history for product ${productId}`
      },
      maxResults: 5,  // last 5 relevant episodes
    }));

    if (!response.memoryRecordSummaries?.length) {
      logger.info("MEMORY_EMPTY", { productId });
      return "";
    }

    // Format memories into a readable block for the system prompt
    const formatted = response.memoryRecordSummaries
      .filter(m => m.content?.text)
      .map((m, i) => `[Episode ${i + 1}] ${m.content?.text ?? ""}`)
      .join("\n");

    logger.info("MEMORY_RETRIEVED", { productId, episodeCount: response.memoryRecordSummaries.length });
    return formatted;

  } catch (error: unknown) {
    // Memory retrieval failure must never crash the agent
    // Log and continue — agent runs without memory context
    logger.error("MEMORY_RETRIEVE_FAILED", error, { productId });
    return "";
  }
}

/**
 * Stores what happened for future recall.
 */
export async function storeMemory(input: StoreMemoryInput): Promise<void> {
  try {
    const { memoryId, namespace } = getMemoryConfig();

    if (config.USE_MOCKS) {
      logger.info("MEMORY_STORE_MOCK", { productId: input.productId });
      return;
    }

    // Build a rich, searchable memory content string
    const content = [
      `Product: ${input.productId}`,
      `Outcome: ${input.finalStatus}`,
      `Summary: ${input.summary}`,
      `Tools used: ${input.toolsUsed.join(", ")}`,
      input.errorCodes?.length
        ? `Error codes encountered: ${input.errorCodes.join(", ")}`
        : null,
      `Timestamp: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join(" | ");

    logger.info("MEMORY_STORE", { productId: input.productId, memoryId });

    // Use BatchCreateMemoryRecordsCommand as it replaces single CreateMemory
    await getAgentCoreClient().send(new BatchCreateMemoryRecordsCommand({
      memoryId,
      records: [
        {
          requestIdentifier: `${input.productId}-${Date.now()}`,
          namespaces: [namespace],
          content: { text: content },
          timestamp: new Date(),
        }
      ]
    }));

    logger.info("MEMORY_STORED", { productId: input.productId });

  } catch (error: unknown) {
    // Memory storage failure must never crash the agent
    logger.error("MEMORY_STORE_FAILED", error, { productId: input.productId });
  }
}

/**
 * Returns all stored episodes for a product.
 */
export async function listAllMemories(productId?: string): Promise<MemoryEntry[]> {
  try {
    const { memoryId, namespace } = getMemoryConfig();
    logger.info("MEMORY_LIST", { productId: productId ?? "ALL", memoryId });

    const response = await getAgentCoreClient().send(new ListMemoryRecordsCommand({
      memoryId,
      namespace,
      maxResults: 50, // SCALING_NOTE: Retrieval is capped at 50 records. Matches may be missed if store grows.
    }));

    if (response.memoryRecordSummaries?.length === 50) {
      logger.warn("MEMORY_LIST_TRUNCATED", { 
        message: "Retrieved maximum 50 records. Client-side filtering may exclude relevant newer/older entries.",
        memoryId 
      });
    }

    if (!response.memoryRecordSummaries?.length) {
      return [];
    }

    const entries: MemoryEntry[] = response.memoryRecordSummaries
      .filter(m => {
        // If productId filter provided, only return matching entries
        if (!productId) return true;
        return m.content?.text?.includes(productId);
      })
      .map(m => ({
        memoryContentId: m.memoryRecordId ?? "",
        content: m.content?.text ?? "",
        createdAt: m.createdAt?.toISOString() ?? "",
        productId: extractProductIdFromContent(m.content?.text ?? ""),
      }));

    logger.info("MEMORY_LIST_COMPLETE", { count: entries.length });
    return entries;

  } catch (error: unknown) {
    logger.error("MEMORY_LIST_FAILED", error);
    return [];
  }
}

/**
 * Lets the agent or operator clear a stale memory entry.
 */
export async function deleteMemory(memoryRecordId: string): Promise<boolean> {
  try {
    const { memoryId } = getMemoryConfig();
    logger.info("MEMORY_DELETE", { memoryRecordId });

    await getAgentCoreClient().send(new BatchDeleteMemoryRecordsCommand({
      memoryId,
      records: [{ memoryRecordId }],
    }));

    logger.info("MEMORY_DELETED", { memoryRecordId });
    return true;

  } catch (error: unknown) {
    logger.error("MEMORY_DELETE_FAILED", error, { memoryRecordId });
    return false;
  }
}

/**
 * Parses the product/SKU ID from a user message.
 */
export function extractProductId(userPrompt: string): string {
  // Match common product ID patterns:
  // prod000, prod_9982, prod666, SKU-1029, SKU 1029, style-abc
  const patterns = [
    /\b(prod[_\-]\w+|prod\d+\w*)\b/i, // prod_9982, prod-abc, prod000 — NOT the word "product"
    /\bsku[:\s-]?(\w+)\b/i,           // SKU 1029, SKU-1029, sku:abc
    /\bstyle[:\s-]?(\w+)\b/i,         // style-abc, style: 123
    /\b([A-Z]{2,}-\d+)\b/,            // ABC-123, GFT-404 format
  ];

  for (const pattern of patterns) {
    const match = userPrompt.match(pattern);
    if (match) {
      // If the pattern has a group (like (\w+)), return that group.
      // Otherwise return the whole match.
      const id = match[1] ?? match[0];
      return id.toLowerCase();
    }
  }

  // No product ID found — return a generic key
  return "unknown-product";
}

// ─────────────────────────────────────────────
// extractProductIdFromContent (internal helper)
// Parses product ID from a stored memory string
// ─────────────────────────────────────────────
function extractProductIdFromContent(content: string): string {
  const match = content.match(/Product:\s*([^\s|]+)/i);
  return match?.[1] ?? "unknown";
}

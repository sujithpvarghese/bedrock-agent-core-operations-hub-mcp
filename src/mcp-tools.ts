import { z } from "zod";

/**
 * 📝 MCP Tool Metadata Registry
 *
 * Centralized registry of tool names, descriptions, and Zod input schemas.
 * Each Service Lambda imports its specific metadata from here.
 *
 * Naming convention:
 *   - Keys match service file names (e.g. "inventoryService" → InventoryService.ts)
 *   - Tool `name` is the verb-form the AI sees (e.g. "checkInventory")
 */

export interface ToolMetadata {
  name: string;         // The tool name Claude sees and calls
  description: string;  // The description Claude uses to decide when to call it
  inputSchema: any;     // Zod schema — drives Claude's argument structure
}

export const TOOL_METADATA: Record<string, ToolMetadata> = {

  // ── Operational Services ────────────────────────────────────────────────

  webDatabaseService: {
    name: "checkWebDatabase",
    description: "Checks the live web system for product sellability status. Always call this FIRST.",
    inputSchema: z.object({ productId: z.string().describe("Product ID to check.") }),
  },

  inventoryService: {
    name: "checkInventory",
    description: "Checks global SKU inventory across all fulfillment centers. Accepts either a skuId or productId — pass whichever you have.",
    inputSchema: z.object({
      skuId: z.string().optional().describe("SKU ID to check (preferred)."),
      productId: z.string().optional().describe("Product ID — used when skuId is not available."),
    }),
  },

  pricingService: {
    name: "checkPricing",
    description: "Checks the upstream pricing service for the authoritative product price.",
    inputSchema: z.object({ productId: z.string().describe("Product ID to check.") }),
  },

  pimService: {
    name: "checkPimService",
    description: "Checks PIM for upstream source-of-truth metadata (name, publish flags, images).",
    inputSchema: z.object({ styleId: z.string().describe("Style/Product ID to look up in PIM.") }),
  },

  dlqService: {
    name: "checkDeadLetterQueue",
    description: "Checks if a previous sync job failed and left a message in the DLQ.",
    inputSchema: z.object({ productId: z.string().describe("Product ID to check in DLQ.") }),
  },

  guideService: {
    name: "queryGuide",
    description: "Queries the RAG troubleshooting guide for a known resolution to an error code. Call this before retrying a failed sync.",
    inputSchema: z.object({ errorCode: z.string().describe("Error code to look up.") }),
  },

  syncService: {
    name: "triggerAutoSync",
    description: "Initiates an autonomous synchronization event for a specific system. Returns a syncId you can reference in logs.",
    inputSchema: z.object({
      productId: z.string().optional().describe("Product ID to sync."),
      skuId: z.string().optional().describe("SKU ID to sync (for inventory)."),
      syncType: z.enum(["inventory", "price", "pim"]).describe("Which upstream system to sync."),
    }),
  },

  verificationService: {
    name: "verifyWebState",
    description: "Re-checks live web database AFTER a sync to confirm the product status is now SELLABLE.",
    inputSchema: z.object({ productId: z.string().describe("Product ID to verify.") }),
  },

  // ── Memory Services ─────────────────────────────────────────────────────

  memoryListService: {
    name: "listMemories",
    description: "Retrieves all episodic memory entries for a product. Use to review past investigation history.",
    inputSchema: z.object({ productId: z.string().optional().describe("Product ID filter. Omit to retrieve all.") }),
  },

  memoryDeleteService: {
    name: "deleteMemory",
    description: "Deletes a specific episodic memory entry by its ID. Use only when a memory is stale or incorrect.",
    inputSchema: z.object({ memoryContentId: z.string().describe("Memory record ID to delete.") }),
  },

  l2DetectiveService: {
    name: "delegateToL2Detective",
    description: "Delegates a systemic infrastructure failure to the L2 Detective agent for root cause analysis. Call this when triggerAutoSync fails three times and the issue is beyond normal triage.",
    inputSchema: z.object({
      errorCode: z.string().describe("The error code that caused repeated sync failures."),
      targetProduct: z.string().optional().describe("The product ID being investigated."),
    }),
  },
};

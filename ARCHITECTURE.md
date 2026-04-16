# 🏗️ AgentCore Operations Hub Architecture

This document provides a deep-dive technical overview for engineering peers, reviewers, and systems architects detailing the Model Context Protocol (MCP) mesh, the core reasoning loop, and the serverless infrastructure.

---

## ⚙️ The Distributed MCP Mesh

Unlike traditional monolithic agents that run all logic inside a single prompt or local filesystem process, this architecture uses a **Distributed Serverless Mesh** powered by the Model Context Protocol (MCP).

### Why MCP over standard function calling?
1. **Separation of Concerns:** Each backend service (Inventory, Price, Sync) is an isolated AWS Lambda function. The core agent does not need to know *how* `checkInventory` works, only its schema.
2. **Independent Scaling:** If the Sync Service requires heavy IOPS, it can be scaled and provisioned with more memory independently of the L2 Detective Service.
3. **Language Agnostic:** Because they communicate via standard MCP over HTTP/JSON, future sub-agents could easily be written in Python or Go without disrupting the TypeScript orchestrator.

```mermaid
graph TD
    User["User Complaint"] --> Classifier["Haiku Classifier (Triage Router)"]
    
    Classifier -->|"Injects Pre-Diagnosis Hint"| Agent["Sonnet Orchestrator (agent.ts)"]
    
    Agent -->|"MCP HTTP Call"| LambdaURL["Lambda Function URL Layer"]
    
    LambdaURL --> InvLambda("Inventory Service")
    LambdaURL --> PriceLambda("Pricing Service")
    LambdaURL --> SyncLambda("AutoSync Service")
```

---

## ⚡ LLM Cascading (The Triage Router)

**Problem: Context Replay & Token Amplification**  
When an orchestration model is given a vague prompt, it performs exploratory tool calls to identify the root cause. In ReAct-style loops, each invocation requires a full context replay (resending the entire conversation history). This leads to significant token amplification and latency spikes.

**Solution: The Planner → Executor Pattern**  
We engineered a dual-model LLM cascade. Before the primary executor is invoked, a lightweight, high-speed Claude Haiku model intercepts the request. Operating as a "Planner," it uses a few-shot prompt (derived from synthetic distillation) to identify the most likely systems involved.

The planner passes its findings to the Claude Sonnet executor as a structured "Pre-Diagnosis Hint" injected into the system prompt. This hint is advisory, not authoritative. If empirical tool outputs contradict it, the executor prioritizes observed system state, ensuring safe fallback when the classifier is incorrect.

**Result:** By injecting this hint, the architecture reduces exploratory tool usage. While deterministic `checkWebDatabase` constraints already provide an optimized baseline path, the Haiku hint delivers an additional ~13% reduction in token consumption on ambiguous edge cases, improving consistency in tool selection and overall latency.

---

## 🧠 The "Self-Healing" Retry Lifecycle

The most advanced piece of the orchestrator is its fault-tolerance mechanism built into `@strands-agents/sdk` hooks. 

### 🏗️ Scaling Pattern: The MCP Server Factory

To manage 11 specialized services without code duplication, the architecture uses a **Centralized Server Factory** (`src/mcp-server-factory.ts`).

-   **Standardized Handlers**: Every service automatically inherits standardized logging, error handling, and correlation ID propagation.
-   **Automated Health Probes**: Each Lambda exposes a `__health` tool by default, allowing the Orchestrator to monitor the mesh status without complex sidecar patterns.
-   **Context Injection**: The factory ensures that cross-cutting concerns (like the Holiday Freeze window) are applied uniformly across the entire tool-set.

---

### 🛡️ Operational Guardrails

### The Flow:
1. **Pre-Execution Guardrails (`BeforeToolCallEvent`):** Real-world operational safety. The system hooks into remediation tools (like `triggerAutoSync`) and dynamically blocks execution during defined "Holiday Freeze" windows (e.g., Fridays after 4 PM or weekends). This prevents accidental production deployments during peak hours or unmonitored periods.
2. **Observation:** The Agent attempts to invoke an upstream MCP service.
3. **Error Interception (`AfterToolCallEvent`):** If a `504` or `503` occurs, the orchestrator "hides" the failure from the LLM. It increments a local tracker in the session context.
4. **Stealth Retries:** The orchestrator re-fires the network request up to 3 times sequentially without the LLM ever knowing a failure occurred. 
5. **Deterministic Escalation**: If all 3 retries fail, the orchestrator stops intercepting. The accumulated failure history is presented to the LLM, and the system prompt's deterministic escalation rules take over to trigger the L2 Detective.

### 🔄 The Hook Execution Loop

```mermaid
sequenceDiagram
    participant LLM as Amazon Bedrock
    participant Hook as agent.ts (SDK Hook)
    participant MCP as Sync Microservice
    
    LLM->>Hook: Request triggerAutoSync()
    Hook->>MCP: HTTP POST /sync
    MCP-->>Hook: 504 Gateway Timeout
    Hook->>Hook: Stealth Increment Retry 1/3
    Hook->>MCP: HTTP POST /sync
    MCP-->>Hook: 504 Gateway Timeout
    Hook->>Hook: Stealth Increment Retry 3/3
    Hook-->>LLM: Response Escalate to L2
    LLM->>Hook: Request delegateToL2Detective()
```

---

## 🕵️‍♂️ Agent-to-Agent (A2A) Encapsulation

**Problem:** Giving a single multi-purpose LLM access to 50 tools leads to massive context bloat (expensive token usage) and high risk of "Tool Hallucination" (using a Jira checking tool when asked to check the price).

**Solution:** The principle of Least Privilege via Sub-Agents.

### 🛡️ Security Boundaries (Component View)

```mermaid
graph TD
    subgraph MainAgent ["Main Agent Environment (Least Privilege)"]
        TriageAgent["Bedrock Triage Agent"]
        TriageAgent -->|"Read Only"| WebDB("Web Database")
        TriageAgent -->|"Escalation Only"| Delegate["delegateToL2Detective"]
    end

    subgraph SecureEnclave ["Secure Enclave (L2 Network)"]
        Delegate -->|"Invoke"| SubAgent["L2 Detective Agent"]
        SubAgent -->|"Deep Infra Access"| CloudWatchLogs("CloudWatch")
        SubAgent -->|"Extensible to"| Jira("Jira / PagerDuty (Simulated)")
    end
    
    style SubAgent fill:#f9f,stroke:#333,stroke-width:2px
```

*   **The Triage Agent:** Only knows how to read web databases, pull inventory, and trigger syncs. It has *no idea* what CloudWatch or Jira are.
*   **The L2 Detective Agent (`L2DetectiveService.ts`):** An independent instantiation of a Bedrock Agent. It holds the private registry of infrastructure tools (`checkCloudTrailLogs`, `checkJiraCommits`). 

The Triage Agent acts merely as a router, invoking the L2 Detective when triaging hits a dead-end, keeping the context windows clean and costs minimized.

---

## 🗺️ Scale-Out Roadmap

While currently running 11 deterministic MCP tools, the next architectural iteration targets:

1. **Dynamic Tool Discovery (RAG for Tools):** Storing MCP Server definitions in a Bedrock Knowledge Base vector store. The `agent.ts` will dynamically route semantic intent to the top 5 relevant tools, allowing the mesh to scale to 100+ microservices without hitting token limits.

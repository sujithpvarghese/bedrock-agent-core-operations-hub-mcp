# 🛡️ Bedrock AgentCore: Self-Healing Operations Hub

> **Autonomous AI Operations Infrastructure for Enterprise E-Commerce.**
> 
> *Validated against 9 scenario types using an **LLM-as-Judge Consensus** framework and a decentralized MCP mesh. Achieved 100% Pass Rate with a 96% average Consensus Score across two independent models (Claude 4.5 Sonnet & Amazon Nova Pro).*

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Node.js 22](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![Strands SDK](https://img.shields.io/badge/Framework-Strands_SDK-purple.svg)](https://github.com/strands-agents/sdk)
[![AWS Bedrock](https://img.shields.io/badge/AWS-Bedrock-orange.svg)](https://aws.amazon.com/bedrock/)
[![MCP Protocol](https://img.shields.io/badge/Protocol-MCP-blue.svg)](https://modelcontextprotocol.io/)
[![Serverless v4](https://img.shields.io/badge/Framework-Serverless--v4-red.svg)](https://www.serverless.com/)

---

## 📖 The Story

It's 3:00 AM on Black Friday. A top-selling SKU suddenly goes "Out of Stock" on the website despite having 500 units in the warehouse. The reason? A transient DynamoDB write-timeout two hours ago left the web database out of sync.

Usually, this would wait for a human developer to wake up, costing thousands in lost revenue. **The Operations Hub doesn't wait.** Within seconds, it clears the blockage, triggers a self-healing sync, and verifies the product is back online—**all before your first customer of the day even wakes up.**

This isn't just an AI; it's a **Self-Healing Infrastructure** that turns manual support tasks into automated success stories.

## 📐 Architectural Journey

This project progressed through **3 distinct evolutionary phases**, where each iteration exposed specific limitations in the previous approach and drove the next major architectural decision:

-   **v1 [`bedrock-full-reconciliation`](https://github.com/sujithpvarghese/bedrock-full-reconciliation)**: Initial prototype using direct Bedrock inference. Hit immediate ceilings with lack of persistent state or structured tool orchestration.
-   **v2 [`agent-core-operations-hub`](https://github.com/sujithpvarghese/agent-core-operations-hub)**: Consolidated all logic into a **Single Lambda Monolith** using `BedrockAgentCore`. While functional, the "Fat Lambda" approach created deployment bottlenecks and violated the principle of least privilege.
-   **v3 (Current)**: Transitioned to a **Distributed MCP Mesh**. Decomposed the monolith into 11 independent MCP services. This achieved true service isolation, independent scalability, and set the stage for A2A (Agent-to-Agent) encapsulation.

---

## 🏗️ Technical Pillars

### 🌐 Decentralized MCP Mesh
Unlike monolithic agents, this system utilizes a **Distributed Model Context Protocol (MCP)** mesh. Built on **Decentralized Tools**: 11 independent AWS Lambda functions acting as MCP Servers. The orchestrator dynamically routes intent across the infrastructure. This decoupling allows for independent service scaling and ensures the orchestrator remains infrastructure-agnostic.

### 🧠 Episodic Memory Bridge
The system leverages a stateful **Episodic Memory** bridge to bypass redundant diagnostic cycles. By correlating current SKU states with historical resolution data, the agent can skip L1 triage and move directly to remediation, drastically reducing token latency and operational costs.

### 🛡️ Stealth Resilience
Implemented a hook-layer retry mechanism that intercepts transient 5xx errors and performs **silent recoveries**. This ensures that minor network blips do not derail the agent's reasoning chain, allowing for optimized task completion rates in unstable production environments.

### 🕵️ Agent-to-Agent (A2A) Encapsulation
To maintain strict security boundaries and lean context windows, we implemented **A2A Handoff**. When systemic infrastructure issues are detected, the primary orchestrator encapsulates the problem and hands it off to a specialized **L2 Detective** sub-agent. This specialist possesses its own secure tool registry (CloudWatch, Jira), keeping investigative "noise" out of the primary triage loop.

### 🔒 Operational Guardrails
Built-in business rules enforced at the hook layer, not the prompt layer:
- **Change Freeze Window**: Automated syncs are blocked Friday 4PM → Monday morning. Any attempt returns `OPERATIONAL_POLICY_ERROR`.
- **Gift Item Guard**: Recognizes that `$0.00` is the **valid business state** for promotional items (`GFT-` or `SAMPLE-`). This prevents the agent from misidentifying these items as pricing errors and triggering unnecessary, redundant remediation cycles.

### 🛠️ The Stack
- **Language**: TypeScript & Node.js 22.x (Enterprise-grade type safety).
- **Orchestration**: `@strands-agents/sdk` + Amazon Bedrock.
- **Protocol**: Official MCP logic over HTTPS Lambda Function URLs.
- **Memory**: Amazon Bedrock AgentCore (Vector-based episodic retrieval).
- **Schema**: Model-aware Zod-to-JSON-Schema transformation (Claude, Nova, Llama).
- **Production Hygiene**: Built-in `__health` probes on every service and a CORS-enabled `statusHub`.
- **Deployment**: Stage-aware Serverless Framework v4 using clean YAML anchors for URL management.
- **Traceability**: Logical Correlation ID tracing across distributed log groups.

> [!TIP]
> **Check out [ARCHITECTURE.md](./ARCHITECTURE.md) for a deep dive into the Stealth Retry Lifecycle and A2A Encapsulation.**

---

## 🚦 Getting Started

### Prerequisites
- Node.js 22.x
- AWS CLI configured with Bedrock access.

### Installation
```bash
npm install
```

### Local Evaluation (100% Simulation)
Run the full diagnostic suite locally without any AWS costs:
```bash
npm run eval
```

### Deployment
Deploy the entire mesh as **13 CloudFormation-managed Lambdas** (1 Orchestrator + 1 StatusHub + 11 Tools) via Serverless Framework.
```bash
sls deploy --stage dev
```

---

## 🧪 Evaluation

The Bedrock Operations Hub is validated against 9 distinct scenario types using a sophisticated **LLM-as-Judge Consensus** framework. Two independent models—**Claude 4.5 Sonnet** and **Amazon Nova Pro**—act as judges, scoring each agent run on **semantic accuracy (0–100)**. The final score is a mean average of both judges, minus any deterministic tool-use penalties.

**Current Performance Baseline:**
- **Pass Rate**: 100% (9/9 scenarios)
- **Average Consensus Score**: 96/100
- **Deterministic Tool Penalty**: -10 pts per missed expected tool invocation

<details>
<summary><b>View "The Receipts" (Full Consensus Log Suite)</b></summary>

```text
📝 [Scenario 1: Generic Availability Complaint]
✅ PASS | 📊 Consensus: 100/100 (Claude: 100, Nova: 100, Pen: -0)
🧑‍⚖️  Claude   : Identifed root cause and used correct tools for inventory/price sync.
🧑‍⚖️  Nova     : Accurate root cause identification and successful verification.

📝 [Scenario 2: Specific Price Complaint]
✅ PASS | 📊 Consensus: 100/100 (Claude: 100, Nova: 100, Pen: -0)
🧑‍⚖️  Claude   : Correctly identified price disparity and triggered price sync.
🧑‍⚖️  Nova     : Agent correctly remediated price discrepancy and verified success.

📝 [Scenario 3: Episodic Memory Fast-Path]
✅ PASS | 📊 Consensus: 98/100 (Claude: 100, Nova: 95, Pen: -0)
🧑‍⚖️  Claude   : Correct identified episodic memory indicator for previous fix.
🧑‍⚖️  Nova     : Accurate identification of root cause and used correct tool.

📝 [Scenario 4: PIM Metadata Complaint]
✅ PASS | 📊 Consensus: 98/100 (Claude: 100, Nova: 95, Pen: -0)
🧑‍⚖️  Claude   : Identified PIM metadata root cause and triggered syncs across systems.
🧑‍⚖️  Nova     : Identified root cause and successfully verified resolution.

📝 [Scenario 5: Full Reconciliation — All Systems]
✅ PASS | 📊 Consensus: 98/100 (Claude: 100, Nova: 95, Pen: -0)
🧑‍⚖️  Claude   : Correctly identified all three system failures as root causes.
🧑‍⚖️  Nova     : Accurate identification of causes and successful sync tool usage.

📝 [Scenario 6: DLQ Recovery — Guide Consultation]
✅ PASS | 📊 Consensus: 95/100 (Claude: 95, Nova: 95, Pen: -0)
🧑‍⚖️  Claude   : Applied troubleshooting guide resolution and triggered sync.
🧑‍⚖️  Nova     : Identified root cause, applied guide resolution and verified remediation.

📝 [Scenario 7: L2 Detective — Handoff Escalation]
✅ PASS | 📊 Consensus: 95/100 (Claude: 100, Nova: 90, Pen: -0)
🧑‍⚖️  Claude   : Properly diagnosed DynamoDB throttling and escalated as instructed.
🧑‍⚖️  Nova     : Accurately identified root cause and provided appropriate escalation.

📝 [Scenario 8: Gift Item Validation — Expected Zero Price]
✅ PASS | 📊 Consensus: 100/100 (Claude: 100, Nova: 100, Pen: -0)
🧑‍⚖️  Claude   : Correct identified promotional $0.00 as valid business state.
🧑‍⚖️  Nova     : Perfectly aligns with ground truth for GFT- SKU logic.

📝 [Scenario 9: Transient Error & Silent Recovery]
✅ PASS | 📊 Consensus: 83/100 (Claude: 85, Nova: 80, Pen: -0)
🧑‍⚖️  Claude   : Correct remediated 503 error via silent retry but missed summary mention.
🧑‍⚖️  Nova     : Correct identified the issue but did not mention the silent recovery.

============================================
  🏆 FINAL RESULTS
  Pass Rate  : 100% (9/9 scenarios)
  Avg Score  : 96/100
============================================
```

</details>

---

## 👤 Engineering Highlights
- **Decentralized MCP Mesh**: Transitioned from a monolithic API to a mesh of **13 independent AWS Lambdas** using direct **Function URLs** to eliminate API Gateway latency and cold-start overhead.
- **Hook-Layer Guardrails**: Implemented deterministic safety logic (Holiday Freeze, Gift Item Guards) using **orchestration hooks** rather than fragile prompt-layer instructions, ensuring 100% policy compliance.
- **A2A Context Optimization**: Implemented the **L2 Detective sub-agent** handoff to minimize context-window bloat, delegating deep-trace analytical tasks to a specialized agentic domain only when needed.

---
*Created by [Palamkunnel Sujith](https://www.linkedin.com/in/sujithpvarghese/) for the Bedrock Agent Portfolio.*

# 🛡️ Bedrock AgentCore: Self-Healing Operations Hub

> **Autonomous AI Operations Infrastructure for Enterprise E-Commerce.**
> 
> *Validated against 9 scenario types using an **LLM-as-Judge** framework and a decentralized MCP mesh. Achieved 100% Pass Rate with a 94% average semantic accuracy score.*

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Node.js 22](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![Strands SDK](https://img.shields.io/badge/Framework-Strands_SDK-purple.svg)](https://github.com/strands-agents/sdk)
[![AWS Bedrock](https://img.shields.io/badge/AWS-Bedrock-orange.svg)](https://aws.amazon.com/bedrock/)
[![MCP Protocol](https://img.shields.io/badge/Protocol-MCP-blue.svg)](https://modelcontextprotocol.io/)
[![Serverless v4](https://img.shields.io/badge/Framework-Serverless--v4-red.svg)](https://www.serverless.com/)

---

## 📖 The Story

Imagine it's **3:00 AM on a Black Friday**. 

A critical product suddenly disappears from your website due to a **subtle race condition** during a stock update. Usually, this means an exhausted engineer gets a page, spends an hour digging through logs, and manually triggers a sync while the company loses thousands in sales.

**Bedrock Operations Hub** changes that story. 

When an issue is reported, an operator simply provides a single natural-language prompt to our AI-driven "Digital Twin." From that moment, the AI **takes over**. It doesn't just see that a product is missing—it **investigates** like a human expert would. It checks the inventory levels, scans the Dead Letter Queues for blockages, and "remembers" if this happened before.
 Within seconds, it clears the blockage, triggers a self-healing sync, and verifies the product is back online—**all before your first customer of the day even wakes up.**

This isn't just an AI; it's a **Self-Healing Infrastructure** that turns manual support tasks into automated success stories.

## 🏗️ Technical Pillars

### 🌐 Decentralized MCP Mesh
Unlike monolithic agents, this system utilizes a **Distributed Model Context Protocol (MCP)** mesh. Built on **Decentralized Tools**: 11 independent AWS Lambda functions acting as MCP Servers. The orchestrator dynamically routes intent across the infrastructure. This decoupling allows for independent service scaling and ensures the orchestrator remains infrastructure-agnostic.

### 🧠 Episodic Memory Bridge
The system leverages a stateful **Episodic Memory** bridge to bypass redundant diagnostic cycles. By correlating current SKU states with historical resolution data, the agent can skip L1 triage and move directly to remediation, drastically reducing token latency and operational costs.

### 🕵️ Agent-to-Agent (A2A) Encapsulation
To maintain strict security boundaries and lean context windows, we implemented **A2A Handoff**. When systemic infrastructure issues are detected, the primary orchestrator encapsulates the problem and hands it off to a specialized **L2 Detective** sub-agent. This specialist possesses its own secure tool registry (CloudWatch, Jira), keeping investigative "noise" out of the primary triage loop.

### 🩹 Stealth Resilience logic
Handles the inherent "chaos" of distributed systems through **Stealth Retries**. The system intercepts transient 5xx errors at the protocol level, performing silent recoveries that are hidden from the LLM’s reasoning chain until deterministic escalation thresholds are met.

### 🔒 Operational Guardrails
Built-in business rules enforced at the hook layer, not the prompt layer:
- **Change Freeze Window**: Automated syncs are blocked Friday 4PM → Monday morning. Any attempt returns `OPERATIONAL_POLICY_ERROR`.
- **Gift Item Guard**: Products with `GFT-` or `SAMPLE-` SKU prefixes that return a $0.00 price are flagged as intentional — sync is suppressed to prevent overwriting valid zero-price items.

---

### 🛠️ The Stack
- **Language**: TypeScript & Node.js 22.x (leveraging `Symbol.dispose`).
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

---

## 🧪 Evaluation

The Bedrock Operations Hub is validated against 9 distinct scenario types using a sophisticated **LLM-as-Judge** framework. A separate, independent Claude 4.5 Sonnet instance acts as the judge, scoring each agent run on **semantic accuracy (0–100)** against ground-truth expectations.

**Methodology:**
- **Metrics**: 9/9 PASS | 94% average semantic accuracy score.
- **Scoring**: Validated against 9 scenario types using an **LLM-as-Judge** framework—a separate Claude instance independently scores each agent run on semantic accuracy, while the evaluator applies a deterministic **-10 tool-call penalty** per expected tool that was missed or skipped.
- **Coverage**: Performance is validated across negative cases (suppressing incorrect syncs on Gift Items), early-exit prevention on healthy products, episodic memory fast-pathing, and multi-step A2A escalation.

<details>
<summary>📊 Latest Eval Run Results (The Receipts)</summary>

```text
============================================
  🧑⚖️  LLM-as-Judge Evaluation Suite
  📋 Suite   : Operations Hub - Full Reconciliation Diagnostics v2
  🤖 Judge   : Claude 4.5 Sonnet (Bedrock)
  ✅ Threshold: 70/100
============================================

📝 [Generic Availability Complaint (Inventory + Price Both Down)]
✅ PASS | 📊 Score: 100/100
🧑⚖️  Judgment: Agent correctly identified both inventory and pricing issues, investigated upstream systems, executed both sync operations, and verified the fix.

📝 [Specific Price Complaint on SELLABLE Product]
✅ PASS | 📊 Score: 100/100
🧑⚖️  Judgment: Agent correctly identified price discrepancy, investigated upstream, triggered price sync, and verified the fix.

📝 [Episodic Memory Fast-Path (SKU 1029)]
✅ PASS | 📊 Score: 95/100
🧑⚖️  Judgment: Agent recalled SKU 1029 was previously fixed, triggered sync to clear the DynamoDB lock, and verified the fix.

📝 [PIM Metadata Complaint (Wrong Product Name)]
✅ PASS | 85/100
🧑⚖️  Judgment: Agent identified PIM metadata discrepancy, investigated upstream, synced PIM data, though it performed extra syncs beyond the core issue.

📝 [Full Reconciliation — All Systems Down]
✅ PASS | 📊 Score: 95/100
🧑⚖️  Judgment: Agent identified all three root causes (INV/PRC/PIM), queried all upstream systems, triggered appropriate syncs, and verified seller status.

📝 [DLQ Recovery — Sync Failure + Guide Consultation]
✅ PASS | 📊 Score: 100/100
🧑⚖️  Judgment: Agent correctly identified root cause from DLQ, applied guide resolution, retried sync, and verified fix.

📝 [L2 Detective Handoff — Systemic Infrastructure Failure]
✅ PASS | 📊 Score: 95/100
🧑⚖️  Judgment: Agent identified DynamoDB write throttling as root cause, investigated DLQ appropriately, and properly escalated to infrastructure team.

📝 [Gift Item Validation — Expected Zero Price]
✅ PASS | 📊 Score: 95/100
🧑⚖️  Judgment: Agent correctly identified valid gift item with intentional $0.00 price and suppressed unnecessary sync.

📝 [Transient Error & Silent Recovery]
✅ PASS | 📊 Score: 85/100
🧑⚖️  Judgment: Agent correctly identified inventory issue and took remediation action, though it missed reporting the transient 503 error in the recovery narrative.

============================================
  🏆 FINAL RESULTS
  Pass Rate  : 100%  (9/9 scenarios)
  Avg Score  : 94/100
============================================
```

</details>

---

## 👤 Engineering Highlights
- **Decentralized MCP Mesh**: Transitioned from a monolithic API to a mesh of **13 independent AWS Lambdas** using direct **Function URLs** to eliminate API Gateway latency and cold-start overhead.
- **Hook-Layer Guardrails**: Implemented deterministic safety logic (Holiday Freeze, Gift Item Guards) using **orchestration hooks** rather than fragile prompt-layer instructions, ensuring 100% policy compliance.
- **A2A Context Optimization**: Implemented the **L2 Detective sub-agent** handoff to minimize context-window bloat, delegating deep-trace analytical tasks to a specialized agentic domain only when needed.

---
*Created by Palamkunnel Sujith for the Bedrock Agent Portfolio.*

# 🛡️ Bedrock AgentCore: Self-Healing Operations Hub

> **Autonomous AI Operations Infrastructure for Enterprise E-Commerce.**
> 
> *A production-grade implementation of decentralized Agentic AI, achieving a **100% Validation Pass Rate** against complex recovery scenarios.*

[![Node.js 22](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
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
- **Orchestration**: `@strands-agents/sdk` + Amazon Bedrock.
- **Protocol**: Official MCP logic over HTTPS Lambda Function URLs.
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
Deploy the entire mesh as 12 CloudFormation-managed Lambdas:
```bash
sls deploy --stage dev
```

---

## 👤 Engineering Highlights
This project demonstrates expertise in:
- **Agentic AI Design**: Multi-agent orchestration and state-bridging.
- **Serverless at Scale**: Management of complex event-driven architectures.
- **Protocol Implementation**: Advanced usage of the Model Context Protocol (MCP).
- **Chaos Engineering**: Building resilient systems that survive 503s and timeouts.

---
*Created by Palamkunnel Sujith for the Bedrock Agent Portfolio.*

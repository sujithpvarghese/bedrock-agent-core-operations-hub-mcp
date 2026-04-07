# 🚀 Bedrock Operations Assistant — E-Commerce Auto-Remediation

**An AI-powered operations assistant that automatically diagnoses, fixes, and verifies e-commerce product catalog issues across multiple backend systems.**

## 💼 The Business Problem
In enterprise e-commerce, a product dropping off the active site (or showing the wrong price) requires L1 support to manually check the Web Database, query the Inventory Service, verify the Pricing Engine, and dig through Dead Letter Queues. This manual triage ties up engineers for hours per incident.

## 💡 The Solution
This project automates the entire investigation using Amazon Bedrock. It acts as an autonomous support engineer that:
1. **Detects** system discrepancies across multiple independent micro-services.
2. **Recalls** past incidents using episodic memory to skip redundant debugging.
3. **Remediates** safe, transient issues autonomously (e.g., triggering a manual catalog sync).
4. **Escalates** complex infrastructure failures to a specialized L2 Agent.

## 🧭 How It Behaves (Execution Flow)

```text
User: "Why is the price for prod_666 wrong?"
   ↓
Agent (Planner)
   ↓
Step 1: Check Memory (Has this failed before?)
   ↓
Step 2: MCP Tool Execution (Query Live DB & Pricing Engine)
   ↓
Step 3: Discrepancy Found ($0.00 vs $24.99)
   ↓
Step 4: Auto-Remediate (Trigger Backend Sync)
   ↓
Final Response (Fix confirmed & verified)
```

## 🎯 1. The Concrete Example

**User Query:**
> *"Why is the price for product 'prod_666' showing as $0.00 on the live site?"*

**Step-by-Step Intelligence:**
1. **Diagnose:** Queries the Live Web Database -> Actual Price is `$0.00`.
2. **Investigate:** Queries the internal Pricing Engine -> Expected Price is `$24.99`.
3. **Safety Check:** Evaluates if `prod_666` is a promotional "Gift Item" (which allows $0 pricing). It is not.
4. **Remediate:** Safely triggers a backend Pricing Sync.
5. **Verify:** Re-queries the live site to confirm the update succeeded.

## 📄 2. Real Execution Proof (Output)

```json
{
  "status": "REMEDIATED",
  "discrepancyType": "Pricing Mismatch",
  "diagnostics": {
    "webDatabaseState": 0.00,
    "upstreamPricingEngine": 24.99,
    "giftItemOverride": false
  },
  "actionTaken": "Triggered manual pricing sync via MCP gateway",
  "verification": "Live site successfully updated to 24.99",
  "finalResponse": "Price discrepancy found and repaired. The live site now correctly reflects $24.99 for prod_666."
}
```

---

## 🛠️ Tech Stack
| Layer | Technology |
|---|---|
| **Orchestration** | Amazon Bedrock (Claude 3.5 Sonnet v2) |
| **Logic Execution** | AWS Lambda (Node.js 22.x) |
| **Protocol** | Model Context Protocol (MCP) |
| **Observability** | Correlation IDs for distributed tracing |
| **Deploy** | Serverless Framework v4 |

## 🔥 Killer Features (Advanced Engineering)

While the agent's logic is straightforward, the underlying architecture implements enterprise-grade resilience:

### 1. State-Aware "Silent" Self-Healing
An AI agent is only as good as its tools. If a backend service throws a `504 Timeout`, a standard agent fails and hallucinates the error to the user. This system uses an invisible **SDK Hook** to automatically retry transient errors up to 3 times in the background without burning tokens on the LLM. 

### 2. Agent-to-Agent Encapsulation (L2 Specialist)
To prevent expensive "Tool Overreach," the main triage agent does not have access to raw CloudWatch logs or Jira commits. If an issue is systemic (e.g., the 3 silent retries fail), the main agent injects a full execution history payload and passes the Context to a **Specialized L2 Sub-Agent** inside its own sandbox, enforcing the principle of least privilege.

---

## 📂 Project Structure
```bash
├── src/
│   ├── agent.ts                # Main orchestrator (Triage & Workflows)
│   ├── logger.ts               # Structured logging + Correlation ID support
│   ├── mcp-server/             # 11 independent micro-services
│   │   ├── InventoryService.ts # Tools for downstream inventory
│   │   ├── SyncService.ts      # Remediation engine for state fixes
│   │   ├── L2DetectiveService.ts # Sub-agent for infrastructure logs
│   └── evaluator.ts            # LLM-as-a-Judge Eval Runner
├── config/
│   └── eval.json               # 9 complex evaluation scenarios
└── serverless.yml              # IaC for all Lambdas and Bedrock configuration
```

## 🚀 Getting Started

### 1. Installation
```bash
nvm use 22
npm install
```

### 2. Deployment
Ensure your AWS credentials are set and Claude 3.5 Sonnet v2 is enabled in Amazon Bedrock.
```bash
npm run deploy
```

### 3. Run Evaluations (LLM-as-a-Judge)
Run the comprehensive test suite to verify the agent's reasoning across all 9 rigorous scenarios, including gift item overrides and L2 escalation paths.
```bash
npm run eval
```

---

## ✍️ Author
**Palamkunnel Sujith** — *AI & Serverless Architect*
- LinkedIn: [https://www.linkedin.com/in/sujithpvarghese/]

## ⚖️ License
MIT

/**
 * benchmark.ts — Distillation Impact Measurement
 *
 * Runs a set of test cases through the agent to prove the ~60% reduction
 * in tool calls achieved by using the Haiku few-shot classifier.
 *
 * Run: npx tsx src/benchmark.ts
 */

import { classify } from "./classifier";
import { config } from "./config";
import { agent } from "./agent";
import * as crypto from "crypto";

// Polyfill for Symbol.dispose in older node environments (node 18.x)
if (!(Symbol as any).dispose) {
  Object.defineProperty(Symbol, "dispose", { value: Symbol("dispose") });
}
if (!(Symbol as any).asyncDispose) {
  Object.defineProperty(Symbol, "asyncDispose", { value: Symbol("asyncDispose") });
}
// Polyfill for randomUUID
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = { randomUUID: () => crypto.randomBytes(16).toString("hex") };
} else if (!(globalThis as any).crypto.randomUUID) {
  (globalThis as any).crypto.randomUUID = () => crypto.randomBytes(16).toString("hex");
}

// Ensure agent runs in mock mode for tools, but we can toggle classifier
Object.defineProperty(config, "USE_MOCKS", { value: true });

const TEST_CASES = [
  "prod000 shows out of stock on our website but we have 500 units in the warehouse",
  "The price for SKU-4455 looks wrong on the website — it should be $24.99 not $9.99",
  "The product name for prod_9982 is completely wrong on the site — it's showing a different item name",
  "prod_dlq has been stuck not sellable for 2 days — we've tried refreshing it manually but nothing works",
];

async function measureRun(userMessage: string, useClassifier: boolean) {
  if (useClassifier) {
    const result = await agent.run({ userPrompt: userMessage });
    return result.steps.length;
  } else {
    // To measure the bypass, we will hijack the classifier just for this tick
    // In actual code, the agent requires the classifier to be run.
    process.env.BENCHMARK_BYPASS_HAIKU = "true";
    const result = await agent.run({ userPrompt: userMessage });
    process.env.BENCHMARK_BYPASS_HAIKU = "false";
    return result.steps.length;
  }
}


async function main() {
  console.log("🚦 Starting Distillation Benchmark...\n");

  let totalWithout = 0;
  let totalWith = 0;

  for (const tc of TEST_CASES) {
    console.log(`\n📝 Test Case: "${tc}"`);
    
    // 1. Run without classifier
    const toolsWithout = await measureRun(tc, false);
    totalWithout += toolsWithout;
    console.log(`   ❌ Without Classifier: ${toolsWithout} tool calls (Exploratory searching)`);

    // 2. Run with classifier
    const toolsWith = await measureRun(tc, true);
    totalWith += toolsWith;
    console.log(`   ✅ With Haiku Classifier: ${toolsWith} tool calls (Direct to remediation)`);
  }

  const reduction = Math.round(((totalWithout - totalWith) / totalWithout) * 100);

  console.log("\n============================================");
  console.log("🏆 BENCHMARK RESULTS");
  console.log(`   Total Tools (No Classifier) : ${totalWithout}`);
  console.log(`   Total Tools (With Haiku)    : ${totalWith}`);
  console.log(`   Tool Call Reduction         : ${reduction}%`);
  console.log("============================================");
}

main().catch(console.error);

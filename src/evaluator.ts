import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { agent } from './agent';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

const bedrockRuntime = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const CLAUDE_MODEL_ID = config.EVAL_CLAUDE_MODEL_ID;
const NOVA_MODEL_ID = config.EVAL_NOVA_MODEL_ID;
const ANTHROPIC_VERSION = config.ANTHROPIC_VERSION;

const JUDGES = [
  { 
    id: 'sonnet', 
    label: 'Claude 4.5 Sonnet', 
    modelId: CLAUDE_MODEL_ID,
    type: 'anthropic'
  },
  { 
    id: 'nova', 
    label: 'Amazon Nova Pro', 
    modelId: NOVA_MODEL_ID,
    type: 'amazon'
  }
];
const PASS_THRESHOLD = 70;

/**
 * Multi-Judge Scorer: Calls the specific model (Claude or Nova)
 * and normalizes the request/response schemas.
 */
async function getJudgeScore(
  judge: typeof JUDGES[0],
  scenarioName: string,
  agentOutput: string,
  groundTruth: string
): Promise<{ score: number; reasoning: string }> {

  const judgePrompt = `Evaluate the following AI agent output against the expected ground truth.
Scenario: "${scenarioName}"
Agent Output: ${agentOutput}
Ground Truth: ${groundTruth}

Score based on:
1. Identifying root cause.
2. Correct tool usage.
3. Verification of success.

Respond ONLY with valid JSON: {"score": <0-100>, "reasoning": "<one sentence>"}`;

  let body: any;
  if (judge.type === 'anthropic') {
    body = {
      anthropic_version: ANTHROPIC_VERSION,
      max_tokens: 1000,
      messages: [{ role: 'user', content: [{ type: 'text', text: judgePrompt }] }]
    };
  } else {
    // Amazon Nova Format
    body = {
      inferenceConfig: { maxTokens: 512 },
      messages: [{ role: 'user', content: [{ text: judgePrompt }] }]
    };
  }

  const response = await bedrockRuntime.send(new InvokeModelCommand({
    modelId: judge.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body)
  }));

  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  
  // Extract text based on provider
  let rawText = '';
  if (judge.type === 'anthropic') {
    rawText = responseBody.content[0].text.trim();
  } else {
    rawText = responseBody.output.message.content[0].text.trim();
  }

  try {
    const cleanedText = rawText.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (err: any) {
    return { score: 0, reasoning: `Judge failure: ${rawText.slice(0, 50)}` };
  }
}

async function runEvals() {
  const evalPath = path.join(__dirname, '../config/eval.json');
  const { test_suite, scenarios } = JSON.parse(fs.readFileSync(evalPath, 'utf8'));

  console.log('\n============================================');
  console.log('  🧑‍⚖️  LLM-as-Judge Evaluation Suite');
  console.log(`  📋 Suite   : ${test_suite}`);
  console.log(`  🤖 Judge   : Claude 4.5 Sonnet (Bedrock)`);
  console.log(`  ✅ Threshold: ${PASS_THRESHOLD}/100`);
  console.log('============================================\n');

  let totalScore = 0;
  let passedCount = 0;

  for (const scenario of scenarios) {
    console.log(`📝 [${scenario.name}]`);
    if (scenario.description) {
      console.log(`   ${scenario.description}`);
    }

    try {
      // Step 1: Run the agent against the scenario input
      const result = await agent.run({ userPrompt: scenario.input });

      // Step 2: Extract real tools from messages (we need to expose or extract them)
      // I'll add logic to check scenario.expected_tools against the summary or track them.
      // Re-running logic to get final state

      // Step 3: Consensus Judgment
      const judgments = await Promise.all(
        JUDGES.map(j => getJudgeScore(j, scenario.name, result.summary, scenario.ground_truth))
      );

      const avgJudgeScore = judgments.reduce((acc, current) => acc + current.score, 0) / JUDGES.length;

      // Step 4: Tool Constraint Check
      const missedTools = (scenario.expected_tools || []).filter(
        (t: string) => !result.steps.some(step => step.tool.toLowerCase() === t.toLowerCase())
      );

      const toolPenalty = missedTools.length * 10;
      const finalScore = Math.max(0, avgJudgeScore - toolPenalty);

      const passed = finalScore >= PASS_THRESHOLD;
      if (passed) passedCount++;
      totalScore += finalScore;

      console.log(passed ? '✅ PASS' : '❌ FAIL');
      console.log(`📊 Consensus: ${finalScore.toFixed(0)}/100 (Claude: ${judgments[0].score}, Nova: ${judgments[1].score}, Pen: -${toolPenalty})`);
      console.log(`🧑‍⚖️  Claude   : ${judgments[0].reasoning}`);
      console.log(`🧑‍⚖️  Nova     : ${judgments[1].reasoning}`);

      if (missedTools.length > 0) {
        console.log(`⚠️  Missed Tools: ${missedTools.join(', ')}`);
      }

      if (!passed) {
        console.log(`   Agent Output : "${result.summary.slice(0, 200)}..."`);
        console.log(`   Ground Truth : "${scenario.ground_truth}"`);
      }
    } catch (err: any) {
      console.log('❌ FAIL (Execution Error)');
      console.log(`🛑 Error: ${err.stack || err.message}`);
      console.log(`   Ground Truth : "${scenario.ground_truth}"`);
    }
    console.log('--------------------------------------------\n');
  }

  const avgScore = (totalScore / scenarios.length).toFixed(0);
  const passRate = ((passedCount / scenarios.length) * 100).toFixed(0);

  console.log('============================================');
  console.log('  🏆 FINAL RESULTS');
  console.log(`  Pass Rate  : ${passRate}%  (${passedCount}/${scenarios.length} scenarios)`);
  console.log(`  Avg Score  : ${avgScore}/100`);
  console.log('============================================\n');
}

runEvals().catch(err => {
  console.error('❌ Evaluation Suite Error:', err.message);
  process.exit(1);
});

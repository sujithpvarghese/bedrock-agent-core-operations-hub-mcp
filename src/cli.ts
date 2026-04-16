import * as crypto from "crypto";
import * as readline from "readline";

// Polyfill for Node 18 environments
if (!(Symbol as any).dispose) {
  Object.defineProperty(Symbol, "dispose", { value: Symbol("dispose") });
}
if (!(Symbol as any).asyncDispose) {
  Object.defineProperty(Symbol, "asyncDispose", { value: Symbol("asyncDispose") });
}
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = { randomUUID: () => crypto.randomBytes(16).toString("hex") };
} else if (!(globalThis as any).crypto.randomUUID) {
  (globalThis as any).crypto.randomUUID = () => crypto.randomBytes(16).toString("hex");
}

import { config } from "./config";
import { agent } from "./agent";

// Force mock mode so the CLI works without requiring local MCP server ports to be bound
Object.defineProperty(config, "USE_MOCKS", { value: true });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ANSI Escape Codes for formatting
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  bold: "\x1b[1m",
};

console.log(`${colors.bold}${colors.blue}=================================================${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}   Bedrock Agent Operations Hub - CLI Client     ${colors.reset}`);
console.log(`${colors.bold}${colors.blue}=================================================${colors.reset}`);
console.log(`${colors.yellow}Type "exit" or "quit" to close the application.${colors.reset}\n`);

function askQuestion() {
  rl.question(`${colors.bold}${colors.green}You:${colors.reset} `, async (input) => {
    const trimmed = input.trim();
    if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
      console.log(`\n${colors.cyan}Goodbye!${colors.reset}`);
      rl.close();
      process.exit(0);
    }

    if (!trimmed) {
      askQuestion();
      return;
    }

    try {
      console.log(`\n${colors.cyan}Agent is thinking...${colors.reset}`);
      const startTime = Date.now();
      
      const response = await agent.run({ userPrompt: trimmed });
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      console.log(`\n${colors.bold}${colors.blue}Agent (Took ${duration}s):${colors.reset}`);
      console.log(response.summary);
      
      console.log(`\n${colors.yellow}[Diagnostic Tools Used: ${response.steps.length}]${colors.reset}`);
      if (response.steps.length > 0) {
        console.log(`${colors.yellow}-> ${response.steps.map(s => s.tool).join(" -> ")}${colors.reset}`);
      }
      
    } catch (error: any) {
      console.log(`\n${colors.bold}\x1b[31mSystem Error:${colors.reset} ${error.message}`);
    }

    console.log("\n-------------------------------------------------\n");
    askQuestion();
  });
}

// Start the loop
askQuestion();

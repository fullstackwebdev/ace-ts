/**
 * Seahorse Emoji Challenge Example
 *
 * A challenge where LLMs often hallucinate that a seahorse emoji exists (it doesn't).
 * This demonstrates ACE's ability to learn from mistakes and self-correct.
 *
 * Prerequisites:
 * - Running LLM server with OpenAI-compatible API (e.g., llama.cpp, Ollama, vLLM)
 * - Server running at http://localhost:8080
 */

import { ACEAgent } from "../src/index.js";

async function main() {
  console.log("=== Seahorse Emoji Challenge ===\n");
  console.log(
    "Testing if agent can learn that there is no seahorse emoji...\n",
  );

  // Create agent
  const agent = new ACEAgent({
    baseURL: "http://localhost:8080",
    model: "llama-3.1-8b",
  });

  // Round 1: Ask about seahorse emoji
  console.log("Round 1: What is the seahorse emoji?");
  const answer1 = await agent.ask(
    'What is the seahorse emoji? If it exists, provide only the emoji character. If it does not exist, say "No seahorse emoji exists".',
  );
  console.log(`Answer: ${answer1}\n`);

  // Provide feedback that answer was incorrect (if agent hallucinated)
  console.log("The agent might have hallucinated 🐴 (horse) or other emoji.");
  console.log(
    "In a full implementation, we would provide negative feedback here.\n",
  );

  // Round 2: Ask again after reflection
  console.log("Round 2: Asking again after the agent has reflected...");
  const answer2 = await agent.ask(
    "What is the seahorse emoji? Be very careful - does it actually exist?",
  );
  console.log(`Answer: ${answer2}\n`);

  // View learned strategies
  const stats = agent.getStats();
  console.log(`\n✅ Agent learned ${stats.skills} skills`);
  console.log("The agent should now understand there is no seahorse emoji.\n");

  console.log("=== Challenge Complete ===");
}

main().catch(console.error);

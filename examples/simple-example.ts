/**
 * Simple ACE Framework Example
 *
 * This example demonstrates the basic usage of the ACE framework:
 * - Creating a self-improving agent
 * - Asking questions
 * - Automatic learning from interactions
 * - Saving and loading learned knowledge
 *
 * Prerequisites:
 * - Running LLM server with OpenAI-compatible API (e.g., llama.cpp, Ollama, vLLM)
 * - Server running at http://localhost:8080
 */

import { ACEAgent } from "../src/index.js";

async function main() {
  console.log("=== ACE Framework Simple Example ===\n");

  // Create self-improving agent with local LLM server
  const agent = new ACEAgent({
    baseURL: "http://localhost:8080",
    model: "llama-3.1-8b",
  });

  console.log("Agent created. Starting Q&A session...\n");

  // Ask related questions - agent learns patterns
  console.log(
    "Question 1: If all cats are animals, is Felix (a cat) an animal?",
  );
  const answer1 = await agent.ask(
    "If all cats are animals, is Felix (a cat) an animal?",
  );
  console.log(`Answer: ${answer1}\n`);

  console.log("Question 2: If all birds fly, can penguins (birds) fly?");
  const answer2 = await agent.ask(
    "If all birds fly, can penguins (birds) fly?",
  );
  console.log(`Answer: ${answer2}\n`);

  console.log(
    "Question 3: If all metals conduct electricity, does copper conduct electricity?",
  );
  const answer3 = await agent.ask(
    "If all metals conduct electricity, does copper conduct electricity?",
  );
  console.log(`Answer: ${answer3}\n`);

  // View learned strategies
  const stats = agent.getStats();
  console.log(`\n✅ Learned ${stats.skills} reasoning skills`);
  console.log(`   Sections: ${stats.sections}`);
  console.log(`   Tags: ${JSON.stringify(stats.tags)}\n`);

  // Save for reuse
  agent.saveSkillbook("trained-agent.json");
  console.log("Skillbook saved to trained-agent.json\n");

  // Demonstrate loading
  console.log("Loading skillbook from file...");
  const agent2 = ACEAgent.fromSkillbook(
    "trained-agent.json",
    {
      baseURL: "http://localhost:8080",
      model: "llama-3.1-8b",
    },
  );
  console.log(`Loaded agent has ${agent2.getStats().skills} skills\n`);

  console.log("=== Example Complete ===");
}

main().catch(console.error);

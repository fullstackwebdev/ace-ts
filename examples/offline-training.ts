/**
 * Offline Training Example
 *
 * Demonstrates how to use OfflineACE to train a skillbook over multiple epochs.
 * This example trains on simple math problems to learn effective strategies.
 */

import * as dotenv from "dotenv";
import { openai } from "@ai-sdk/openai";
import {
  OfflineACE,
  Agent,
  Reflector,
  SkillManager,
  SimpleEnvironment,
  Sample,
  VercelAIClient,
} from "../src/index.js";

// Load environment variables
dotenv.config();

async function main() {
  console.log("🎓 ACE Framework - Offline Training Example\n");

  // Initialize LLM client (shared by all roles)
  const llmClient = new VercelAIClient({
    model: openai("gpt-4o-mini"),
  });

  // Create the three ACE roles
  const agent = new Agent(llmClient);
  const reflector = new Reflector(llmClient);
  const skillManager = new SkillManager(llmClient);

  // Create ACE instance
  const ace = new OfflineACE({
    agent,
    reflector,
    skillManager,
    maxRefinementRounds: 1,
    reflectionWindow: 3,
  });

  // Prepare training samples (math problems)
  const trainingSamples: Sample[] = [
    {
      question: "What is 15 + 27?",
      groundTruth: "42",
      metadata: { difficulty: "easy" },
    },
    {
      question: "Calculate 8 × 9",
      groundTruth: "72",
      metadata: { difficulty: "easy" },
    },
    {
      question: "What is 144 ÷ 12?",
      groundTruth: "12",
      metadata: { difficulty: "medium" },
    },
    {
      question: "Solve: 3² + 4²",
      groundTruth: "25",
      metadata: { difficulty: "medium" },
    },
  ];

  // Create simple evaluation environment
  const environment = new SimpleEnvironment();

  console.log(`📊 Training Configuration:`);
  console.log(`   Samples: ${trainingSamples.length}`);
  console.log(`   Epochs: 2`);
  console.log(`   Environment: SimpleEnvironment (exact match)\n`);

  console.log("🚀 Starting training...\n");

  // Run offline training for 2 epochs
  const results = await ace.run(trainingSamples, environment, {
    epochs: 2,
  });

  console.log("\n✅ Training complete!\n");

  // Display results
  console.log("📈 Training Results:");
  console.log(`   Total samples processed: ${results.length}`);

  // Calculate accuracy
  const correctAnswers = results.filter(
    (r) => r.environmentResult.metrics?.correct === 1.0,
  ).length;
  const accuracy = (correctAnswers / results.length) * 100;
  console.log(`   Accuracy: ${accuracy.toFixed(1)}%`);

  // Show skillbook evolution
  const skillbook = ace.getSkillbook();
  const skills = skillbook.skills();
  console.log(`\n📚 Learned Skills: ${skills.length}`);

  if (skills.length > 0) {
    console.log("\n   Top Skills:");
    const topSkills = skills.sort((a, b) => b.helpful - a.helpful).slice(0, 3);

    topSkills.forEach((skill, idx) => {
      console.log(
        `   ${idx + 1}. [${skill.section}] ${skill.content.slice(0, 60)}${skill.content.length > 60 ? "..." : ""}`,
      );
      console.log(
        `      Stats: +${skill.helpful} helpful, -${skill.harmful} harmful\n`,
      );
    });
  }

  // Show sample evolution (first sample across epochs)
  console.log("📊 Sample Evolution (First Sample):");
  const firstSampleResults = results.filter(
    (r, idx) => idx % trainingSamples.length === 0,
  );

  firstSampleResults.forEach((result, epochIdx) => {
    const isCorrect = result.environmentResult.metrics?.correct === 1.0;
    const symbol = isCorrect ? "✓" : "✗";
    const answer = result.agentOutput.final_answer || "N/A";
    console.log(`   Epoch ${epochIdx + 1}: ${symbol} ${answer.slice(0, 50)}`);
  });

  // Show final skillbook statistics
  const stats = skillbook.stats();
  console.log("\n📊 Final Skillbook Statistics:");
  console.log(`   Total skills: ${stats.skills}`);
  console.log(`   Total sections: ${stats.sections}`);
  console.log(`   Tags:`);
  console.log(`      Helpful: ${stats.tags.helpful}`);
  console.log(`      Harmful: ${stats.tags.harmful}`);
  console.log(`      Neutral: ${stats.tags.neutral}`);

  // Save skillbook for future use
  const skillbookPath = "./trained_skillbook.json";
  await skillbook.saveToFile(skillbookPath);
  console.log(`\n💾 Skillbook saved to: ${skillbookPath}`);

  console.log("\n🎉 Done! The skillbook has learned from experience.");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});

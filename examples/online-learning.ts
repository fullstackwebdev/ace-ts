/**
 * Online Learning Example
 *
 * Demonstrates how to use OnlineACE for continuous learning.
 * This simulates a production scenario where the agent learns from each interaction.
 */

import dotenv from 'dotenv';
import { openai } from '@ai-sdk/openai';
import {
  OnlineACE,
  Agent,
  Reflector,
  SkillManager,
  SimpleEnvironment,
  Sample,
  VercelAIClient,
  Skillbook,
} from '../src/index.js';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🔄 ACE Framework - Online Learning Example\n');

  // Initialize LLM client (shared by all roles)
  const llmClient = new VercelAIClient({
    model: openai('gpt-4o-mini'),
  });

  // Create the three ACE roles
  const agent = new Agent(llmClient);
  const reflector = new Reflector(llmClient);
  const skillManager = new SkillManager(llmClient);

  // Load pre-trained skillbook if it exists, otherwise start fresh
  let skillbook: Skillbook;
  try {
    skillbook = await Skillbook.loadFromFile('./trained_skillbook.json');
    console.log('📚 Loaded pre-trained skillbook');
    console.log(`   Existing skills: ${skillbook.skills().length}\n`);
  } catch (error) {
    skillbook = new Skillbook();
    console.log('📚 Starting with empty skillbook\n');
  }

  // Create ACE instance with pre-trained skillbook
  const ace = new OnlineACE({
    skillbook,
    agent,
    reflector,
    skillManager,
    maxRefinementRounds: 1,
    reflectionWindow: 3,
  });

  // Simulate streaming samples (in production, these would come from real user interactions)
  const incomingSamples: Sample[] = [
    {
      question: 'What is 99 + 1?',
      groundTruth: '100',
      metadata: { source: 'user_query', timestamp: Date.now() },
    },
    {
      question: 'Calculate 7 × 8',
      groundTruth: '56',
      metadata: { source: 'user_query', timestamp: Date.now() },
    },
    {
      question: 'What is 50% of 200?',
      groundTruth: '100',
      metadata: { source: 'user_query', timestamp: Date.now() },
    },
  ];

  // Create evaluation environment
  const environment = new SimpleEnvironment();

  console.log(`🌐 Online Learning Configuration:`);
  console.log(`   Mode: Continuous (one-shot per sample)`);
  console.log(`   Incoming samples: ${incomingSamples.length}`);
  console.log(`   Environment: SimpleEnvironment\n`);

  console.log('🚀 Processing samples with continuous learning...\n');

  // Track skillbook evolution
  const initialSkillCount = ace.getSkillbook().skills().length;

  // Process each sample with immediate learning
  const results = await ace.run(incomingSamples, environment);

  console.log('\n✅ Online learning session complete!\n');

  // Display results
  console.log('📈 Session Results:');
  console.log(`   Samples processed: ${results.length}`);

  // Calculate accuracy
  const correctAnswers = results.filter(
    (r) => r.environmentResult.metrics?.correct === 1.0
  ).length;
  const accuracy = (correctAnswers / results.length) * 100;
  console.log(`   Accuracy: ${accuracy.toFixed(1)}%`);

  // Show skillbook growth
  const finalSkillCount = ace.getSkillbook().skills().length;
  const skillsLearned = finalSkillCount - initialSkillCount;
  console.log(`   Skills learned this session: ${skillsLearned}`);
  console.log(`   Total skills: ${finalSkillCount}\n`);

  // Display each sample result
  console.log('📊 Sample-by-Sample Results:');
  results.forEach((result, idx) => {
    const isCorrect = result.environmentResult.metrics?.correct === 1.0;
    const symbol = isCorrect ? '✅' : '❌';
    const answer = result.agentOutput.finalAnswer || result.agentOutput.answer || 'N/A';
    console.log(
      `   ${idx + 1}. ${symbol} ${result.sample.question}`
    );
    console.log(
      `      Answer: ${answer.slice(0, 60)}`
    );
    console.log(
      `      Feedback: ${result.environmentResult.feedback}\n`
    );
  });

  // Show recently learned skills
  const recentSkills = ace
    .getSkillbook()
    .skills()
    .slice(-3);

  if (recentSkills.length > 0) {
    console.log('🆕 Recently Learned Skills:');
    recentSkills.forEach((skill, idx) => {
      console.log(
        `   ${idx + 1}. [${skill.section}] ${skill.content.slice(0, 60)}${skill.content.length > 60 ? '...' : ''}`
      );
      console.log(
        `      Stats: +${skill.helpful} helpful, -${skill.harmful} harmful\n`
      );
    });
  }

  // Show skillbook statistics
  const stats = ace.getSkillbook().stats();
  console.log('\n📊 Skillbook Statistics:');
  console.log(`   Total skills: ${stats.skills}`);
  console.log(`   Total sections: ${stats.sections}`);
  console.log(`   Tags:`);
  console.log(`      Helpful: ${stats.tags.helpful}`);
  console.log(`      Harmful: ${stats.tags.harmful}`);
  console.log(`      Neutral: ${stats.tags.neutral}`);

  // Save updated skillbook
  const skillbookPath = './online_skillbook.json';
  await ace.getSkillbook().saveToFile(skillbookPath);
  console.log(`\n💾 Updated skillbook saved to: ${skillbookPath}`);

  console.log('\n🎉 Done! The agent continues to learn from each interaction.');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

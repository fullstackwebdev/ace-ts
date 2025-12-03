/**
 * Simple ACE example using DummyLLMClient for demonstration
 */

import {
  DummyLLMClient,
  Generator,
  Reflector,
  Curator,
  OfflineAdapter,
  SimpleEnvironment,
  Playbook,
  Sample,
} from '../src/index.js';

async function main() {
  console.log('ACE Framework - Simple Example\n');

  // Create a dummy LLM client with pre-programmed responses
  const llm = new DummyLLMClient();

  // Queue responses for Generator, Reflector, and Curator
  // In a real scenario, these would come from an actual LLM

  // Generator response (will be called first)
  llm.queue(
    JSON.stringify({
      reasoning: 'Paris is the capital and largest city of France.',
      final_answer: 'Paris',
      bullet_ids: [],
    })
  );

  // Reflector response
  llm.queue(
    JSON.stringify({
      reasoning: 'The generator correctly identified Paris as the capital of France.',
      error_identification: '',
      root_cause_analysis: '',
      correct_approach: 'Direct factual recall from geographic knowledge.',
      key_insight: 'Capital city questions require factual geographic knowledge.',
      bullet_tags: [],
    })
  );

  // Curator response
  llm.queue(
    JSON.stringify({
      reasoning: 'Adding a strategy about capital city questions.',
      operations: [
        {
          type: 'ADD',
          section: 'Geography',
          content:
            'For capital city questions, provide the official capital and verify it is the largest or most well-known city.',
        },
      ],
    })
  );

  // Create ACE components
  const generator = new Generator(llm);
  const reflector = new Reflector(llm);
  const curator = new Curator(llm);

  // Create the task environment
  const environment = new SimpleEnvironment();

  // Create an adapter with a fresh playbook
  const adapter = new OfflineAdapter(generator, reflector, curator, {
    playbook: new Playbook(),
  });

  // Define a sample task
  const samples: Sample[] = [
    {
      question: 'What is the capital of France?',
      context: 'Answer concisely.',
      groundTruth: 'Paris',
    },
  ];

  console.log('Running ACE adaptation...\n');

  // Run offline adaptation
  const results = await adapter.run(samples, environment, {
    epochs: 1,
    onSampleProcessed: (result) => {
      console.log(`Sample ${result.step}:`);
      console.log(`  Question: ${result.sample.question}`);
      console.log(`  Answer: ${result.generatorOutput.final_answer}`);
      console.log(`  Feedback: ${result.environmentResult.feedback}`);
      console.log(`  Insight: ${result.reflection.key_insight}`);
      console.log('');
    },
  });

  // Display final playbook
  console.log('Final Playbook:');
  console.log('---------------');
  const playbook = adapter.getPlaybook();
  console.log(playbook.toString());
  console.log('');

  console.log('Stats:', JSON.stringify(playbook.stats(), null, 2));
}

main().catch(console.error);

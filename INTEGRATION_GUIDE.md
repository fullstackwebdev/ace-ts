# ACE Integration Guide (TypeScript)

Comprehensive guide for integrating ACE learning with your agentic system.

---

## Table of Contents

1. [Integration vs Full Pipeline](#integration-vs-full-pipeline)
2. [The Base Integration Pattern](#the-base-integration-pattern)
3. [Building a Custom Integration](#building-a-custom-integration)
4. [Reference Implementations](#reference-implementations)
5. [Integration Patterns](#integration-patterns)
6. [Advanced Topics](#advanced-topics)
7. [Troubleshooting](#troubleshooting)

---

## Integration vs Full Pipeline

### Decision Tree: Which Approach Should You Use?

```
Do you have an existing agentic system?
│
├─ YES → Use INTEGRATION PATTERN
│   │
│   ├─ Browser automation? → Use ACEAgent (browser-use)
│   ├─ LangChain chains/agents? → Use ACELangChain (coming soon)
│   └─ Custom agent? → Follow this guide
│
└─ NO → Use FULL ACE PIPELINE
    │
    ├─ Simple tasks (Q&A, classification)? → Use ACEAgent
    └─ Complex tasks (tools, workflows)? → Use OfflineACE/OnlineACE
```

### What's the Difference?

**INTEGRATION PATTERN** (this guide):
- Your agent executes tasks (browser automation, LangChain, custom API)
- ACE **learns** from results (doesn't execute)
- Components: Skillbook + Reflector + SkillManager (NO Agent)
- Use case: Wrapping existing agents with learning

**FULL ACE PIPELINE** (not this guide):
- ACE Agent executes tasks
- Full ACE components: Skillbook + Agent + Reflector + SkillManager
- Use case: Building new agents from scratch
- See: `ACEAgent` class and `OfflineACE`/`OnlineACE` in `adaptation.ts`

---

## The Base Integration Pattern

All ACE integrations follow a three-step pattern:

### Step 1: INJECT (Optional but Recommended)

Add learned strategies from the skillbook to your agent's input.

```typescript
import { wrapSkillbookContext } from '@kayba/ace-framework/integrations/base';
import { Skillbook } from '@kayba/ace-framework';

const skillbook = new Skillbook(); // or load existing: Skillbook.loadFromFile("expert.json")
const task = "Process user request";

// Inject skillbook context
if (skillbook.skills().length > 0) {
  const enhancedTask = `${task}\n\n${wrapSkillbookContext(skillbook)}`;
} else {
  const enhancedTask = task; // No learned strategies yet
}
```

**What does `wrapSkillbookContext()` do?**
- Formats learned strategies with success rates
- Adds usage instructions for the agent
- Returns empty string if no skills (safe to call always)

### Step 2: EXECUTE

Your agent runs normally - ACE doesn't interfere.

```typescript
// Your agent (any framework/API)
const result = await yourAgent.execute(enhancedTask);

// Examples:
// - Browser automation: await agent.run({ task: enhancedTask })
// - LangChain: await chain.invoke({ input: enhancedTask })
// - API: await fetch("/execute", { method: "POST", body: JSON.stringify({ task: enhancedTask }) })
// - Custom: await myAgent.run(enhancedTask)
```

### Step 3: LEARN

ACE analyzes the result and updates the skillbook.

```typescript
import { OpenAICompatibleClient, Reflector, SkillManager } from '@kayba/ace-framework';
import { AgentOutput } from '@kayba/ace-framework';

// Setup ACE learning components (do this once)
const llmClient = new OpenAICompatibleClient({
  baseURL: "http://localhost:8080",
  model: "llama-3.1-8b"
});
const reflector = new Reflector(llmClient);
const skillManager = new SkillManager(llmClient);

// Create adapter for Reflector interface
const agentOutput: AgentOutput = {
  reasoning: `Task: ${task}`,  // What happened
  final_answer: result.output,  // Agent's output
  skill_ids: [],  // External agents don't cite skills
  raw: { success: result.success, steps: result.steps }  // Metadata
};

// Build feedback string
const feedback = `Task ${result.success ? 'succeeded' : 'failed'}. Output: ${result.output}`;

// Reflect: Analyze what worked/failed
const reflection = await reflector.reflect({
  question: task,
  generatorAnswer: agentOutput.final_answer,
  feedback: feedback,
  skillbook: skillbook
});

// Update skills: Generate skillbook updates
const updates = await skillManager.curate({
  reflectionAnalysis: reflection.analysis,
  skillbook: skillbook
});

// Apply updates
skillbook.applyUpdate(updates);

// Save for next time
await skillbook.saveToFile("learned_strategies.json");
```

---

## Building a Custom Integration

### Wrapper Class Pattern (Recommended)

Create a wrapper class that bundles your agent with ACE learning:

```typescript
import { Skillbook, OpenAICompatibleClient, Reflector, SkillManager } from '@kayba/ace-framework';
import { wrapSkillbookContext } from '@kayba/ace-framework/integrations/base';
import { AgentOutput } from '@kayba/ace-framework';

interface AgentResult {
  output: string;
  success: boolean;
  [key: string]: any;
}

interface ACEWrapperConfig {
  agent: any;  // Your agent instance
  aceModel?: string;
  baseURL?: string;
  skillbookPath?: string;
  isLearning?: boolean;
}

class ACEWrapper {
  /** Wraps your custom agent with ACE learning. */
  
  private agent: any;
  private isLearning: boolean;
  private skillbook: Skillbook;
  private llmClient: OpenAICompatibleClient;
  private reflector: Reflector;
  private skillManager: SkillManager;

  constructor(config: ACEWrapperConfig) {
    this.agent = config.agent;
    this.isLearning = config.isLearning ?? true;

    // Load or create skillbook
    if (config.skillbookPath) {
      try {
        this.skillbook = Skillbook.loadFromFile(config.skillbookPath);
      } catch (err) {
        // File doesn't exist yet, will create on first save
        this.skillbook = new Skillbook();
      }
    } else {
      this.skillbook = new Skillbook();
    }

    // Setup ACE learning components
    this.llmClient = new OpenAICompatibleClient({
      baseURL: config.baseURL || "http://localhost:8080",
      model: config.aceModel || "llama-3.1-8b"
    });
    this.reflector = new Reflector(this.llmClient);
    this.skillManager = new SkillManager(this.llmClient);
  }

  async run(task: string): Promise<AgentResult> {
    /** Execute task with ACE learning. */
    
    // STEP 1: Inject skillbook context
    const enhancedTask = this._injectContext(task);

    // STEP 2: Execute
    const result = await this.agent.execute(enhancedTask);

    // STEP 3: Learn (if enabled)
    if (this.isLearning) {
      await this._learn(task, result);
    }

    return result;
  }

  private _injectContext(task: string): string {
    /** Add skillbook strategies to task. */
    if (this.skillbook.skills().length > 0) {
      return `${task}\n\n${wrapSkillbookContext(this.skillbook)}`;
    }
    return task;
  }

  private async _learn(task: string, result: AgentResult): Promise<void> {
    /** Run ACE learning pipeline. */
    
    // Adapt result to ACE interface
    const agentOutput: AgentOutput = {
      reasoning: `Task: ${task}`,
      final_answer: result.output,
      skill_ids: [],
      raw: { success: result.success }
    };

    // Build feedback
    const feedback = `Task ${result.success ? 'succeeded' : 'failed'}`;

    // Reflect
    const reflection = await this.reflector.reflect({
      question: task,
      generatorAnswer: agentOutput.final_answer,
      feedback: feedback,
      skillbook: this.skillbook
    });

    // Update skills
    const updates = await this.skillManager.curate({
      reflectionAnalysis: reflection.analysis,
      skillbook: this.skillbook
    });

    // Update skillbook
    this.skillbook.applyUpdate(updates);
  }

  async saveSkillbook(path: string): Promise<void> {
    /** Save learned strategies. */
    await this.skillbook.saveToFile(path);
  }

  async loadSkillbook(path: string): Promise<void> {
    /** Load existing strategies. */
    this.skillbook = await Skillbook.loadFromFile(path);
  }

  enableLearning(): void {
    /** Enable learning. */
    this.isLearning = true;
  }

  disableLearning(): void {
    /** Disable learning (execution only). */
    this.isLearning = false;
  }
}
```

### Usage Example

```typescript
// Your custom agent
class MyAgent {
  async execute(task: string): Promise<AgentResult> {
    // Your agent logic
    return { output: "result", success: true };
  }
}

// Wrap with ACE
const myAgent = new MyAgent();
const aceAgent = new ACEWrapper({
  agent: myAgent,
  isLearning: true,
  baseURL: "http://localhost:8080",
  model: "llama-3.1-8b"
});

// Use it
const result = await aceAgent.run("Process data");
console.log(`Result: ${result.output}`);
console.log(`Learned ${aceAgent.skillbook.skills().length} strategies`);

// Save learned knowledge
await aceAgent.saveSkillbook("my_agent_learned.json");

// Next session: Load previous knowledge
const aceAgent2 = new ACEWrapper({
  agent: new MyAgent(),
  skillbookPath: "my_agent_learned.json",
  baseURL: "http://localhost:8080"
});
```

---

## Reference Implementations

### Simple Integration (ACEAgent)

See [`examples/simple-example.ts`](examples/simple-example.ts) for the simplest integration:

```typescript
import { ACEAgent } from '@kayba/ace-framework';

// Create self-improving agent
const agent = new ACEAgent({
  baseURL: "http://localhost:8080",
  model: "llama-3.1-8b"
});

// Ask questions - agent learns automatically
const answer = await agent.ask("What does Kayba's ACE framework do?");
console.log(answer);

// View learned strategies
console.log(`✅ Learned ${agent.getStats().skills} skills`);

// Save for reuse
agent.saveSkillbook("my-agent.json");
```

### Offline Training

See [`examples/offline-training.ts`](examples/offline-training.ts) for multi-epoch training:

```typescript
import {
  OfflineACE,
  Agent,
  Reflector,
  SkillManager,
  SimpleEnvironment,
  OpenAICompatibleClient
} from '@kayba/ace-framework';

const llmClient = new OpenAICompatibleClient({
  baseURL: "http://localhost:8080",
  model: "llama-3.1-8b"
});

const ace = new OfflineACE({
  agent: new Agent(llmClient),
  reflector: new Reflector(llmClient),
  skillManager: new SkillManager(llmClient)
});

const samples = [
  { question: "What is 2+2?", groundTruth: "4" },
  { question: "What is 5*3?", groundTruth: "15" }
];

const results = await ace.run(samples, new SimpleEnvironment(), {
  epochs: 2
});
```

### Runnable Examples

See these working examples in the repository:

- **Simple Q&A**: [`examples/simple-example.ts`](examples/simple-example.ts)
- **Offline training**: [`examples/offline-training.ts`](examples/offline-training.ts)
- **Online learning**: [`examples/online-learning.ts`](examples/online-learning.ts)
- **Learning from mistakes**: [`examples/seahorse-emoji.ts`](examples/seahorse-emoji.ts)

---

## Integration Patterns

Common patterns for integrating ACE with different types of agents. Each pattern includes complete code examples, when to use it, and key considerations.

---

### REST API-Based Agents

#### When to Use
- Your agent is a REST API service
- Remote execution (cloud-based agents)
- Stateless request/response pattern

#### Pattern

```typescript
import {
  Skillbook,
  OpenAICompatibleClient,
  Reflector,
  SkillManager,
  AgentOutput
} from '@kayba/ace-framework';
import { wrapSkillbookContext } from '@kayba/ace-framework/integrations/base';

interface APIResult {
  output: string;
  success: boolean;
}

class ACEAPIAgent {
  /** Wraps REST API agent with ACE learning. */

  private apiURL: string;
  private apiKey?: string;
  private skillbook: Skillbook;
  private llmClient: OpenAICompatibleClient;
  private reflector: Reflector;
  private skillManager: SkillManager;

  constructor(
    apiURL: string,
    apiKey?: string,
    aceModel: string = "llama-3.1-8b",
    baseURL: string = "http://localhost:8080"
  ) {
    this.apiURL = apiURL;
    this.apiKey = apiKey;
    this.skillbook = new Skillbook();

    // ACE components
    this.llmClient = new OpenAICompatibleClient({
      baseURL,
      model: aceModel
    });
    this.reflector = new Reflector(this.llmClient);
    this.skillManager = new SkillManager(this.llmClient);
  }

  async execute(task: string): Promise<APIResult> {
    /** Execute task via API with ACE learning. */
    
    // Inject context
    if (this.skillbook.skills().length > 0) {
      task = `${task}\n\n${wrapSkillbookContext(this.skillbook)}`;
    }

    // API call
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.apiURL}/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({ task }),
      timeout: 60000
    });

    // Extract result
    const success = response.ok;
    const data = await response.json();
    const output = success ? data.result : data.error || response.statusText;

    // Learn
    await this._learn(task, output, success);

    return { output, success };
  }

  private async _learn(task: string, output: string, success: boolean): Promise<void> {
    // Create adapter
    const agentOutput: AgentOutput = {
      reasoning: `API call for task: ${task}`,
      final_answer: output,
      skill_ids: [],
      raw: { success }
    };

    // Feedback
    const feedback = `API call ${success ? 'succeeded' : 'failed'}. Output: ${output.slice(0, 200)}`;

    // Reflect + Update skills
    const reflection = await this.reflector.reflect({
      question: task,
      generatorAnswer: agentOutput.final_answer,
      feedback,
      skillbook: this.skillbook
    });

    const updates = await this.skillManager.curate({
      reflectionAnalysis: reflection.analysis,
      skillbook: this.skillbook
    });

    this.skillbook.applyUpdate(updates);
  }
}

// Usage
const agent = new ACEAPIAgent(
  "https://api.example.com",
  "your-api-key"
);
const result = await agent.execute("Process user data");
await agent.skillbook.saveToFile("api_agent_learned.json");
```

#### Key Considerations
- Handle timeouts and retries
- Parse API error messages for better feedback
- Consider rate limiting (don't learn on every call if high volume)

---

### Multi-Step Workflow Agents

#### When to Use
- Agent executes multiple sequential steps
- Each step has its own outcome
- Want to learn from entire workflow

#### Pattern

```typescript
import {
  Skillbook,
  OpenAICompatibleClient,
  Reflector,
  SkillManager,
  AgentOutput
} from '@kayba/ace-framework';
import { wrapSkillbookContext } from '@kayba/ace-framework/integrations/base';

interface WorkflowStep {
  action: string;
  outcome: string;
  success: boolean;
  duration: number;
}

interface WorkflowResult {
  steps: WorkflowStep[];
  finalOutput: string;
  overallSuccess: boolean;
}

class ACEWorkflowAgent {
  /** Wraps multi-step workflow agent with rich trace learning. */

  private agent: any;
  private skillbook: Skillbook;
  private llmClient: OpenAICompatibleClient;
  private reflector: Reflector;
  private skillManager: SkillManager;

  constructor(
    workflowAgent: any,
    aceModel: string = "llama-3.1-8b",
    baseURL: string = "http://localhost:8080"
  ) {
    this.agent = workflowAgent;
    this.skillbook = new Skillbook();

    this.llmClient = new OpenAICompatibleClient({
      baseURL,
      model: aceModel
    });
    this.reflector = new Reflector(this.llmClient);
    this.skillManager = new SkillManager(this.llmClient);
  }

  async run(task: string): Promise<WorkflowResult> {
    /** Execute workflow with ACE learning. */
    
    // Inject context
    if (this.skillbook.skills().length > 0) {
      task = `${task}\n\n${wrapSkillbookContext(this.skillbook)}`;
    }

    // Execute workflow (returns WorkflowResult)
    const result = await this.agent.executeWorkflow(task);

    // Learn from entire workflow
    await this._learn(task, result);

    return result;
  }

  private async _learn(task: string, result: WorkflowResult): Promise<void> {
    /** Learn from complete workflow trace. */
    
    // Build rich feedback with all steps
    const feedbackParts = [
      `Workflow ${result.overallSuccess ? 'succeeded' : 'failed'} ` +
      `in ${result.steps.length} steps\n`
    ];

    result.steps.forEach((step, i) => {
      const status = step.success ? "✓" : "✗";
      feedbackParts.push(
        `Step ${i + 1} [${status}]: ${step.action}\n` +
        `  → Outcome: ${step.outcome}\n` +
        `  → Duration: ${step.duration.toFixed(2)}s`
      );
    });

    const feedback = feedbackParts.join("\n");

    // Create adapter with full trace
    const agentOutput: AgentOutput = {
      reasoning: feedback,  // Full workflow trace
      final_answer: result.finalOutput,
      skill_ids: [],
      raw: {
        totalSteps: result.steps.length,
        successfulSteps: result.steps.filter(s => s.success).length,
        totalDuration: result.steps.reduce((sum, s) => sum + s.duration, 0)
      }
    };

    // Reflect + Update skills
    const reflection = await this.reflector.reflect({
      question: task,
      generatorAnswer: agentOutput.final_answer,
      feedback,
      skillbook: this.skillbook
    });

    const updates = await this.skillManager.curate({
      reflectionAnalysis: reflection.analysis,
      skillbook: this.skillbook
    });

    this.skillbook.applyUpdate(updates);
  }
}

// Usage
const workflowAgent = new MyWorkflowAgent();
const aceAgent = new ACEWorkflowAgent(workflowAgent);
const result = await aceAgent.run("Complete data pipeline");
```

#### Key Considerations
- Include step-by-step trace in feedback for better learning
- Track timing information to learn performance patterns
- Distinguish partial failures (some steps succeed) from total failures

---

### Tool-Using Agents

#### When to Use
- Agent has access to external tools/functions
- Tool selection and usage is part of learning
- Want to inject context into system message or tool descriptions

#### Pattern

```typescript
import {
  Skillbook,
  OpenAICompatibleClient,
  Reflector,
  SkillManager,
  AgentOutput
} from '@kayba/ace-framework';
import { wrapSkillbookContext } from '@kayba/ace-framework/integrations/base';

interface ToolUsage {
  name: string;
  args: Record<string, any>;
  outcome: string;
}

interface ToolAgentResult {
  output: string;
  success: boolean;
  toolsUsed: ToolUsage[];
  toolResults: any[];
}

class ACEToolAgent {
  /** Wraps tool-using agent with ACE learning. */

  private agent: any;
  private skillbook: Skillbook;
  private llmClient: OpenAICompatibleClient;
  private reflector: Reflector;
  private skillManager: SkillManager;
  private originalSystemMessage: string;

  constructor(
    toolAgent: any,
    aceModel: string = "llama-3.1-8b",
    baseURL: string = "http://localhost:8080"
  ) {
    this.agent = toolAgent;
    this.skillbook = new Skillbook();
    this.originalSystemMessage = toolAgent.systemMessage || "";

    this.llmClient = new OpenAICompatibleClient({
      baseURL,
      model: aceModel
    });
    this.reflector = new Reflector(this.llmClient);
    this.skillManager = new SkillManager(this.llmClient);
  }

  async run(task: string): Promise<ToolAgentResult> {
    /** Execute with tool access and ACE learning. */
    
    // Inject skillbook into system message (not task)
    if (this.skillbook.skills().length > 0) {
      const context = wrapSkillbookContext(this.skillbook);
      this.agent.systemMessage = `${this.originalSystemMessage}\n\n${context}`;
    }

    // Execute (agent selects and uses tools)
    const result = await this.agent.execute(task);

    // Restore original system message
    this.agent.systemMessage = this.originalSystemMessage;

    // Learn
    await this._learn(task, result);

    return result;
  }

  private async _learn(task: string, result: ToolAgentResult): Promise<void> {
    /** Learn from tool usage patterns. */
    
    // Extract tool usage information
    const toolsUsed = result.toolsUsed || [];
    const toolResults = result.toolResults || [];

    // Build rich feedback
    const feedbackParts = [
      `Task ${result.success ? 'succeeded' : 'failed'}`,
      `Tools used: ${toolsUsed.map(t => t.name).join(', ')}`
    ];

    toolsUsed.forEach((tool, i) => {
      const toolResult = toolResults[i]?.outcome || 'N/A';
      feedbackParts.push(
        `  ${tool.name}(${JSON.stringify(tool.args)}) → ${toolResult}`
      );
    });

    const feedback = feedbackParts.join("\n");

    // Adapter
    const agentOutput: AgentOutput = {
      reasoning: feedback,
      final_answer: result.output,
      skill_ids: [],
      raw: { toolsUsed: toolsUsed.map(t => t.name) }
    };

    // Reflect + Update skills
    const reflection = await this.reflector.reflect({
      question: task,
      generatorAnswer: agentOutput.final_answer,
      feedback,
      skillbook: this.skillbook
    });

    const updates = await this.skillManager.curate({
      reflectionAnalysis: reflection.analysis,
      skillbook: this.skillbook
    });

    this.skillbook.applyUpdate(updates);
  }
}

// Usage
const toolAgent = new MyToolUsingAgent({ tools: [...] });
const aceAgent = new ACEToolAgent(toolAgent);
const result = await aceAgent.run("Analyze data and send report");
```

#### Key Considerations
- Inject context into system message (not task) for better tool selection
- Track which tools were used for learning tool selection patterns
- Include tool outcomes in feedback

---

### Async Agents

#### When to Use
- Agent operations are async (browser automation, async APIs)
- Need non-blocking execution
- Want to maintain async interface

#### Pattern

```typescript
import {
  Skillbook,
  OpenAICompatibleClient,
  Reflector,
  SkillManager,
  AgentOutput
} from '@kayba/ace-framework';
import { wrapSkillbookContext } from '@kayba/ace-framework/integrations/base';

interface AsyncResult {
  output: string;
  success: boolean;
}

class ACEAsyncAgent {
  /** Wraps async agent with ACE learning. */

  private agent: any;
  private skillbook: Skillbook;
  private llmClient: OpenAICompatibleClient;
  private reflector: Reflector;
  private skillManager: SkillManager;

  constructor(
    asyncAgent: any,
    aceModel: string = "llama-3.1-8b",
    baseURL: string = "http://localhost:8080"
  ) {
    this.agent = asyncAgent;
    this.skillbook = new Skillbook();

    this.llmClient = new OpenAICompatibleClient({
      baseURL,
      model: aceModel
    });
    this.reflector = new Reflector(this.llmClient);
    this.skillManager = new SkillManager(this.llmClient);
  }

  async run(task: string): Promise<AsyncResult> {
    /** Async execution with ACE learning. */
    
    // Inject context
    if (this.skillbook.skills().length > 0) {
      task = `${task}\n\n${wrapSkillbookContext(this.skillbook)}`;
    }

    // Execute (async)
    const result = await this.agent.execute(task);

    // Learn (native async - no threading needed in TS)
    await this._learn(task, result);

    return result;
  }

  private async _learn(task: string, result: AsyncResult): Promise<void> {
    /** Async learning pipeline. */
    
    const agentOutput: AgentOutput = {
      reasoning: `Async task: ${task}`,
      final_answer: result.output,
      skill_ids: [],
      raw: { success: result.success }
    };

    const feedback = `Async task ${result.success ? 'succeeded' : 'failed'}`;

    const reflection = await this.reflector.reflect({
      question: task,
      generatorAnswer: agentOutput.final_answer,
      feedback,
      skillbook: this.skillbook
    });

    const updates = await this.skillManager.curate({
      reflectionAnalysis: reflection.analysis,
      skillbook: this.skillbook
    });

    this.skillbook.applyUpdate(updates);
  }
}

// Usage
async function main() {
  const asyncAgent = new MyAsyncAgent();
  const aceAgent = new ACEAsyncAgent(asyncAgent);

  const result = await aceAgent.run("Fetch and process data");
  console.log(`Result: ${result.output}`);
}

main();
```

#### Key Considerations
- TypeScript async/await is native - no need for `asyncio.to_thread()`
- ACE learning is already async, so it composes naturally
- Consider batching learning for high-throughput async systems

---

### Chat-Based Agents

#### When to Use
- Agent maintains conversation history
- Multi-turn interactions
- Want to learn from entire conversation

#### Pattern

```typescript
import {
  Skillbook,
  OpenAICompatibleClient,
  Reflector,
  SkillManager,
  AgentOutput
} from '@kayba/ace-framework';
import { wrapSkillbookContext } from '@kayba/ace-framework/integrations/base';

interface ConversationTurn {
  user: string;
  assistant: string;
}

class ACEChatAgent {
  /** Wraps chat agent with per-conversation learning. */

  private agent: any;
  private skillbook: Skillbook;
  private llmClient: OpenAICompatibleClient;
  private reflector: Reflector;
  private skillManager: SkillManager;
  private conversationHistory: ConversationTurn[];

  constructor(
    chatAgent: any,
    aceModel: string = "llama-3.1-8b",
    baseURL: string = "http://localhost:8080"
  ) {
    this.agent = chatAgent;
    this.skillbook = new Skillbook();
    this.conversationHistory = [];

    this.llmClient = new OpenAICompatibleClient({
      baseURL,
      model: aceModel
    });
    this.reflector = new Reflector(this.llmClient);
    this.skillManager = new SkillManager(this.llmClient);
  }

  async chat(message: string): Promise<string> {
    /** Single chat turn with context injection. */
    
    // Inject skillbook on first message
    if (this.conversationHistory.length === 0 && this.skillbook.skills().length > 0) {
      const systemContext = wrapSkillbookContext(this.skillbook);
      await this.agent.addSystemMessage(systemContext);
    }

    // Chat
    const response = await this.agent.chat(message);

    // Track conversation
    this.conversationHistory.push({ user: message, assistant: response });

    return response;
  }

  async endConversation(success: boolean = true, feedback: string = ""): Promise<void> {
    /** Learn from entire conversation at the end. */
    
    if (this.conversationHistory.length === 0) {
      return;
    }

    // Build conversation summary
    const conversation = this.conversationHistory.map(
      turn => `User: ${turn.user}\nAssistant: ${turn.assistant}`
    ).join("\n");

    // Learn from full conversation
    const agentOutput: AgentOutput = {
      reasoning: conversation,
      final_answer: this.conversationHistory[this.conversationHistory.length - 1].assistant,
      skill_ids: [],
      raw: { turns: this.conversationHistory.length }
    };

    const feedbackText = (
      `Conversation ${success ? 'succeeded' : 'failed'} ` +
      `over ${this.conversationHistory.length} turns. ${feedback}`
    );

    const reflection = await this.reflector.reflect({
      question: this.conversationHistory[0].user,
      generatorAnswer: agentOutput.final_answer,
      feedback: feedbackText,
      skillbook: this.skillbook
    });

    const updates = await this.skillManager.curate({
      reflectionAnalysis: reflection.analysis,
      skillbook: this.skillbook
    });

    this.skillbook.applyUpdate(updates);

    // Reset for next conversation
    this.conversationHistory = [];
  }
}

// Usage
const chatAgent = new MyChatAgent();
const aceAgent = new ACEChatAgent(chatAgent);

// Multi-turn conversation
await aceAgent.chat("Hello, I need help with X");
await aceAgent.chat("Can you clarify Y?");
await aceAgent.chat("Thanks, that works!");

// Learn from entire conversation
await aceAgent.endConversation(true, "User satisfied");
await aceAgent.skillbook.saveToFile("chat_agent_learned.json");
```

#### Key Considerations
- Learn from complete conversation (not individual turns)
- Inject skillbook context at conversation start
- Allow manual feedback at conversation end

---

### Batch Processing Agents

#### When to Use
- Processing large batches of similar tasks
- Want to amortize learning costs
- Need high throughput

#### Pattern

```typescript
import {
  Skillbook,
  OpenAICompatibleClient,
  Reflector,
  SkillManager,
  AgentOutput
} from '@kayba/ace-framework';
import { wrapSkillbookContext } from '@kayba/ace-framework/integrations/base';

interface BatchResult {
  output: string;
  success: boolean;
}

class ACEBatchAgent {
  /** Wraps agent with batched learning. */

  private agent: any;
  private skillbook: Skillbook;
  private llmClient: OpenAICompatibleClient;
  private reflector: Reflector;
  private skillManager: SkillManager;
  private learnEvery: number;
  private pendingResults: Array<[string, BatchResult]>;

  constructor(
    agent: any,
    aceModel: string = "llama-3.1-8b",
    baseURL: string = "http://localhost:8080",
    learnEvery: number = 10
  ) {
    this.agent = agent;
    this.skillbook = new Skillbook();
    this.learnEvery = learnEvery;
    this.pendingResults = [];

    this.llmClient = new OpenAICompatibleClient({
      baseURL,
      model: aceModel
    });
    this.reflector = new Reflector(this.llmClient);
    this.skillManager = new SkillManager(this.llmClient);
  }

  async process(task: string): Promise<BatchResult> {
    /** Process single task (learn in batches). */
    
    // Inject context
    if (this.skillbook.skills().length > 0) {
      task = `${task}\n\n${wrapSkillbookContext(this.skillbook)}`;
    }

    // Execute
    const result = await this.agent.execute(task);

    // Add to pending
    this.pendingResults.push([task, result]);

    // Learn when batch is full
    if (this.pendingResults.length >= this.learnEvery) {
      await this._learnFromBatch();
    }

    return result;
  }

  private async _learnFromBatch(): Promise<void> {
    /** Learn from accumulated results. */
    
    if (this.pendingResults.length === 0) {
      return;
    }

    // Aggregate feedback
    const successes = this.pendingResults.filter(([_, r]) => r.success).length;
    const failures = this.pendingResults.length - successes;

    // Learn from batch summary
    const feedback = (
      `Batch of ${this.pendingResults.length} tasks: ` +
      `${successes} succeeded, ${failures} failed`
    );

    // Use first task as representative
    const [task, result] = this.pendingResults[0];

    const agentOutput: AgentOutput = {
      reasoning: `Batch processing: ${feedback}`,
      final_answer: result.output,
      skill_ids: [],
      raw: {
        batchSize: this.pendingResults.length,
        successRate: successes / this.pendingResults.length
      }
    };

    const reflection = await this.reflector.reflect({
      question: task,
      generatorAnswer: agentOutput.final_answer,
      feedback,
      skillbook: this.skillbook
    });

    const updates = await this.skillManager.curate({
      reflectionAnalysis: reflection.analysis,
      skillbook: this.skillbook
    });

    this.skillbook.applyUpdate(updates);

    // Clear pending
    this.pendingResults = [];
  }

  async flush(): Promise<void> {
    /** Force learning from remaining pending results. */
    await this._learnFromBatch();
  }
}

// Usage
const agent = new MyBatchAgent();
const aceAgent = new ACEBatchAgent(agent, "llama-3.1-8b", "http://localhost:8080", 10);

// Process many tasks
for (const task of tasks) {
  await aceAgent.process(task);
}

// Learn from remainder
await aceAgent.flush();
await aceAgent.skillbook.saveToFile("batch_learned.json");
```

#### Key Considerations
- Balance learning frequency vs cost (learnEvery parameter)
- Call `flush()` at end to learn from remaining items
- Consider success rate in batch feedback

---

### Streaming Agents

#### When to Use
- Agent streams responses token-by-token
- Want to maintain streaming interface
- Learn after complete stream

#### Pattern

```typescript
import {
  Skillbook,
  OpenAICompatibleClient,
  Reflector,
  SkillManager,
  AgentOutput
} from '@kayba/ace-framework';
import { wrapSkillbookContext } from '@kayba/ace-framework/integrations/base';

class ACEStreamingAgent {
  /** Wraps streaming agent with post-stream learning. */

  private agent: any;
  private skillbook: Skillbook;
  private llmClient: OpenAICompatibleClient;
  private reflector: Reflector;
  private skillManager: SkillManager;

  constructor(
    streamingAgent: any,
    aceModel: string = "llama-3.1-8b",
    baseURL: string = "http://localhost:8080"
  ) {
    this.agent = streamingAgent;
    this.skillbook = new Skillbook();

    this.llmClient = new OpenAICompatibleClient({
      baseURL,
      model: aceModel
    });
    this.reflector = new Reflector(this.llmClient);
    this.skillManager = new SkillManager(this.llmClient);
  }

  async *stream(task: string): AsyncGenerator<string> {
    /** Stream response with learning after completion. */
    
    // Inject context
    if (this.skillbook.skills().length > 0) {
      task = `${task}\n\n${wrapSkillbookContext(this.skillbook)}`;
    }

    // Collect full response while streaming
    const fullResponse: string[] = [];

    for await (const chunk of this.agent.stream(task)) {
      fullResponse.push(chunk);
      yield chunk;  // Stream to caller
    }

    // Learn after stream completes
    const completeResponse = fullResponse.join("");
    await this._learn(task, completeResponse);
  }

  private async _learn(task: string, response: string): Promise<void> {
    /** Learn from complete streamed response. */
    
    const agentOutput: AgentOutput = {
      reasoning: `Streamed response for: ${task}`,
      final_answer: response,
      skill_ids: [],
      raw: { responseLength: response.length }
    };

    const feedback = `Streamed ${response.length} characters`;

    const reflection = await this.reflector.reflect({
      question: task,
      generatorAnswer: agentOutput.final_answer,
      feedback,
      skillbook: this.skillbook
    });

    const updates = await this.skillManager.curate({
      reflectionAnalysis: reflection.analysis,
      skillbook: this.skillbook
    });

    this.skillbook.applyUpdate(updates);
  }
}

// Usage
const streamingAgent = new MyStreamingAgent();
const aceAgent = new ACEStreamingAgent(streamingAgent);

for await (const chunk of aceAgent.stream("Generate report")) {
  process.stdout.write(chunk);
}
```

#### Key Considerations
- Collect full response before learning
- Don't block streaming (learn after completion)
- Maintain streaming interface for caller using async generators

---

### Error-Prone Agents

#### When to Use
- Agent frequently fails or throws exceptions
- Want to learn from failures
- Need robust error handling

#### Pattern

```typescript
import {
  Skillbook,
  OpenAICompatibleClient,
  Reflector,
  SkillManager,
  AgentOutput
} from '@kayba/ace-framework';
import { wrapSkillbookContext } from '@kayba/ace-framework/integrations/base';

interface ExecutionResult {
  output: string;
  success: boolean;
}

class ACERobustAgent {
  /** Wraps agent with error handling and failure learning. */

  private agent: any;
  private skillbook: Skillbook;
  private llmClient: OpenAICompatibleClient;
  private reflector: Reflector;
  private skillManager: SkillManager;
  private maxRetries: number;

  constructor(
    agent: any,
    aceModel: string = "llama-3.1-8b",
    baseURL: string = "http://localhost:8080",
    maxRetries: number = 3
  ) {
    this.agent = agent;
    this.skillbook = new Skillbook();
    this.maxRetries = maxRetries;

    this.llmClient = new OpenAICompatibleClient({
      baseURL,
      model: aceModel
    });
    this.reflector = new Reflector(this.llmClient);
    this.skillManager = new SkillManager(this.llmClient);
  }

  async run(task: string): Promise<ExecutionResult> {
    /** Execute with retries and error learning. */
    
    // Inject context
    if (this.skillbook.skills().length > 0) {
      task = `${task}\n\n${wrapSkillbookContext(this.skillbook)}`;
    }

    let lastError: string | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await this.agent.execute(task);
        // Success - learn from it
        await this._learn(task, result, true);
        return result;

      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        if (attempt < this.maxRetries - 1) {
          // Retry
          continue;
        } else {
          // Final failure - learn from it
          await this._learn(task, null, false, lastError);
          throw e;
        }
      }
    }

    throw new Error("Unexpected error in retry loop");
  }

  private async _learn(
    task: string,
    result: ExecutionResult | null,
    success: boolean,
    error?: string
  ): Promise<void> {
    /** Learn from both successes and failures. */
    
    try {
      // Build feedback
      let feedback: string;
      let finalAnswer: string;

      if (success && result) {
        feedback = `Task succeeded. Output: ${result.output}`;
        finalAnswer = result.output;
      } else {
        feedback = `Task failed after ${this.maxRetries} attempts. Error: ${error}`;
        finalAnswer = "";
      }

      // Adapter
      const agentOutput: AgentOutput = {
        reasoning: `Task: ${task}. ${feedback}`,
        final_answer: finalAnswer,
        skill_ids: [],
        raw: { success, error }
      };

      // Reflect + Update skills
      const reflection = await this.reflector.reflect({
        question: task,
        generatorAnswer: agentOutput.final_answer,
        feedback,
        skillbook: this.skillbook
      });

      const updates = await this.skillManager.curate({
        reflectionAnalysis: reflection.analysis,
        skillbook: this.skillbook
      });

      this.skillbook.applyUpdate(updates);

    } catch (learningError) {
      // Never crash due to learning failures
      console.error(`ACE learning failed: ${learningError}`);
    }
  }
}

// Usage
const errorProneAgent = new MyUnreliableAgent();
const aceAgent = new ACERobustAgent(errorProneAgent, "llama-3.1-8b", "http://localhost:8080", 3);

try {
  const result = await aceAgent.run("Risky task");
  console.log(`Success: ${result.output}`);
} catch (e) {
  console.error(`Task failed: ${e}`);
  // But skillbook learned from the failure!
}
```

#### Key Considerations
- Learn from both successes AND failures
- Wrap learning in try/catch (never crash from learning)
- Include error details in feedback for failure pattern learning

---

## Advanced Topics

### Rich Feedback Extraction

The quality of ACE learning depends on the feedback you provide. The more detailed, the better.

**Basic Feedback (Minimal):**
```typescript
const feedback = `Task ${success ? 'succeeded' : 'failed'}`;
```

**Good Feedback (Contextual):**
```typescript
const feedback = `
Task ${success ? 'succeeded' : 'failed'} in ${steps} steps.
Duration: ${duration}s
Final output: ${output.slice(0, 200)}...
`;
```

**Rich Feedback (Detailed Trace):**
```typescript
// For agents with step-by-step execution
const feedbackParts: string[] = [];
feedbackParts.push(`Task ${status} in ${steps.length} steps`);

// Add execution trace
steps.forEach((step, i) => {
  feedbackParts.push(`\nStep ${i + 1}:`);
  feedbackParts.push(`  Thought: ${step.thought}`);
  feedbackParts.push(`  Action: ${step.action}`);
  feedbackParts.push(`  Result: ${step.result}`);
});

const feedback = feedbackParts.join("\n");
```

**Benefits of Rich Feedback:**
- Learns action sequencing patterns
- Understands timing requirements
- Recognizes error patterns
- Captures domain-specific knowledge

### Citation-Based Strategy Tracking

ACE uses citations to track which strategies were used:

**How It Works:**
1. Strategies are formatted with IDs: `[section-00001]`
2. Agent cites them in reasoning: `"Following [navigation-00042], I will..."`
3. ACE extracts citations automatically

**Extracting Citations:**
```typescript
import { extractCitedSkillIds } from '@kayba/ace-framework';

// Agent's reasoning with citations
const reasoning = `
Step 1: Following [navigation-00042], navigate to main page.
Step 2: Using [extraction-00003], extract title element.
`;

// Extract citations
const citedIds = extractCitedSkillIds(reasoning);
// Returns: ['navigation-00042', 'extraction-00003']

// Pass to AgentOutput
const agentOutput: AgentOutput = {
  reasoning,
  final_answer: result,
  skill_ids: citedIds,
  raw: {}
};
```

**For External Agents:**
```typescript
// Extract from agent's thought process
if ('modelThoughts' in history) {
  const thoughts = history.modelThoughts;
  const thoughtsText = thoughts.map((t: any) => t.thinking).join("\n");
  const citedIds = extractCitedSkillIds(thoughtsText);
}
```

### Error Handling

Always wrap learning in try/catch to prevent crashes:

```typescript
private async _learn(task: string, result: any): Promise<void> {
  try {
    // Reflection
    const reflection = await this.reflector.reflect({
      question: task,
      generatorAnswer: result.output,
      feedback: "Task completed",
      skillbook: this.skillbook
    });

    // Update skills
    const updates = await this.skillManager.curate({
      reflectionAnalysis: reflection.analysis,
      skillbook: this.skillbook
    });

    // Update
    this.skillbook.applyUpdate(updates);

  } catch (e) {
    console.error(`ACE learning failed: ${e}`);
    // Continue without learning - don't crash!
  }
}
```

### Token Limits

ACE learning components need sufficient tokens:

```typescript
// Reflector: 400-800 tokens typical
// SkillManager: 300-1000 tokens typical
const llmClient = new OpenAICompatibleClient({
  baseURL: "http://localhost:8080",
  model: "llama-3.1-8b",
  maxTokens: 2048  // Recommended
});

// For complex tasks with long traces:
const llmClient = new OpenAICompatibleClient({
  baseURL: "http://localhost:8080",
  model: "llama-3.1-8b",
  maxTokens: 4096
});
```

---

## Troubleshooting

### Problem: JSON Parsing Errors from SkillManager

**Cause:** Insufficient `maxTokens` for structured output

**Solution:**
```typescript
const llmClient = new OpenAICompatibleClient({
  baseURL: "http://localhost:8080",
  model: "llama-3.1-8b",
  maxTokens: 2048  // or higher
});
```

### Problem: Not Learning Anything

**Checks:**
1. Is learning enabled? Check your wrapper's `isLearning` flag
2. Is SkillManager output non-empty? `console.log(updates)`
3. Is skillbook being saved? `await skillbook.saveToFile(...)`

### Problem: Too Many Skills

**Solution:** SkillManager automatically manages skills via TAG operations. Review with:
```typescript
const skills = skillbook.skills();
console.log(`Total: ${skills.length}`);
skills.slice(0, 10).forEach(s => {
  console.log(`[${s.id}] +${s.helpful}/-${s.harmful}: ${s.content}`);
});
```

### Problem: High API Costs

**Solutions:**
- Use smaller local model: `model="llama-3.1-8b"` or `model="glm-4.7-flash"`
- Disable learning for simple tasks: `isLearning=false`
- Batch learning: Learn only every N tasks

### Problem: Agent Ignores Skillbook Strategies

**Checks:**
1. Are you actually injecting context? `console.log(enhancedTask)`
2. Does skillbook have skills? `console.log(skillbook.skills().length)`
3. Is context clear enough for your agent?

---

## Next Steps

1. **Start Simple:** Use the wrapper class template above
2. **Adapt `_learn()`:** Customize for your agent's output format
3. **Test Without Learning:** Set `isLearning=false` first
4. **Enable Learning:** Turn on and monitor skillbook growth
5. **Iterate:** Improve feedback extraction for better learning

---

## See Also

- **Out-of-box integrations:** ACEAgent, OfflineACE, OnlineACE
- **Full ACE guide:** [COMPLETE_GUIDE_TO_ACE.md](COMPLETE_GUIDE_TO_ACE.md) (Python version)
- **API reference:** See source files in `src/` directory
- **Examples:** [`examples/`](examples/) directory

Questions? Join our [Discord](https://discord.gg/mqCqH7sTyK)

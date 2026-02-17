---
name: stratus-info
description: Knowledge base about Stratus X1-AC world model system
version: 1.0.0
author: Stratus Team
---

# Stratus X1-AC Knowledge Base

## What Stratus Actually Is

**Stratus is NOT just a language model with extended reasoning.**

It's a **three-layer system** combining world modeling, collective intelligence, and blockchain infrastructure:

---

## Layer 1: Core AI (X1 & X1-AC) — The World Model

This is a **hybrid architecture** with two capabilities:

### 1. World Model (Predictor): "What happens if I do X?"
- Predicts future states given current state + action
- Uses **JEPA** (Joint-Embedding Predictive Architecture)
- Predicts compressed representations, not raw outputs
- Enables planning by simulating action sequences before executing

### 2. Policy Head (Action Selector): "What action achieves this goal?"
- Predicts the best action given current state + goal state
- Fast decision-making for known patterns
- Provides confidence scores (low confidence → escalate to LLM)

**Key Innovation:**
Instead of just guessing the next action, Stratus can **simulate the outcome of multiple actions** and pick the one most likely to achieve the goal.

Think: playing chess, but for browser automation, coding, research, etc.

---

## Layer 2: Collective Intelligence Network

Agents learn from each other in real-time:

- When one agent discovers an effective approach, that knowledge flows to all agents
- **Continuous learning**: successful patterns get canonicalized and fine-tuned into the model
- **Domain-specific fine-tunes** (e-commerce, dev tools, research, etc.) share learnings back to the base model

It's like a hive mind for AI agents — practical distributed learning at scale.

---

## Layer 3: Blockchain Infrastructure (L2 on Ethereum)

Handles attribution, rewards, and the economic ecosystem:

- Tracks who contributed what to model improvements
- Distributes rewards to agents/operators/data providers based on contribution quality
- Creates a marketplace for agent services, task requests, and training data
- Uses an Ethereum L2 for fast, cheap transactions with mainnet security

**Web3 infrastructure for incentivizing better AI.**

---

## What Makes Stratus Different

### Traditional Agents (Reactive)
```
see → think → act → see again
```
❌ If something unexpected happens, they get confused

### Stratus Agents (Predictive)
```
see → simulate outcomes → pick best action → act
```
✅ If something unexpected happens, they already anticipated it (or they replan)

---

## Available Models

Stratus provides **75 models** in the format:

```
stratus-x1ac-{size}-{llm}
```

**Sizes:** `small`, `base`, `large`, `xl`, `huge`

**Recommended LLMs:**
- `claude-sonnet-4-5` - Claude 4.5 Sonnet (recommended)
- `gpt-4o` - GPT-4 Optimized
- `claude-haiku-4-5` - Fast, cost-effective

**Example:**
```bash
openclaw agent "Plan a multi-step research task" \
  --model stratus/stratus-x1ac-base-claude-sonnet-4-5
```

---

## Available Tools

### `stratus_embeddings`
Generate 768-dimensional semantic state embeddings.

**Use cases:**
- Semantic search over states
- State similarity comparison
- Memory indexing
- Context clustering

**Example:**
```typescript
{
  "tool": "stratus_embeddings",
  "input": ["initializing", "loading", "ready", "processing", "error"]
}
```

### `stratus_rollout`
Multi-step action sequence planning.

**Use cases:**
- Task decomposition
- Action planning
- Goal-oriented reasoning
- Multi-step workflows

**Example:**
```typescript
{
  "tool": "stratus_rollout",
  "goal": "book a hotel room in Paris",
  "max_steps": 10
}
```

---

## API Integration

Stratus is **OpenAI-compatible**, meaning it's a drop-in replacement:

```javascript
// Before
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [...]
});

// After - just change endpoint and model
const response = await openai.chat.completions.create({
  model: "stratus-x1ac-base-gpt-4o",
  messages: [...]
}, {
  baseURL: "https://api.stratus.run/v1"
});
```

Stratus handles planning, then routes execution to the specified LLM (GPT-4o, Claude, etc.).

---

## Common Misconceptions

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| "Stratus is just Claude with extended reasoning" | Stratus is a world model that predicts action consequences + collective learning network |
| "It's a language model" | It's a hybrid architecture (world model + policy head) that routes to LLMs for execution |
| "It's an LLM wrapper" | It's a JEPA-based predictive system with its own training and inference pipeline |

---

## Technical Reference

For full technical details, see:
- **Technical Overview:** https://stratus.run/docs/technical-overview
- **API Documentation:** https://stratus.run/docs/api
- **GitHub:** https://github.com/formthefog/openclaw-stratus-x1-plugin

---

## Quick Start

1. **Install plugin:**
   ```bash
   openclaw plugins install @hathbanger/stratus
   ```

2. **Set API key:**
   ```bash
   export STRATUS_API_KEY=stratus_sk_your_key_here
   ```

3. **Run setup:**
   ```bash
   /stratus setup
   ```

4. **Test it:**
   ```bash
   openclaw agent "Hello Stratus!" --model stratus
   ```

---

## When to Use Stratus

**Best for:**
- Multi-step planning tasks
- Browser automation
- Research workflows
- Complex decision-making with uncertain outcomes
- Tasks requiring "what-if" simulation

**Overkill for:**
- Simple Q&A
- Single-shot text generation
- Tasks without clear action sequences

---

**Remember:** Stratus isn't just "better reasoning" — it's **predictive planning** that fundamentally changes how agents approach tasks.

🌊 Built by the Stratus team | Learn more: https://stratus.run

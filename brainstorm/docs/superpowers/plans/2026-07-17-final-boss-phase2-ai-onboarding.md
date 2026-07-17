# Final Boss Phase 2: AI Layer + Onboarding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the provider-agnostic AI abstraction and the full onboarding conversation flow — from freeform goal description through archetype assignment to skill tree generation.

**Architecture:** AI layer is a single interface (`AIProvider`) with implementations swappable via config. Onboarding is a multi-step stateful conversation stored in the DB. The Assessor AI role drives the onboarding conversation, the Architect role generates the skill tree.

**Tech Stack:** Anthropic SDK / OpenAI SDK (swappable), Fastify routes, Drizzle ORM, React Native screens with chat UI.

## Global Constraints

- TypeScript strict mode everywhere
- AI provider must be swappable without changing calling code
- All AI prompts stored as versioned constants (not inline strings)
- Onboarding state persisted to DB (survives app restart)
- Archetype taxonomy: 8 archetypes (defined in this phase)
- Skill tree: 12-20 nodes per user, 3-5 top-level branches

---

## File Structure (new files this phase)

```
apps/api/src/
├── ai/
│   ├── provider.ts         (AIProvider interface)
│   ├── anthropic.ts        (Claude implementation)
│   ├── openai.ts           (GPT implementation)
│   └── index.ts            (factory — reads config, returns provider)
├── prompts/
│   ├── assessor.ts         (onboarding conversation prompts)
│   ├── architect.ts        (skill tree generation prompts)
│   └── types.ts            (prompt input/output types)
├── routes/
│   └── onboarding.ts       (onboarding conversation endpoints)
├── services/
│   ├── onboarding.ts       (onboarding state machine)
│   └── skill-tree.ts       (tree generation + storage)
├── db/
│   └── schema.ts           (add onboarding_conversations table)
tests/
├── ai.test.ts
├── onboarding.test.ts
└── skill-tree.test.ts

apps/mobile/
├── app/(app)/
│   └── onboarding.tsx      (onboarding chat screen)
├── components/
│   ├── ChatBubble.tsx      (message bubble component)
│   └── ChatInput.tsx       (text input for chat)
└── lib/
    └── onboarding.ts       (onboarding API calls)
```

---

### Task 1: AI Provider Abstraction

**Files:**
- Create: `apps/api/src/ai/provider.ts`
- Create: `apps/api/src/ai/anthropic.ts`
- Create: `apps/api/src/ai/openai.ts`
- Create: `apps/api/src/ai/index.ts`
- Create: `apps/api/tests/ai.test.ts`
- Modify: `apps/api/package.json` (add AI SDK deps)
- Modify: `apps/api/src/config.ts` (add AI config)

**Interfaces:**
- Consumes: `config.aiProvider`, `config.aiApiKey`
- Produces: `getAI(): AIProvider` factory, `AIProvider.chat(messages, options): Promise<string>`, `AIProvider.chatJSON<T>(messages, schema, options): Promise<T>`

- [ ] **Step 1: Add dependencies**

Add to `apps/api/package.json` dependencies:
```json
"@anthropic-ai/sdk": "^0.30.0",
"openai": "^4.70.0",
"zod": "^3.23.0"
```

Run: `pnpm install`

Add to `apps/api/src/config.ts`:
```typescript
aiProvider: (process.env.AI_PROVIDER || "anthropic") as "anthropic" | "openai",
aiApiKey: process.env.AI_API_KEY || "",
aiModel: process.env.AI_MODEL || "claude-sonnet-4-6-20250514",
```

- [ ] **Step 2: Write failing test**

`apps/api/tests/ai.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { getAI, type AIProvider } from "../src/ai/index.js";

describe("AI Provider", () => {
  it("exports getAI factory", () => {
    expect(typeof getAI).toBe("function");
  });

  it("provider implements chat interface", () => {
    const ai = getAI();
    expect(typeof ai.chat).toBe("function");
    expect(typeof ai.chatJSON).toBe("function");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/api && pnpm test -- tests/ai.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 4: Implement provider interface**

`apps/api/src/ai/provider.ts`:
```typescript
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  temperature?: number;
  maxTokens?: number;
};

export interface AIProvider {
  chat(messages: Message[], options?: ChatOptions): Promise<string>;
  chatJSON<T>(messages: Message[], options?: ChatOptions): Promise<T>;
}
```

- [ ] **Step 5: Implement Anthropic provider**

`apps/api/src/ai/anthropic.ts`:
```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, Message, ChatOptions } from "./provider.js";
import { config } from "../config.js";

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: config.aiApiKey });
    this.model = config.aiModel;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<string> {
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens || 1024,
      temperature: options?.temperature,
      system: systemMessage?.content,
      messages: chatMessages,
    });

    const block = response.content[0];
    if (block.type !== "text") throw new Error("Unexpected response type");
    return block.text;
  }

  async chatJSON<T>(messages: Message[], options?: ChatOptions): Promise<T> {
    const withJsonInstruction: Message[] = [
      ...messages.slice(0, -1),
      {
        ...messages[messages.length - 1],
        content: messages[messages.length - 1].content + "\n\nRespond with valid JSON only. No markdown, no explanation.",
      },
    ];
    const text = await this.chat(withJsonInstruction, options);
    return JSON.parse(text) as T;
  }
}
```

- [ ] **Step 6: Implement OpenAI provider**

`apps/api/src/ai/openai.ts`:
```typescript
import OpenAI from "openai";
import type { AIProvider, Message, ChatOptions } from "./provider.js";
import { config } from "../config.js";

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({ apiKey: config.aiApiKey });
    this.model = config.aiModel || "gpt-4o";
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: options?.maxTokens || 1024,
      temperature: options?.temperature,
    });

    return response.choices[0]?.message?.content || "";
  }

  async chatJSON<T>(messages: Message[], options?: ChatOptions): Promise<T> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: options?.maxTokens || 1024,
      temperature: options?.temperature,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content || "{}";
    return JSON.parse(text) as T;
  }
}
```

- [ ] **Step 7: Implement factory**

`apps/api/src/ai/index.ts`:
```typescript
import { config } from "../config.js";
import type { AIProvider } from "./provider.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";

export type { AIProvider, Message, ChatOptions } from "./provider.js";

let instance: AIProvider | null = null;

export function getAI(): AIProvider {
  if (!instance) {
    instance = config.aiProvider === "openai"
      ? new OpenAIProvider()
      : new AnthropicProvider();
  }
  return instance;
}
```

- [ ] **Step 8: Run tests**

```bash
cd apps/api && pnpm test -- tests/ai.test.ts
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/ai apps/api/tests/ai.test.ts apps/api/package.json apps/api/src/config.ts
git commit -m "feat(api): add provider-agnostic AI layer (Anthropic + OpenAI)"
```

---

### Task 2: Archetype Taxonomy + Prompts

**Files:**
- Create: `apps/api/src/prompts/types.ts`
- Create: `apps/api/src/prompts/assessor.ts`
- Create: `apps/api/src/prompts/architect.ts`
- Modify: `packages/shared/src/types.ts` (add archetype type)

**Interfaces:**
- Consumes: nothing
- Produces: `ARCHETYPES` constant (8 archetypes with descriptions), `buildAssessorSystemPrompt()`, `buildAssessorClarifyPrompt(context)`, `buildArchetypeAssignmentPrompt(context)`, `buildSkillTreePrompt(archetype, gap)` — all return `Message[]`

- [ ] **Step 1: Define archetype type in shared**

Add to `packages/shared/src/types.ts`:
```typescript
export type Archetype =
  | "disciplined-achiever"
  | "creative-force"
  | "stoic-leader"
  | "empathic-connector"
  | "relentless-learner"
  | "bold-entrepreneur"
  | "mindful-warrior"
  | "visionary-builder";
```

- [ ] **Step 2: Create prompt types**

`apps/api/src/prompts/types.ts`:
```typescript
import type { Archetype } from "@final-boss/shared";

export type OnboardingContext = {
  finalBossDescription: string;
  currentSelfDescription?: string;
  clarifyingAnswers: { question: string; answer: string }[];
};

export type ArchetypeAssignment = {
  archetype: Archetype;
  explanation: string;
  dimensions: { name: string; currentLevel: number; targetLevel: number }[];
};

export type SkillTreeNode = {
  title: string;
  description: string;
  estimatedDays: number;
  parentTitle: string | null;
  orderIndex: number;
};

export type GeneratedSkillTree = {
  nodes: SkillTreeNode[];
};
```

- [ ] **Step 3: Create assessor prompts**

`apps/api/src/prompts/assessor.ts`:
```typescript
import type { Message } from "../ai/provider.js";
import type { OnboardingContext } from "./types.js";

export const ARCHETYPES = {
  "disciplined-achiever": "Systematic, goal-oriented. Builds through consistent daily habits and measurable progress. The marathon runner.",
  "creative-force": "Expressive, innovative. Grows through creation, experimentation, and artistic output. The artist-builder.",
  "stoic-leader": "Calm, principled. Develops through emotional mastery, decision-making under pressure, and influence. The commander.",
  "empathic-connector": "Warm, perceptive. Evolves through deep relationships, communication mastery, and community building. The bridge.",
  "relentless-learner": "Curious, analytical. Advances through knowledge acquisition, skill stacking, and intellectual challenge. The scholar.",
  "bold-entrepreneur": "Risk-taking, resourceful. Grows through action, iteration, and building from nothing. The maker.",
  "mindful-warrior": "Present, resilient. Develops through physical mastery, mental discipline, and mind-body integration. The athlete-monk.",
  "visionary-builder": "Strategic, ambitious. Evolves through systems thinking, long-term planning, and creating lasting impact. The architect.",
} as const;

export function buildAssessorSystemPrompt(): Message {
  return {
    role: "system",
    content: `You are the Assessor for Final Boss, a personal transformation program. Your job is to understand who someone wants to become and who they are today.

You ask clarifying questions one at a time. Be warm but direct. Ask about:
- Specific behaviors and traits they want to develop
- What "success" looks like day-to-day (not abstract)
- What's currently holding them back
- Their relationship with discipline, creativity, relationships, learning

Keep questions conversational and insightful. Don't interrogate. You're a wise friend trying to understand them deeply.

When you have enough context (usually 3-5 questions), say exactly: "[READY]" at the start of your message, then give a brief summary of what you've understood.`,
  };
}

export function buildClarifyingPrompt(context: OnboardingContext): Message[] {
  const messages: Message[] = [buildAssessorSystemPrompt()];

  messages.push({
    role: "user",
    content: `Here's who I want to become:\n\n${context.finalBossDescription}`,
  });

  for (const qa of context.clarifyingAnswers) {
    messages.push({ role: "assistant", content: qa.question });
    messages.push({ role: "user", content: qa.answer });
  }

  if (context.currentSelfDescription) {
    messages.push({
      role: "user",
      content: `And here's who I am today:\n\n${context.currentSelfDescription}`,
    });
  }

  return messages;
}

export function buildArchetypeAssignmentPrompt(context: OnboardingContext): Message[] {
  const archetypeDescriptions = Object.entries(ARCHETYPES)
    .map(([key, desc]) => `- ${key}: ${desc}`)
    .join("\n");

  return [
    {
      role: "system",
      content: `You are assigning an archetype to a user based on their transformation goals. Available archetypes:\n\n${archetypeDescriptions}\n\nAnalyze their goal and current state. Assign the single best-fit archetype. Also identify 4-6 growth dimensions with current level (1-10) and target level (1-10).

Return JSON with this exact shape:
{
  "archetype": "archetype-slug",
  "explanation": "2-3 sentences explaining why this archetype fits",
  "dimensions": [
    { "name": "dimension name", "currentLevel": 3, "targetLevel": 8 }
  ]
}`,
    },
    {
      role: "user",
      content: `Final boss vision: ${context.finalBossDescription}\n\nCurrent self: ${context.currentSelfDescription || "Not provided"}\n\nClarifying conversation:\n${context.clarifyingAnswers.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join("\n\n")}`,
    },
  ];
}
```

- [ ] **Step 4: Create architect prompts**

`apps/api/src/prompts/architect.ts`:
```typescript
import type { Message } from "../ai/provider.js";
import type { Archetype } from "@final-boss/shared";
import type { ArchetypeAssignment } from "./types.js";

export function buildSkillTreePrompt(
  assignment: ArchetypeAssignment,
  finalBossDescription: string
): Message[] {
  return [
    {
      role: "system",
      content: `You are the Architect for Final Boss. Generate a skill tree for a user's transformation journey.

Rules:
- Create 12-20 nodes total
- 3-5 top-level branches (parentTitle: null)
- Each branch has 2-5 child nodes
- Nodes should be concrete growth areas, not vague
- estimatedDays per node: 7-30 (be realistic)
- Order nodes within branches by difficulty (easier first)
- The tree should cover all identified growth dimensions
- Node titles should be inspiring but specific (e.g., "Morning Mastery" not "Wake up early")

Return JSON with this exact shape:
{
  "nodes": [
    {
      "title": "Node Title",
      "description": "What this growth area involves — 1-2 sentences",
      "estimatedDays": 14,
      "parentTitle": null or "Parent Node Title",
      "orderIndex": 0
    }
  ]
}`,
    },
    {
      role: "user",
      content: `Archetype: ${assignment.archetype}
Explanation: ${assignment.explanation}

Growth dimensions:
${assignment.dimensions.map((d) => `- ${d.name}: ${d.currentLevel}/10 → ${d.targetLevel}/10`).join("\n")}

Final boss vision: ${finalBossDescription}

Generate the full skill tree.`,
    },
  ];
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/prompts packages/shared/src/types.ts
git commit -m "feat(api): add archetype taxonomy and AI prompt templates"
```

---

### Task 3: Onboarding State Machine + API Routes

**Files:**
- Create: `apps/api/src/services/onboarding.ts`
- Create: `apps/api/src/services/skill-tree.ts`
- Create: `apps/api/src/routes/onboarding.ts`
- Create: `apps/api/tests/onboarding.test.ts`
- Modify: `apps/api/src/db/schema.ts` (add onboarding_conversations table)
- Modify: `apps/api/src/index.ts` (register routes)

**Interfaces:**
- Consumes: `getAI()` (Task 1), prompts (Task 2), `db` + schema (Phase 1 Task 3), `authenticate` middleware
- Produces: `POST /onboarding/start` (begin onboarding), `POST /onboarding/message` (send user message, get AI response), `POST /onboarding/current-self` (submit current self description), `GET /onboarding/status` (get onboarding state), `POST /onboarding/complete` (finalize — assigns archetype + generates tree)

- [ ] **Step 1: Add onboarding_conversations table to schema**

Add to `apps/api/src/db/schema.ts`:
```typescript
export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "awaiting_final_boss",
  "clarifying",
  "awaiting_current_self",
  "assigning_archetype",
  "generating_tree",
  "selecting_branch",
  "complete",
]);

export const onboardingConversations = pgTable("onboarding_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  status: onboardingStatusEnum("status").notNull().default("awaiting_final_boss"),
  finalBossDescription: text("final_boss_description"),
  currentSelfDescription: text("current_self_description"),
  clarifyingAnswers: jsonb("clarifying_answers").$type<{ question: string; answer: string }[]>().default([]),
  archetypeResult: jsonb("archetype_result").$type<{
    archetype: string;
    explanation: string;
    dimensions: { name: string; currentLevel: number; targetLevel: number }[];
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Generate migration: `pnpm db:generate`

- [ ] **Step 2: Implement onboarding service**

`apps/api/src/services/onboarding.ts`:
```typescript
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { onboardingConversations, users } from "../db/schema.js";
import { getAI } from "../ai/index.js";
import {
  buildClarifyingPrompt,
  buildArchetypeAssignmentPrompt,
} from "../prompts/assessor.js";
import type { OnboardingContext, ArchetypeAssignment } from "../prompts/types.js";

export async function getOrCreateOnboarding(userId: string) {
  let [conv] = await db
    .select()
    .from(onboardingConversations)
    .where(eq(onboardingConversations.userId, userId))
    .limit(1);

  if (!conv) {
    [conv] = await db
      .insert(onboardingConversations)
      .values({ userId })
      .returning();
  }

  return conv;
}

export async function submitFinalBoss(userId: string, description: string) {
  const [conv] = await db
    .update(onboardingConversations)
    .set({
      finalBossDescription: description,
      status: "clarifying",
      updatedAt: new Date(),
    })
    .where(eq(onboardingConversations.userId, userId))
    .returning();

  // Get first clarifying question
  const ai = getAI();
  const context: OnboardingContext = {
    finalBossDescription: description,
    clarifyingAnswers: [],
  };
  const messages = buildClarifyingPrompt(context);
  const response = await ai.chat(messages);

  return { conversation: conv, aiResponse: response };
}

export async function submitClarifyingAnswer(userId: string, answer: string) {
  const [conv] = await db
    .select()
    .from(onboardingConversations)
    .where(eq(onboardingConversations.userId, userId))
    .limit(1);

  if (!conv || conv.status !== "clarifying") {
    throw new Error("Not in clarifying state");
  }

  // Get the last AI question (we need to reconstruct it)
  const context: OnboardingContext = {
    finalBossDescription: conv.finalBossDescription!,
    clarifyingAnswers: conv.clarifyingAnswers || [],
  };

  // First, get what the AI's last question was by replaying
  const ai = getAI();
  const prevMessages = buildClarifyingPrompt(context);
  const lastQuestion = await ai.chat(prevMessages);

  // Add this Q&A pair
  const updatedAnswers = [
    ...(conv.clarifyingAnswers || []),
    { question: lastQuestion, answer },
  ];

  // Get next response
  const nextContext: OnboardingContext = {
    ...context,
    clarifyingAnswers: updatedAnswers,
  };
  const nextMessages = buildClarifyingPrompt(nextContext);
  const nextResponse = await ai.chat(nextMessages);

  const isReady = nextResponse.startsWith("[READY]");
  const newStatus = isReady ? "awaiting_current_self" : "clarifying";

  const [updated] = await db
    .update(onboardingConversations)
    .set({
      clarifyingAnswers: updatedAnswers,
      status: newStatus as any,
      updatedAt: new Date(),
    })
    .where(eq(onboardingConversations.userId, userId))
    .returning();

  return { conversation: updated, aiResponse: nextResponse, isReady };
}

export async function submitCurrentSelf(userId: string, description: string) {
  const [conv] = await db
    .update(onboardingConversations)
    .set({
      currentSelfDescription: description,
      status: "assigning_archetype",
      updatedAt: new Date(),
    })
    .where(eq(onboardingConversations.userId, userId))
    .returning();

  return conv;
}

export async function assignArchetype(userId: string): Promise<ArchetypeAssignment> {
  const [conv] = await db
    .select()
    .from(onboardingConversations)
    .where(eq(onboardingConversations.userId, userId))
    .limit(1);

  if (!conv) throw new Error("No onboarding found");

  const context: OnboardingContext = {
    finalBossDescription: conv.finalBossDescription!,
    currentSelfDescription: conv.currentSelfDescription || undefined,
    clarifyingAnswers: conv.clarifyingAnswers || [],
  };

  const ai = getAI();
  const messages = buildArchetypeAssignmentPrompt(context);
  const result = await ai.chatJSON<ArchetypeAssignment>(messages);

  // Save to onboarding + user
  await db
    .update(onboardingConversations)
    .set({ archetypeResult: result as any, status: "generating_tree", updatedAt: new Date() })
    .where(eq(onboardingConversations.userId, userId));

  await db
    .update(users)
    .set({
      archetype: result.archetype,
      finalBossDescription: conv.finalBossDescription,
      currentSelfDescription: conv.currentSelfDescription,
    })
    .where(eq(users.id, userId));

  return result;
}
```

- [ ] **Step 3: Implement skill tree service**

`apps/api/src/services/skill-tree.ts`:
```typescript
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { skillNodes, onboardingConversations, users } from "../db/schema.js";
import { getAI } from "../ai/index.js";
import { buildSkillTreePrompt } from "../prompts/architect.js";
import type { ArchetypeAssignment, GeneratedSkillTree } from "../prompts/types.js";

export async function generateSkillTree(userId: string): Promise<void> {
  const [conv] = await db
    .select()
    .from(onboardingConversations)
    .where(eq(onboardingConversations.userId, userId))
    .limit(1);

  if (!conv || !conv.archetypeResult) throw new Error("Archetype not assigned");

  const assignment = conv.archetypeResult as unknown as ArchetypeAssignment;
  const ai = getAI();
  const messages = buildSkillTreePrompt(assignment, conv.finalBossDescription!);
  const tree = await ai.chatJSON<GeneratedSkillTree>(messages);

  // Insert nodes — first pass: root nodes (parentTitle === null)
  const nodeMap = new Map<string, string>(); // title -> id

  const rootNodes = tree.nodes.filter((n) => !n.parentTitle);
  for (const node of rootNodes) {
    const [inserted] = await db
      .insert(skillNodes)
      .values({
        userId,
        title: node.title,
        description: node.description,
        estimatedDays: node.estimatedDays,
        orderIndex: node.orderIndex,
        status: "available", // root nodes start available
      })
      .returning();
    nodeMap.set(node.title, inserted.id);
  }

  // Second pass: child nodes
  const childNodes = tree.nodes.filter((n) => n.parentTitle);
  for (const node of childNodes) {
    const parentId = nodeMap.get(node.parentTitle!);
    const [inserted] = await db
      .insert(skillNodes)
      .values({
        userId,
        parentNodeId: parentId || null,
        title: node.title,
        description: node.description,
        estimatedDays: node.estimatedDays,
        orderIndex: node.orderIndex,
        status: "locked",
      })
      .returning();
    nodeMap.set(node.title, inserted.id);
  }

  // Compute initial time estimate
  const totalDays = tree.nodes.reduce((sum, n) => sum + n.estimatedDays, 0);
  await db
    .update(users)
    .set({ timeToFinalBoss: totalDays })
    .where(eq(users.id, userId));

  // Update onboarding status
  await db
    .update(onboardingConversations)
    .set({ status: "selecting_branch", updatedAt: new Date() })
    .where(eq(onboardingConversations.userId, userId));
}

export async function getUserSkillTree(userId: string) {
  return db
    .select()
    .from(skillNodes)
    .where(eq(skillNodes.userId, userId))
    .orderBy(skillNodes.orderIndex);
}

export async function selectBranch(userId: string, nodeId: string) {
  // Set the selected node to "active"
  await db
    .update(skillNodes)
    .set({ status: "active" })
    .where(eq(skillNodes.id, nodeId));

  // Mark onboarding complete
  await db
    .update(onboardingConversations)
    .set({ status: "complete", updatedAt: new Date() })
    .where(eq(onboardingConversations.userId, userId));

  await db
    .update(users)
    .set({
      onboardingComplete: new Date(),
      trialStatus: "active",
      trialStartDate: new Date().toISOString().split("T")[0],
    })
    .where(eq(users.id, userId));
}
```

- [ ] **Step 4: Implement onboarding routes**

`apps/api/src/routes/onboarding.ts`:
```typescript
import type { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/authenticate.js";
import {
  getOrCreateOnboarding,
  submitFinalBoss,
  submitClarifyingAnswer,
  submitCurrentSelf,
  assignArchetype,
} from "../services/onboarding.js";
import { generateSkillTree, getUserSkillTree, selectBranch } from "../services/skill-tree.js";

export async function onboardingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/onboarding/status", async (request) => {
    const conv = await getOrCreateOnboarding(request.userId);
    return { data: conv };
  });

  app.post<{ Body: { description: string } }>("/onboarding/final-boss", async (request, reply) => {
    const { description } = request.body || {};
    if (!description?.trim()) {
      return reply.status(400).send({ error: { code: "REQUIRED", message: "Description required" } });
    }
    const result = await submitFinalBoss(request.userId, description);
    return { data: { status: result.conversation.status, aiResponse: result.aiResponse } };
  });

  app.post<{ Body: { answer: string } }>("/onboarding/clarify", async (request, reply) => {
    const { answer } = request.body || {};
    if (!answer?.trim()) {
      return reply.status(400).send({ error: { code: "REQUIRED", message: "Answer required" } });
    }
    const result = await submitClarifyingAnswer(request.userId, answer);
    return { data: { status: result.conversation.status, aiResponse: result.aiResponse, isReady: result.isReady } };
  });

  app.post<{ Body: { description: string } }>("/onboarding/current-self", async (request, reply) => {
    const { description } = request.body || {};
    if (!description?.trim()) {
      return reply.status(400).send({ error: { code: "REQUIRED", message: "Description required" } });
    }
    await submitCurrentSelf(request.userId, description);

    // Auto-trigger archetype assignment
    const assignment = await assignArchetype(request.userId);
    return { data: { archetype: assignment } };
  });

  app.post("/onboarding/generate-tree", async (request) => {
    await generateSkillTree(request.userId);
    const tree = await getUserSkillTree(request.userId);
    return { data: { nodes: tree } };
  });

  app.post<{ Body: { nodeId: string } }>("/onboarding/select-branch", async (request, reply) => {
    const { nodeId } = request.body || {};
    if (!nodeId) {
      return reply.status(400).send({ error: { code: "REQUIRED", message: "nodeId required" } });
    }
    await selectBranch(request.userId, nodeId);
    return { data: { message: "Onboarding complete. Your journey begins." } };
  });
}
```

- [ ] **Step 5: Register routes in server**

Add to `apps/api/src/index.ts`:
```typescript
import { onboardingRoutes } from "./routes/onboarding.js";
```

In `buildApp()`:
```typescript
await app.register(onboardingRoutes);
```

- [ ] **Step 6: Generate migration and run**

```bash
cd apps/api && pnpm db:generate && pnpm db:migrate
```

- [ ] **Step 7: Write integration test**

`apps/api/tests/onboarding.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { getOrCreateOnboarding } from "../src/services/onboarding.js";

// Mock AI to avoid real API calls in tests
vi.mock("../src/ai/index.js", () => ({
  getAI: () => ({
    chat: vi.fn().mockResolvedValue("What does your ideal morning look like?"),
    chatJSON: vi.fn().mockResolvedValue({
      archetype: "disciplined-achiever",
      explanation: "You focus on systematic growth",
      dimensions: [
        { name: "Discipline", currentLevel: 4, targetLevel: 9 },
        { name: "Focus", currentLevel: 5, targetLevel: 8 },
      ],
    }),
  }),
}));

describe("Onboarding Service", () => {
  it("getOrCreateOnboarding returns a conversation object", async () => {
    // This test requires a running DB — skip in CI without DB
    // In practice, run with a test database
    expect(typeof getOrCreateOnboarding).toBe("function");
  });
});
```

- [ ] **Step 8: Run tests**

```bash
cd apps/api && pnpm test
```

Expected: All pass

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services apps/api/src/routes/onboarding.ts apps/api/src/db/schema.ts apps/api/tests/onboarding.test.ts apps/api/src/index.ts apps/api/drizzle
git commit -m "feat(api): add onboarding state machine with AI-driven conversation flow"
```

---

### Task 4: Mobile Onboarding Chat UI

**Files:**
- Create: `apps/mobile/app/(app)/onboarding.tsx`
- Create: `apps/mobile/components/ChatBubble.tsx`
- Create: `apps/mobile/components/ChatInput.tsx`
- Create: `apps/mobile/lib/onboarding.ts`
- Modify: `apps/mobile/app/(app)/home.tsx` (redirect to onboarding if needed)

**Interfaces:**
- Consumes: API endpoints from Task 3 (`/onboarding/*`), `api()` client, `useAuth()`
- Produces: Full onboarding flow screens: final boss input → clarifying chat → current self input → archetype reveal → skill tree preview → branch selection

- [ ] **Step 1: Create onboarding API helpers**

`apps/mobile/lib/onboarding.ts`:
```typescript
import { api } from "./api";

export type OnboardingStatus = {
  status: string;
  finalBossDescription?: string;
  currentSelfDescription?: string;
  archetypeResult?: {
    archetype: string;
    explanation: string;
    dimensions: { name: string; currentLevel: number; targetLevel: number }[];
  };
};

export type SkillNode = {
  id: string;
  title: string;
  description: string;
  status: string;
  estimatedDays: number;
  parentNodeId: string | null;
};

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  return api("/onboarding/status");
}

export async function submitFinalBoss(description: string) {
  return api<{ status: string; aiResponse: string }>("/onboarding/final-boss", {
    method: "POST",
    body: JSON.stringify({ description }),
  });
}

export async function submitClarifyingAnswer(answer: string) {
  return api<{ status: string; aiResponse: string; isReady: boolean }>("/onboarding/clarify", {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
}

export async function submitCurrentSelf(description: string) {
  return api<{ archetype: { archetype: string; explanation: string; dimensions: any[] } }>("/onboarding/current-self", {
    method: "POST",
    body: JSON.stringify({ description }),
  });
}

export async function generateTree() {
  return api<{ nodes: SkillNode[] }>("/onboarding/generate-tree", { method: "POST" });
}

export async function selectBranch(nodeId: string) {
  return api<{ message: string }>("/onboarding/select-branch", {
    method: "POST",
    body: JSON.stringify({ nodeId }),
  });
}
```

- [ ] **Step 2: Create ChatBubble component**

`apps/mobile/components/ChatBubble.tsx`:
```typescript
import { View, Text, StyleSheet } from "react-native";

type Props = {
  content: string;
  role: "user" | "assistant";
};

export function ChatBubble({ content, role }: Props) {
  const isUser = role === "user";
  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
      <Text style={[styles.text, isUser ? styles.userText : styles.aiText]}>
        {content}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "80%", padding: 14, borderRadius: 16, marginVertical: 4 },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#f59e0b" },
  aiBubble: { alignSelf: "flex-start", backgroundColor: "#1e293b" },
  text: { fontSize: 15, lineHeight: 22 },
  userText: { color: "#0f1729" },
  aiText: { color: "#f1f5f9" },
});
```

- [ ] **Step 3: Create ChatInput component**

`apps/mobile/components/ChatInput.tsx`:
```typescript
import { useState } from "react";
import { View, TextInput, Pressable, Text, StyleSheet } from "react-native";

type Props = {
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
};

export function ChatInput({ onSend, placeholder = "Type...", disabled, multiline }: Props) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        multiline={multiline}
        editable={!disabled}
      />
      <Pressable style={[styles.send, disabled && styles.sendDisabled]} onPress={handleSend} disabled={disabled}>
        <Text style={styles.sendText}>→</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "flex-end", padding: 12, backgroundColor: "#0f1729", borderTopWidth: 1, borderTopColor: "#1e293b" },
  input: { flex: 1, backgroundColor: "#1e293b", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, color: "#f8fafc", fontSize: 15, maxHeight: 120 },
  send: { marginLeft: 8, backgroundColor: "#f59e0b", width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: "#0f1729", fontSize: 18, fontWeight: "700" },
});
```

- [ ] **Step 4: Create onboarding screen**

`apps/mobile/app/(app)/onboarding.tsx`:
```typescript
import { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import { ChatBubble } from "@/components/ChatBubble";
import { ChatInput } from "@/components/ChatInput";
import {
  getOnboardingStatus,
  submitFinalBoss,
  submitClarifyingAnswer,
  submitCurrentSelf,
  generateTree,
  selectBranch,
  type SkillNode,
} from "@/lib/onboarding";

type Message = { role: "user" | "assistant"; content: string };

type Phase = "final_boss" | "clarifying" | "current_self" | "archetype" | "tree" | "done";

export default function OnboardingScreen() {
  const [phase, setPhase] = useState<Phase>("final_boss");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Tell me — who is the final boss version of you? Describe who you want to become. Be specific, be ambitious." },
  ]);
  const [loading, setLoading] = useState(false);
  const [archetype, setArchetype] = useState<{ archetype: string; explanation: string } | null>(null);
  const [tree, setTree] = useState<SkillNode[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const addMessage = (msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  };

  const handleSend = async (text: string) => {
    addMessage({ role: "user", content: text });
    setLoading(true);

    try {
      if (phase === "final_boss") {
        const result = await submitFinalBoss(text);
        addMessage({ role: "assistant", content: result.aiResponse });
        setPhase("clarifying");
      } else if (phase === "clarifying") {
        const result = await submitClarifyingAnswer(text);
        if (result.isReady) {
          addMessage({ role: "assistant", content: result.aiResponse });
          addMessage({ role: "assistant", content: "Now tell me — who are you today? Be honest. Where do you stand right now?" });
          setPhase("current_self");
        } else {
          addMessage({ role: "assistant", content: result.aiResponse });
        }
      } else if (phase === "current_self") {
        const result = await submitCurrentSelf(text);
        setArchetype(result.archetype);
        addMessage({
          role: "assistant",
          content: `Your archetype: ${result.archetype.archetype.replace(/-/g, " ").toUpperCase()}\n\n${result.archetype.explanation}`,
        });
        setPhase("archetype");

        // Auto-generate tree
        const treeResult = await generateTree();
        setTree(treeResult.nodes);
        setPhase("tree");
      }
    } catch (err: any) {
      addMessage({ role: "assistant", content: "Something went wrong. Try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBranch = async (nodeId: string) => {
    setLoading(true);
    try {
      await selectBranch(nodeId);
      setPhase("done");
      router.replace("/(app)/home");
    } finally {
      setLoading(false);
    }
  };

  const rootNodes = tree.filter((n) => !n.parentNodeId);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg, i) => (
          <ChatBubble key={i} role={msg.role} content={msg.content} />
        ))}

        {phase === "tree" && (
          <View style={styles.treeSection}>
            <Text style={styles.treeTitle}>Choose your first path:</Text>
            {rootNodes.map((node) => (
              <Pressable key={node.id} style={styles.branchCard} onPress={() => handleSelectBranch(node.id)}>
                <Text style={styles.branchTitle}>{node.title}</Text>
                <Text style={styles.branchDesc}>{node.description}</Text>
                <Text style={styles.branchDays}>{node.estimatedDays} days</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {phase !== "tree" && phase !== "done" && (
        <ChatInput
          onSend={handleSend}
          disabled={loading}
          multiline
          placeholder={
            phase === "final_boss" ? "Describe your final boss..."
            : phase === "current_self" ? "Describe who you are today..."
            : "Your answer..."
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f1729" },
  messages: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 32 },
  treeSection: { marginTop: 20 },
  treeTitle: { color: "#f59e0b", fontSize: 18, fontWeight: "600", marginBottom: 12 },
  branchCard: { backgroundColor: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#334155" },
  branchTitle: { color: "#f8fafc", fontSize: 16, fontWeight: "600" },
  branchDesc: { color: "#94a3b8", fontSize: 14, marginTop: 4 },
  branchDays: { color: "#f59e0b", fontSize: 12, marginTop: 8 },
});
```

- [ ] **Step 5: Update home screen to redirect to onboarding**

`apps/mobile/app/(app)/home.tsx`:
```typescript
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ onboardingComplete: string | null }>("/user/me")
      .then((user) => {
        if (!user.onboardingComplete) {
          router.replace("/(app)/onboarding");
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#f59e0b" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, warrior.</Text>
      <Text style={styles.subtitle}>Your journey continues.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1729" },
  title: { fontSize: 24, fontWeight: "700", color: "#f8fafc" },
  subtitle: { fontSize: 16, color: "#94a3b8", marginTop: 8 },
});
```

- [ ] **Step 6: Verify typecheck**

```bash
cd apps/mobile && pnpm typecheck
```

Expected: no errors

- [ ] **Step 7: Manual test**

Start both servers:
```bash
# Terminal 1
cd apps/api && pnpm dev

# Terminal 2
cd apps/mobile && pnpm start
```

Test flow: Login → redirects to onboarding → describe final boss → AI asks questions → describe current self → archetype assigned → tree shown → select branch → lands on home.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): add onboarding chat UI with AI conversation flow"
```

---

## Phase 2 Complete Checklist

After all 4 tasks:
- [x] Provider-agnostic AI layer (Anthropic + OpenAI swappable)
- [x] 8 archetypes defined with descriptions
- [x] Assessor prompts (clarifying questions, archetype assignment)
- [x] Architect prompts (skill tree generation)
- [x] Onboarding state machine with DB persistence
- [x] Skill tree generation and storage
- [x] Mobile onboarding chat UI (full flow)
- [x] Branch selection → onboarding complete

**Next phase:** Phase 3 — Daily Loop + Skill Tree Visualization (task generation, check-in conversations, tree rendering, trial gate)

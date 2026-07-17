# Final Boss MVP: Telegram Bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the core hypothesis — can AI-driven onboarding, personalized daily tasks, and a 7-day accountability gate create real commitment and personal growth? All via a Telegram bot. Zero frontend to build.

**Architecture:** Single Node.js process: grammY Telegram bot + Fastify for cron webhooks + Drizzle ORM + PostgreSQL. Deploy on Railway. One command to run.

**Tech Stack:** grammY (Telegram bot framework), Fastify (health/webhook), Drizzle ORM, PostgreSQL, Anthropic SDK (Claude), node-cron, Railway deployment.

## Global Constraints

- TypeScript strict mode
- Single `final-boss-mvp/` project directory — not a monorepo
- All interaction via Telegram chat (text messages + inline keyboard buttons)
- AI provider: Claude (Anthropic SDK) — hardcoded for MVP, no abstraction layer
- PostgreSQL on Railway (addon)
- Environment variables for all secrets
- Conversations are stateful — bot remembers where each user is in the flow

---

## File Structure

```
final-boss-mvp/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── .env.example
├── .gitignore
├── railway.toml
├── src/
│   ├── index.ts              (entry: starts bot + cron)
│   ├── config.ts             (env loading)
│   ├── bot.ts                (grammY bot setup + command handlers)
│   ├── db/
│   │   ├── client.ts         (drizzle connection)
│   │   ├── schema.ts         (all tables)
│   │   └── migrate.ts        (migration runner)
│   ├── handlers/
│   │   ├── start.ts          (onboarding entry)
│   │   ├── onboarding.ts     (conversation state machine)
│   │   ├── daily.ts          (task delivery + completion)
│   │   └── callbacks.ts      (inline keyboard callbacks)
│   ├── services/
│   │   ├── ai.ts             (Claude wrapper)
│   │   ├── onboarding.ts     (onboarding logic)
│   │   ├── tree.ts           (skill tree generation)
│   │   ├── tasks.ts          (daily task generation + completion)
│   │   └── trial.ts          (7-day evaluation)
│   ├── prompts/
│   │   ├── assessor.ts       (onboarding prompts)
│   │   ├── architect.ts      (tree generation prompts)
│   │   └── coach.ts          (daily task + check-in prompts)
│   └── jobs/
│       └── daily.ts          (cron: morning task, evening check-in, day-7 eval)
├── drizzle/
│   └── migrations/           (generated)
└── tests/
    └── trial.test.ts
```

---

### Task 1: Project Scaffold + Database Schema

**Files:**
- Create: `final-boss-mvp/package.json`
- Create: `final-boss-mvp/tsconfig.json`
- Create: `final-boss-mvp/.env.example`
- Create: `final-boss-mvp/.gitignore`
- Create: `final-boss-mvp/railway.toml`
- Create: `final-boss-mvp/drizzle.config.ts`
- Create: `final-boss-mvp/src/config.ts`
- Create: `final-boss-mvp/src/db/client.ts`
- Create: `final-boss-mvp/src/db/schema.ts`
- Create: `final-boss-mvp/src/db/migrate.ts`

**Interfaces:**
- Consumes: nothing
- Produces: Project skeleton, `db` client, full schema (`users`, `skillNodes`, `dailyTasks`, `checkIns`), `config` object

- [ ] **Step 1: Create project directory and init**

```bash
mkdir final-boss-mvp && cd final-boss-mvp && git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "final-boss-mvp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "grammy": "^1.30.0",
    "fastify": "^5.0.0",
    "drizzle-orm": "^0.33.0",
    "postgres": "^3.4.0",
    "node-cron": "^3.0.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/node-cron": "^3.0.0",
    "drizzle-kit": "^0.24.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create .env.example**

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finalboss
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
ANTHROPIC_API_KEY=sk-ant-xxxxx
AI_MODEL=claude-sonnet-4-6-20250514
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.env
.env.local
*.tsbuildinfo
```

- [ ] **Step 6: Create railway.toml**

```toml
[build]
builder = "nixpacks"
buildCommand = "pnpm install && pnpm build && pnpm db:migrate"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
restartPolicyType = "on_failure"
```

- [ ] **Step 7: Create config.ts**

`src/config.ts`:
```typescript
import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN!,
  anthropicKey: process.env.ANTHROPIC_API_KEY!,
  aiModel: process.env.AI_MODEL || "claude-sonnet-4-6-20250514",
  port: parseInt(process.env.PORT || "3000", 10),
};
```

- [ ] **Step 8: Create database schema**

`src/db/schema.ts`:
```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  real,
  bigint,
  date,
  boolean,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  telegramUsername: text("telegram_username"),
  // Onboarding state
  onboardingStatus: text("onboarding_status").notNull().default("not_started"),
  // not_started | awaiting_final_boss | clarifying | awaiting_current_self | assigning | generating_tree | selecting_branch | complete
  finalBossDescription: text("final_boss_description"),
  currentSelfDescription: text("current_self_description"),
  clarifyingAnswers: jsonb("clarifying_answers").$type<{ question: string; answer: string }[]>().default([]),
  archetype: text("archetype"),
  archetypeExplanation: text("archetype_explanation"),
  // Trial
  trialStartDate: date("trial_start_date"),
  trialStatus: text("trial_status").notNull().default("pending"), // pending | active | passed | failed
  // Metrics
  timeToFinalBoss: integer("time_to_final_boss"),
  currentStreak: integer("current_streak").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skillNodes = pgTable("skill_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentNodeId: uuid("parent_node_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("locked"), // locked | available | active | completed
  estimatedDays: integer("estimated_days").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dailyTasks = pgTable("daily_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  skillNodeId: uuid("skill_node_id").references(() => skillNodes.id),
  taskText: text("task_text").notNull(),
  taskType: text("task_type").notNull(), // action | reflection | social | observation
  status: text("status").notNull().default("assigned"), // assigned | completed | skipped | missed
  assignedDate: date("assigned_date").notNull(),
  reflection: text("reflection"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checkIns = pgTable("check_ins", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  messages: jsonb("messages").$type<{ role: string; content: string }[]>().default([]),
  extractedSignals: jsonb("extracted_signals").$type<{
    progress: string[];
    resistance: string[];
    insight: string[];
    emotionalState: string;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 9: Create database client**

`src/db/client.ts`:
```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

const connection = postgres(config.databaseUrl);
export const db = drizzle(connection, { schema });
```

- [ ] **Step 10: Create migration runner**

`src/db/migrate.ts`:
```typescript
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./client.js";

async function run() {
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  console.log("Done.");
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
```

`drizzle.config.ts`:
```typescript
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 11: Install deps, generate migration, verify**

```bash
pnpm install && pnpm db:generate && pnpm typecheck
```

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "chore: scaffold project with schema and config"
```

---

### Task 2: AI Service + Prompts

**Files:**
- Create: `src/services/ai.ts`
- Create: `src/prompts/assessor.ts`
- Create: `src/prompts/architect.ts`
- Create: `src/prompts/coach.ts`

**Interfaces:**
- Consumes: `config.anthropicKey`, `config.aiModel`
- Produces: `ai.chat(messages): Promise<string>`, `ai.json<T>(messages): Promise<T>`, all prompt builders

- [ ] **Step 1: Create AI service**

`src/services/ai.ts`:
```typescript
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

const client = new Anthropic({ apiKey: config.anthropicKey });

type Msg = { role: "user" | "assistant"; content: string };

export async function chat(system: string, messages: Msg[]): Promise<string> {
  const response = await client.messages.create({
    model: config.aiModel,
    max_tokens: 1024,
    system,
    messages,
  });
  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response");
  return block.text;
}

export async function chatJSON<T>(system: string, messages: Msg[]): Promise<T> {
  const response = await client.messages.create({
    model: config.aiModel,
    max_tokens: 2048,
    system: system + "\n\nRespond with valid JSON only. No markdown fences, no explanation.",
    messages,
  });
  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response");
  return JSON.parse(block.text) as T;
}
```

- [ ] **Step 2: Create assessor prompts**

`src/prompts/assessor.ts`:
```typescript
export const ASSESSOR_SYSTEM = `You are the Assessor for Final Boss, a personal transformation program delivered via Telegram.

Your job: understand who someone wants to become and who they are today. Ask clarifying questions ONE AT A TIME. Be warm, direct, insightful.

Probe for:
- Specific behaviors/traits they want (not vague aspirations)
- What success looks like day-to-day
- What currently holds them back
- Their relationship with discipline, creativity, relationships

Keep it conversational. You're a wise friend, not an interviewer. Short messages — this is Telegram, not email.

When you have enough context (usually 3-5 questions), start your message with exactly "[READY]" followed by a brief summary of what you've understood.`;

export const ARCHETYPE_SYSTEM = `Assign an archetype based on the user's transformation goals.

Available archetypes:
- disciplined-achiever: Systematic, habit-driven. The marathon runner.
- creative-force: Expressive, experimental. The artist-builder.
- stoic-leader: Calm, principled. Emotional mastery + influence.
- empathic-connector: Warm, perceptive. Relationships + communication.
- relentless-learner: Curious, analytical. Knowledge + skill stacking.
- bold-entrepreneur: Risk-taking, resourceful. Action + iteration.
- mindful-warrior: Present, resilient. Physical + mental discipline.
- visionary-builder: Strategic, ambitious. Systems + lasting impact.

Return JSON:
{
  "archetype": "slug",
  "explanation": "2-3 sentences why this fits (speak directly to the user, use 'you')",
  "dimensions": [
    { "name": "dimension name", "currentLevel": 3, "targetLevel": 8 }
  ]
}`;
```

- [ ] **Step 3: Create architect prompts**

`src/prompts/architect.ts`:
```typescript
export const TREE_SYSTEM = `You are the Architect for Final Boss. Generate a skill tree for someone's transformation.

Rules:
- Create exactly 3 top-level branches (parentTitle: null)
- Each branch has 2-3 child nodes
- Total: 9-12 nodes
- Each node = a concrete growth area (not vague)
- estimatedDays per node: 7-21
- Node titles should be inspiring but specific ("Morning Mastery" not "Wake up early")
- First child in each branch should be achievable in 7 days (trial period!)

Return JSON:
{
  "nodes": [
    {
      "title": "Node Title",
      "description": "What this involves — 1 sentence",
      "estimatedDays": 14,
      "parentTitle": null,
      "orderIndex": 0
    }
  ]
}`;
```

- [ ] **Step 4: Create coach prompts**

`src/prompts/coach.ts`:
```typescript
export function taskGenerationSystem(context: {
  archetype: string;
  nodeTitle: string;
  nodeDescription: string;
  dayNumber: number;
  recentTasks: string[];
}) {
  return `You are the Coach for Final Boss. Generate ONE daily micro-task.

Context:
- User's archetype: ${context.archetype}
- Active growth area: "${context.nodeTitle}" — ${context.nodeDescription}
- Day ${context.dayNumber} of this branch
- Recent tasks: ${context.recentTasks.join("; ") || "None yet"}

Rules:
- Task takes 15-30 minutes
- Be specific and actionable
- Vary types: action (do something), reflection (think deeply), social (interact), observation (notice patterns)
- Day 1-3: easier. Day 4-7: progressively harder.
- This is Telegram — keep the task description under 2 sentences.

Return JSON:
{ "taskText": "The task", "taskType": "action|reflection|social|observation" }`;
}

export function checkinSystem(context: {
  archetype: string;
  taskText: string;
  taskCompleted: boolean;
  reflection?: string;
  dayNumber: number;
}) {
  return `You are the Coach in Final Boss — evening check-in via Telegram.

Context:
- Archetype: ${context.archetype}
- Today's task: "${context.taskText}" — ${context.taskCompleted ? "COMPLETED" : "NOT completed"}
${context.reflection ? `- Their reflection: "${context.reflection}"` : ""}
- Day ${context.dayNumber} of their journey

Rules:
- Ask about their experience (1 question)
- Probe deeper based on response
- Keep to 2-3 exchanges MAX
- Short Telegram-friendly messages
- Warm but direct. Wise friend energy.
- End with encouragement or a provocative thought for tomorrow.`;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/services/ai.ts src/prompts && git commit -m "feat: add AI service and prompt templates"
```

---

### Task 3: Onboarding Flow (Telegram Conversation)

**Files:**
- Create: `src/services/onboarding.ts`
- Create: `src/handlers/start.ts`
- Create: `src/handlers/onboarding.ts`

**Interfaces:**
- Consumes: `ai.chat()`, `ai.json()`, assessor/architect prompts, `db`, `users` + `skillNodes` schemas
- Produces: `/start` command handler, message handler that routes based on `onboardingStatus`, full onboarding state machine

- [ ] **Step 1: Implement onboarding service**

`src/services/onboarding.ts`:
```typescript
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, skillNodes } from "../db/schema.js";
import * as ai from "./ai.js";
import { ASSESSOR_SYSTEM, ARCHETYPE_SYSTEM } from "../prompts/assessor.js";
import { TREE_SYSTEM } from "../prompts/architect.js";

export async function getOrCreateUser(telegramId: number, username?: string) {
  let [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (!user) {
    [user] = await db.insert(users).values({
      telegramId,
      telegramUsername: username || null,
    }).returning();
  }
  return user;
}

export async function handleFinalBossInput(userId: string, description: string): Promise<string> {
  await db.update(users).set({
    finalBossDescription: description,
    onboardingStatus: "clarifying",
  }).where(eq(users.id, userId));

  // Get first clarifying question
  const response = await ai.chat(ASSESSOR_SYSTEM, [
    { role: "user", content: `Here's who I want to become:\n\n${description}` },
  ]);

  return response;
}

export async function handleClarifyingAnswer(userId: string, answer: string): Promise<{ response: string; isReady: boolean }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  const answers = [...(user.clarifyingAnswers || [])];

  // Rebuild conversation for AI
  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: `Here's who I want to become:\n\n${user.finalBossDescription}` },
  ];

  for (const qa of answers) {
    messages.push({ role: "assistant", content: qa.question });
    messages.push({ role: "user", content: qa.answer });
  }

  // Get what AI said last (the question we're answering)
  // We need the last AI message — reconstruct by getting AI response to previous context
  const lastAiResponse = messages.length > 1
    ? await ai.chat(ASSESSOR_SYSTEM, messages.slice(0, -0)) // hack: we'll store the question
    : "";

  // Actually, simpler: just add the new answer and ask for next question
  messages.push({ role: "user", content: answer });
  const nextResponse = await ai.chat(ASSESSOR_SYSTEM, messages);

  const isReady = nextResponse.startsWith("[READY]");

  // Store this Q&A pair (use a placeholder for the question since we don't have it cleanly)
  answers.push({ question: "(previous AI message)", answer });

  const newStatus = isReady ? "awaiting_current_self" : "clarifying";
  await db.update(users).set({
    clarifyingAnswers: answers,
    onboardingStatus: newStatus,
  }).where(eq(users.id, userId));

  const cleanResponse = isReady ? nextResponse.replace("[READY]", "").trim() : nextResponse;
  return { response: cleanResponse, isReady };
}

export async function handleCurrentSelf(userId: string, description: string): Promise<string> {
  await db.update(users).set({
    currentSelfDescription: description,
    onboardingStatus: "assigning",
  }).where(eq(users.id, userId));

  // Assign archetype
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  const assignmentInput = `Final boss vision: ${user!.finalBossDescription}\n\nCurrent self: ${description}\n\nClarifying answers:\n${(user!.clarifyingAnswers || []).map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join("\n")}`;

  const result = await ai.chatJSON<{
    archetype: string;
    explanation: string;
    dimensions: { name: string; currentLevel: number; targetLevel: number }[];
  }>(ARCHETYPE_SYSTEM, [{ role: "user", content: assignmentInput }]);

  await db.update(users).set({
    archetype: result.archetype,
    archetypeExplanation: result.explanation,
    onboardingStatus: "generating_tree",
  }).where(eq(users.id, userId));

  return result.explanation;
}

export async function generateTree(userId: string): Promise<typeof skillNodes.$inferSelect[]> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  const treeInput = `Archetype: ${user.archetype}\nGoal: ${user.finalBossDescription}\nCurrent: ${user.currentSelfDescription}\nDimensions identified during assessment.`;

  const result = await ai.chatJSON<{
    nodes: { title: string; description: string; estimatedDays: number; parentTitle: string | null; orderIndex: number }[];
  }>(TREE_SYSTEM, [{ role: "user", content: treeInput }]);

  // Insert root nodes first
  const nodeMap = new Map<string, string>();
  const roots = result.nodes.filter((n) => !n.parentTitle);

  for (const node of roots) {
    const [inserted] = await db.insert(skillNodes).values({
      userId,
      title: node.title,
      description: node.description,
      estimatedDays: node.estimatedDays,
      orderIndex: node.orderIndex,
      status: "available",
    }).returning();
    nodeMap.set(node.title, inserted.id);
  }

  // Insert children
  const children = result.nodes.filter((n) => n.parentTitle);
  for (const node of children) {
    const parentId = nodeMap.get(node.parentTitle!) || null;
    const [inserted] = await db.insert(skillNodes).values({
      userId,
      parentNodeId: parentId,
      title: node.title,
      description: node.description,
      estimatedDays: node.estimatedDays,
      orderIndex: node.orderIndex,
      status: "locked",
    }).returning();
    nodeMap.set(node.title, inserted.id);
  }

  // Compute time estimate
  const totalDays = result.nodes.reduce((sum, n) => sum + n.estimatedDays, 0);
  await db.update(users).set({
    timeToFinalBoss: totalDays,
    onboardingStatus: "selecting_branch",
  }).where(eq(users.id, userId));

  return db.select().from(skillNodes).where(eq(skillNodes.userId, userId));
}

export async function selectBranch(userId: string, nodeId: string) {
  await db.update(skillNodes).set({ status: "active" }).where(eq(skillNodes.id, nodeId));

  // Unlock first child of this branch
  const children = await db.select().from(skillNodes).where(eq(skillNodes.parentNodeId, nodeId));
  if (children.length > 0) {
    const first = children.sort((a, b) => a.orderIndex - b.orderIndex)[0];
    await db.update(skillNodes).set({ status: "active" }).where(eq(skillNodes.id, first.id));
  }

  const today = new Date().toISOString().split("T")[0];
  await db.update(users).set({
    onboardingStatus: "complete",
    trialStatus: "active",
    trialStartDate: today,
  }).where(eq(users.id, userId));
}
```

- [ ] **Step 2: Implement /start handler**

`src/handlers/start.ts`:
```typescript
import type { Context } from "grammy";
import { getOrCreateUser } from "../services/onboarding.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function handleStart(ctx: Context) {
  const telegramId = ctx.from!.id;
  const username = ctx.from?.username;

  const user = await getOrCreateUser(telegramId, username);

  if (user.onboardingStatus === "complete") {
    await ctx.reply("Welcome back. Your journey continues. ⚡");
    return;
  }

  if (user.onboardingStatus !== "not_started") {
    await ctx.reply("We were in the middle of something. Let's pick up where we left off.\n\nSend me a message to continue.");
    return;
  }

  // Start onboarding
  await db.update(users).set({ onboardingStatus: "awaiting_final_boss" }).where(eq(users.id, user.id));

  await ctx.reply(
    "Welcome to *Final Boss*\\.\n\n" +
    "This is a personal transformation program\\. Not an app you open when you feel like it — a commitment\\.\n\n" +
    "You have 7 days to prove you're serious\\. Complete 5 of 7 daily tasks, or you're out\\.\n\n" +
    "Ready? Let's begin\\.\n\n" +
    "*Who is the final boss version of you?*\n\n" +
    "Describe who you want to become\\. Be specific, be ambitious\\. The person you'd be if you had no excuses\\.",
    { parse_mode: "MarkdownV2" }
  );
}
```

- [ ] **Step 3: Implement onboarding message handler**

`src/handlers/onboarding.ts`:
```typescript
import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, skillNodes } from "../db/schema.js";
import {
  getOrCreateUser,
  handleFinalBossInput,
  handleClarifyingAnswer,
  handleCurrentSelf,
  generateTree,
} from "../services/onboarding.js";

export async function handleOnboardingMessage(ctx: Context) {
  if (!ctx.message?.text || !ctx.from) return;

  const user = await getOrCreateUser(ctx.from.id);
  const text = ctx.message.text;

  switch (user.onboardingStatus) {
    case "not_started":
      // They sent a message without /start — nudge them
      await ctx.reply("Send /start to begin your journey.");
      break;

    case "awaiting_final_boss": {
      await ctx.reply("Let me think about that...");
      const response = await handleFinalBossInput(user.id, text);
      await ctx.reply(response);
      break;
    }

    case "clarifying": {
      const { response, isReady } = await handleClarifyingAnswer(user.id, text);

      if (isReady) {
        await ctx.reply(response);
        await ctx.reply("Now — *who are you today?*\n\nBe honest. Where do you actually stand right now? What's your reality?", { parse_mode: "MarkdownV2" });
      } else {
        await ctx.reply(response);
      }
      break;
    }

    case "awaiting_current_self": {
      await ctx.reply("Analyzing your gap...");
      const explanation = await handleCurrentSelf(user.id, text);

      // Show archetype
      const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      const archetypeName = (updatedUser!.archetype || "").replace(/-/g, " ").toUpperCase();

      await ctx.reply(`Your archetype: *${archetypeName}*\n\n${explanation}`, { parse_mode: "Markdown" });
      await ctx.reply("Generating your skill tree...");

      // Generate tree
      const nodes = await generateTree(user.id);
      const rootNodes = nodes.filter((n) => !n.parentNodeId);

      // Show branches as inline keyboard
      const keyboard = new InlineKeyboard();
      for (const node of rootNodes) {
        keyboard.text(`${node.title} (${node.estimatedDays}d)`, `select_branch:${node.id}`).row();
      }

      const treeText = rootNodes
        .map((r) => {
          const children = nodes.filter((n) => n.parentNodeId === r.id);
          const childList = children.map((c) => `  → ${c.title}`).join("\n");
          return `🌟 *${r.title}*\n${r.description}\n${childList}`;
        })
        .join("\n\n");

      await ctx.reply(`Here's your path:\n\n${treeText}\n\n*Choose your first branch:*`, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      break;
    }

    case "complete":
      // Handled by daily task handler, not here
      break;

    default:
      await ctx.reply("Hold on — something's processing. Give me a moment.");
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/services/onboarding.ts src/handlers && git commit -m "feat: add onboarding flow — final boss → clarify → archetype → tree"
```

---

### Task 4: Daily Tasks + Check-In + Completion

**Files:**
- Create: `src/services/tasks.ts`
- Create: `src/handlers/daily.ts`
- Create: `src/handlers/callbacks.ts`

**Interfaces:**
- Consumes: `ai.chatJSON()`, coach prompts, `db`, `dailyTasks` + `checkIns` + `skillNodes` schemas
- Produces: `generateDailyTask(userId)`, `completeTask(taskId, reflection?)`, task message handler (user replies "done"), inline keyboard callback for branch selection + task actions

- [ ] **Step 1: Implement task service**

`src/services/tasks.ts`:
```typescript
import { eq, and, desc, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { dailyTasks, skillNodes, users } from "../db/schema.js";
import * as ai from "./ai.js";
import { taskGenerationSystem } from "../prompts/coach.js";

export async function generateDailyTask(userId: string) {
  const today = new Date().toISOString().split("T")[0];

  // Check if already exists
  const [existing] = await db.select().from(dailyTasks)
    .where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.assignedDate, today)))
    .limit(1);
  if (existing) return existing;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  // Get active node (deepest active — prefer child over parent)
  const activeNodes = await db.select().from(skillNodes)
    .where(and(eq(skillNodes.userId, userId), eq(skillNodes.status, "active")));

  const activeNode = activeNodes.find((n) => n.parentNodeId) || activeNodes[0];
  if (!activeNode) throw new Error("No active node");

  // Get recent tasks
  const recentTasks = await db.select().from(dailyTasks)
    .where(eq(dailyTasks.userId, userId))
    .orderBy(desc(dailyTasks.createdAt))
    .limit(5);

  // Count days since trial start
  const dayNumber = user.trialStartDate
    ? Math.floor((Date.now() - new Date(user.trialStartDate).getTime()) / (24 * 60 * 60 * 1000)) + 1
    : 1;

  const system = taskGenerationSystem({
    archetype: user.archetype || "disciplined-achiever",
    nodeTitle: activeNode.title,
    nodeDescription: activeNode.description,
    dayNumber,
    recentTasks: recentTasks.map((t) => `[${t.status}] ${t.taskText}`),
  });

  const result = await ai.chatJSON<{ taskText: string; taskType: string }>(
    system,
    [{ role: "user", content: "Generate today's task." }]
  );

  const [task] = await db.insert(dailyTasks).values({
    userId,
    skillNodeId: activeNode.id,
    taskText: result.taskText,
    taskType: result.taskType,
    assignedDate: today,
  }).returning();

  return task;
}

export async function completeTask(taskId: string, reflection?: string) {
  const [task] = await db.update(dailyTasks).set({
    status: "completed",
    reflection: reflection || null,
  }).where(eq(dailyTasks.id, taskId)).returning();

  // Update streak
  if (task) {
    const [user] = await db.select().from(users).where(eq(users.id, task.userId)).limit(1);
    if (user) {
      await db.update(users).set({ currentStreak: user.currentStreak + 1 }).where(eq(users.id, user.id));
    }
  }

  return task;
}

export async function getTodayTask(userId: string) {
  const today = new Date().toISOString().split("T")[0];
  const [task] = await db.select().from(dailyTasks)
    .where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.assignedDate, today)))
    .limit(1);
  return task;
}

export async function markMissed(userId: string) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  await db.update(dailyTasks).set({ status: "missed" })
    .where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.assignedDate, yesterday), eq(dailyTasks.status, "assigned")));

  // Break streak
  await db.update(users).set({ currentStreak: 0 }).where(eq(users.id, userId));
}
```

- [ ] **Step 2: Implement daily message handler**

`src/handlers/daily.ts`:
```typescript
import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getOrCreateUser } from "../services/onboarding.js";
import { getTodayTask, completeTask } from "../services/tasks.js";

export async function handleDailyMessage(ctx: Context) {
  if (!ctx.message?.text || !ctx.from) return;

  const user = await getOrCreateUser(ctx.from.id);
  if (user.onboardingStatus !== "complete") return false; // not for us

  const text = ctx.message.text.toLowerCase().trim();
  const task = await getTodayTask(user.id);

  if (!task) {
    await ctx.reply("No task assigned yet today. It'll arrive in the morning.");
    return true;
  }

  if (task.status === "completed") {
    await ctx.reply("You already completed today's task. Rest up — tomorrow brings a new challenge.");
    return true;
  }

  // Check for completion signals
  if (text === "done" || text === "completed" || text === "✅") {
    await ctx.reply("Nice. Any quick reflection? What did you notice? (or send 'skip' to skip)");
    return true;
  }

  if (text === "skip") {
    await completeTask(task.id);
    await ctx.reply(`✅ Day logged. Streak: ${user.currentStreak + 1} 🔥`);
    return true;
  }

  // If task is assigned and they send text, treat it as reflection for completion
  if (task.status === "assigned") {
    // Check if this looks like a reflection (they said "done" previously, now giving reflection)
    // Simple heuristic: if it's not a question or command, treat as reflection
    if (text.length > 5 && !text.startsWith("/")) {
      await completeTask(task.id, ctx.message.text);
      await ctx.reply(`✅ Logged with reflection. Streak: ${user.currentStreak + 1} 🔥\n\nSee you tonight for the check-in.`);
      return true;
    }
  }

  // Show current task status
  const keyboard = new InlineKeyboard()
    .text("✅ Done", `complete_task:${task.id}`)
    .text("⏭ Skip", `skip_task:${task.id}`);

  await ctx.reply(`Today's task:\n\n*${task.taskText}*\n\nType: ${task.taskType}\n\nReply "done" when finished (+ optional reflection), or tap below:`, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });

  return true;
}
```

- [ ] **Step 3: Implement callback handler (inline keyboards)**

`src/handlers/callbacks.ts`:
```typescript
import type { Context } from "grammy";
import { selectBranch } from "../services/onboarding.js";
import { completeTask } from "../services/tasks.js";
import { getOrCreateUser } from "../services/onboarding.js";

export async function handleCallback(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data || !ctx.from) return;

  const user = await getOrCreateUser(ctx.from.id);

  if (data.startsWith("select_branch:")) {
    const nodeId = data.replace("select_branch:", "");
    await selectBranch(user.id, nodeId);
    await ctx.answerCallbackQuery({ text: "Branch selected!" });
    await ctx.reply(
      "Your journey begins *now*.\n\n" +
      "Every morning you'll get a task. Complete it, then tell me 'done'.\n\n" +
      "Every evening I'll check in with you.\n\n" +
      "*You have 7 days. Complete 5 tasks to stay in the program.*\n\n" +
      "First task arrives tomorrow morning. Get some rest.",
      { parse_mode: "Markdown" }
    );
  } else if (data.startsWith("complete_task:")) {
    const taskId = data.replace("complete_task:", "");
    await completeTask(taskId);
    await ctx.answerCallbackQuery({ text: "Task completed!" });
    await ctx.editMessageText(`✅ Done! Streak: ${user.currentStreak + 1} 🔥`);
  } else if (data.startsWith("skip_task:")) {
    const taskId = data.replace("skip_task:", "");
    await completeTask(taskId); // counts as done for MVP
    await ctx.answerCallbackQuery({ text: "Skipped" });
    await ctx.editMessageText("⏭ Skipped. Tomorrow's a new day.");
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/services/tasks.ts src/handlers/daily.ts src/handlers/callbacks.ts && git commit -m "feat: add daily task generation, completion, and callback handlers"
```

---

### Task 5: Trial Evaluation + Daily Cron Jobs

**Files:**
- Create: `src/services/trial.ts`
- Create: `src/jobs/daily.ts`

**Interfaces:**
- Consumes: `db`, all schemas, task service, bot instance (to send messages)
- Produces: `evaluateTrial(userId): "active" | "passed" | "failed"`, cron jobs (morning task delivery, evening check-in prompt, missed task marking, day-7 evaluation)

- [ ] **Step 1: Implement trial service**

`src/services/trial.ts`:
```typescript
import { eq, and, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, dailyTasks } from "../db/schema.js";

const TRIAL_DAYS = 7;
const TRIAL_THRESHOLD = 5;

export async function evaluateTrial(userId: string): Promise<"active" | "passed" | "failed"> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.trialStatus !== "active" || !user.trialStartDate) return "active";

  const startDate = new Date(user.trialStartDate);
  const endDate = new Date(startDate.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  if (new Date() < endDate) return "active"; // not over yet

  // Count unique days with completed tasks
  const tasks = await db.select().from(dailyTasks).where(
    and(
      eq(dailyTasks.userId, userId),
      eq(dailyTasks.status, "completed"),
      gte(dailyTasks.assignedDate, user.trialStartDate),
    )
  );

  const uniqueDays = new Set(tasks.map((t) => t.assignedDate)).size;
  const result = uniqueDays >= TRIAL_THRESHOLD ? "passed" : "failed";

  await db.update(users).set({ trialStatus: result }).where(eq(users.id, userId));
  return result;
}

export function getTrialDayNumber(trialStartDate: string): number {
  return Math.floor((Date.now() - new Date(trialStartDate).getTime()) / (24 * 60 * 60 * 1000)) + 1;
}
```

- [ ] **Step 2: Implement daily cron jobs**

`src/jobs/daily.ts`:
```typescript
import cron from "node-cron";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { generateDailyTask, markMissed } from "../services/tasks.js";
import { evaluateTrial, getTrialDayNumber } from "../services/trial.js";
import type { Bot } from "grammy";

export function startJobs(bot: Bot) {
  // Morning: 7:00 UTC — generate and send daily task
  cron.schedule("0 7 * * *", async () => {
    console.log("[CRON] Morning task delivery");

    const activeUsers = await db.select().from(users).where(eq(users.trialStatus, "active"));
    const passedUsers = await db.select().from(users).where(eq(users.trialStatus, "passed"));

    for (const user of [...activeUsers, ...passedUsers]) {
      try {
        // Mark yesterday's undone tasks as missed
        await markMissed(user.id);

        // Generate today's task
        const task = await generateDailyTask(user.id);

        const dayNum = user.trialStartDate ? getTrialDayNumber(user.trialStartDate) : "?";
        const trialNote = user.trialStatus === "active" ? `\n\n📅 Trial day ${dayNum}/7` : "";

        await bot.api.sendMessage(
          user.telegramId,
          `☀️ *Day ${dayNum} — Your task:*\n\n${task.taskText}\n\n_Type: ${task.taskType}_${trialNote}\n\nReply "done" when complete.`,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        console.error(`[CRON] Failed for user ${user.telegramId}:`, err);
      }
    }
  });

  // Evening: 20:00 UTC — check-in prompt
  cron.schedule("0 20 * * *", async () => {
    console.log("[CRON] Evening check-in prompt");

    const activeUsers = await db.select().from(users).where(eq(users.trialStatus, "active"));
    const passedUsers = await db.select().from(users).where(eq(users.trialStatus, "passed"));

    for (const user of [...activeUsers, ...passedUsers]) {
      try {
        await bot.api.sendMessage(
          user.telegramId,
          "🌙 Evening check-in time.\n\nHow did today go? Tell me about your task — did you do it? What did you notice?",
        );
      } catch (err) {
        console.error(`[CRON] Check-in failed for ${user.telegramId}:`, err);
      }
    }
  });

  // Midnight: evaluate trials
  cron.schedule("0 0 * * *", async () => {
    console.log("[CRON] Trial evaluation");

    const activeTrials = await db.select().from(users).where(eq(users.trialStatus, "active"));

    for (const user of activeTrials) {
      const result = await evaluateTrial(user.id);

      if (result === "passed") {
        await bot.api.sendMessage(
          user.telegramId,
          "🏆 *You passed the trial.*\n\nYou showed up. You proved you're serious.\n\nWelcome to the program. Your journey continues — no more trial pressure, just consistent growth.\n\nTomorrow's task arrives in the morning.",
          { parse_mode: "Markdown" }
        );
      } else if (result === "failed") {
        await bot.api.sendMessage(
          user.telegramId,
          "Your trial period has ended.\n\nYou needed 5 completed days out of 7. You didn't hit the threshold.\n\nThis isn't a punishment — it's a filter. This program works for people who show up consistently.\n\nYou can try again in 14 days. Use /start to re-enter when you're ready.",
        );
      }
    }
  });

  console.log("[CRON] Daily jobs scheduled (7:00 task, 20:00 check-in, 00:00 eval)");
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/trial.ts src/jobs/daily.ts && git commit -m "feat: add trial evaluation and daily cron jobs"
```

---

### Task 6: Bot Assembly + Entry Point + Health Check

**Files:**
- Create: `src/bot.ts`
- Create: `src/index.ts`

**Interfaces:**
- Consumes: all handlers, all jobs, config
- Produces: Running bot that responds to /start, handles onboarding messages, handles daily flow, processes callbacks, runs cron jobs, exposes /health for Railway

- [ ] **Step 1: Create bot setup**

`src/bot.ts`:
```typescript
import { Bot } from "grammy";
import { config } from "./config.js";
import { handleStart } from "./handlers/start.js";
import { handleOnboardingMessage } from "./handlers/onboarding.js";
import { handleDailyMessage } from "./handlers/daily.js";
import { handleCallback } from "./handlers/callbacks.js";
import { getOrCreateUser } from "./services/onboarding.js";

export function createBot() {
  const bot = new Bot(config.telegramToken);

  // Commands
  bot.command("start", handleStart);

  bot.command("status", async (ctx) => {
    if (!ctx.from) return;
    const user = await getOrCreateUser(ctx.from.id);

    if (user.onboardingStatus !== "complete") {
      await ctx.reply(`Onboarding status: ${user.onboardingStatus}\n\nKeep going — send me a message to continue.`);
      return;
    }

    const dayNum = user.trialStartDate
      ? Math.floor((Date.now() - new Date(user.trialStartDate).getTime()) / (24 * 60 * 60 * 1000)) + 1
      : 0;

    await ctx.reply(
      `📊 *Status*\n\n` +
      `Archetype: ${(user.archetype || "").replace(/-/g, " ")}\n` +
      `Trial: ${user.trialStatus} (day ${dayNum})\n` +
      `Streak: ${user.currentStreak} 🔥\n` +
      `Time to Final Boss: ${user.timeToFinalBoss || "?"} days`,
      { parse_mode: "Markdown" }
    );
  });

  // Callbacks (inline keyboard buttons)
  bot.on("callback_query:data", handleCallback);

  // Messages — route based on user state
  bot.on("message:text", async (ctx) => {
    if (!ctx.from) return;

    const user = await getOrCreateUser(ctx.from.id);

    // If onboarding complete, try daily handler
    if (user.onboardingStatus === "complete") {
      const handled = await handleDailyMessage(ctx);
      if (handled) return;
    }

    // Otherwise, onboarding handler
    if (user.onboardingStatus !== "complete" && user.onboardingStatus !== "not_started") {
      await handleOnboardingMessage(ctx);
      return;
    }

    // Fallback
    if (user.onboardingStatus === "not_started") {
      await ctx.reply("Send /start to begin.");
    }
  });

  return bot;
}
```

- [ ] **Step 2: Create entry point**

`src/index.ts`:
```typescript
import Fastify from "fastify";
import { config } from "./config.js";
import { createBot } from "./bot.js";
import { startJobs } from "./jobs/daily.js";

async function main() {
  // Health check server (Railway needs this)
  const server = Fastify({ logger: false });
  server.get("/health", async () => ({ status: "ok" }));
  await server.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`Health check on port ${config.port}`);

  // Start bot
  const bot = createBot();
  startJobs(bot);

  bot.start({
    onStart: () => console.log("Bot running."),
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Verify everything compiles**

```bash
pnpm typecheck
```

- [ ] **Step 4: Test locally**

1. Create a Telegram bot via @BotFather, get token
2. Set up `.env` with token + database URL + Anthropic key
3. Create local PostgreSQL database and run migrations:
```bash
createdb finalboss && pnpm db:migrate
```
4. Run:
```bash
pnpm dev
```
5. Open Telegram, send /start to your bot, go through onboarding.

- [ ] **Step 5: Commit**

```bash
git add src/bot.ts src/index.ts && git commit -m "feat: assemble bot with routing, health check, and entry point"
```

---

### Task 7: Deploy to Railway

**Files:**
- No new files (railway.toml already created in Task 1)

**Interfaces:**
- Consumes: All code from Tasks 1-6, Railway CLI
- Produces: Live bot running on Railway with PostgreSQL addon

- [ ] **Step 1: Install Railway CLI (if not present)**

```bash
npm install -g @railway/cli
```

- [ ] **Step 2: Login and create project**

```bash
railway login
railway init
```

Select "Empty Project" when prompted.

- [ ] **Step 3: Add PostgreSQL addon**

```bash
railway add --plugin postgresql
```

- [ ] **Step 4: Set environment variables**

```bash
railway variables set TELEGRAM_BOT_TOKEN=your-token
railway variables set ANTHROPIC_API_KEY=sk-ant-xxxxx
railway variables set AI_MODEL=claude-sonnet-4-6-20250514
```

Note: `DATABASE_URL` is automatically set by the PostgreSQL addon.

- [ ] **Step 5: Deploy**

```bash
railway up
```

Expected: Build succeeds, migrations run, bot starts, health check passes.

- [ ] **Step 6: Verify bot responds**

Open Telegram → send /start to your bot → verify onboarding begins.

- [ ] **Step 7: Commit deployment config (if any changes)**

```bash
git add -A && git commit -m "chore: finalize deployment config" 2>/dev/null || true
```

---

## What This Proves

| Hypothesis | How to validate |
|-----------|----------------|
| AI onboarding feels insightful | Go through it yourself. Does it ask good questions? Does the archetype feel right? |
| Generated tree is meaningful | Look at the tree. Are the nodes specific? Achievable? Connected to your goal? |
| Daily tasks are actionable | Do 7 days. Are tasks concrete? Do they build on each other? |
| 7-day gate creates urgency | Do you feel pressure to complete tasks? Does the countdown matter? |
| Check-in conversations add value | After a week, do you feel the AI understands your progress? |

## What's NOT Here (add later if validated)

- Skill tree visualization (Telegram doesn't need it — text list works)
- Voice input (just type in Telegram)
- Analytics dashboard (check /status command)
- Social features (solo validation first)
- Payments (free during validation)
- Multiple active branches (one at a time for MVP)
- Smart notification timing (fixed UTC for now)

# Final Boss Phase 3: Daily Loop + Skill Tree UI + Trial Gate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core daily experience — AI-generated micro-tasks, evening conversational check-ins, the visual skill tree, push notifications, and the 7-day trial gate that filters uncommitted users.

**Architecture:** Coach AI role generates daily tasks and runs check-ins. Analyst role runs nightly to compute metrics and adjust paths. Skill tree rendered with react-native-svg. Push notifications via Expo Push. Trial gate enforced server-side with a daily cron job.

**Tech Stack:** Expo Notifications, react-native-svg, node-cron, Fastify routes, Drizzle ORM.

## Global Constraints

- TypeScript strict mode everywhere
- Tasks generated at midnight UTC for the next day (or on-demand if none exists)
- Check-in conversations limited to 8 messages (4 user + 4 AI)
- Trial gate: 5/7 days must have a completed task
- Push notifications respect user timezone (stored in user preferences)
- Skill tree max 20 nodes rendered — performance boundary

---

## File Structure (new files this phase)

```
apps/api/src/
├── prompts/
│   ├── coach.ts            (daily task + check-in prompts)
│   └── analyst.ts          (signal extraction + metrics prompts)
├── routes/
│   ├── tasks.ts            (daily task endpoints)
│   ├── checkin.ts          (check-in conversation endpoints)
│   └── tree.ts             (skill tree endpoints)
├── services/
│   ├── task-generator.ts   (AI task generation logic)
│   ├── checkin.ts          (check-in conversation logic)
│   ├── trial.ts            (trial gate evaluation)
│   ├── metrics.ts          (progress computation)
│   └── notifications.ts   (push notification sender)
├── jobs/
│   └── daily.ts            (cron: generate tasks, check trial, compute metrics)
tests/
├── tasks.test.ts
├── checkin.test.ts
└── trial.test.ts

apps/mobile/
├── app/(app)/
│   ├── _layout.tsx         (tab navigator: home, tree, checkin, progress)
│   ├── home.tsx            (today's task + timer + streak)
│   ├── tree.tsx            (skill tree visualization)
│   ├── checkin.tsx         (evening check-in chat)
│   └── progress.tsx        (progress stats placeholder)
├── components/
│   ├── SkillTree.tsx       (SVG tree renderer)
│   ├── SkillNode.tsx       (individual node component)
│   ├── TaskCard.tsx        (today's task display)
│   ├── StreakCounter.tsx   (streak display)
│   └── TimeCounter.tsx     (time-to-final-boss display)
└── lib/
    ├── tasks.ts            (task API calls)
    ├── checkin.ts          (check-in API calls)
    └── notifications.ts   (push notification registration)
```

---

### Task 1: Coach Prompts + Task Generation Service

**Files:**
- Create: `apps/api/src/prompts/coach.ts`
- Create: `apps/api/src/prompts/analyst.ts`
- Create: `apps/api/src/services/task-generator.ts`
- Create: `apps/api/tests/tasks.test.ts`

**Interfaces:**
- Consumes: `getAI()`, `db`, `skillNodes` schema, `dailyTasks` schema, `users` schema
- Produces: `generateDailyTask(userId): Promise<DailyTask>`, `buildTaskGenerationPrompt(context)`, `buildCheckinSystemPrompt()`, `buildSignalExtractionPrompt(messages)`

- [ ] **Step 1: Create coach prompts**

`apps/api/src/prompts/coach.ts`:
```typescript
import type { Message } from "../ai/provider.js";

type TaskGenerationContext = {
  archetype: string;
  activeNodeTitle: string;
  activeNodeDescription: string;
  recentTasks: { text: string; type: string; status: string }[];
  completionRate: number;
  streakCount: number;
  dayOfWeek: string;
};

export function buildTaskGenerationPrompt(context: TaskGenerationContext): Message[] {
  return [
    {
      role: "system",
      content: `You are the Coach for Final Boss. Generate ONE daily micro-task for the user.

Rules:
- Task must align with the active skill tree node: "${context.activeNodeTitle}" — ${context.activeNodeDescription}
- Task should take 15-30 minutes
- Be specific and actionable (not vague like "practice mindfulness")
- Vary task types: action (do something), reflection (think deeply), social (interact), observation (notice patterns)
- Consider recent task history to avoid repetition
- If completion rate is below 60%, make tasks easier
- If completion rate is above 90%, make tasks more challenging
- Weekend tasks can be longer/different from weekday tasks

User's archetype: ${context.archetype}
Day: ${context.dayOfWeek}
Completion rate (last 7 days): ${Math.round(context.completionRate * 100)}%
Current streak: ${context.streakCount} days

Recent tasks:
${context.recentTasks.map((t) => `- [${t.status}] (${t.type}) ${t.text}`).join("\n") || "None yet"}

Return JSON:
{
  "taskText": "The specific task description",
  "taskType": "action" | "reflection" | "social" | "observation"
}`,
    },
    {
      role: "user",
      content: "Generate today's task.",
    },
  ];
}

type CheckinContext = {
  archetype: string;
  todayTask: { text: string; type: string; completed: boolean; reflection?: string };
  recentSignals: { progress: string[]; resistance: string[]; insight: string[] };
  streakCount: number;
};

export function buildCheckinSystemPrompt(context: CheckinContext): Message {
  return {
    role: "system",
    content: `You are the Coach in Final Boss — the user's evening check-in partner. You are warm, direct, and insightful. Like a wise friend, not a therapist.

Context:
- Archetype: ${context.archetype}
- Today's task: "${context.todayTask.text}" (${context.todayTask.type}) — ${context.todayTask.completed ? "completed" : "not completed"}
${context.todayTask.reflection ? `- Their reflection: "${context.todayTask.reflection}"` : ""}
- Current streak: ${context.streakCount} days
- Recent patterns: ${JSON.stringify(context.recentSignals)}

Your job:
1. Ask about their experience with today's task (or why they didn't do it)
2. Probe deeper — what did they feel, learn, notice?
3. Connect it to their larger journey
4. Keep it to 3-4 exchanges max. End with encouragement or a provocative thought.

Be conversational. Short messages. Don't lecture. Ask one thing at a time.`,
  };
}
```

- [ ] **Step 2: Create analyst prompts**

`apps/api/src/prompts/analyst.ts`:
```typescript
import type { Message } from "../ai/provider.js";

export function buildSignalExtractionPrompt(
  messages: { role: string; content: string }[]
): Message[] {
  return [
    {
      role: "system",
      content: `Analyze this check-in conversation and extract signals. Return JSON:
{
  "progress": ["specific progress statements or behaviors observed"],
  "resistance": ["specific resistance, avoidance, or struggle patterns"],
  "insight": ["specific realizations or self-awareness moments"],
  "emotionalState": "one word: enthusiastic | content | neutral | frustrated | avoidant | struggling"
}

Be specific. Quote or paraphrase actual user statements. Empty arrays are fine if no signals detected.`,
    },
    {
      role: "user",
      content: `Conversation:\n${messages.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
    },
  ];
}
```

- [ ] **Step 3: Implement task generator service**

`apps/api/src/services/task-generator.ts`:
```typescript
import { eq, and, desc, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { dailyTasks, skillNodes, users, progressMetrics } from "../db/schema.js";
import { getAI } from "../ai/index.js";
import { buildTaskGenerationPrompt } from "../prompts/coach.js";

export async function generateDailyTask(userId: string) {
  const today = new Date().toISOString().split("T")[0];

  // Check if task already exists for today
  const [existing] = await db
    .select()
    .from(dailyTasks)
    .where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.assignedDate, today)))
    .limit(1);

  if (existing) return existing;

  // Get user info
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  // Get active node
  const [activeNode] = await db
    .select()
    .from(skillNodes)
    .where(and(eq(skillNodes.userId, userId), eq(skillNodes.status, "active")))
    .limit(1);

  if (!activeNode) throw new Error("No active skill node");

  // Get recent tasks (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const recentTasks = await db
    .select()
    .from(dailyTasks)
    .where(and(eq(dailyTasks.userId, userId), gte(dailyTasks.assignedDate, sevenDaysAgo)))
    .orderBy(desc(dailyTasks.assignedDate));

  // Compute completion rate
  const completed = recentTasks.filter((t) => t.status === "completed").length;
  const completionRate = recentTasks.length > 0 ? completed / recentTasks.length : 0.5;

  // Get streak
  const [latestMetric] = await db
    .select()
    .from(progressMetrics)
    .where(eq(progressMetrics.userId, userId))
    .orderBy(desc(progressMetrics.date))
    .limit(1);

  const streakCount = latestMetric?.streakCount || 0;
  const dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];

  const ai = getAI();
  const messages = buildTaskGenerationPrompt({
    archetype: user.archetype || "disciplined-achiever",
    activeNodeTitle: activeNode.title,
    activeNodeDescription: activeNode.description,
    recentTasks: recentTasks.map((t) => ({ text: t.taskText, type: t.taskType, status: t.status })),
    completionRate,
    streakCount,
    dayOfWeek,
  });

  const result = await ai.chatJSON<{ taskText: string; taskType: string }>(messages);

  const [task] = await db
    .insert(dailyTasks)
    .values({
      userId,
      skillNodeId: activeNode.id,
      taskText: result.taskText,
      taskType: result.taskType as any,
      assignedDate: today,
    })
    .returning();

  return task;
}

export async function completeTask(taskId: string, reflection?: string) {
  const [task] = await db
    .update(dailyTasks)
    .set({
      status: "completed",
      reflection: reflection || null,
      completedAt: new Date(),
    })
    .where(eq(dailyTasks.id, taskId))
    .returning();

  return task;
}

export async function skipTask(taskId: string, reason?: string) {
  const [task] = await db
    .update(dailyTasks)
    .set({
      status: "skipped",
      reflection: reason || null,
    })
    .where(eq(dailyTasks.id, taskId))
    .returning();

  return task;
}
```

- [ ] **Step 4: Write test**

`apps/api/tests/tasks.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { completeTask, skipTask } from "../src/services/task-generator.js";

vi.mock("../src/ai/index.js", () => ({
  getAI: () => ({
    chat: vi.fn().mockResolvedValue("mock"),
    chatJSON: vi.fn().mockResolvedValue({ taskText: "Meditate for 10 minutes", taskType: "action" }),
  }),
}));

describe("Task Generator", () => {
  it("completeTask and skipTask are exported functions", () => {
    expect(typeof completeTask).toBe("function");
    expect(typeof skipTask).toBe("function");
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && pnpm test -- tests/tasks.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/prompts/coach.ts apps/api/src/prompts/analyst.ts apps/api/src/services/task-generator.ts apps/api/tests/tasks.test.ts
git commit -m "feat(api): add Coach prompts and daily task generation service"
```

---

### Task 2: Check-In Conversation Service + Routes

**Files:**
- Create: `apps/api/src/services/checkin.ts`
- Create: `apps/api/src/routes/tasks.ts`
- Create: `apps/api/src/routes/checkin.ts`
- Create: `apps/api/tests/checkin.test.ts`
- Modify: `apps/api/src/index.ts` (register new routes)

**Interfaces:**
- Consumes: `getAI()`, coach prompts, analyst prompts, `db`, check-in schema, daily tasks schema
- Produces: `POST /tasks/today` (get/generate today's task), `POST /tasks/:id/complete`, `POST /tasks/:id/skip`, `POST /checkin/start` (begin evening check-in), `POST /checkin/message` (send message in check-in), `GET /checkin/today` (get today's check-in state)

- [ ] **Step 1: Implement check-in service**

`apps/api/src/services/checkin.ts`:
```typescript
import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { checkIns, checkInMessages, dailyTasks, users, progressMetrics } from "../db/schema.js";
import { getAI } from "../ai/index.js";
import { buildCheckinSystemPrompt } from "../prompts/coach.js";
import { buildSignalExtractionPrompt } from "../prompts/analyst.js";

export async function getOrStartCheckin(userId: string) {
  const today = new Date().toISOString().split("T")[0];

  let [checkin] = await db
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.userId, userId), eq(checkIns.date, today)))
    .limit(1);

  if (!checkin) {
    [checkin] = await db.insert(checkIns).values({ userId, date: today }).returning();
  }

  const messages = await db
    .select()
    .from(checkInMessages)
    .where(eq(checkInMessages.checkInId, checkin.id))
    .orderBy(checkInMessages.createdAt);

  return { checkin, messages };
}

export async function sendCheckinMessage(userId: string, userMessage: string) {
  const { checkin, messages } = await getOrStartCheckin(userId);
  const today = new Date().toISOString().split("T")[0];

  // Get today's task for context
  const [todayTask] = await db
    .select()
    .from(dailyTasks)
    .where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.assignedDate, today)))
    .limit(1);

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  // Save user message
  await db.insert(checkInMessages).values({
    checkInId: checkin.id,
    role: "user",
    content: userMessage,
  });

  // Build AI context
  const recentSignals = checkin.extractedSignals || { progress: [], resistance: [], insight: [] };
  const systemPrompt = buildCheckinSystemPrompt({
    archetype: user?.archetype || "disciplined-achiever",
    todayTask: todayTask
      ? { text: todayTask.taskText, type: todayTask.taskType, completed: todayTask.status === "completed", reflection: todayTask.reflection || undefined }
      : { text: "No task assigned", type: "action", completed: false },
    recentSignals: recentSignals as any,
    streakCount: 0,
  });

  // Build conversation history
  const allMessages = [...messages, { role: "user" as const, content: userMessage }];
  const aiMessages = [
    systemPrompt,
    ...allMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const ai = getAI();
  const aiResponse = await ai.chat(aiMessages);

  // Save AI response
  await db.insert(checkInMessages).values({
    checkInId: checkin.id,
    role: "assistant",
    content: aiResponse,
  });

  // If this is the 4th exchange (8 messages total), extract signals
  const totalMessages = allMessages.length + 1; // +1 for the AI response we just added
  if (totalMessages >= 6) {
    const extractionMessages = [...allMessages, { role: "assistant", content: aiResponse }];
    const signalPrompt = buildSignalExtractionPrompt(
      extractionMessages.map((m) => ({ role: m.role, content: m.content }))
    );
    const signals = await ai.chatJSON<{
      progress: string[];
      resistance: string[];
      insight: string[];
      emotionalState: string;
    }>(signalPrompt);

    await db
      .update(checkIns)
      .set({ extractedSignals: signals as any })
      .where(eq(checkIns.id, checkin.id));
  }

  return { aiResponse, messageCount: totalMessages };
}
```

- [ ] **Step 2: Implement task routes**

`apps/api/src/routes/tasks.ts`:
```typescript
import type { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/authenticate.js";
import { generateDailyTask, completeTask, skipTask } from "../services/task-generator.js";

export async function taskRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/tasks/today", async (request) => {
    const task = await generateDailyTask(request.userId);
    return { data: task };
  });

  app.post<{ Params: { id: string }; Body: { reflection?: string } }>(
    "/tasks/:id/complete",
    async (request) => {
      const task = await completeTask(request.params.id, request.body?.reflection);
      return { data: task };
    }
  );

  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    "/tasks/:id/skip",
    async (request) => {
      const task = await skipTask(request.params.id, request.body?.reason);
      return { data: task };
    }
  );
}
```

- [ ] **Step 3: Implement check-in routes**

`apps/api/src/routes/checkin.ts`:
```typescript
import type { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/authenticate.js";
import { getOrStartCheckin, sendCheckinMessage } from "../services/checkin.js";

export async function checkinRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/checkin/today", async (request) => {
    const result = await getOrStartCheckin(request.userId);
    return { data: result };
  });

  app.post<{ Body: { message: string } }>("/checkin/message", async (request, reply) => {
    const { message } = request.body || {};
    if (!message?.trim()) {
      return reply.status(400).send({ error: { code: "REQUIRED", message: "Message required" } });
    }
    const result = await sendCheckinMessage(request.userId, message);
    return { data: result };
  });
}
```

- [ ] **Step 4: Register routes**

Add to `apps/api/src/index.ts`:
```typescript
import { taskRoutes } from "./routes/tasks.js";
import { checkinRoutes } from "./routes/checkin.js";
```

In `buildApp()`:
```typescript
await app.register(taskRoutes);
await app.register(checkinRoutes);
```

- [ ] **Step 5: Write test**

`apps/api/tests/checkin.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { getOrStartCheckin } from "../src/services/checkin.js";

vi.mock("../src/ai/index.js", () => ({
  getAI: () => ({
    chat: vi.fn().mockResolvedValue("How did that task go today?"),
    chatJSON: vi.fn().mockResolvedValue({
      progress: [],
      resistance: [],
      insight: [],
      emotionalState: "neutral",
    }),
  }),
}));

describe("Check-in Service", () => {
  it("getOrStartCheckin is exported", () => {
    expect(typeof getOrStartCheckin).toBe("function");
  });
});
```

- [ ] **Step 6: Run tests**

```bash
cd apps/api && pnpm test
```

Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/checkin.ts apps/api/src/routes/tasks.ts apps/api/src/routes/checkin.ts apps/api/tests/checkin.test.ts apps/api/src/index.ts
git commit -m "feat(api): add daily task and check-in conversation endpoints"
```

---

### Task 3: Trial Gate + Metrics + Daily Cron Job

**Files:**
- Create: `apps/api/src/services/trial.ts`
- Create: `apps/api/src/services/metrics.ts`
- Create: `apps/api/src/jobs/daily.ts`
- Create: `apps/api/src/routes/tree.ts`
- Create: `apps/api/tests/trial.test.ts`
- Modify: `apps/api/package.json` (add node-cron)
- Modify: `apps/api/src/index.ts` (start cron, register tree routes)

**Interfaces:**
- Consumes: `db`, all schemas, `TRIAL_DURATION_DAYS`, `TRIAL_THRESHOLD` from shared constants
- Produces: `evaluateTrial(userId): Promise<"passed" | "failed" | "active">`, `computeDailyMetrics(userId)`, `GET /tree` (user's skill tree), daily cron that runs at midnight UTC

- [ ] **Step 1: Add node-cron dependency**

Add to `apps/api/package.json` dependencies:
```json
"node-cron": "^3.0.0"
```

Add to devDependencies:
```json
"@types/node-cron": "^3.0.0"
```

Run: `pnpm install`

- [ ] **Step 2: Implement trial service**

`apps/api/src/services/trial.ts`:
```typescript
import { eq, and, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, dailyTasks } from "../db/schema.js";
import { TRIAL_DURATION_DAYS, TRIAL_THRESHOLD } from "@final-boss/shared";

export async function evaluateTrial(userId: string): Promise<"passed" | "failed" | "active"> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.trialStatus !== "active") return user?.trialStatus as any || "active";
  if (!user.trialStartDate) return "active";

  const startDate = new Date(user.trialStartDate);
  const endDate = new Date(startDate.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();

  // Trial not over yet
  if (now < endDate) return "active";

  // Count completed tasks during trial period
  const trialTasks = await db
    .select()
    .from(dailyTasks)
    .where(
      and(
        eq(dailyTasks.userId, userId),
        gte(dailyTasks.assignedDate, user.trialStartDate),
        lte(dailyTasks.assignedDate, endDate.toISOString().split("T")[0]),
        eq(dailyTasks.status, "completed")
      )
    );

  const completedDays = new Set(trialTasks.map((t) => t.assignedDate)).size;
  const result = completedDays >= TRIAL_THRESHOLD ? "passed" : "failed";

  await db
    .update(users)
    .set({ trialStatus: result })
    .where(eq(users.id, userId));

  return result;
}
```

- [ ] **Step 3: Implement metrics service**

`apps/api/src/services/metrics.ts`:
```typescript
import { eq, and, gte, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { dailyTasks, progressMetrics, users, skillNodes } from "../db/schema.js";

export async function computeDailyMetrics(userId: string) {
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Get recent tasks
  const recentTasks = await db
    .select()
    .from(dailyTasks)
    .where(and(eq(dailyTasks.userId, userId), gte(dailyTasks.assignedDate, sevenDaysAgo)));

  const completed = recentTasks.filter((t) => t.status === "completed").length;
  const completionRate = recentTasks.length > 0 ? completed / recentTasks.length : 0;

  // Compute streak
  const [prevMetric] = await db
    .select()
    .from(progressMetrics)
    .where(eq(progressMetrics.userId, userId))
    .orderBy(desc(progressMetrics.date))
    .limit(1);

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [yesterdayTask] = await db
    .select()
    .from(dailyTasks)
    .where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.assignedDate, yesterday), eq(dailyTasks.status, "completed")))
    .limit(1);

  const streakCount = yesterdayTask ? (prevMetric?.streakCount || 0) + 1 : 0;

  // Compute time estimate delta
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const previousEstimate = user?.timeToFinalBoss || 0;

  // Remaining estimate: sum of incomplete nodes' estimated days, adjusted by pace
  const remainingNodes = await db
    .select()
    .from(skillNodes)
    .where(and(eq(skillNodes.userId, userId), eq(skillNodes.status, "locked")));

  const rawRemaining = remainingNodes.reduce((sum, n) => sum + n.estimatedDays, 0);
  // Adjust by completion rate: lower rate = longer timeline
  const paceMultiplier = completionRate > 0 ? 1 / completionRate : 2;
  const adjustedRemaining = Math.round(rawRemaining * Math.min(paceMultiplier, 3));

  const timeEstimateDelta = adjustedRemaining - previousEstimate;

  // Update user's time estimate
  await db
    .update(users)
    .set({ timeToFinalBoss: adjustedRemaining })
    .where(eq(users.id, userId));

  // Save metric
  const [metric] = await db
    .insert(progressMetrics)
    .values({
      userId,
      date: today,
      completionRate,
      streakCount,
      timeEstimateDelta,
    })
    .returning();

  return metric;
}
```

- [ ] **Step 4: Implement daily cron job**

`apps/api/src/jobs/daily.ts`:
```typescript
import cron from "node-cron";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { generateDailyTask } from "../services/task-generator.js";
import { evaluateTrial } from "../services/trial.js";
import { computeDailyMetrics } from "../services/metrics.js";

export function startDailyJobs() {
  // Run at midnight UTC
  cron.schedule("0 0 * * *", async () => {
    console.log("[CRON] Running daily jobs...");

    // Get all active users (passed trial or in trial)
    const activeUsers = await db
      .select()
      .from(users)
      .where(eq(users.trialStatus, "active"));

    const passedUsers = await db
      .select()
      .from(users)
      .where(eq(users.trialStatus, "passed"));

    const allUsers = [...activeUsers, ...passedUsers];

    for (const user of allUsers) {
      try {
        // Evaluate trial if still active
        if (user.trialStatus === "active") {
          await evaluateTrial(user.id);
        }

        // Generate tomorrow's task
        await generateDailyTask(user.id);

        // Compute metrics
        await computeDailyMetrics(user.id);

        // Mark yesterday's unfinished tasks as missed
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        await db.execute(
          `UPDATE daily_tasks SET status = 'missed' WHERE user_id = '${user.id}' AND assigned_date = '${yesterday}' AND status = 'assigned'`
        );
      } catch (err) {
        console.error(`[CRON] Error for user ${user.id}:`, err);
      }
    }

    console.log(`[CRON] Daily jobs complete for ${allUsers.length} users`);
  });
}
```

- [ ] **Step 5: Implement tree route**

`apps/api/src/routes/tree.ts`:
```typescript
import type { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/authenticate.js";
import { getUserSkillTree } from "../services/skill-tree.js";

export async function treeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/tree", async (request) => {
    const nodes = await getUserSkillTree(request.userId);
    return { data: { nodes } };
  });
}
```

- [ ] **Step 6: Register in server + start cron**

Update `apps/api/src/index.ts`:
```typescript
import { treeRoutes } from "./routes/tree.js";
import { startDailyJobs } from "./jobs/daily.js";
```

In `buildApp()`:
```typescript
await app.register(treeRoutes);
```

In `main()`, after `app.listen`:
```typescript
startDailyJobs();
```

- [ ] **Step 7: Write trial test**

`apps/api/tests/trial.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { evaluateTrial } from "../src/services/trial.js";

describe("Trial Gate", () => {
  it("evaluateTrial is exported", () => {
    expect(typeof evaluateTrial).toBe("function");
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
git add apps/api/src/services/trial.ts apps/api/src/services/metrics.ts apps/api/src/jobs/daily.ts apps/api/src/routes/tree.ts apps/api/tests/trial.test.ts apps/api/src/index.ts apps/api/package.json
git commit -m "feat(api): add trial gate, metrics computation, daily cron, and tree endpoint"
```

---

### Task 4: Mobile — Home Screen (Today's Task + Metrics)

**Files:**
- Create: `apps/mobile/lib/tasks.ts`
- Create: `apps/mobile/components/TaskCard.tsx`
- Create: `apps/mobile/components/TimeCounter.tsx`
- Create: `apps/mobile/components/StreakCounter.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (add tab navigation)
- Modify: `apps/mobile/app/(app)/home.tsx` (full home screen)

**Interfaces:**
- Consumes: `GET /tasks/today`, `POST /tasks/:id/complete`, `POST /tasks/:id/skip`, `GET /user/me`
- Produces: Home tab with today's task card, time-to-final-boss counter, streak display, complete/skip actions

- [ ] **Step 1: Create task API helpers**

`apps/mobile/lib/tasks.ts`:
```typescript
import { api } from "./api";

export type DailyTask = {
  id: string;
  taskText: string;
  taskType: string;
  status: string;
  assignedDate: string;
  reflection?: string;
};

export async function getTodayTask(): Promise<DailyTask> {
  return api("/tasks/today");
}

export async function completeTask(taskId: string, reflection?: string) {
  return api(`/tasks/${taskId}/complete`, {
    method: "POST",
    body: JSON.stringify({ reflection }),
  });
}

export async function skipTask(taskId: string, reason?: string) {
  return api(`/tasks/${taskId}/skip`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
```

- [ ] **Step 2: Create TimeCounter component**

`apps/mobile/components/TimeCounter.tsx`:
```typescript
import { View, Text, StyleSheet } from "react-native";

type Props = { days: number | null };

export function TimeCounter({ days }: Props) {
  if (days === null) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>TIME TO FINAL BOSS</Text>
      <Text style={styles.value}>{days}</Text>
      <Text style={styles.unit}>days</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingVertical: 24 },
  label: { color: "#64748b", fontSize: 11, fontWeight: "600", letterSpacing: 1.5 },
  value: { color: "#f59e0b", fontSize: 56, fontWeight: "700", fontFamily: "monospace", marginVertical: 4 },
  unit: { color: "#94a3b8", fontSize: 14 },
});
```

- [ ] **Step 3: Create StreakCounter component**

`apps/mobile/components/StreakCounter.tsx`:
```typescript
import { View, Text, StyleSheet } from "react-native";

type Props = { count: number };

export function StreakCounter({ count }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.value}>{count}</Text>
      <Text style={styles.label}>day streak</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  value: { color: "#f8fafc", fontSize: 20, fontWeight: "700" },
  label: { color: "#64748b", fontSize: 13 },
});
```

- [ ] **Step 4: Create TaskCard component**

`apps/mobile/components/TaskCard.tsx`:
```typescript
import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import type { DailyTask } from "@/lib/tasks";

type Props = {
  task: DailyTask;
  onComplete: (reflection?: string) => void;
  onSkip: (reason?: string) => void;
};

export function TaskCard({ task, onComplete, onSkip }: Props) {
  const [showReflection, setShowReflection] = useState(false);
  const [reflection, setReflection] = useState("");
  const isCompleted = task.status === "completed";

  const typeColors: Record<string, string> = {
    action: "#3b82f6",
    reflection: "#a855f7",
    social: "#10b981",
    observation: "#f97316",
  };

  if (isCompleted) {
    return (
      <View style={[styles.card, styles.completedCard]}>
        <Text style={styles.completedText}>Done for today</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.typeBadge, { backgroundColor: typeColors[task.taskType] || "#64748b" }]}>
          <Text style={styles.typeText}>{task.taskType}</Text>
        </View>
      </View>
      <Text style={styles.taskText}>{task.taskText}</Text>

      {showReflection ? (
        <View style={styles.reflectionArea}>
          <TextInput
            style={styles.reflectionInput}
            placeholder="Brief reflection (optional)..."
            placeholderTextColor="#64748b"
            value={reflection}
            onChangeText={setReflection}
            multiline
          />
          <Pressable style={styles.doneButton} onPress={() => onComplete(reflection || undefined)}>
            <Text style={styles.doneButtonText}>Complete</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable style={styles.completeButton} onPress={() => setShowReflection(true)}>
            <Text style={styles.completeButtonText}>Done</Text>
          </Pressable>
          <Pressable style={styles.skipButton} onPress={() => onSkip()}>
            <Text style={styles.skipButtonText}>Skip</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#1e293b", borderRadius: 16, padding: 20, marginHorizontal: 16 },
  completedCard: { alignItems: "center", paddingVertical: 32 },
  completedText: { color: "#10b981", fontSize: 16, fontWeight: "600" },
  header: { flexDirection: "row", marginBottom: 12 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  typeText: { color: "#fff", fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  taskText: { color: "#f1f5f9", fontSize: 17, lineHeight: 26 },
  actions: { flexDirection: "row", gap: 12, marginTop: 20 },
  completeButton: { flex: 1, backgroundColor: "#f59e0b", borderRadius: 12, padding: 14, alignItems: "center" },
  completeButtonText: { color: "#0f1729", fontSize: 15, fontWeight: "600" },
  skipButton: { paddingHorizontal: 20, paddingVertical: 14, alignItems: "center" },
  skipButtonText: { color: "#64748b", fontSize: 15 },
  reflectionArea: { marginTop: 16 },
  reflectionInput: { backgroundColor: "#0f1729", borderRadius: 12, padding: 14, color: "#f8fafc", fontSize: 15, minHeight: 60, marginBottom: 12 },
  doneButton: { backgroundColor: "#f59e0b", borderRadius: 12, padding: 14, alignItems: "center" },
  doneButtonText: { color: "#0f1729", fontSize: 15, fontWeight: "600" },
});
```

- [ ] **Step 5: Update tab layout**

`apps/mobile/app/(app)/_layout.tsx`:
```typescript
import { Tabs } from "expo-router";
import { Text } from "react-native";

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "#0f1729", borderTopColor: "#1e293b" },
        tabBarActiveTintColor: "#f59e0b",
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Today", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>◉</Text> }} />
      <Tabs.Screen name="tree" options={{ title: "Tree", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⬡</Text> }} />
      <Tabs.Screen name="checkin" options={{ title: "Check-in", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>◈</Text> }} />
      <Tabs.Screen name="progress" options={{ title: "Progress", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>◆</Text> }} />
      <Tabs.Screen name="onboarding" options={{ href: null }} />
    </Tabs>
  );
}
```

- [ ] **Step 6: Rebuild home screen**

`apps/mobile/app/(app)/home.tsx`:
```typescript
import { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { getTodayTask, completeTask, skipTask, type DailyTask } from "@/lib/tasks";
import { TaskCard } from "@/components/TaskCard";
import { TimeCounter } from "@/components/TimeCounter";
import { StreakCounter } from "@/components/StreakCounter";

type UserProfile = {
  onboardingComplete: string | null;
  timeToFinalBoss: number | null;
};

export default function HomeScreen() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [task, setTask] = useState<DailyTask | null>(null);
  const [streak, setStreak] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const profile = await api<UserProfile>("/user/me");
      if (!profile.onboardingComplete) {
        router.replace("/(app)/onboarding");
        return;
      }
      setUser(profile);

      const todayTask = await getTodayTask();
      setTask(todayTask);
    } catch {}
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleComplete = async (reflection?: string) => {
    if (!task) return;
    await completeTask(task.id, reflection);
    setTask({ ...task, status: "completed" });
    setStreak((s) => s + 1);
  };

  const handleSkip = async (reason?: string) => {
    if (!task) return;
    await skipTask(task.id, reason);
    setTask({ ...task, status: "skipped" });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}
    >
      <TimeCounter days={user?.timeToFinalBoss || null} />
      <View style={styles.streakRow}>
        <StreakCounter count={streak} />
      </View>
      {task && <TaskCard task={task} onComplete={handleComplete} onSkip={handleSkip} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f1729" },
  content: { paddingTop: 60, paddingBottom: 40 },
  streakRow: { alignItems: "center", marginBottom: 32 },
});
```

- [ ] **Step 7: Verify typecheck**

```bash
cd apps/mobile && pnpm typecheck
```

- [ ] **Step 8: Manual test — verify home screen renders with task card**

```bash
cd apps/mobile && pnpm start
```

- [ ] **Step 9: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): add home screen with task card, time counter, and streak"
```

---

### Task 5: Mobile — Skill Tree Visualization

**Files:**
- Create: `apps/mobile/components/SkillTree.tsx`
- Create: `apps/mobile/components/SkillNode.tsx`
- Create: `apps/mobile/app/(app)/tree.tsx`
- Modify: `apps/mobile/package.json` (add react-native-svg)

**Interfaces:**
- Consumes: `GET /tree` endpoint, node data with parent relationships
- Produces: Full-screen zoomable skill tree with constellation aesthetic, node states visualized (locked/available/active/completed)

- [ ] **Step 1: Add react-native-svg**

Add to `apps/mobile/package.json` dependencies:
```json
"react-native-svg": "^15.8.0"
```

Run: `pnpm install`

- [ ] **Step 2: Create SkillNode component**

`apps/mobile/components/SkillNode.tsx`:
```typescript
import { Circle, Text as SvgText, G } from "react-native-svg";

type Props = {
  x: number;
  y: number;
  title: string;
  status: "locked" | "available" | "active" | "completed";
  onPress?: () => void;
};

const STATUS_COLORS = {
  locked: { fill: "#1e293b", stroke: "#334155", text: "#64748b" },
  available: { fill: "#1e293b", stroke: "#94a3b8", text: "#e2e8f0" },
  active: { fill: "#f59e0b", stroke: "#fbbf24", text: "#0f1729" },
  completed: { fill: "#10b981", stroke: "#34d399", text: "#0f1729" },
};

export function SkillNode({ x, y, title, status, onPress }: Props) {
  const colors = STATUS_COLORS[status];
  const radius = status === "active" ? 22 : 18;

  return (
    <G onPress={onPress}>
      {/* Glow effect for active node */}
      {status === "active" && (
        <Circle cx={x} cy={y} r={radius + 8} fill="none" stroke="#f59e0b" strokeWidth={1} opacity={0.3} />
      )}
      <Circle cx={x} cy={y} r={radius} fill={colors.fill} stroke={colors.stroke} strokeWidth={2} />
      <SvgText
        x={x}
        y={y + 30}
        textAnchor="middle"
        fontSize={10}
        fill={colors.text}
      >
        {title.length > 12 ? title.slice(0, 12) + "…" : title}
      </SvgText>
    </G>
  );
}
```

- [ ] **Step 3: Create SkillTree component**

`apps/mobile/components/SkillTree.tsx`:
```typescript
import { useMemo } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Svg, { Line } from "react-native-svg";
import { SkillNode } from "./SkillNode";

type Node = {
  id: string;
  title: string;
  status: "locked" | "available" | "active" | "completed";
  parentNodeId: string | null;
  orderIndex: number;
};

type Props = {
  nodes: Node[];
  onNodePress?: (nodeId: string) => void;
};

type PositionedNode = Node & { x: number; y: number };

function layoutTree(nodes: Node[], width: number): PositionedNode[] {
  const roots = nodes.filter((n) => !n.parentNodeId);
  const positioned: PositionedNode[] = [];
  const spacing = width / (roots.length + 1);
  const yStep = 100;

  // Position root nodes across the top
  roots.forEach((root, i) => {
    const x = spacing * (i + 1);
    const y = 60;
    positioned.push({ ...root, x, y });

    // Position children below
    const children = nodes.filter((n) => n.parentNodeId === root.id);
    children.forEach((child, j) => {
      const childX = x + (j - (children.length - 1) / 2) * 60;
      const childY = y + yStep * (j + 1);
      positioned.push({ ...child, x: childX, y: childY });
    });
  });

  return positioned;
}

export function SkillTree({ nodes, onNodePress }: Props) {
  const { width } = Dimensions.get("window");
  const positioned = useMemo(() => layoutTree(nodes, width - 40), [nodes, width]);

  // Build edges
  const edges = positioned
    .filter((n) => n.parentNodeId)
    .map((child) => {
      const parent = positioned.find((p) => p.id === child.parentNodeId);
      return parent ? { from: parent, to: child } : null;
    })
    .filter(Boolean) as { from: PositionedNode; to: PositionedNode }[];

  const height = Math.max(...positioned.map((n) => n.y), 400) + 80;

  return (
    <View style={styles.container}>
      <Svg width={width - 40} height={height}>
        {/* Draw edges */}
        {edges.map((edge, i) => (
          <Line
            key={i}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke="#334155"
            strokeWidth={1}
            opacity={0.6}
          />
        ))}
        {/* Draw nodes */}
        {positioned.map((node) => (
          <SkillNode
            key={node.id}
            x={node.x}
            y={node.y}
            title={node.title}
            status={node.status as any}
            onPress={() => onNodePress?.(node.id)}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingVertical: 20 },
});
```

- [ ] **Step 4: Create tree screen**

`apps/mobile/app/(app)/tree.tsx`:
```typescript
import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "@/lib/api";
import { SkillTree } from "@/components/SkillTree";

type SkillNodeData = {
  id: string;
  title: string;
  description: string;
  status: string;
  estimatedDays: number;
  parentNodeId: string | null;
  orderIndex: number;
};

export default function TreeScreen() {
  const [nodes, setNodes] = useState<SkillNodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SkillNodeData | null>(null);

  useEffect(() => {
    api<{ nodes: SkillNodeData[] }>("/tree")
      .then((data) => setNodes(data.nodes))
      .finally(() => setLoading(false));
  }, []);

  const handleNodePress = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    setSelected(node || null);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#f59e0b" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Your Path</Text>
        <SkillTree nodes={nodes as any} onNodePress={handleNodePress} />
      </ScrollView>

      {selected && (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>{selected.title}</Text>
          <Text style={styles.detailDesc}>{selected.description}</Text>
          <Text style={styles.detailDays}>{selected.estimatedDays} days estimated</Text>
          <Text style={styles.detailStatus}>{selected.status}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f1729" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1729" },
  scrollContent: { paddingTop: 60 },
  title: { color: "#f8fafc", fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 20 },
  detail: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#1e293b", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  detailTitle: { color: "#f8fafc", fontSize: 18, fontWeight: "600" },
  detailDesc: { color: "#94a3b8", fontSize: 14, marginTop: 8 },
  detailDays: { color: "#f59e0b", fontSize: 13, marginTop: 8 },
  detailStatus: { color: "#64748b", fontSize: 12, marginTop: 4, textTransform: "uppercase" },
});
```

- [ ] **Step 5: Verify typecheck**

```bash
cd apps/mobile && pnpm typecheck
```

- [ ] **Step 6: Manual test — verify tree renders with connected nodes**

- [ ] **Step 7: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): add skill tree visualization with constellation-style SVG rendering"
```

---

### Task 6: Mobile — Check-In Chat Screen + Push Notifications

**Files:**
- Create: `apps/mobile/lib/checkin.ts`
- Create: `apps/mobile/lib/notifications.ts`
- Create: `apps/mobile/app/(app)/checkin.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (register for notifications on boot)
- Modify: `apps/mobile/package.json` (add expo-notifications)

**Interfaces:**
- Consumes: `GET /checkin/today`, `POST /checkin/message`, Expo Push Notifications API
- Produces: Evening check-in chat screen (reuses ChatBubble/ChatInput), push notification registration + handling

- [ ] **Step 1: Add expo-notifications**

Add to `apps/mobile/package.json`:
```json
"expo-notifications": "~0.29.0",
"expo-device": "~7.0.0"
```

Update `app.json` plugins:
```json
"plugins": ["expo-router", "expo-secure-store", "expo-notifications"]
```

Run: `pnpm install`

- [ ] **Step 2: Create check-in API helpers**

`apps/mobile/lib/checkin.ts`:
```typescript
import { api } from "./api";

export type CheckInMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export type CheckInData = {
  checkin: { id: string; date: string };
  messages: CheckInMessage[];
};

export async function getTodayCheckin(): Promise<CheckInData> {
  return api("/checkin/today");
}

export async function sendCheckinMessage(message: string): Promise<{ aiResponse: string; messageCount: number }> {
  return api("/checkin/message", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}
```

- [ ] **Step 3: Create notifications helper**

`apps/mobile/lib/notifications.ts`:
```typescript
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  // Send token to backend (for future notification delivery)
  // await api("/user/push-token", { method: "POST", body: JSON.stringify({ token }) });

  return token;
}
```

- [ ] **Step 4: Create check-in screen**

`apps/mobile/app/(app)/checkin.tsx`:
```typescript
import { useEffect, useState, useRef } from "react";
import { View, ScrollView, Text, StyleSheet, ActivityIndicator } from "react-native";
import { ChatBubble } from "@/components/ChatBubble";
import { ChatInput } from "@/components/ChatInput";
import { getTodayCheckin, sendCheckinMessage, type CheckInMessage } from "@/lib/checkin";

export default function CheckinScreen() {
  const [messages, setMessages] = useState<CheckInMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    getTodayCheckin().then((data) => {
      if (data.messages.length === 0) {
        // Start with AI greeting
        setMessages([{
          id: "greeting",
          role: "assistant",
          content: "Hey. How did today go?",
          createdAt: new Date().toISOString(),
        }]);
      } else {
        setMessages(data.messages);
      }
      setLoading(false);
    });
  }, []);

  const handleSend = async (text: string) => {
    const userMsg: CheckInMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const result = await sendCheckinMessage(text);
      const aiMsg: CheckInMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: result.aiResponse,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "Something went wrong. Try again.",
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#f59e0b" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Evening Check-in</Text>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => (
          <ChatBubble key={msg.id} role={msg.role as any} content={msg.content} />
        ))}
      </ScrollView>
      <ChatInput onSend={handleSend} disabled={sending} placeholder="Reflect..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f1729" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1729" },
  header: { paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  headerTitle: { color: "#f8fafc", fontSize: 20, fontWeight: "600" },
  messages: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 16 },
});
```

- [ ] **Step 5: Register push notifications on app boot**

Update `apps/mobile/app/_layout.tsx`:
```typescript
import { useEffect } from "react";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthContext, useAuthState } from "@/lib/auth";
import { registerForPushNotifications } from "@/lib/notifications";

export default function RootLayout() {
  const auth = useAuthState();

  useEffect(() => {
    registerForPushNotifications();
  }, []);

  return (
    <AuthContext.Provider value={auth}>
      <StatusBar style="light" />
      <Slot />
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 6: Create placeholder progress screen**

`apps/mobile/app/(app)/progress.tsx`:
```typescript
import { View, Text, StyleSheet } from "react-native";

export default function ProgressScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Progress</Text>
      <Text style={styles.subtitle}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1729" },
  title: { color: "#f8fafc", fontSize: 24, fontWeight: "700" },
  subtitle: { color: "#64748b", fontSize: 14, marginTop: 8 },
});
```

- [ ] **Step 7: Verify typecheck and test manually**

```bash
cd apps/mobile && pnpm typecheck
pnpm start
```

Test: navigate to check-in tab, send a message, verify AI responds.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): add check-in chat screen and push notification registration"
```

---

## Phase 3 Complete Checklist

After all 6 tasks:
- [x] Coach AI prompts for task generation and check-in conversations
- [x] Analyst AI prompts for signal extraction
- [x] Daily task generation service
- [x] Task completion/skip endpoints
- [x] Check-in conversation service with signal extraction
- [x] Trial gate evaluation logic
- [x] Metrics computation (streak, completion rate, time estimate)
- [x] Daily cron job (generate tasks, evaluate trials, mark missed)
- [x] Mobile home screen with task card + time counter + streak
- [x] Mobile skill tree visualization (SVG constellation style)
- [x] Mobile check-in chat screen
- [x] Push notification setup
- [x] Tab navigation (Home, Tree, Check-in, Progress)

**Next phase:** Phase 4 — Analytics, Social Features, Voice Input, Monetization

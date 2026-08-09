import { eq, and, desc, gte, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { dailyTasks, skillNodes, users, journalEntries } from "../db/schema.js";
import * as ai from "./ai.js";
import { getUserAIConfigByUserId } from "./llmSettings.js";
import { taskGenerationSystem } from "../prompts/coach.js";

function toDateString(d: Date): string {
  return d.toISOString().split("T")[0] as string;
}

export async function generateDailyTask(userId: string) {
  const today = toDateString(new Date());

  // Check if already exists
  const [existing] = await db.select().from(dailyTasks)
    .where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.assignedDate, today)))
    .limit(1);
  if (existing) return existing;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  // Get active node (deepest active -- prefer child over parent)
  const activeNodes = await db.select().from(skillNodes)
    .where(and(eq(skillNodes.userId, userId), eq(skillNodes.status, "active")));

  const activeNode = activeNodes.find((n) => n.parentNodeId) ?? activeNodes[0];
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

  const keyStruggles = (user.clarifyingAnswers || [])
    .map(qa => qa.answer)
    .join("; ")
    .slice(0, 500); // cap length

  // Query recent journal signals (last 5 days) for psychological context
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const recentSignals = await db.select({ signals: journalEntries.signals })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.userId, userId),
      gte(journalEntries.createdAt, fiveDaysAgo),
      isNotNull(journalEntries.signals),
    ))
    .orderBy(desc(journalEntries.createdAt))
    .limit(20);

  let journalContext: string | undefined;
  if (recentSignals.length > 0) {
    const allEmotions = new Set<string>();
    const allThemes = new Set<string>();
    const allObstacles = new Set<string>();
    for (const row of recentSignals) {
      if (row.signals) {
        row.signals.emotions?.forEach(e => allEmotions.add(e));
        row.signals.themes?.forEach(t => allThemes.add(t));
        row.signals.obstacles?.forEach(o => allObstacles.add(o));
      }
    }
    const parts: string[] = [];
    if (allEmotions.size > 0) parts.push(`- Recent emotions: ${[...allEmotions].slice(0, 5).join(", ")}`);
    if (allThemes.size > 0) parts.push(`- Recurring themes: ${[...allThemes].slice(0, 5).join(", ")}`);
    if (allObstacles.size > 0) parts.push(`- Obstacles surfaced: ${[...allObstacles].slice(0, 5).join(", ")}`);
    if (parts.length > 0) journalContext = parts.join("\n");
  }

  const system = taskGenerationSystem({
    archetype: user.archetype ?? "disciplined-achiever",
    nodeTitle: activeNode.title,
    nodeDescription: activeNode.description,
    dayNumber,
    recentTasks: recentTasks.map((t) => `[${t.status}] ${t.taskText}`),
    finalBossDescription: user.finalBossDescription ?? "",
    currentSelfDescription: user.currentSelfDescription ?? "",
    keyStruggles,
    journalContext,
  });

  const userConfig = await getUserAIConfigByUserId(userId);
  const result = await ai.chatJSON<{ taskText: string; taskType: string }>(
    system,
    [{ role: "user", content: "Generate today's task." }],
    userConfig
  );

  const [task] = await db.insert(dailyTasks).values({
    userId,
    skillNodeId: activeNode.id,
    taskText: result.taskText,
    taskType: result.taskType,
    assignedDate: today,
  }).returning();

  if (!task) throw new Error("Failed to insert task");
  return task;
}

export async function completeTask(taskId: string, reflection?: string): Promise<{ task: typeof dailyTasks.$inferSelect; newStreak: number } | undefined> {
  const [task] = await db.update(dailyTasks).set({
    status: "completed",
    reflection: reflection ?? null,
  }).where(eq(dailyTasks.id, taskId)).returning();

  if (!task) return undefined;

  // Update streak
  const [user] = await db.select().from(users).where(eq(users.id, task.userId)).limit(1);
  const newStreak = user ? user.currentStreak + 1 : 1;
  if (user) {
    await db.update(users).set({ currentStreak: newStreak }).where(eq(users.id, user.id));
  }

  return { task, newStreak };
}

export async function getTodayTask(userId: string) {
  const today = toDateString(new Date());
  const [task] = await db.select().from(dailyTasks)
    .where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.assignedDate, today)))
    .limit(1);
  return task;
}

export async function markMissed(userId: string) {
  const yesterday = toDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const missed = await db.update(dailyTasks).set({ status: "missed" })
    .where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.assignedDate, yesterday), eq(dailyTasks.status, "assigned")))
    .returning();

  if (missed.length > 0) {
    await db.update(users).set({ currentStreak: 0 }).where(eq(users.id, userId));
  }
}

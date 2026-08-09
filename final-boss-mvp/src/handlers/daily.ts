import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getOrCreateUser } from "../services/onboarding.js";
import { getTodayTask, completeTask } from "../services/tasks.js";
import { db } from "../db/client.js";
import { journalEntries } from "../db/schema.js";

// ponytail: in-memory per-process; fine for single-instance MVP
const pendingReflection = new Map<number, string>();

function isCompletionSignal(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return lower === "done" || lower === "completed" || lower === "✅";
}

export async function handleDailyMessage(ctx: Context): Promise<boolean> {
  if (!ctx.message?.text || !ctx.from) return false;

  const user = await getOrCreateUser(ctx.from.id);
  if (user.onboardingStatus !== "complete") return false;

  const text = ctx.message.text.trim();
  const lower = text.toLowerCase();

  // Skip signal — complete task without reflection
  if (lower === "skip") {
    const task = await getTodayTask(user.id);
    if (!task || task.status === "completed") {
      await ctx.reply("No pending task to skip.");
      return true;
    }
    pendingReflection.delete(ctx.from.id);
    const result = await completeTask(task.id);
    const newStreak = result?.newStreak ?? 1;
    await ctx.reply(`✅ Day logged. Streak: ${newStreak} 🔥`);
    return true;
  }

  // Completion signal — set pending reflection
  if (isCompletionSignal(text)) {
    const task = await getTodayTask(user.id);
    if (!task) {
      await ctx.reply("No task assigned yet today. It'll arrive in the morning.");
      return true;
    }
    if (task.status === "completed") {
      await ctx.reply("You already completed today's task. Rest up, tomorrow brings a new challenge.");
      return true;
    }
    pendingReflection.set(ctx.from.id, task.id);
    await ctx.reply("Nice. Any quick reflection? What did you notice? (or send 'skip' to skip)");
    return true;
  }

  // If pending reflection — store as reflection and complete
  const pendingTaskId = pendingReflection.get(ctx.from.id);
  if (pendingTaskId) {
    pendingReflection.delete(ctx.from.id);
    const result = await completeTask(pendingTaskId, text);
    const newStreak = result?.newStreak ?? 1;
    await ctx.reply(`✅ Logged with reflection. Streak: ${newStreak} 🔥\n\nSee you tonight for the check-in.`);
    return true;
  }

  // Commands should not be journaled
  if (text.startsWith("/")) return false;

  // Everything else → journal entry
  await db.insert(journalEntries).values({
    userId: user.id,
    content: text,
  });
  await ctx.reply("📓 Noted.");
  return true;
}

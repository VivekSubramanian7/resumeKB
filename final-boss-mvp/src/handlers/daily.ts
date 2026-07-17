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
    const result = await completeTask(task.id);
    const newStreak = result?.newStreak ?? 1;
    await ctx.reply(`✅ Day logged. Streak: ${newStreak} 🔥`);
    return true;
  }

  // If task is assigned and they send text, treat it as reflection for completion
  if (task.status === "assigned") {
    // Check if this looks like a reflection (they said "done" previously, now giving reflection)
    // Simple heuristic: if it's not a question or command, treat as reflection
    if (text.length > 5 && !text.startsWith("/")) {
      const result = await completeTask(task.id, ctx.message.text);
      const newStreak = result?.newStreak ?? 1;
      await ctx.reply(`✅ Logged with reflection. Streak: ${newStreak} 🔥\n\nSee you tonight for the check-in.`);
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

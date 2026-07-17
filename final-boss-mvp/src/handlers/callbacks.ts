import type { Context } from "grammy";
import { getOrCreateUser, selectBranch } from "../services/onboarding.js";
import { completeTask } from "../services/tasks.js";

export async function handleCallback(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data || !ctx.from) return;

  const user = await getOrCreateUser(ctx.from.id);

  if (data.startsWith("select_branch:")) {
    try {
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
    } catch {
      await ctx.answerCallbackQuery({ text: "Something went wrong" });
    }
  } else if (data.startsWith("complete_task:")) {
    try {
      const taskId = data.replace("complete_task:", "");
      const result = await completeTask(taskId);
      const newStreak = result?.newStreak ?? 1;
      await ctx.answerCallbackQuery({ text: "Task completed!" });
      await ctx.editMessageText(`✅ Done! Streak: ${newStreak} 🔥`);
    } catch {
      await ctx.answerCallbackQuery({ text: "Something went wrong" });
    }
  } else if (data.startsWith("skip_task:")) {
    try {
      const taskId = data.replace("skip_task:", "");
      await completeTask(taskId); // counts as done for MVP
      await ctx.answerCallbackQuery({ text: "Skipped" });
      await ctx.editMessageText("⏭ Skipped. Tomorrow's a new day.");
    } catch {
      await ctx.answerCallbackQuery({ text: "Something went wrong" });
    }
  }
}

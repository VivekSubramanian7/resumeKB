import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { getOrCreateUser, selectBranch, generateTree } from "../services/onboarding.js";
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
  } else if (data === "confirm_archetype") {
    await db.update(users).set({ onboardingStatus: "generating_tree" }).where(eq(users.id, user.id));
    await ctx.answerCallbackQuery({ text: "Let's build your path" });
    await ctx.reply("Generating your skill tree...");
    const nodes = await generateTree(user.id);
    const rootNodes = nodes.filter((n) => !n.parentNodeId);

    const keyboard = new InlineKeyboard();
    for (const node of rootNodes) {
      keyboard.text(`${node.title}`, `select_branch:${node.id}`).row();
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
  } else if (data === "change_archetype") {
    await db.update(users).set({ onboardingStatus: "awaiting_current_self" }).where(eq(users.id, user.id));
    await ctx.answerCallbackQuery();
    await ctx.reply("Tell me more about what feels off. What's missing from that description?");
  }
}

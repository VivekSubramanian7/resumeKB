import { Bot } from "grammy";
import { eq, desc, gte, and } from "drizzle-orm";
import { config } from "./config.js";
import { NoAIConfigError } from "./services/ai.js";
import { handleStart } from "./handlers/start.js";
import { handleOnboardingMessage } from "./handlers/onboarding.js";
import { handleDailyMessage } from "./handlers/daily.js";
import { handleCallback } from "./handlers/callbacks.js";
import { getOrCreateUser } from "./services/onboarding.js";
import { handleSettingsCommand, handleSettingsReset, handleSettingsClear, handleSettingsMessage } from "./handlers/settings.js";
import { db } from "./db/client.js";
import { getTrialDayNumber } from "./services/trial.js";
import { skillNodes, dailyTasks, users } from "./db/schema.js";

// ponytail: in-memory per-process; fine for single-instance MVP
const pendingReset = new Set<number>();

export function createBot() {
  const bot = new Bot(config.telegramToken);

  // Commands
  bot.command("start", handleStart);
  bot.command("settings", handleSettingsCommand);
  bot.command("settings_reset", handleSettingsReset);
  bot.command("settings_clear", handleSettingsClear);

  bot.command("reset", async (ctx) => {
    if (!ctx.from) return;
    pendingReset.add(ctx.from.id);
    await ctx.reply(
      "⚠️ This will delete your skill tree, daily tasks, and all onboarding progress\\. Your LLM settings are kept\\.\n\n" +
      "Send /confirm\\_reset to continue, or anything else to cancel\\.",
      { parse_mode: "MarkdownV2" }
    );
  });

  bot.command("confirm_reset", async (ctx) => {
    if (!ctx.from) return;
    if (!pendingReset.has(ctx.from.id)) {
      await ctx.reply("No reset pending. Send /reset first.");
      return;
    }
    pendingReset.delete(ctx.from.id);
    const user = await getOrCreateUser(ctx.from.id);
    await db.delete(dailyTasks).where(eq(dailyTasks.userId, user.id));
    await db.delete(skillNodes).where(eq(skillNodes.userId, user.id));
    await db.update(users).set({
      onboardingStatus: "not_started",
      finalBossDescription: null,
      currentSelfDescription: null,
      clarifyingAnswers: [],
      archetype: null,
      archetypeExplanation: null,
      trialStartDate: null,
      trialStatus: "pending",
      currentStreak: 0,
    }).where(eq(users.id, user.id));
    await ctx.reply("Done. Your progress has been reset. Send /start to begin again.");
  });

  bot.command("status", async (ctx) => {
    if (!ctx.from) return;
    const user = await getOrCreateUser(ctx.from.id);

    if (user.onboardingStatus !== "complete") {
      await ctx.reply(`Onboarding status: ${user.onboardingStatus}\n\nKeep going - send me a message to continue.`);
      return;
    }

    // Skill tree context
    const allNodes = await db.select().from(skillNodes).where(eq(skillNodes.userId, user.id));
    const rootNodes = allNodes.filter(n => !n.parentNodeId);
    const activeBranch = rootNodes.find(n => n.status === "active");
    const activeChild = allNodes.find(n => n.parentNodeId && n.status === "active");

    const archetype = (user.archetype || "unknown").replace(/-/g, " ");
    const branchLine = activeBranch
      ? `🌟 ${activeBranch.title}${activeChild ? ` → ${activeChild.title}` : ""}`
      : "🌟 No active branch";

    // Trial scoreboard
    let trialLine = "";
    if (user.trialStartDate && user.trialStatus === "active") {
      const dayNum = getTrialDayNumber(user.trialStartDate);
      const trialStart = user.trialStartDate;
      const trialTasks = await db.select().from(dailyTasks).where(
        and(eq(dailyTasks.userId, user.id), gte(dailyTasks.assignedDate, trialStart))
      );

      const icons = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(new Date(trialStart).getTime() + d * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split("T")[0];
        const task = trialTasks.find(t => t.assignedDate === dateStr);
        if (!task) icons.push("⬜");
        else if (task.status === "completed") icons.push("✅");
        else if (task.status === "missed") icons.push("❌");
        else if (task.status === "skipped") icons.push("⏭");
        else icons.push("⏳");
      }
      const completed = icons.filter(i => i === "✅").length;
      trialLine = `📅 Trial: Day ${dayNum} of 7\n   ${icons.join("")}  (${completed}/5 needed)`;
    } else if (user.trialStatus === "passed") {
      trialLine = "📅 Trial: passed ✓";
    } else {
      trialLine = `📅 Trial: ${user.trialStatus}`;
    }

    // Today's task
    const today = new Date().toISOString().split("T")[0] as string;
    const [todayTask] = await db.select().from(dailyTasks)
      .where(and(eq(dailyTasks.userId, user.id), eq(dailyTasks.assignedDate, today)))
      .limit(1);

    const statusIcon = (s: string) => ({ completed: "✅", missed: "❌", skipped: "⏭", assigned: "⏳" }[s] || "⬜");
    const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s;

    let todayLine = "📋 Today: no task yet";
    if (todayTask) {
      todayLine = `📋 Today: ${statusIcon(todayTask.status)} ${todayTask.status}\n   "${truncate(todayTask.taskText, 80)}"`;
    }

    // Last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;
    const recentTasks = await db.select().from(dailyTasks)
      .where(and(eq(dailyTasks.userId, user.id), gte(dailyTasks.assignedDate, sevenDaysAgo)))
      .orderBy(desc(dailyTasks.assignedDate))
      .limit(7);

    const historyLines = recentTasks.map(t => {
      const d = new Date(t.assignedDate + "T00:00:00Z");
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      return `   ${label}: ${statusIcon(t.status)} "${truncate(t.taskText, 50)}"`;
    });

    const msg = [
      "📊 Status\n",
      `🎭 ${archetype}`,
      branchLine,
      "",
      trialLine,
      "",
      `🔥 Streak: ${user.currentStreak}`,
      "",
      todayLine,
      "",
      historyLines.length > 0 ? `📜 Last 7 days:\n${historyLines.join("\n")}` : "📜 No task history yet",
    ].join("\n");

    await ctx.reply(msg);
  });

  // Callbacks (inline keyboard buttons)
  bot.on("callback_query:data", handleCallback);

  // Messages -- route based on user state
  bot.on("message:text", async (ctx) => {
    if (!ctx.from) return;

    // Settings flow takes priority while user is in settings wizard
    if (await handleSettingsMessage(ctx)) return;

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

  bot.catch(async (err) => {
    const ctx = err.ctx;
    if (err.error instanceof NoAIConfigError) {
      await ctx.reply(
        "I need an AI provider to do that.\n\nUse /settings to configure your API key and model, then try again."
      ).catch(() => {});
      return;
    }
    // Re-throw so Railway logs the real error
    throw err;
  });

  return bot;
}

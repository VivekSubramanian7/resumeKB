import { Bot } from "grammy";
import { eq } from "drizzle-orm";
import { config } from "./config.js";
import { handleStart } from "./handlers/start.js";
import { handleOnboardingMessage } from "./handlers/onboarding.js";
import { handleDailyMessage } from "./handlers/daily.js";
import { handleCallback } from "./handlers/callbacks.js";
import { getOrCreateUser } from "./services/onboarding.js";
import { handleSettingsCommand, handleSettingsReset, handleSettingsClear, handleSettingsMessage } from "./handlers/settings.js";
import { db } from "./db/client.js";
import { skillNodes } from "./db/schema.js";

export function createBot() {
  const bot = new Bot(config.telegramToken);

  // Commands
  bot.command("start", handleStart);
  bot.command("settings", handleSettingsCommand);
  bot.command("settings_reset", handleSettingsReset);
  bot.command("settings_clear", handleSettingsClear);

  bot.command("status", async (ctx) => {
    if (!ctx.from) return;
    const user = await getOrCreateUser(ctx.from.id);

    if (user.onboardingStatus !== "complete") {
      await ctx.reply(`Onboarding status: ${user.onboardingStatus}\n\nKeep going - send me a message to continue.`);
      return;
    }

    const dayNum = user.trialStartDate
      ? Math.floor((Date.now() - new Date(user.trialStartDate).getTime()) / (24 * 60 * 60 * 1000)) + 1
      : 0;

    const allNodes = await db.select().from(skillNodes).where(eq(skillNodes.userId, user.id));
    const rootNodes = allNodes.filter(n => !n.parentNodeId);
    const completedBranches = rootNodes.filter(n => n.status === "completed").length;
    const activeBranch = rootNodes.find(n => n.status === "active");
    const totalBranches = rootNodes.length || 3;
    const progressLine = `Progress: Phase ${completedBranches + 1} of ${totalBranches}${activeBranch ? `: ${activeBranch.title}` : ""}`;

    await ctx.reply(
      `📊 *Status*\n\n` +
      `Archetype: ${(user.archetype || "").replace(/-/g, " ")}\n` +
      `Trial: ${user.trialStatus} (day ${dayNum})\n` +
      `Streak: ${user.currentStreak} 🔥\n` +
      progressLine,
      { parse_mode: "Markdown" }
    );
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

  return bot;
}

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

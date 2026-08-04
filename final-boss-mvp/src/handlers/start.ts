import type { Context } from "grammy";
import { getOrCreateUser } from "../services/onboarding.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function handleStart(ctx: Context) {
  const telegramId = ctx.from!.id;
  const username = ctx.from?.username;

  const user = await getOrCreateUser(telegramId, username);

  if (user.trialStatus === "failed") {
    const trialEnd = user.trialStartDate
      ? new Date(new Date(user.trialStartDate).getTime() + 7 * 24 * 60 * 60 * 1000)
      : null;
    const daysSinceEnd = trialEnd
      ? Math.floor((Date.now() - trialEnd.getTime()) / (24 * 60 * 60 * 1000))
      : 999;

    if (daysSinceEnd < 14) {
      const daysLeft = 14 - daysSinceEnd;
      await ctx.reply(`Your trial period ended. You can re-enter in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.\n\nUse this time to reflect on what held you back.`);
      return;
    }

    // 14+ days passed -- reset for re-entry
    await db.update(users).set({
      trialStatus: "pending",
      onboardingStatus: "awaiting_final_boss",
      trialStartDate: null,
      currentStreak: 0,
      clarifyingAnswers: [],
      finalBossDescription: null,
      currentSelfDescription: null,
      archetype: null,
      archetypeExplanation: null,
      timeToFinalBoss: null,
    }).where(eq(users.id, user.id));
    // fall through to normal start flow below
  }

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
    "This is a personal transformation program\\. Not an app you open when you feel like it, a commitment\\.\n\n" +
    "You have 7 days to prove you're serious\\. Complete 5 of 7 daily tasks, or you're out\\.\n\n" +
    "💡 _Tip: Use /settings to bring your own LLM API key \\(Anthropic, OpenAI, or local\\)\\._\n\n" +
    "Ready? Let's begin\\.\n\n" +
    "*Who is the final boss version of you?*\n\n" +
    "Describe who you want to become\\. Be specific, be ambitious\\. The person you'd be if you had no excuses\\.",
    { parse_mode: "MarkdownV2" }
  );
}

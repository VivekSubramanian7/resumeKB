import type { Context } from "grammy";
import { getOrCreateUser } from "../services/onboarding.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function handleStart(ctx: Context) {
  const telegramId = ctx.from!.id;
  const username = ctx.from?.username;

  const user = await getOrCreateUser(telegramId, username);

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
    "This is a personal transformation program\\. Not an app you open when you feel like it — a commitment\\.\n\n" +
    "You have 7 days to prove you're serious\\. Complete 5 of 7 daily tasks, or you're out\\.\n\n" +
    "Ready? Let's begin\\.\n\n" +
    "*Who is the final boss version of you?*\n\n" +
    "Describe who you want to become\\. Be specific, be ambitious\\. The person you'd be if you had no excuses\\.",
    { parse_mode: "MarkdownV2" }
  );
}

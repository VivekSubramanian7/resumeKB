import cron from "node-cron";
import { eq, and, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, dailyTasks, journalEntries } from "../db/schema.js";
import { generateDailyTask, markMissed } from "../services/tasks.js";
import { evaluateTrial, getTrialDayNumber } from "../services/trial.js";
import { chatJSON } from "../services/ai.js";
import { getUserAIConfigByUserId } from "../services/llmSettings.js";
import { checkinWithJournalSystem } from "../prompts/coach.js";
import type { Bot } from "grammy";

export function startJobs(bot: Bot) {
  // Morning: 7:00 UTC  - generate and send daily task
  cron.schedule("0 7 * * *", async () => {
    console.log("[CRON] Morning task delivery");

    const activeUsers = await db.select().from(users).where(eq(users.trialStatus, "active"));
    const passedUsers = await db.select().from(users).where(eq(users.trialStatus, "passed"));

    for (const user of [...activeUsers, ...passedUsers]) {
      try {
        // Mark yesterday's undone tasks as missed
        await markMissed(user.id);

        // Generate today's task
        const task = await generateDailyTask(user.id);

        const dayNum = user.trialStartDate ? getTrialDayNumber(user.trialStartDate) : "?";
        const trialNote = user.trialStatus === "active" ? `\n\n📅 Trial day ${dayNum}/7` : "";

        await bot.api.sendMessage(
          user.telegramId,
          `☀️ *Day ${dayNum}  - Your task:*\n\n${task.taskText}${trialNote}\n\nReply "done" when complete.`,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        console.error(`[CRON] Failed for user ${user.telegramId}:`, err);
      }
    }
  });

  // Evening: 20:00 UTC  - check-in prompt (personalized if journal entries exist)
  cron.schedule("0 20 * * *", async () => {
    console.log("[CRON] Evening check-in prompt");

    const activeUsers = await db.select().from(users).where(eq(users.trialStatus, "active"));
    const passedUsers = await db.select().from(users).where(eq(users.trialStatus, "passed"));

    const today = new Date().toISOString().split("T")[0] as string;

    for (const user of [...activeUsers, ...passedUsers]) {
      try {
        // Query today's journal entries
        const entries = await db.select().from(journalEntries)
          .where(and(eq(journalEntries.userId, user.id), gte(journalEntries.createdAt, new Date(today + "T00:00:00Z"))))
          .orderBy(journalEntries.createdAt);

        if (entries.length === 0) {
          // No journal entries — send generic message
          await bot.api.sendMessage(
            user.telegramId,
            "🌙 Evening check-in time.\n\nHow did today go? Tell me about your task — did you do it? What did you notice?",
          );
          continue;
        }

        // Get today's task for context
        const [todayTask] = await db.select().from(dailyTasks)
          .where(and(eq(dailyTasks.userId, user.id), eq(dailyTasks.assignedDate, today)))
          .limit(1);

        const dayNum = user.trialStartDate ? getTrialDayNumber(user.trialStartDate) : 1;

        const journalContext = entries.map(e => ({
          content: e.content,
          time: e.createdAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }),
        }));

        const userConfig = await getUserAIConfigByUserId(user.id);
        const result = await chatJSON<{
          message: string;
          signals: { entryIndex: number; emotions: string[]; themes: string[]; obstacles: string[] }[];
        }>(
          checkinWithJournalSystem({
            archetype: user.archetype || "disciplined-achiever",
            taskText: todayTask?.taskText || "No task today",
            taskStatus: todayTask?.status || "none",
            dayNumber: dayNum,
            journalEntries: journalContext,
          }),
          [{ role: "user", content: "Generate the evening check-in." }],
          userConfig,
        );

        // Send personalized check-in
        await bot.api.sendMessage(user.telegramId, `🌙 ${result.message}`);

        // Write signals back to journal entries
        for (const sig of result.signals) {
          const entry = entries[sig.entryIndex];
          if (entry) {
            await db.update(journalEntries)
              .set({ signals: { emotions: sig.emotions, themes: sig.themes, obstacles: sig.obstacles } })
              .where(eq(journalEntries.id, entry.id));
          }
        }
      } catch (err) {
        console.error(`[CRON] Check-in failed for ${user.telegramId}:`, err);
        // Fallback to generic on AI failure
        try {
          await bot.api.sendMessage(
            user.telegramId,
            "🌙 Evening check-in time.\n\nHow did today go? Tell me about your task — did you do it? What did you notice?",
          );
        } catch {}
      }
    }
  });

  // Midnight: evaluate trials
  cron.schedule("0 0 * * *", async () => {
    console.log("[CRON] Trial evaluation");

    const activeTrials = await db.select().from(users).where(eq(users.trialStatus, "active"));

    for (const user of activeTrials) {
      try {
        const result = await evaluateTrial(user.id);

        if (result === "passed") {
          await bot.api.sendMessage(
            user.telegramId,
            "🏆 *You passed the trial.*\n\nYou showed up. You proved you're serious.\n\nWelcome to the program. Your journey continues  - no more trial pressure, just consistent growth.\n\nTomorrow's task arrives in the morning.",
            { parse_mode: "Markdown" }
          );
        } else if (result === "failed") {
          await bot.api.sendMessage(
            user.telegramId,
            "Your trial period has ended.\n\nYou needed 5 completed days out of 7. You didn't hit the threshold.\n\nThis isn't a punishment  - it's a filter. This program works for people who show up consistently.\n\nYou can try again in 14 days. Use /start to re-enter when you're ready.",
          );
        }
      } catch (err) {
        console.error(`[CRON] Trial eval failed for user ${user.telegramId}:`, err);
      }
    }
  });

  console.log("[CRON] Daily jobs scheduled (7:00 task, 20:00 check-in, 00:00 eval)");
}

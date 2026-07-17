import { eq, and, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, dailyTasks } from "../db/schema.js";

const TRIAL_DAYS = 7;
const TRIAL_THRESHOLD = 5;

export async function evaluateTrial(userId: string): Promise<"active" | "passed" | "failed"> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.trialStatus !== "active" || !user.trialStartDate) return "active";

  const startDate = new Date(user.trialStartDate);
  const endDate = new Date(startDate.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  if (new Date() < endDate) return "active"; // not over yet

  // Count unique days with completed tasks
  const tasks = await db.select().from(dailyTasks).where(
    and(
      eq(dailyTasks.userId, userId),
      eq(dailyTasks.status, "completed"),
      gte(dailyTasks.assignedDate, user.trialStartDate),
    )
  );

  const uniqueDays = new Set(tasks.map((t) => t.assignedDate)).size;
  const result = uniqueDays >= TRIAL_THRESHOLD ? "passed" : "failed";

  await db.update(users).set({ trialStatus: result }).where(eq(users.id, userId));
  return result;
}

export function getTrialDayNumber(trialStartDate: string): number {
  return Math.floor((Date.now() - new Date(trialStartDate).getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

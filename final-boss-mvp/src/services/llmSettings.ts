import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { userLlmSettings, users } from "../db/schema.js";
import type { UserAIConfig } from "./ai.js";

export async function getUserAIConfig(telegramId: number): Promise<UserAIConfig | undefined> {
  const result = await db
    .select({ s: userLlmSettings })
    .from(userLlmSettings)
    .innerJoin(users, eq(users.id, userLlmSettings.userId))
    .where(eq(users.telegramId, telegramId))
    .limit(1);
  const s = result[0]?.s;
  if (!s) return undefined;
  return { aiProvider: s.aiProvider, aiBaseUrl: s.aiBaseUrl, aiApiKey: s.aiApiKey, aiModel: s.aiModel };
}

export async function getUserAIConfigByUserId(userId: string): Promise<UserAIConfig | undefined> {
  const result = await db.select().from(userLlmSettings).where(eq(userLlmSettings.userId, userId)).limit(1);
  const s = result[0];
  if (!s) return undefined;
  return { aiProvider: s.aiProvider, aiBaseUrl: s.aiBaseUrl, aiApiKey: s.aiApiKey, aiModel: s.aiModel };
}

export async function upsertUserAIConfig(userId: string, cfg: UserAIConfig) {
  await db
    .insert(userLlmSettings)
    .values({
      userId,
      aiProvider: cfg.aiProvider,
      aiBaseUrl: cfg.aiBaseUrl,
      aiApiKey: cfg.aiApiKey,
      aiModel: cfg.aiModel,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userLlmSettings.userId,
      set: {
        aiProvider: cfg.aiProvider,
        aiBaseUrl: cfg.aiBaseUrl,
        aiApiKey: cfg.aiApiKey,
        aiModel: cfg.aiModel,
        updatedAt: new Date(),
      },
    });
}

export async function deleteUserAIConfig(userId: string) {
  await db.delete(userLlmSettings).where(eq(userLlmSettings.userId, userId));
}

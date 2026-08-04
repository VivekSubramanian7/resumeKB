import type { Context } from "grammy";
import { getOrCreateUser } from "../services/onboarding.js";
import { getUserAIConfig, upsertUserAIConfig, deleteUserAIConfig } from "../services/llmSettings.js";
import { chat } from "../services/ai.js";

type SettingsStep = "provider" | "base_url" | "api_key" | "model" | "confirm";
type SettingsSession = { step: SettingsStep; provider?: string; baseUrl?: string; apiKey?: string; model?: string };

// ponytail: in-memory per-process; fine for single-instance MVP
const pending = new Map<number, SettingsSession>();

export async function handleSettingsCommand(ctx: Context) {
  if (!ctx.from) return;
  const user = await getOrCreateUser(ctx.from.id);
  const existing = await getUserAIConfig(ctx.from.id);

  if (existing) {
    const maskedKey = existing.aiApiKey.length > 8
      ? existing.aiApiKey.slice(0, 4) + "****" + existing.aiApiKey.slice(-4)
      : "****";
    await ctx.reply(
      `*Current LLM config*\n\nProvider: ${existing.aiProvider}\nBase URL: ${existing.aiBaseUrl ?? "(default)"}\nAPI Key: ${maskedKey}\nModel: ${existing.aiModel}\n\nSend /settings_reset to reconfigure, or /settings_clear to remove and use the server default.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  pending.set(ctx.from.id, { step: "provider" });
  await ctx.reply("Let's configure your LLM.\n\nWhich provider? Reply *anthropic* or *openai* (OpenAI-compatible, e.g. LM Studio, Groq, Together).", { parse_mode: "Markdown" });
}

export async function handleSettingsReset(ctx: Context) {
  if (!ctx.from) return;
  pending.set(ctx.from.id, { step: "provider" });
  await ctx.reply("Resetting. Which provider? Reply *anthropic* or *openai*.", { parse_mode: "Markdown" });
}

export async function handleSettingsClear(ctx: Context) {
  if (!ctx.from) return;
  const user = await getOrCreateUser(ctx.from.id);
  await deleteUserAIConfig(user.id);
  pending.delete(ctx.from.id);
  await ctx.reply("LLM config cleared. Using server default.");
}

export async function handleSettingsMessage(ctx: Context): Promise<boolean> {
  if (!ctx.from || !ctx.message?.text) return false;
  const session = pending.get(ctx.from.id);
  if (!session) return false;

  const text = ctx.message.text.trim();

  switch (session.step) {
    case "provider": {
      const provider = text.toLowerCase();
      if (provider !== "anthropic" && provider !== "openai") {
        await ctx.reply("Reply *anthropic* or *openai*.", { parse_mode: "Markdown" });
        return true;
      }
      session.provider = provider;
      if (provider === "openai") {
        session.step = "base_url";
        await ctx.reply("Base URL for your OpenAI-compatible endpoint (e.g. `http://localhost:1234/v1`).\n\nSend *skip* to use the server default.", { parse_mode: "Markdown" });
      } else {
        session.step = "api_key";
        await ctx.reply("Your Anthropic API key:");
      }
      return true;
    }

    case "base_url": {
      session.baseUrl = text.toLowerCase() === "skip" ? undefined : text;
      session.step = "api_key";
      await ctx.reply("Your API key:");
      return true;
    }

    case "api_key": {
      if (text.length < 8) {
        await ctx.reply("That looks too short. Paste your full API key:");
        return true;
      }
      session.apiKey = text;
      session.step = "model";
      await ctx.reply("Model name (e.g. `claude-sonnet-4-6-20250514`, `gpt-4o`, or your local model ID):", { parse_mode: "Markdown" });
      return true;
    }

    case "model": {
      session.model = text;
      session.step = "confirm";

      const maskedKey = session.apiKey!.length > 8
        ? session.apiKey!.slice(0, 4) + "****" + session.apiKey!.slice(-4)
        : "****";

      await ctx.reply(
        `*Confirm your config:*\n\nProvider: ${session.provider}\nBase URL: ${session.baseUrl ?? "(default)"}\nAPI Key: ${maskedKey}\nModel: ${session.model}\n\nSend *yes* to save, *no* to cancel.`,
        { parse_mode: "Markdown" }
      );
      return true;
    }

    case "confirm": {
      if (text.toLowerCase() === "no") {
        pending.delete(ctx.from.id);
        await ctx.reply("Cancelled. Your config was not saved.");
        return true;
      }
      if (text.toLowerCase() !== "yes") {
        await ctx.reply("Send *yes* to save or *no* to cancel.", { parse_mode: "Markdown" });
        return true;
      }

      const user = await getOrCreateUser(ctx.from.id);
      const cfg = {
        aiProvider: session.provider!,
        aiBaseUrl: session.baseUrl ?? null,
        aiApiKey: session.apiKey!,
        aiModel: session.model!,
      };

      // Test the config before saving
      await ctx.reply("Testing your config...");
      try {
        await chat("You are a helpful assistant.", [{ role: "user", content: "Reply with exactly: ok" }], cfg);
      } catch (err) {
        await ctx.reply(`Config test failed: ${err instanceof Error ? err.message : String(err)}\n\nCheck your key, URL, and model name, then /settings_reset to try again.`);
        pending.delete(ctx.from.id);
        return true;
      }

      await upsertUserAIConfig(user.id, cfg);
      pending.delete(ctx.from.id);
      await ctx.reply("✅ LLM config saved. Your conversations will now use your own API key and model.");
      return true;
    }
  }
}

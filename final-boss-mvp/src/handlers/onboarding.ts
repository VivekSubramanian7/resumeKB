import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import {
  getOrCreateUser,
  handleFinalBossInput,
  handleClarifyingAnswer,
  handleCurrentSelf,
} from "../services/onboarding.js";

export async function handleOnboardingMessage(ctx: Context) {
  if (!ctx.message?.text || !ctx.from) return;

  const user = await getOrCreateUser(ctx.from.id);
  const text = ctx.message.text;

  switch (user.onboardingStatus) {
    case "not_started":
      // They sent a message without /start -- nudge them
      await ctx.reply("Send /start to begin your journey.");
      break;

    case "awaiting_final_boss": {
      await ctx.replyWithChatAction("typing");
      const response = await handleFinalBossInput(user.id, text);
      await ctx.reply(response);
      break;
    }

    case "clarifying": {
      const { response, isReady } = await handleClarifyingAnswer(user.id, text);

      if (isReady) {
        await ctx.reply(response);
        await ctx.reply("Now, *who are you today?*\n\nBe honest. Where do you actually stand right now? What's your reality?", { parse_mode: "MarkdownV2" });
      } else {
        await ctx.reply(response);
      }
      break;
    }

    case "awaiting_current_self": {
      await ctx.reply("Analyzing your gap...");
      const explanation = await handleCurrentSelf(user.id, text);

      // Override status to confirming_archetype (handleCurrentSelf sets generating_tree)
      await db.update(users).set({ onboardingStatus: "confirming_archetype" }).where(eq(users.id, user.id));

      // Show archetype
      const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      const archetypeName = (updatedUser!.archetype || "").replace(/-/g, " ").toUpperCase();

      const confirmKeyboard = new InlineKeyboard()
        .text("Yes, that's me", "confirm_archetype")
        .text("Not quite", "change_archetype");

      await ctx.reply(
        `Your archetype: *${archetypeName}*\n\n${explanation}\n\nDoes this feel right?`,
        { parse_mode: "Markdown", reply_markup: confirmKeyboard }
      );
      break;
    }

    case "confirming_archetype": {
      await ctx.reply("Please use the buttons above to confirm or change your archetype.");
      break;
    }

    case "complete":
      // Handled by daily task handler, not here
      break;

    default:
      await ctx.reply("Hold on, something's processing. Give me a moment.");
  }
}

import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, skillNodes } from "../db/schema.js";
import {
  getOrCreateUser,
  handleFinalBossInput,
  handleClarifyingAnswer,
  handleCurrentSelf,
  generateTree,
} from "../services/onboarding.js";

export async function handleOnboardingMessage(ctx: Context) {
  if (!ctx.message?.text || !ctx.from) return;

  const user = await getOrCreateUser(ctx.from.id);
  const text = ctx.message.text;

  switch (user.onboardingStatus) {
    case "not_started":
      // They sent a message without /start — nudge them
      await ctx.reply("Send /start to begin your journey.");
      break;

    case "awaiting_final_boss": {
      await ctx.reply("Let me think about that...");
      const response = await handleFinalBossInput(user.id, text);
      await ctx.reply(response);
      break;
    }

    case "clarifying": {
      const { response, isReady } = await handleClarifyingAnswer(user.id, text);

      if (isReady) {
        await ctx.reply(response);
        await ctx.reply("Now — *who are you today?*\n\nBe honest. Where do you actually stand right now? What's your reality?", { parse_mode: "MarkdownV2" });
      } else {
        await ctx.reply(response);
      }
      break;
    }

    case "awaiting_current_self": {
      await ctx.reply("Analyzing your gap...");
      const explanation = await handleCurrentSelf(user.id, text);

      // Show archetype
      const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      const archetypeName = (updatedUser!.archetype || "").replace(/-/g, " ").toUpperCase();

      await ctx.reply(`Your archetype: *${archetypeName}*\n\n${explanation}`, { parse_mode: "Markdown" });
      await ctx.reply("Generating your skill tree...");

      // Generate tree
      const nodes = await generateTree(user.id);
      const rootNodes = nodes.filter((n) => !n.parentNodeId);

      // Show branches as inline keyboard
      const keyboard = new InlineKeyboard();
      for (const node of rootNodes) {
        keyboard.text(`${node.title} (${node.estimatedDays}d)`, `select_branch:${node.id}`).row();
      }

      const treeText = rootNodes
        .map((r) => {
          const children = nodes.filter((n) => n.parentNodeId === r.id);
          const childList = children.map((c) => `  → ${c.title}`).join("\n");
          return `🌟 *${r.title}*\n${r.description}\n${childList}`;
        })
        .join("\n\n");

      await ctx.reply(`Here's your path:\n\n${treeText}\n\n*Choose your first branch:*`, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      break;
    }

    case "complete":
      // Handled by daily task handler, not here
      break;

    default:
      await ctx.reply("Hold on — something's processing. Give me a moment.");
  }
}

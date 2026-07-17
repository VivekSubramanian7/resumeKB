import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN!,
  anthropicKey: process.env.ANTHROPIC_API_KEY!,
  aiModel: process.env.AI_MODEL || "claude-sonnet-4-6-20250514",
  port: parseInt(process.env.PORT || "3000", 10),
};

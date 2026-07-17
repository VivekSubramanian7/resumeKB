import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN!,
  anthropicKey: process.env.ANTHROPIC_API_KEY!,
  aiModel: process.env.AI_MODEL || "claude-sonnet-4-6-20250514",
  port: parseInt(process.env.PORT || "3000", 10),
  aiProvider: process.env.AI_PROVIDER || "anthropic",
  aiBaseUrl: process.env.AI_BASE_URL || "http://localhost:1234/v1",
  openaiKey: process.env.OPENAI_API_KEY || "lm-studio",
};

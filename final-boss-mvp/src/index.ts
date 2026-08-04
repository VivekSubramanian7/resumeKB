import Fastify from "fastify";
import { config } from "./config.js";
import { createBot } from "./bot.js";
import { startJobs } from "./jobs/daily.js";

async function main() {
  // Health check server (Railway needs this)
  const server = Fastify({ logger: false });
  server.get("/health", async () => ({ status: "ok" }));
  await server.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`Health check on port ${config.port}`);

  const bot = createBot();
  bot.catch((err) => console.error("Bot error:", err));
  startJobs(bot);

  process.once("SIGTERM", () => {
    bot.stop();
    server.close();
  });

  console.log("Starting bot...");
  bot.start({
    onStart: () => console.log("Bot running."),
  }).catch((err) => {
    console.error("bot.start() rejected:", err);
    process.exit(1);
  });

  // Give bot.start() 10s to connect
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("bot.start() timed out after 10s")), 10_000);
    bot.api.getMe()
      .then((me) => { clearTimeout(timeout); console.log(`Polling as @${me.username}`); resolve(); })
      .catch((err) => { clearTimeout(timeout); reject(err); });
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

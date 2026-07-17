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

  // Start bot
  const bot = createBot();
  startJobs(bot);

  process.once("SIGTERM", () => {
    bot.stop();
    server.close();
  });

  await bot.start({
    onStart: () => console.log("Bot running."),
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

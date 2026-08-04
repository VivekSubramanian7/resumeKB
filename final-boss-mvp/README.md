# Final Boss - Telegram MVP

A personal transformation Telegram bot. It onboards users via an AI-driven conversation, assigns them an archetype, builds a skill tree, delivers daily tasks, tracks streaks, and gates continued access behind a 7-day accountability trial.

## How It Works

### User Journey

```
/start
  |
  v
"Who is the final boss version of you?"
  |
  v
AI asks 3-5 clarifying questions (one at a time)
  |
  v
"Who are you today?" (current self)
  |
  v
Archetype assigned (e.g. Bold Entrepreneur, Stoic Leader)
  |
  v
Skill tree generated (root branches + child nodes)
  |
  v
User picks a branch --> Trial starts
  |
  v
[Daily loop for 7 days]
  07:00 UTC  Morning task delivered
  User replies "done" + optional reflection
  20:00 UTC  Evening check-in prompt
  00:00 UTC  Trial evaluation (day 7+)
  |
  v
5/7 tasks completed? --> PASSED (daily loop continues)
Less than 5?         --> FAILED (14-day cooldown, then re-entry via /start)
```

### Onboarding States

| Status | What happens |
|---|---|
| `not_started` | User hasn't sent `/start` yet |
| `awaiting_final_boss` | Bot asked "Who do you want to become?" - waiting for answer |
| `clarifying` | AI is asking follow-up questions to understand the goal |
| `awaiting_current_self` | Bot asked "Who are you today?" - waiting for answer |
| `assigning` | AI is computing archetype |
| `generating_tree` | AI is building the skill tree |
| `selecting_branch` | User is choosing which branch to start |
| `complete` | Onboarding done, daily loop active |

### Per-User LLM Config

Users can bring their own API key via `/settings`. This lets them use any OpenAI-compatible endpoint (LM Studio, Groq, Together, etc.) instead of the server default. Settings are stored in a separate `user_llm_settings` table and passed through all AI calls.

Commands: `/settings`, `/settings_reset`, `/settings_clear`

## Features

- **AI onboarding** - conversational clarification of your "Final Boss" goal and current self, ending with archetype assignment and a personalized skill tree (9-12 nodes)
- **Daily tasks** - morning delivery, evening check-in prompt, completion via text or inline button
- **Streak tracking** - consecutive completion days tracked per user
- **7-day trial gate** - users must complete 5 of 7 trial days to continue; failed users enter a 14-day cooldown before re-entry
- **Per-user LLM settings** - users can configure their own provider/key/model via `/settings`
- **Scheduled jobs** - morning (07:00 UTC), evening (20:00 UTC), midnight (00:00 UTC) cron jobs
- **Health check** - `GET /health` on Fastify for Railway uptime monitoring
- **Dual AI provider** - Anthropic Claude (production) or any OpenAI-compatible API like LM Studio (local dev)
- **Thinking/reasoning filter** - strips internal monologue from verbose local models before sending to user

## Tech Stack

| Layer | Library |
|---|---|
| Telegram bot | grammY |
| HTTP server | Fastify v5 |
| Database ORM | Drizzle ORM + postgres.js |
| AI (prod) | Anthropic SDK |
| AI (local) | OpenAI SDK (OpenAI-compatible) |
| Scheduler | node-cron |
| Runtime | Node.js + TypeScript (strict ESM) |
| Deploy | Railway |

## Project Structure

```
final-boss-mvp/
├── src/
│   ├── index.ts              # Entry point - Fastify health check, migrations, bot start
│   ├── bot.ts                # grammY bot assembly, message routing
│   ├── config.ts             # Env var validation and defaults
│   ├── db/
│   │   ├── schema.ts         # Drizzle table definitions
│   │   ├── client.ts         # postgres.js + Drizzle client
│   │   └── migrate.ts        # Migration runner (standalone)
│   ├── handlers/
│   │   ├── start.ts          # /start command
│   │   ├── onboarding.ts     # Onboarding state machine
│   │   ├── daily.ts          # Task completion text detection
│   │   ├── callbacks.ts      # Inline button callbacks
│   │   └── settings.ts       # /settings wizard (per-user LLM config)
│   ├── services/
│   │   ├── ai.ts             # chat() and chatJSON() - provider-switched, thinking filter
│   │   ├── onboarding.ts     # Onboarding business logic
│   │   ├── tasks.ts          # Task generation, completion, streak
│   │   ├── trial.ts          # Trial evaluation logic
│   │   └── llmSettings.ts    # CRUD for per-user LLM settings
│   ├── prompts/
│   │   ├── assessor.ts       # Onboarding + archetype prompts
│   │   ├── architect.ts      # Skill tree generation prompt
│   │   └── coach.ts          # Daily task + check-in prompts
│   └── jobs/
│       └── daily.ts          # Cron job registration
├── drizzle/
│   └── migrations/           # Generated SQL migrations
├── tests/
│   ├── trial.test.ts         # Trial day number unit tests
│   └── ai.test.ts            # AI service openai path tests
├── .env.example
├── drizzle.config.ts
├── railway.toml
└── package.json
```

## Database Schema

| Table | Key columns |
|---|---|
| `users` | `telegramId`, `onboardingStatus`, `trialStatus`, `currentStreak`, `clarifyingAnswers` (jsonb), `archetype`, `trialStartDate` |
| `skill_nodes` | `userId`, `parentNodeId` (self-ref), `title`, `status` (locked/available/active/completed), `orderIndex` |
| `daily_tasks` | `userId`, `skillNodeId`, `taskText`, `taskType`, `status`, `assignedDate`, `reflection` |
| `check_ins` | `userId`, `date`, `messages` (jsonb), `extractedSignals` (jsonb) |
| `user_llm_settings` | `userId` (unique), `aiProvider`, `aiBaseUrl`, `aiApiKey`, `aiModel` |

## Setup

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL database
- Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Anthropic API key (or LM Studio for local dev)

### Install

```bash
cd final-boss-mvp
pnpm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/finalboss
TELEGRAM_BOT_TOKEN=your-token-from-botfather
ANTHROPIC_API_KEY=sk-ant-xxxxx
AI_MODEL=claude-sonnet-4-6-20250514
```

### Run migrations

```bash
pnpm db:migrate
```

### Dev

```bash
pnpm dev
```

### Production build

```bash
pnpm build
pnpm start
```

## Local Model Testing (LM Studio)

You can swap out Anthropic for any OpenAI-compatible local server:

1. Download and open [LM Studio](https://lmstudio.ai/)
2. Load a model and start the local server (default: `http://localhost:1234`)
3. Set env vars:

```bash
AI_PROVIDER=openai
AI_BASE_URL=http://localhost:1234/v1
AI_MODEL=your-loaded-model-name   # must match the model name LM Studio shows
OPENAI_API_KEY=lm-studio          # LM Studio doesn't validate keys; any string works
```

Or inline for a one-off run:

```bash
AI_PROVIDER=openai AI_MODEL=lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF pnpm dev
```

When `AI_PROVIDER` is unset or `"anthropic"`, the Anthropic SDK is used and `AI_BASE_URL`/`OPENAI_API_KEY` are ignored.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | Yes | - | Token from @BotFather |
| `ANTHROPIC_API_KEY` | Prod only | - | Anthropic API key |
| `AI_MODEL` | No | `claude-sonnet-4-6-20250514` | Model name for the active provider |
| `AI_PROVIDER` | No | `anthropic` | `anthropic` or `openai` |
| `AI_BASE_URL` | No | `http://localhost:1234/v1` | Base URL when `AI_PROVIDER=openai` |
| `OPENAI_API_KEY` | No | `lm-studio` | API key when `AI_PROVIDER=openai` |
| `PORT` | No | `3000` | HTTP server port |

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run with hot reload via tsx |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled output |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm test` | Run vitest unit tests |
| `pnpm db:generate` | Generate Drizzle migration files |
| `pnpm db:migrate` | Apply migrations to database |

## Deploy to Railway

1. Install [Railway CLI](https://docs.railway.app/develop/cli) and log in:
   ```bash
   railway login
   ```

2. From `final-boss-mvp/`:
   ```bash
   railway init
   railway add --plugin postgresql
   ```

3. Set environment variables:
   ```bash
   railway variables set \
     TELEGRAM_BOT_TOKEN=your-token \
     ANTHROPIC_API_KEY=sk-ant-xxxxx \
     AI_MODEL=claude-sonnet-4-6-20250514
   ```
   `DATABASE_URL` is set automatically by Railway's PostgreSQL plugin.

4. Deploy:
   ```bash
   railway up
   ```

Railway uses `railway.toml` - it runs `pnpm install && pnpm build` on build, then `node dist/index.js`. Migrations run automatically at startup (after the health check server is up). The `/health` endpoint is used for uptime checks.

## Cron Schedule (UTC)

| Time | Job |
|---|---|
| 07:00 | Mark missed tasks, generate today's task, send morning message |
| 20:00 | Send evening check-in prompt |
| 00:00 | Evaluate trial status for users in their trial window |

## Trial Logic

- Trial starts when user selects a skill branch during onboarding
- Duration: 7 days (`TRIAL_DAYS`)
- Pass threshold: 5 completed tasks (`TRIAL_THRESHOLD`)
- On failure: 14-day cooldown; on re-entry all state is reset
- `trialStatus` values: `pending` → `active` → `passed` / `failed`

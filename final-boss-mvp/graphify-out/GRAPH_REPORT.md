# Graph Report - C:/Users/srivpra/Documents/GitHub/resumeKB/final-boss-mvp  (2026-08-04)

## Corpus Check
- Corpus is ~6,573 words - fits in a single context window. You may not need a graph.

## Summary
- 410 nodes · 533 edges · 31 communities (28 shown, 3 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Database Runtime Layer|Database Runtime Layer]]
- [[_COMMUNITY_AI Concepts & Patterns|AI Concepts & Patterns]]
- [[_COMMUNITY_Skill Tree Schema|Skill Tree Schema]]
- [[_COMMUNITY_DB Column Metadata|DB Column Metadata]]
- [[_COMMUNITY_Bot & Telegram Handlers|Bot & Telegram Handlers]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Check-in & Messages|Check-in & Messages]]
- [[_COMMUNITY_Foreign Key Relations A|Foreign Key Relations A]]
- [[_COMMUNITY_Foreign Key Relations B|Foreign Key Relations B]]
- [[_COMMUNITY_Migration Snapshot|Migration Snapshot]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Drizzle Migration Meta|Drizzle Migration Meta]]
- [[_COMMUNITY_Users Table Columns|Users Table Columns]]
- [[_COMMUNITY_DB Defaults Layer|DB Defaults Layer]]
- [[_COMMUNITY_Streak Tracking|Streak Tracking]]
- [[_COMMUNITY_Onboarding Status|Onboarding Status]]
- [[_COMMUNITY_Trial Status|Trial Status]]
- [[_COMMUNITY_Daily Tasks Schema|Daily Tasks Schema]]
- [[_COMMUNITY_Final Boss Description|Final Boss Description]]
- [[_COMMUNITY_Time To Goal|Time To Goal]]
- [[_COMMUNITY_Current Self Description|Current Self Description]]
- [[_COMMUNITY_Telegram User Identity|Telegram User Identity]]
- [[_COMMUNITY_Telegram Username|Telegram Username]]
- [[_COMMUNITY_Trial Start Date|Trial Start Date]]
- [[_COMMUNITY_Migration Journal|Migration Journal]]
- [[_COMMUNITY_AI Service Tests|AI Service Tests]]
- [[_COMMUNITY_Trial Day Tests|Trial Day Tests]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Check-in Prompt|Check-in Prompt]]
- [[_COMMUNITY_Get Today Task|Get Today Task]]

## God Nodes (most connected - your core abstractions)
1. `columns` - 15 edges
2. `compilerOptions` - 11 edges
3. `columns` - 10 edges
4. `columns` - 10 edges
5. `getOrCreateUser()` - 10 edges
6. `created_at` - 9 edges
7. `Bot Factory (createBot)` - 9 edges
8. `scripts` - 8 edges
9. `public.check_ins` - 8 edges
10. `check_ins_user_id_users_id_fk` - 8 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `fastify`  [INFERRED]
  src/index.ts → package.json
- `chat()` --calls--> `Anthropic Client Instance`  [EXTRACTED]
  src/services/ai.ts → final-boss-mvp/src/services/ai.ts
- `chat()` --calls--> `OpenAI Client Instance`  [EXTRACTED]
  src/services/ai.ts → final-boss-mvp/src/services/ai.ts
- `chat()` --implements--> `Dual AI Provider Pattern`  [INFERRED]
  src/services/ai.ts → final-boss-mvp/src/services/ai.ts
- `AI Service OpenAI Path Tests` --references--> `chat()`  [EXTRACTED]
  final-boss-mvp/tests/ai.test.ts → src/services/ai.ts

## Hyperedges (group relationships)
- **Telegram Message Routing Pipeline** — bot_ts, handlers_callbacks, handlers_daily, handler_start, handler_onboarding [EXTRACTED 1.00]
- **Database Layer (schema + client + migrations)** — db_schema, db_client, db_migrate, migration_sql, drizzle_config [EXTRACTED 1.00]
- **Four Core DB Tables** — schema_users_table, schema_skill_nodes_table, schema_daily_tasks_table, schema_check_ins_table [EXTRACTED 1.00]
- **Application Bootstrap (Fastify + Bot + Cron)** — index_ts, bot_ts, jobs_daily, dep_fastify [EXTRACTED 1.00]
- **Dual AI Provider Config (Anthropic + OpenAI/LMStudio)** — config_ts, dep_anthropic, dep_openai [EXTRACTED 1.00]
- **Full Onboarding Pipeline** — onboarding_handler_handleOnboardingMessage, services_onboarding_handleFinalBossInput, services_onboarding_handleClarifyingAnswer, services_onboarding_handleCurrentSelf, services_onboarding_generateTree, services_onboarding_selectBranch [INFERRED 0.95]
- **AI Prompt Layer** — prompts_assessor_ASSESSOR_SYSTEM, prompts_assessor_ARCHETYPE_SYSTEM, prompts_architect_TREE_SYSTEM, prompts_coach_taskGenerationSystem, prompts_coach_checkinSystem [INFERRED 0.90]
- **Scheduled Cron Job Trio** — daily_job_morningCron, daily_job_eveningCron, daily_job_midnightCron [EXTRACTED 1.00]
- **Dual AI Provider Service** — services_ai_chat, services_ai_chatJSON, services_ai_anthropicClient, services_ai_openaiClient [EXTRACTED 1.00]
- **Trial Lifecycle System** — concept_trial_gate, services_trial_evaluateTrial, services_trial_getTrialDayNumber, services_onboarding_selectBranch, start_handler_handleStart [INFERRED 0.90]

## Communities (31 total, 3 thin omitted)

### Community 0 - "Database Runtime Layer"
Cohesion: 0.10
Nodes (31): connection, db, checkIns, dailyTasks, skillNodes, users, handleCallback(), handleDailyMessage() (+23 more)

### Community 1 - "AI Concepts & Patterns"
Cohesion: 0.09
Nodes (34): Archetype Assignment Concept, Dual AI Provider Pattern, Onboarding State Machine, Concept: Skill Tree / Branch Selection, 7-Day Trial Gate Concept, Evening Check-in Cron Job (20:00 UTC), Midnight Trial Evaluation Cron Job (00:00 UTC), Morning Cron Job (07:00 UTC) (+26 more)

### Community 2 - "Skill Tree Schema"
Cohesion: 0.06
Nodes (33): description, estimated_days, id, order_index, parent_node_id, title, name, notNull (+25 more)

### Community 3 - "DB Column Metadata"
Cohesion: 0.06
Nodes (32): name, notNull, primaryKey, type, assigned_date, reflection, skill_node_id, status (+24 more)

### Community 4 - "Bot & Telegram Handlers"
Cohesion: 0.10
Nodes (30): Bot Factory (createBot), Concept: Daily Check-in and Task Completion, Concept: Onboarding State Machine, Concept: 7-Day Trial System, App Config (env vars), DB Client (drizzle instance), DB Migrate Runner, DB Schema (users, skillNodes, dailyTasks, checkIns) (+22 more)

### Community 5 - "Package Dependencies"
Cohesion: 0.07
Nodes (28): dependencies, @anthropic-ai/sdk, dotenv, drizzle-orm, fastify, grammy, node-cron, openai (+20 more)

### Community 6 - "Check-in & Messages"
Cohesion: 0.07
Nodes (28): created_at, date, extracted_signals, messages, user_id, default, name, notNull (+20 more)

### Community 7 - "Foreign Key Relations A"
Cohesion: 0.07
Nodes (27): columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom, tableTo, check_ins_user_id_users_id_fk (+19 more)

### Community 8 - "Foreign Key Relations B"
Cohesion: 0.09
Nodes (23): columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom, tableTo, columnsFrom (+15 more)

### Community 9 - "Migration Snapshot"
Cohesion: 0.13
Nodes (15): skill_nodes_user_id_users_id_fk, compositePrimaryKeys, foreignKeys, indexes, name, schema, uniqueConstraints, columnsFrom (+7 more)

### Community 10 - "TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, outDir, resolveJsonModule, rootDir (+5 more)

### Community 11 - "Drizzle Migration Meta"
Cohesion: 0.17
Nodes (11): dialect, enums, id, _meta, columns, schemas, tables, prevId (+3 more)

### Community 12 - "Users Table Columns"
Cohesion: 0.33
Nodes (6): name, notNull, primaryKey, type, archetype, columns

### Community 13 - "DB Defaults Layer"
Cohesion: 0.33
Nodes (6): default, name, notNull, primaryKey, type, clarifying_answers

### Community 14 - "Streak Tracking"
Cohesion: 0.33
Nodes (6): current_streak, default, name, notNull, primaryKey, type

### Community 15 - "Onboarding Status"
Cohesion: 0.33
Nodes (6): onboarding_status, default, name, notNull, primaryKey, type

### Community 16 - "Trial Status"
Cohesion: 0.33
Nodes (6): trial_status, default, name, notNull, primaryKey, type

### Community 17 - "Daily Tasks Schema"
Cohesion: 0.40
Nodes (5): name, notNull, primaryKey, type, archetype_explanation

### Community 18 - "Final Boss Description"
Cohesion: 0.40
Nodes (5): final_boss_description, name, notNull, primaryKey, type

### Community 19 - "Time To Goal"
Cohesion: 0.40
Nodes (5): time_to_final_boss, name, notNull, primaryKey, type

### Community 20 - "Current Self Description"
Cohesion: 0.40
Nodes (5): current_self_description, name, notNull, primaryKey, type

### Community 21 - "Telegram User Identity"
Cohesion: 0.40
Nodes (5): telegram_id, name, notNull, primaryKey, type

### Community 22 - "Telegram Username"
Cohesion: 0.40
Nodes (5): telegram_username, name, notNull, primaryKey, type

### Community 23 - "Trial Start Date"
Cohesion: 0.40
Nodes (5): trial_start_date, name, notNull, primaryKey, type

### Community 24 - "Migration Journal"
Cohesion: 0.50
Nodes (3): dialect, entries, version

### Community 25 - "AI Service Tests"
Cohesion: 0.50
Nodes (3): call, mockCreate, result

### Community 26 - "Trial Day Tests"
Cohesion: 0.50
Nodes (3): sevenDaysAgo, sixDaysAgo, today

## Knowledge Gaps
- **249 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+244 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `columns` connect `Users Table Columns` to `Skill Tree Schema`, `Check-in & Messages`, `Foreign Key Relations A`, `DB Defaults Layer`, `Streak Tracking`, `Onboarding Status`, `Trial Status`, `Daily Tasks Schema`, `Final Boss Description`, `Time To Goal`, `Current Self Description`, `Telegram User Identity`, `Telegram Username`, `Trial Start Date`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Why does `columns` connect `DB Column Metadata` to `Foreign Key Relations B`, `Skill Tree Schema`, `Check-in & Messages`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Why does `columns` connect `Skill Tree Schema` to `Migration Snapshot`, `DB Column Metadata`, `Check-in & Messages`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _257 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Database Runtime Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.10256410256410256 - nodes in this community are weakly interconnected._
- **Should `AI Concepts & Patterns` be split into smaller, more focused modules?**
  _Cohesion score 0.08912655971479501 - nodes in this community are weakly interconnected._
- **Should `Skill Tree Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
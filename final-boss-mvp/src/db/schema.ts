import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  real,
  bigint,
  date,
  boolean,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  telegramUsername: text("telegram_username"),
  // Onboarding state
  onboardingStatus: text("onboarding_status").notNull().default("not_started"),
  // not_started | awaiting_final_boss | clarifying | awaiting_current_self | assigning | generating_tree | selecting_branch | complete
  finalBossDescription: text("final_boss_description"),
  currentSelfDescription: text("current_self_description"),
  clarifyingAnswers: jsonb("clarifying_answers").$type<{ question: string; answer: string }[]>().default([]),
  archetype: text("archetype"),
  archetypeExplanation: text("archetype_explanation"),
  // Trial
  trialStartDate: date("trial_start_date"),
  trialStatus: text("trial_status").notNull().default("pending"), // pending | active | passed | failed
  // Metrics
  timeToFinalBoss: integer("time_to_final_boss"),
  currentStreak: integer("current_streak").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skillNodes = pgTable("skill_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentNodeId: uuid("parent_node_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("locked"), // locked | available | active | completed
  estimatedDays: integer("estimated_days").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dailyTasks = pgTable("daily_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  skillNodeId: uuid("skill_node_id").references(() => skillNodes.id),
  taskText: text("task_text").notNull(),
  taskType: text("task_type").notNull(), // action | reflection | social | observation
  status: text("status").notNull().default("assigned"), // assigned | completed | skipped | missed
  assignedDate: date("assigned_date").notNull(),
  reflection: text("reflection"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userLlmSettings = pgTable("user_llm_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  aiProvider: text("ai_provider").notNull().default("anthropic"), // anthropic | openai
  aiBaseUrl: text("ai_base_url"),
  aiApiKey: text("ai_api_key").notNull(),
  aiModel: text("ai_model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checkIns = pgTable("check_ins", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  messages: jsonb("messages").$type<{ role: string; content: string }[]>().default([]),
  extractedSignals: jsonb("extracted_signals").$type<{
    progress: string[];
    resistance: string[];
    insight: string[];
    emotionalState: string;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

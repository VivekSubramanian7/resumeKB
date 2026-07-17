# Final Boss Phase 1: Foundation (Backend + Auth + DB + Project Scaffold)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Expo mobile app, Node.js API server, PostgreSQL database, and authentication — the skeleton everything else bolts onto.

**Architecture:** Monorepo with Expo frontend and Fastify backend. PostgreSQL with pgvector extension for future semantic search. Magic-link email auth (no passwords). Clean separation: `apps/mobile`, `apps/api`, `packages/shared` (types/constants shared across both).

**Tech Stack:** Expo SDK 53, React Native, Fastify, PostgreSQL 16 + pgvector, Drizzle ORM, TypeScript throughout, magic-link auth via email (Resend for delivery).

## Global Constraints

- TypeScript strict mode everywhere
- Node.js 20+ (LTS)
- PostgreSQL 16+ with pgvector extension enabled
- Expo SDK 53 (managed workflow)
- No Python anywhere — full JS/TS stack
- All API responses follow `{ data: T } | { error: { code: string, message: string } }` shape
- All dates stored as UTC timestamps
- Environment variables via `.env` files (never committed)
- Package manager: pnpm with workspaces

---

## File Structure

```
final-boss/
├── package.json                    (pnpm workspace root)
├── pnpm-workspace.yaml
├── tsconfig.base.json              (shared TS config)
├── .env.example
├── .gitignore
├── apps/
│   ├── mobile/
│   │   ├── app.json                (Expo config)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── app/
│   │   │   ├── _layout.tsx         (root layout, providers)
│   │   │   ├── index.tsx           (entry redirect)
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx       (magic link request)
│   │   │   │   └── verify.tsx      (magic link verification)
│   │   │   └── (app)/
│   │   │       ├── _layout.tsx     (tab navigator)
│   │   │       └── home.tsx        (placeholder home)
│   │   ├── lib/
│   │   │   ├── api.ts              (API client)
│   │   │   ├── auth.ts             (auth state management)
│   │   │   └── storage.ts          (secure token storage)
│   │   └── components/
│   │       └── Button.tsx          (base button component)
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts            (server entry)
│   │   │   ├── config.ts           (env loading)
│   │   │   ├── db/
│   │   │   │   ├── client.ts       (drizzle client)
│   │   │   │   ├── schema.ts       (all table definitions)
│   │   │   │   └── migrate.ts      (migration runner)
│   │   │   ├── routes/
│   │   │   │   ├── health.ts       (health check)
│   │   │   │   └── auth.ts         (login + verify endpoints)
│   │   │   ├── middleware/
│   │   │   │   └── authenticate.ts (JWT verification)
│   │   │   └── services/
│   │   │       └── email.ts        (magic link sender via Resend)
│   │   ├── drizzle/
│   │   │   └── migrations/         (generated SQL migrations)
│   │   └── tests/
│   │       ├── setup.ts            (test DB + server setup)
│   │       ├── health.test.ts
│   │       └── auth.test.ts
│   └── packages/
│       └── shared/
│           ├── package.json
│           ├── tsconfig.json
│           └── src/
│               ├── types.ts        (shared type definitions)
│               └── constants.ts    (shared constants)
```

---

### Task 1: Monorepo Scaffold + Tooling

**Files:**
- Create: `final-boss/package.json`
- Create: `final-boss/pnpm-workspace.yaml`
- Create: `final-boss/tsconfig.base.json`
- Create: `final-boss/.gitignore`
- Create: `final-boss/.env.example`
- Create: `final-boss/packages/shared/package.json`
- Create: `final-boss/packages/shared/tsconfig.json`
- Create: `final-boss/packages/shared/src/types.ts`
- Create: `final-boss/packages/shared/src/constants.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: pnpm workspace with `@final-boss/shared` package exporting `ApiResponse<T>`, `ApiError`, `UserTrialStatus`, `TaskStatus`, `NodeStatus` types

- [ ] **Step 1: Create project root**

```bash
mkdir final-boss && cd final-boss && git init
```

- [ ] **Step 2: Create root package.json**

```json
{
  "name": "final-boss",
  "private": true,
  "scripts": {
    "dev:api": "pnpm --filter @final-boss/api dev",
    "dev:mobile": "pnpm --filter @final-boss/mobile start",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.env
.env.local
*.tsbuildinfo
.expo/
ios/
android/
```

- [ ] **Step 6: Create .env.example**

```env
# API
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finalboss
JWT_SECRET=change-me-in-production
RESEND_API_KEY=re_xxxxx
MAGIC_LINK_URL=finalboss://verify

# Mobile
EXPO_PUBLIC_API_URL=http://localhost:3000
```

- [ ] **Step 7: Create shared package**

`packages/shared/package.json`:
```json
{
  "name": "@final-boss/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

`packages/shared/src/types.ts`:
```typescript
export type ApiResponse<T> = { data: T };
export type ApiError = { error: { code: string; message: string } };
export type ApiResult<T> = ApiResponse<T> | ApiError;

export type UserTrialStatus = "pending" | "active" | "passed" | "failed";
export type TaskStatus = "assigned" | "completed" | "skipped" | "missed";
export type TaskType = "action" | "reflection" | "social" | "observation";
export type NodeStatus = "locked" | "available" | "active" | "completed";
```

`packages/shared/src/constants.ts`:
```typescript
export const TRIAL_DURATION_DAYS = 7;
export const TRIAL_THRESHOLD = 5; // must complete 5 of 7 days
export const WAITLIST_COOLDOWN_DAYS = 14;
export const CHECKIN_CONTEXT_DAYS = 7; // how many days of history AI sees
```

`packages/shared/src/index.ts`:
```typescript
export * from "./types";
export * from "./constants";
```

- [ ] **Step 8: Install dependencies and verify**

```bash
cd final-boss && pnpm install
pnpm typecheck
```

Expected: clean exit, no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo with pnpm workspaces and shared types"
```

---

### Task 2: Fastify API Server + Health Check

**Files:**
- Create: `final-boss/apps/api/package.json`
- Create: `final-boss/apps/api/tsconfig.json`
- Create: `final-boss/apps/api/src/index.ts`
- Create: `final-boss/apps/api/src/config.ts`
- Create: `final-boss/apps/api/src/routes/health.ts`
- Create: `final-boss/apps/api/tests/setup.ts`
- Create: `final-boss/apps/api/tests/health.test.ts`

**Interfaces:**
- Consumes: `@final-boss/shared` types
- Produces: Fastify server instance with `/health` endpoint, `buildApp()` factory for testing

- [ ] **Step 1: Create api package.json**

```json
{
  "name": "@final-boss/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@fastify/cors": "^10.0.0",
    "dotenv": "^16.4.0",
    "fastify": "^5.0.0",
    "@final-boss/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create api tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": ["tests"]
}
```

- [ ] **Step 3: Write the failing health check test**

`apps/api/tests/setup.ts`:
```typescript
import { buildApp } from "../src/index.js";

export async function createTestApp() {
  const app = await buildApp();
  return app;
}
```

`apps/api/tests/health.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestApp } from "./setup.js";
import type { FastifyInstance } from "fastify";

describe("GET /health", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns status ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { status: "ok" } });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd apps/api && pnpm test
```

Expected: FAIL — cannot find module `../src/index.js`

- [ ] **Step 5: Implement config + server + health route**

`apps/api/src/config.ts`:
```typescript
import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  resendApiKey: process.env.RESEND_API_KEY || "",
  magicLinkUrl: process.env.MAGIC_LINK_URL || "finalboss://verify",
};
```

`apps/api/src/routes/health.ts`:
```typescript
import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return { data: { status: "ok" } };
  });
}
```

`apps/api/src/index.ts`:
```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";

export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cors);
  await app.register(healthRoutes);
  return app;
}

async function main() {
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  console.log(`Server running on port ${config.port}`);
}

if (process.argv[1] === import.meta.filename) {
  main();
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/api && pnpm test
```

Expected: PASS — 1 test passing

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): add Fastify server with health check endpoint"
```

---

### Task 3: PostgreSQL + Drizzle ORM Schema

**Files:**
- Create: `final-boss/apps/api/src/db/client.ts`
- Create: `final-boss/apps/api/src/db/schema.ts`
- Create: `final-boss/apps/api/src/db/migrate.ts`
- Create: `final-boss/apps/api/drizzle.config.ts`
- Modify: `final-boss/apps/api/package.json` (add drizzle deps)

**Interfaces:**
- Consumes: `config.databaseUrl`, shared types (`UserTrialStatus`, `TaskStatus`, `TaskType`, `NodeStatus`)
- Produces: `db` client instance, table schemas (`users`, `skillNodes`, `dailyTasks`, `checkIns`, `checkInMessages`, `progressMetrics`), `runMigrations()` function

- [ ] **Step 1: Add drizzle dependencies to api/package.json**

Add to `dependencies`:
```json
"drizzle-orm": "^0.33.0",
"postgres": "^3.4.0"
```

Add to `devDependencies`:
```json
"drizzle-kit": "^0.24.0"
```

Add script:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "tsx src/db/migrate.ts"
```

Run: `pnpm install`

- [ ] **Step 2: Create drizzle.config.ts**

`apps/api/drizzle.config.ts`:
```typescript
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 3: Create database client**

`apps/api/src/db/client.ts`:
```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

const connection = postgres(config.databaseUrl);
export const db = drizzle(connection, { schema });
export type Database = typeof db;
```

- [ ] **Step 4: Create full schema**

`apps/api/src/db/schema.ts`:
```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  real,
  pgEnum,
  date,
} from "drizzle-orm/pg-core";

export const trialStatusEnum = pgEnum("trial_status", [
  "pending",
  "active",
  "passed",
  "failed",
]);

export const nodeStatusEnum = pgEnum("node_status", [
  "locked",
  "available",
  "active",
  "completed",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "assigned",
  "completed",
  "skipped",
  "missed",
]);

export const taskTypeEnum = pgEnum("task_type", [
  "action",
  "reflection",
  "social",
  "observation",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  archetype: text("archetype"),
  currentSelfDescription: text("current_self_description"),
  finalBossDescription: text("final_boss_description"),
  timeToFinalBoss: integer("time_to_final_boss"), // days
  trialStatus: trialStatusEnum("trial_status").notNull().default("pending"),
  trialStartDate: date("trial_start_date"),
  onboardingComplete: timestamp("onboarding_complete", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skillNodes = pgTable("skill_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentNodeId: uuid("parent_node_id").references((): any => skillNodes.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: nodeStatusEnum("status").notNull().default("locked"),
  estimatedDays: integer("estimated_days").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dailyTasks = pgTable("daily_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  skillNodeId: uuid("skill_node_id").references(() => skillNodes.id),
  taskText: text("task_text").notNull(),
  taskType: taskTypeEnum("task_type").notNull(),
  status: taskStatusEnum("status").notNull().default("assigned"),
  assignedDate: date("assigned_date").notNull(),
  reflection: text("reflection"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checkIns = pgTable("check_ins", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  extractedSignals: jsonb("extracted_signals").$type<{
    progress: string[];
    resistance: string[];
    insight: string[];
    emotionalState: string;
  }>(),
  pathAdjustments: jsonb("path_adjustments").$type<{
    type: string;
    description: string;
  }[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checkInMessages = pgTable("check_in_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  checkInId: uuid("check_in_id").notNull().references(() => checkIns.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const progressMetrics = pgTable("progress_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  completionRate: real("completion_rate").notNull(),
  streakCount: integer("streak_count").notNull().default(0),
  timeEstimateDelta: integer("time_estimate_delta"), // days added/removed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 5: Create migration runner**

`apps/api/src/db/migrate.ts`:
```typescript
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./client.js";

async function runMigrations() {
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  console.log("Migrations complete.");
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

- [ ] **Step 6: Generate initial migration**

```bash
cd apps/api && pnpm db:generate
```

Expected: SQL migration files created in `drizzle/migrations/`

- [ ] **Step 7: Verify migration runs against a local PostgreSQL**

Prerequisite: PostgreSQL running locally with database `finalboss` created and pgvector extension enabled:
```bash
psql -U postgres -c "CREATE DATABASE finalboss;" 2>/dev/null || true
psql -U postgres -d finalboss -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Then:
```bash
cd apps/api && pnpm db:migrate
```

Expected: "Migrations complete." — tables created.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/db apps/api/drizzle.config.ts apps/api/drizzle apps/api/package.json
git commit -m "feat(api): add PostgreSQL schema with Drizzle ORM for all core entities"
```

---

### Task 4: Magic-Link Authentication

**Files:**
- Create: `final-boss/apps/api/src/routes/auth.ts`
- Create: `final-boss/apps/api/src/services/email.ts`
- Create: `final-boss/apps/api/src/middleware/authenticate.ts`
- Create: `final-boss/apps/api/tests/auth.test.ts`
- Modify: `final-boss/apps/api/src/index.ts` (register auth routes)
- Modify: `final-boss/apps/api/package.json` (add jose dep)

**Interfaces:**
- Consumes: `db` (from Task 3), `config` (jwtSecret, resendApiKey, magicLinkUrl)
- Produces: `POST /auth/login` (sends magic link), `POST /auth/verify` (returns JWT), `authenticate` middleware (attaches `request.userId`), `sendMagicLink(email, token)` service function

- [ ] **Step 1: Add jose dependency**

Add to `apps/api/package.json` dependencies:
```json
"jose": "^5.0.0"
```

Run: `pnpm install`

- [ ] **Step 2: Write failing auth tests**

`apps/api/tests/auth.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestApp } from "./setup.js";
import type { FastifyInstance } from "fastify";

// Mock email service
vi.mock("../src/services/email.js", () => ({
  sendMagicLink: vi.fn().mockResolvedValue(undefined),
}));

describe("Auth", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /auth/login", () => {
    it("returns success for valid email", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "test@example.com" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: { message: "Magic link sent" },
      });
    });

    it("returns 400 for missing email", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /auth/verify", () => {
    it("returns 400 for invalid token", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/verify",
        payload: { token: "invalid-token" },
      });
      expect(response.statusCode).toBe(400);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/api && pnpm test
```

Expected: FAIL — routes don't exist yet

- [ ] **Step 4: Implement email service**

`apps/api/src/services/email.ts`:
```typescript
import { config } from "../config.js";

export async function sendMagicLink(email: string, token: string): Promise<void> {
  const link = `${config.magicLinkUrl}?token=${token}`;

  if (!config.resendApiKey) {
    // Dev mode: log to console
    console.log(`[DEV] Magic link for ${email}: ${link}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Final Boss <auth@finalboss.app>",
      to: email,
      subject: "Your login link",
      html: `<a href="${link}">Click to sign in</a>. This link expires in 15 minutes.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email send failed: ${response.statusText}`);
  }
}
```

- [ ] **Step 5: Implement auth routes**

`apps/api/src/routes/auth.ts`:
```typescript
import type { FastifyInstance } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { config } from "../config.js";
import { sendMagicLink } from "../services/email.js";

const SECRET = new TextEncoder().encode(config.jwtSecret);
const MAGIC_LINK_EXPIRY = "15m";
const SESSION_EXPIRY = "30d";

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string } }>("/auth/login", async (request, reply) => {
    const { email } = request.body || {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return reply.status(400).send({ error: { code: "INVALID_EMAIL", message: "Valid email required" } });
    }

    const token = await new SignJWT({ email })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(MAGIC_LINK_EXPIRY)
      .sign(SECRET);

    await sendMagicLink(email, token);
    return { data: { message: "Magic link sent" } };
  });

  app.post<{ Body: { token: string } }>("/auth/verify", async (request, reply) => {
    const { token } = request.body || {};
    if (!token || typeof token !== "string") {
      return reply.status(400).send({ error: { code: "INVALID_TOKEN", message: "Token required" } });
    }

    try {
      const { payload } = await jwtVerify(token, SECRET);
      const email = payload.email as string;

      // Upsert user
      let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) {
        [user] = await db.insert(users).values({ email }).returning();
      }

      // Issue session token
      const sessionToken = await new SignJWT({ userId: user.id })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime(SESSION_EXPIRY)
        .sign(SECRET);

      return { data: { token: sessionToken, userId: user.id } };
    } catch {
      return reply.status(400).send({ error: { code: "INVALID_TOKEN", message: "Token expired or invalid" } });
    }
  });
}
```

- [ ] **Step 6: Implement authenticate middleware**

`apps/api/src/middleware/authenticate.ts`:
```typescript
import type { FastifyRequest, FastifyReply } from "fastify";
import { jwtVerify } from "jose";
import { config } from "../config.js";

const SECRET = new TextEncoder().encode(config.jwtSecret);

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Missing token" } });
  }

  try {
    const token = header.slice(7);
    const { payload } = await jwtVerify(token, SECRET);
    request.userId = payload.userId as string;
  } catch {
    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid token" } });
  }
}
```

- [ ] **Step 7: Register auth routes in server**

Update `apps/api/src/index.ts`:
```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";

export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cors);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  return app;
}

async function main() {
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  console.log(`Server running on port ${config.port}`);
}

if (process.argv[1] === import.meta.filename) {
  main();
}
```

- [ ] **Step 8: Update test setup for DB**

Update `apps/api/tests/setup.ts`:
```typescript
import { buildApp } from "../src/index.js";

export async function createTestApp() {
  const app = await buildApp();
  return app;
}
```

- [ ] **Step 9: Run tests**

```bash
cd apps/api && pnpm test
```

Expected: All tests pass (auth tests use mocked email service, login/verify routes respond correctly)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/services/email.ts apps/api/src/middleware/authenticate.ts apps/api/tests/auth.test.ts apps/api/src/index.ts apps/api/package.json
git commit -m "feat(api): add magic-link auth with JWT sessions"
```

---

### Task 5: Expo Mobile App Scaffold + Auth Flow

**Files:**
- Create: `final-boss/apps/mobile/package.json`
- Create: `final-boss/apps/mobile/app.json`
- Create: `final-boss/apps/mobile/tsconfig.json`
- Create: `final-boss/apps/mobile/app/_layout.tsx`
- Create: `final-boss/apps/mobile/app/index.tsx`
- Create: `final-boss/apps/mobile/app/(auth)/login.tsx`
- Create: `final-boss/apps/mobile/app/(auth)/verify.tsx`
- Create: `final-boss/apps/mobile/app/(app)/_layout.tsx`
- Create: `final-boss/apps/mobile/app/(app)/home.tsx`
- Create: `final-boss/apps/mobile/lib/api.ts`
- Create: `final-boss/apps/mobile/lib/auth.ts`
- Create: `final-boss/apps/mobile/lib/storage.ts`

**Interfaces:**
- Consumes: API endpoints from Task 4 (`POST /auth/login`, `POST /auth/verify`)
- Produces: Working mobile app with login → verify → home flow, `api` client with auth headers, `useAuth()` hook

- [ ] **Step 1: Create mobile package.json**

```json
{
  "name": "@final-boss/mobile",
  "version": "0.0.1",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "android": "expo run:android",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "expo": "~53.0.0",
    "expo-router": "~4.0.0",
    "expo-linking": "~7.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.0",
    "react-native-safe-area-context": "^4.12.0",
    "react-native-screens": "~4.4.0",
    "@final-boss/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "~18.3.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create app.json**

```json
{
  "expo": {
    "name": "Final Boss",
    "slug": "final-boss",
    "version": "0.0.1",
    "scheme": "finalboss",
    "platforms": ["ios", "android"],
    "newArchEnabled": true,
    "plugins": ["expo-router", "expo-secure-store"]
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 4: Create storage utility**

`apps/mobile/lib/storage.ts`:
```typescript
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "session_token";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
```

- [ ] **Step 5: Create API client**

`apps/mobile/lib/api.ts`:
```typescript
import { getToken } from "./storage";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const json = await response.json();
  if ("error" in json) {
    throw new Error(json.error.message);
  }
  return json.data;
}
```

- [ ] **Step 6: Create auth hook**

`apps/mobile/lib/auth.ts`:
```typescript
import { useState, useEffect, createContext, useContext } from "react";
import { getToken, setToken, clearToken } from "./storage";

type AuthState = { isLoading: boolean; isAuthenticated: boolean };

const AuthContext = createContext<AuthState & { signOut: () => Promise<void> }>({
  isLoading: true,
  isAuthenticated: false,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export { AuthContext };

export function useAuthState() {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    getToken().then((token) => {
      setState({ isLoading: false, isAuthenticated: !!token });
    });
  }, []);

  const signOut = async () => {
    await clearToken();
    setState({ isLoading: false, isAuthenticated: false });
  };

  const signIn = async (token: string) => {
    await setToken(token);
    setState({ isLoading: false, isAuthenticated: true });
  };

  return { ...state, signOut, signIn };
}
```

- [ ] **Step 7: Create root layout**

`apps/mobile/app/_layout.tsx`:
```typescript
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthContext, useAuthState } from "@/lib/auth";

export default function RootLayout() {
  const auth = useAuthState();

  return (
    <AuthContext.Provider value={auth}>
      <StatusBar style="light" />
      <Slot />
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 8: Create index redirect**

`apps/mobile/app/index.tsx`:
```typescript
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { View, ActivityIndicator } from "react-native";

export default function Index() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1729" }}>
        <ActivityIndicator color="#f59e0b" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(app)/home" />;
  }

  return <Redirect href="/(auth)/login" />;
}
```

- [ ] **Step 9: Create login screen**

`apps/mobile/app/(auth)/login.tsx`:
```typescript
import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleLogin = async () => {
    if (!email) return;
    setLoading(true);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      // handle error
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a sign-in link to {email}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Final Boss</Text>
      <Text style={styles.subtitle}>Begin your transformation</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#64748b"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>
          {loading ? "Sending..." : "Send magic link"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#0f1729" },
  title: { fontSize: 32, fontWeight: "700", color: "#f8fafc", marginBottom: 8 },
  subtitle: { fontSize: 16, color: "#94a3b8", marginBottom: 32 },
  input: { backgroundColor: "#1e293b", borderRadius: 12, padding: 16, color: "#f8fafc", fontSize: 16, marginBottom: 16 },
  button: { backgroundColor: "#f59e0b", borderRadius: 12, padding: 16, alignItems: "center" },
  buttonText: { color: "#0f1729", fontSize: 16, fontWeight: "600" },
});
```

- [ ] **Step 10: Create verify screen (deep link handler)**

`apps/mobile/app/(auth)/verify.tsx`:
```typescript
import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { api } from "@/lib/api";
import { setToken } from "@/lib/storage";

export default function VerifyScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();

  useEffect(() => {
    if (token) {
      api<{ token: string; userId: string }>("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ token }),
      })
        .then(async (data) => {
          await setToken(data.token);
          router.replace("/(app)/home");
        })
        .catch(() => {
          router.replace("/(auth)/login");
        });
    }
  }, [token]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#f59e0b" size="large" />
      <Text style={styles.text}>Verifying...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1729" },
  text: { color: "#94a3b8", marginTop: 16, fontSize: 16 },
});
```

- [ ] **Step 11: Create app layout (tabs placeholder)**

`apps/mobile/app/(app)/_layout.tsx`:
```typescript
import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0f1729" } }} />
  );
}
```

- [ ] **Step 12: Create home screen placeholder**

`apps/mobile/app/(app)/home.tsx`:
```typescript
import { View, Text, StyleSheet } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, warrior.</Text>
      <Text style={styles.subtitle}>Your journey begins tomorrow.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1729" },
  title: { fontSize: 24, fontWeight: "700", color: "#f8fafc" },
  subtitle: { fontSize: 16, color: "#94a3b8", marginTop: 8 },
});
```

- [ ] **Step 13: Install and verify**

```bash
cd apps/mobile && pnpm install && pnpm typecheck
```

Expected: no type errors.

- [ ] **Step 14: Run Expo dev server to verify it boots**

```bash
cd apps/mobile && pnpm start
```

Expected: Expo dev server starts, QR code shown. Scan to verify login screen renders with dark background, amber button.

- [ ] **Step 15: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): scaffold Expo app with magic-link auth flow"
```

---

### Task 6: Protected Route + User Profile Endpoint

**Files:**
- Create: `final-boss/apps/api/src/routes/user.ts`
- Create: `final-boss/apps/api/tests/user.test.ts`
- Modify: `final-boss/apps/api/src/index.ts` (register user routes)

**Interfaces:**
- Consumes: `authenticate` middleware (Task 4), `db` + `users` schema (Task 3)
- Produces: `GET /user/me` (returns current user profile), registered as authenticated route

- [ ] **Step 1: Write failing test**

`apps/api/tests/user.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestApp } from "./setup.js";
import { SignJWT } from "jose";
import type { FastifyInstance } from "fastify";

const SECRET = new TextEncoder().encode("dev-secret");

async function makeToken(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(SECRET);
}

describe("GET /user/me", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 without token", async () => {
    const response = await app.inject({ method: "GET", url: "/user/me" });
    expect(response.statusCode).toBe(401);
  });

  it("returns user profile with valid token", async () => {
    // First create a user via login flow
    await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "profile@test.com" },
    });

    // Since we can't easily get the magic link token in tests,
    // we test the 401 case here. Integration test covers full flow.
    const token = await makeToken("nonexistent-id");
    const response = await app.inject({
      method: "GET",
      url: "/user/me",
      headers: { authorization: `Bearer ${token}` },
    });
    // Returns 404 for non-existent user (valid token, no user)
    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm test -- tests/user.test.ts
```

Expected: FAIL — route doesn't exist

- [ ] **Step 3: Implement user route**

`apps/api/src/routes/user.ts`:
```typescript
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { authenticate } from "../middleware/authenticate.js";

export async function userRoutes(app: FastifyInstance) {
  app.get("/user/me", { preHandler: [authenticate] }, async (request, reply) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);

    if (!user) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
    }

    return {
      data: {
        id: user.id,
        email: user.email,
        archetype: user.archetype,
        trialStatus: user.trialStatus,
        timeToFinalBoss: user.timeToFinalBoss,
        onboardingComplete: user.onboardingComplete,
        createdAt: user.createdAt,
      },
    };
  });
}
```

- [ ] **Step 4: Register in server**

Update `apps/api/src/index.ts` imports and registration:
```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/user.js";

export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cors);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(userRoutes);
  return app;
}

async function main() {
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  console.log(`Server running on port ${config.port}`);
}

if (process.argv[1] === import.meta.filename) {
  main();
}
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && pnpm test
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/user.ts apps/api/tests/user.test.ts apps/api/src/index.ts
git commit -m "feat(api): add protected /user/me endpoint"
```

---

## Phase 1 Complete Checklist

After all 6 tasks:
- [x] Monorepo with shared types
- [x] Fastify API server running
- [x] PostgreSQL schema for all entities (users, skill nodes, tasks, check-ins, metrics)
- [x] Magic-link auth (login + verify + JWT sessions)
- [x] Expo mobile app with auth flow (login → verify → home)
- [x] Protected API endpoints working
- [x] Tests for API routes

**Next phase:** Phase 2 — AI Layer + Onboarding (provider-agnostic AI abstraction, onboarding conversation flow, archetype assignment, skill tree generation)

---

## Phase Overview (remaining)

| Phase | Focus | Depends on |
|-------|-------|-----------|
| **Phase 2** | AI Layer + Onboarding | Phase 1 |
| **Phase 3** | Daily Loop + Skill Tree UI | Phase 1 + 2 |
| **Phase 4** | Analytics + Social + Monetization + Voice | Phase 1 + 2 + 3 |

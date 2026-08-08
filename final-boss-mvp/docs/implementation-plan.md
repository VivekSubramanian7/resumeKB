# Final Boss — Robustness & Testing Implementation Plan

Based on the readiness assessment. Fixes all 10 issues + replaces scripted testing with LLM-as-user.

---

## Phase 1: Enrich Task Generation (Issue #3 — Generic Tasks)

**Problem:** Task generator only sees `archetype`, `nodeTitle`, `nodeDescription`, `dayNumber`. Blind to user's actual answers/struggles.

**Files to change:**
- `src/prompts/coach.ts` — expand `taskGenerationSystem` input type
- `src/services/tasks.ts` — pass user context into prompt
- `src/simulate.ts` — same in simulator's `generateDailyTask`
- `src/simulate-scripted.ts` — same

**Changes:**

### `src/prompts/coach.ts`

Add fields to the context parameter:

```typescript
export function taskGenerationSystem(context: {
  archetype: string;
  nodeTitle: string;
  nodeDescription: string;
  dayNumber: number;
  recentTasks: string[];
  // NEW:
  finalBossDescription: string;
  currentSelfDescription: string;
  keyStruggles: string; // extracted from clarifyingAnswers
}) {
```

Add to the prompt body after "Context:":

```
- Their vision: ${context.finalBossDescription}
- Where they are now: ${context.currentSelfDescription}
- Key struggles: ${context.keyStruggles}
```

Add a rule:

```
- The task MUST directly address the user's stated struggles or goals. No generic self-help. Reference their specific situation.
```

### `src/services/tasks.ts`

In `generateDailyTask`, after fetching `user`, build `keyStruggles`:

```typescript
const keyStruggles = (user.clarifyingAnswers || [])
  .map(qa => qa.answer)
  .join("; ")
  .slice(0, 500); // cap length

const system = taskGenerationSystem({
  archetype: user.archetype ?? "disciplined-achiever",
  nodeTitle: activeNode.title,
  nodeDescription: activeNode.description,
  dayNumber,
  recentTasks: recentTasks.map((t) => `[${t.status}] ${t.taskText}`),
  finalBossDescription: user.finalBossDescription ?? "",
  currentSelfDescription: user.currentSelfDescription ?? "",
  keyStruggles,
});
```

Mirror this in `simulate.ts` and `simulate-scripted.ts`.

---

## Phase 2: Hardcode Transition Logic (Issue #5 — Unpredictable [READY])

**Problem:** Model decides when to emit `[READY]`. Less capable models count inconsistently.

**Files to change:**
- `src/services/onboarding.ts` — `handleClarifyingAnswer`
- `src/simulate.ts` — local `handleClarifyingAnswer`
- `src/simulate-scripted.ts` — local `handleClarifyingAnswer`

**Changes:**

After 3 user responses in the clarifying phase, force the final turn. The logic:

```typescript
export async function handleClarifyingAnswer(userId: string, answer: string): Promise<{ response: string; isReady: boolean }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  const answers = [...(user.clarifyingAnswers || [])];

  // Build conversation history
  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: `Here's who I want to become:\n\n${user.finalBossDescription}` },
  ];
  for (const qa of answers) {
    messages.push({ role: "assistant", content: qa.question });
    messages.push({ role: "user", content: qa.answer });
  }
  messages.push({ role: "user", content: answer });

  // NEW: Force [READY] after 3 user answers (4th turn total including initial vision)
  const turnCount = answers.length + 1; // +1 for current answer
  const forceReady = turnCount >= 3;

  const systemPrompt = forceReady
    ? ASSESSOR_SYSTEM + "\n\nThis is the final exchange. You MUST output [READY] at the start of your message followed by a 1-2 sentence summary. Do NOT ask another question."
    : ASSESSOR_SYSTEM;

  const userConfig = await getUserAIConfigByUserId(userId);
  const nextResponse = await ai.chat(systemPrompt, messages, userConfig);

  // App-level enforcement: if we forced it and model still didn't say [READY], prepend it
  let isReady = nextResponse.includes("[READY]");
  let cleanResponse: string;

  if (forceReady && !isReady) {
    isReady = true;
    cleanResponse = nextResponse.replace(/^\[READY\]\s*/i, "").trim();
  } else if (isReady) {
    cleanResponse = nextResponse.slice(nextResponse.indexOf("[READY]") + "[READY]".length).trim();
  } else {
    cleanResponse = nextResponse;
  }

  answers.push({ question: "(previous AI message)", answer });
  const newStatus = isReady ? "awaiting_current_self" : "clarifying";
  await db.update(users).set({ clarifyingAnswers: answers, onboardingStatus: newStatus }).where(eq(users.id, userId));

  return { response: cleanResponse, isReady };
}
```

---

## Phase 3: Validate Skill Tree Output (Issue #7 — Wrong Node Count)

**Problem:** Prompt says "exactly 3 top-level branches" but model returns 4. No enforcement.

**Files to change:**
- `src/services/onboarding.ts` — `generateTree`
- `src/simulate.ts` — local `generateTree`
- `src/simulate-scripted.ts` — local `generateTree`

**Changes:**

After `chatJSON` returns, validate and fix:

```typescript
// Validate: exactly 3 root nodes
let roots = result.nodes.filter((n) => !n.parentTitle);
if (roots.length > 3) {
  roots = roots.slice(0, 3);
  result.nodes = [
    ...roots,
    ...result.nodes.filter((n) => n.parentTitle && roots.some(r => r.title === n.parentTitle)),
  ];
}
if (roots.length < 3) {
  // Re-prompt once
  const retryResult = await ai.chatJSON<typeof result>(
    TREE_SYSTEM + "\n\nYou MUST return EXACTLY 3 top-level branches (parentTitle: null). You returned " + roots.length + " last time.",
    [{ role: "user", content: treeInput }],
    userConfig,
  );
  result = retryResult;
}

// Validate: each root has 2-3 children
for (const root of roots) {
  const children = result.nodes.filter(n => n.parentTitle === root.title);
  if (children.length > 3) {
    // Keep only first 3
    const toRemove = children.slice(3);
    result.nodes = result.nodes.filter(n => !toRemove.includes(n));
  }
}
```

---

## Phase 4: Product Polish

### 4a. Replace "Time to Final Boss: 119 days" with qualitative progress (Issue #4)

**Files to change:**
- `src/handlers/start.ts` or wherever /status is rendered
- `src/simulate.ts` — `handleStatusCommand`
- `src/handlers/onboarding.ts` — remove `estimatedDays` from button labels

**Changes:**

In status display, replace:
```
Time to Final Boss: ${user.timeToFinalBoss || "?"} days
```
With:
```typescript
const totalBranches = rootNodes.length; // 3
const completedBranches = rootNodes.filter(n => n.status === "completed").length;
const activeBranch = rootNodes.find(n => n.status === "active");
// "Phase 1 of 3: Morning Mastery"
`Progress: Phase ${completedBranches + 1} of ${totalBranches}${activeBranch ? `: ${activeBranch.title}` : ""}`
```

Remove `estimatedDays` from button labels. Just show: `"Morning Mastery"` not `"Morning Mastery (14d)"`.

### 4b. Remove "Type: action" from user-facing messages (Issue #8)

**Files to change:**
- `src/handlers/daily.ts` — line 55
- `src/simulate.ts` — `handleDailyMessage` and `/generate_task`

**Changes:**

Remove `\n\nType: ${task.taskType}` from every user-facing task display. Keep it stored in DB for internal use (analytics, diversity enforcement) but don't show it.

### 4c. Let user confirm/adjust archetype (Issue #10)

**Files to change:**
- `src/services/onboarding.ts` — `handleCurrentSelf`
- `src/handlers/onboarding.ts` — `awaiting_current_self` case
- `src/handlers/callbacks.ts` — new callback `confirm_archetype` / `change_archetype`
- `src/simulate.ts` — onboarding flow
- `src/db/schema.ts` — add `"confirming_archetype"` to valid onboarding states

**Changes:**

After archetype assignment, instead of immediately generating tree:

1. Set status to `"confirming_archetype"` (new state)
2. Show archetype + explanation + buttons: `["Yes, that's me", "Not quite — reassess"]`
3. On confirm → proceed to `generating_tree` as before
4. On reject → re-run with additional user feedback, or offer the 2nd-most-likely archetype

In `src/handlers/callbacks.ts`:
```typescript
} else if (data === "confirm_archetype") {
  await db.update(users).set({ onboardingStatus: "generating_tree" }).where(eq(users.id, user.id));
  await ctx.answerCallbackQuery({ text: "Let's build your path" });
  await ctx.reply("Generating your skill tree...");
  const nodes = await generateTree(user.id);
  // ... render tree (extract to shared helper)
} else if (data === "change_archetype") {
  await ctx.answerCallbackQuery();
  await db.update(users).set({ onboardingStatus: "awaiting_current_self" }).where(eq(users.id, user.id));
  await ctx.reply("Tell me more about what feels off. What's missing from that description?");
}
```

### 4d. Remove "Let me think about that..." filler (Issue #6)

**Files to change:**
- `src/handlers/onboarding.ts` — line 28
- `src/simulate.ts` — `awaiting_final_boss` case

**Changes:**

Delete the "Let me think about that..." message. Just send the AI response directly. Telegram already shows "typing..." indicator for async work.

In the production handler, add:
```typescript
await ctx.replyWithChatAction("typing");
```
before the AI call instead.

### 4e. Trial mechanic messaging (Issue from recommendations)

In the /start message, after "Complete 5 of 7 daily tasks, or you're out." add:

```
This isn't punishment — it's proof. If you can't do 5 micro-tasks in a week, the program won't help you. This filter exists so your time isn't wasted.
```

---

## Phase 5: LLM-as-User Simulator (Issue #2)

**New file:** `src/simulate-llm.ts`

This replaces `simulate-scripted.ts` for quality testing. The scripted version stays for quick smoke tests.

**Architecture:**

```
┌─────────────────┐        ┌──────────────────┐
│  User LLM       │◄──────►│  Bot Logic       │
│  (persona)      │        │  (same as prod)  │
└─────────────────┘        └──────────────────┘
         │                          │
         ▼                          ▼
┌─────────────────────────────────────────────┐
│  Assertion Engine (per-message checks)       │
│  - No third-person narration                 │
│  - No thinking leakage                       │
│  - JSON schema compliance                    │
│  - Node count validation                     │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  conversation-log-llm.txt (raw + cleaned)    │
└─────────────────────────────────────────────┘
```

**Key design decisions:**

1. **User persona prompt:**
```typescript
const USER_PERSONA = `You are simulating a real person talking to a personal transformation bot on Telegram.

Your persona:
- Name: Alex, 28, software engineer working remotely
- You want to become disciplined, ship code daily, wake up early, mentor others
- You struggle with: procrastination, starting but not finishing, wasting mornings
- You're somewhat skeptical but willing to try
- You type casually, short messages, like a real Telegram user

RULES:
- Respond naturally to whatever the bot asks. Answer the ACTUAL question asked.
- Keep responses 1-3 sentences. This is Telegram.
- Be honest and specific about your struggles.
- Don't be overly enthusiastic or robotic.
- When asked to choose (buttons), pick one and state it clearly.`;
```

2. **Assertion checks run after every bot message:**
```typescript
interface Assertion {
  name: string;
  check: (botMessage: string, context: ConversationState) => { pass: boolean; detail?: string };
}

const ASSERTIONS: Assertion[] = [
  {
    name: "no-third-person-narration",
    check: (msg) => {
      const patterns = [/^the user/im, /^they (are|have|want|need|feel)/im, /^i need to/im, /^i should/im, /^my (goal|plan|approach)/im];
      const match = patterns.find(p => p.test(msg));
      return { pass: !match, detail: match ? `Matched: ${match.source}` : undefined };
    }
  },
  {
    name: "no-thinking-labels",
    check: (msg) => {
      const labels = /^(Plan|Thinking|Analysis|Reasoning|Understanding|Context|Notes?|Step \d+)\s*:/im;
      const match = labels.test(msg);
      return { pass: !match, detail: match ? "Contains thinking label prefix" : undefined };
    }
  },
  {
    name: "message-length-reasonable",
    check: (msg) => {
      const pass = msg.length < 500; // Telegram messages should be short
      return { pass, detail: pass ? undefined : `${msg.length} chars (max 500)` };
    }
  },
  {
    name: "no-empty-response",
    check: (msg) => ({ pass: msg.trim().length > 0 })
  },
];
```

3. **Skill tree validation (runs once after tree generation):**
```typescript
function validateTree(nodes: SkillNode[]): { pass: boolean; issues: string[] } {
  const issues: string[] = [];
  const roots = nodes.filter(n => !n.parentNodeId);
  if (roots.length !== 3) issues.push(`Expected 3 root nodes, got ${roots.length}`);
  for (const root of roots) {
    const children = nodes.filter(n => n.parentNodeId === root.id);
    if (children.length < 2 || children.length > 3) {
      issues.push(`"${root.title}" has ${children.length} children (expected 2-3)`);
    }
  }
  return { pass: issues.length === 0, issues };
}
```

4. **Conversation flow (replaces scripted script):**
```typescript
async function runConversation() {
  // 1. /start (hardcoded — command, not AI)
  await send("/start");

  // 2. Bot asks for final boss vision → User LLM generates a vision
  const visionResponse = await userLLM("The bot just asked: 'Who is the final boss version of you?' Give your answer.");
  await send(visionResponse);

  // 3. Clarifying loop — bot asks, user LLM answers
  while (getUser().onboardingStatus === "clarifying") {
    const lastBotMsg = getLastBotMessage();
    const userResponse = await userLLM(`The bot asked: "${lastBotMsg}"\n\nAnswer naturally.`);
    await send(userResponse);
  }

  // 4. Current self
  if (getUser().onboardingStatus === "awaiting_current_self") {
    const userResponse = await userLLM("The bot asked: 'Who are you today? Be honest.' Describe your current reality.");
    await send(userResponse);
  }

  // 5. Archetype confirmation (after Phase 4c)
  // 6. Branch selection — pick first branch
  // 7. Task generation + completion
  // 8. /status check
}
```

5. **Output format (dual logging):**
```
═══ CONVERSATION ═══════════════════════════════
📍 State: awaiting_final_boss

👤 USER: I want to become someone who ships meaningful code every single day...
   [assertions: ✓ n/a — user message]

🤖 BOT: What does 'meaningful' mean to you specifically?
   [raw]: "The user wants to... I should ask... What does 'meaningful' mean to you specifically?"
   [cleaned]: "What does 'meaningful' mean to you specifically?"
   [assertions: ✓ no-third-person ✓ no-thinking-labels ✓ length-ok ✓ not-empty]

...

═══ SUMMARY ════════════════════════════════════
Total messages: 24
Assertions passed: 22/24
Failures:
  - Turn 3: no-third-person-narration — Matched: ^the user
  - Turn 7: message-length-reasonable — 523 chars (max 500)
Skill tree: ✓ 3 roots, 2-3 children each
Task relevance: "open your code editor and push one commit to your side project within 15 minutes of waking up"
```

6. **package.json script:**
```json
"simulate:llm": "tsx src/simulate-llm.ts"
```

---

## Phase 6: Logging Raw vs Cleaned (Recommendation #3)

**Files to change:**
- `src/services/ai.ts` — `chat` function for openai path

**Changes:**

Add an optional `debug` callback or return both raw and cleaned text:

```typescript
// Option A: Module-level debug hook (simplest)
let debugHook: ((raw: string, cleaned: string) => void) | null = null;

export function setDebugHook(hook: typeof debugHook) { debugHook = hook; }

// In chat(), openai path:
const raw = response.choices?.[0]?.message?.content ?? "";
const cleaned = stripThinking(raw);
debugHook?.(raw, cleaned);
return cleaned;
```

The simulator sets the hook at startup:
```typescript
ai.setDebugHook((raw, cleaned) => {
  if (raw !== cleaned) {
    log(`   [raw]: ${raw.slice(0, 200)}...`);
    log(`   [cleaned]: ${cleaned.slice(0, 200)}`);
  }
});
```

---

## Implementation Order

| Step | Phase | Effort | Dependencies |
|------|-------|--------|--------------|
| 1 | Phase 6 (debug hook) | 10 min | None — enables logging for all testing |
| 2 | Phase 2 (hardcode transition) | 15 min | None |
| 3 | Phase 3 (tree validation) | 15 min | None |
| 4 | Phase 1 (enrich tasks) | 20 min | None |
| 5 | Phase 4a-b (remove noise) | 10 min | None |
| 6 | Phase 4c (archetype confirm) | 30 min | New state + callback handler |
| 7 | Phase 4d-e (filler + messaging) | 5 min | None |
| 8 | Phase 5 (LLM-as-user) | 45 min | Phase 6 (uses debug hook) |

**Total estimate: ~2.5 hours**

Steps 1-5 can be done independently in any order. Step 6 adds a new onboarding state so test it carefully. Step 8 is the big one but builds on everything else.

---

## Testing After Implementation

Run the LLM simulator 3 times:
```bash
npm run simulate:llm
```

Pass criteria:
- Zero third-person narration in bot output
- [READY] transition happens at exactly turn 3-4 (hardcoded)
- Skill tree: exactly 3 roots, 2-3 children each
- Task text references user's specific situation
- No "Type: action" shown to user
- No "119 days" countdown
- Archetype confirmation step exists
- All assertion checks pass

If using gemma-4-e2b (local), expect thinking leakage in raw output — the `stripThinking` filter handles it. The assertions check the *cleaned* output. The leaked reasoning fix comes later as you specified.

# Fix Plan — Post LLM-as-User Test Run

Implements all 5 fixes from `fix-list.md`. Order: 1 → 2 → 4 → 3 → 5 (as recommended).

---

## Fix 1: `<reply>` Tag Extraction in `stripThinking`

**Root cause:** Model fuses reasoning with reply on the same line (no `\n\n` boundary). The paragraph-classification approach can't separate them.

**Approach:** Option A from fix-list. All conversational prompts (assessor, coach check-in) get a `<reply>` tag instruction. JSON prompts (archetype, tree, task generation) don't need it since they use `chatJSON` which extracts JSON directly.

### Changes

#### `src/services/ai.ts` — `stripThinking()` (top of function, before existing logic)

Add `<reply>` tag extraction as the first thing tried:

```typescript
function stripThinking(text: string): string {
  // 0. If model wrapped response in <reply> tags, extract only that
  const replyMatch = text.match(/<reply>([\s\S]*?)<\/reply>/i);
  if (replyMatch) return replyMatch[1].trim();

  // ... existing logic unchanged ...
}
```

This is non-breaking: if no `<reply>` tags are present, falls through to existing heuristics.

#### `src/prompts/assessor.ts` — `ASSESSOR_SYSTEM`

Append to the end of the OUTPUT FORMAT section (after rule 5):

```
6. Wrap your ENTIRE reply in <reply></reply> tags. Everything outside these tags is ignored.
```

Update the example good outputs to use tags:

```
Example good outputs:
- <reply>What does discipline look like for you right now — do you have any routines that stick?</reply>
- <reply>[READY] You want to become a disciplined daily builder who ships publicly and mentors with depth. The gap is consistency — you start strong but friction kills momentum after 2-3 weeks.</reply>
```

#### `src/prompts/coach.ts` — `checkinSystem()` 

Add at end of rules:

```
- Wrap your entire response in <reply></reply> tags.
```

#### NOT changed: `ARCHETYPE_SYSTEM`, `TREE_SYSTEM`, `taskGenerationSystem`

These all use `chatJSON` which parses JSON directly. Adding `<reply>` tags would interfere with JSON extraction.

---

## Fix 2: User-Sim Reasoning Cleanup

**Root cause:** `generateUserResponse()` applies basic quote-stripping but doesn't handle reasoning prefixes that leak through `stripThinking` (e.g., `Plan: ...ActualResponse`).

### Changes

#### `src/simulate-llm.ts` — `USER_PERSONA`

Add the `<reply>` tag instruction:

```
RULES:
- Respond naturally to whatever the bot asks. Answer the ACTUAL question being asked.
- Keep responses 1-3 sentences. This is Telegram, not email.
- Be honest and specific about your struggles.
- Don't be overly enthusiastic or robotic. Casual tone.
- Never break character or mention you're an AI.
- Wrap your response in <reply></reply> tags. Everything outside these tags is discarded.
- Output ONLY your response as Alex inside the tags. No thinking, no labels.
```

#### `src/simulate-llm.ts` — `generateUserResponse()`

The `ai.chat()` call already goes through `stripThinking` which now extracts `<reply>` tags. But add a safety net for when the model ignores tags:

```typescript
async function generateUserResponse(botMessage: string, context?: string): Promise<string> {
  conversationHistory.push({ role: "bot", text: botMessage });

  const recentHistory = conversationHistory.slice(-10)
    .map(m => `${m.role === "bot" ? "Bot" : "You"}: ${m.text}`)
    .join("\n");

  const prompt = context
    ? `${context}\n\nRecent conversation:\n${recentHistory}\n\nBot's latest message: "${botMessage}"\n\nYour response as Alex (in <reply> tags):`
    : `Recent conversation:\n${recentHistory}\n\nBot's latest message: "${botMessage}"\n\nRespond naturally as Alex (in <reply> tags):`;

  const response = await ai.chat(USER_PERSONA, [{ role: "user", content: prompt }]);

  // ai.chat already extracts <reply> tags via stripThinking.
  // Fallback: strip common reasoning prefixes that leak through.
  let cleaned = response
    .replace(/^(Plan|Strategy|Self-Correction|My goal is to respond|Constraint Check|My persona)[^.!?]*[.!?]\s*/s, "")
    .replace(/^\*[^*]+\*\s*/gm, "")  // italic internal notes
    .replace(/^["']|["']$/g, "")
    .trim();

  conversationHistory.push({ role: "user", text: cleaned });
  return cleaned;
}
```

---

## Fix 4: Hardcap Clarifying Turns in Simulator

**Root cause:** The production `onboarding.ts` already forces `[READY]` after 3 turns, but the `simulate-llm.ts` local copy doesn't have this logic.

### Changes

#### `src/simulate-llm.ts` — `handleClarifyingAnswer()`

Replace the current function with the same force-ready logic the production handler uses:

```typescript
async function handleClarifyingAnswer(userId: string, answer: string): Promise<{ response: string; isReady: boolean }> {
  const user = getUserById(userId)!;
  const answers = [...(user.clarifyingAnswers || [])];

  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: `Here's who I want to become:\n\n${user.finalBossDescription}` },
  ];
  for (const qa of answers) {
    messages.push({ role: "assistant", content: qa.question });
    messages.push({ role: "user", content: qa.answer });
  }
  messages.push({ role: "user", content: answer });

  // Force [READY] after 3 user answers
  const turnCount = answers.length + 1;
  const forceReady = turnCount >= 3;

  const systemPrompt = forceReady
    ? ASSESSOR_SYSTEM + "\n\nThis is the final exchange. You MUST output [READY] at the start of your message followed by a 1-2 sentence summary. Do NOT ask another question."
    : ASSESSOR_SYSTEM;

  const userConfig = getUserAIConfig(userId);
  const nextResponse = await ai.chat(systemPrompt, messages, userConfig);

  let isReady = nextResponse.includes("[READY]");
  let cleanResponse: string;

  if (forceReady && !isReady) {
    isReady = true;
    cleanResponse = nextResponse.trim();
  } else if (isReady) {
    cleanResponse = nextResponse.slice(nextResponse.indexOf("[READY]") + "[READY]".length).trim();
  } else {
    cleanResponse = nextResponse;
  }

  answers.push({ question: cleanResponse, answer });
  updateUser(userId, {
    clarifyingAnswers: answers,
    onboardingStatus: isReady ? "awaiting_current_self" : "clarifying",
  });

  return { response: cleanResponse, isReady };
}
```

Also apply the same fix to `src/simulate-scripted.ts` (same local copy).

---

## Fix 3: Skill Tree Fuzzy-Match + Retry

**Root cause:** Model returns children with `parentTitle` values that don't exact-match root node titles (casing, extra whitespace, slight rephrasing). Also sometimes returns 0 children.

### Changes

#### `src/services/onboarding.ts` — `generateTree()`

After `chatJSON` returns, add fuzzy matching and validation:

```typescript
// Fuzzy-match parentTitle → root title
function fuzzyFindParent(parentTitle: string, nodeMap: Map<string, string>): string | null {
  const exact = nodeMap.get(parentTitle);
  if (exact) return exact;
  const normalized = parentTitle.toLowerCase().trim();
  for (const [key, id] of nodeMap.entries()) {
    if (key.toLowerCase().trim() === normalized) return id;
  }
  // Substring match: if parentTitle contains a root title or vice versa
  for (const [key, id] of nodeMap.entries()) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) return id;
  }
  return null;
}
```

Replace the child insertion loop:

```typescript
const children = result.nodes.filter((n) => n.parentTitle);
for (const node of children) {
  const parentId = fuzzyFindParent(node.parentTitle!, nodeMap);
  // ... insert with parentId (null if no match found)
}
```

Add validation + retry after insertion:

```typescript
const insertedRoots = store.skillNodes.filter(n => n.userId === userId && !n.parentNodeId);
const insertedChildren = store.skillNodes.filter(n => n.userId === userId && n.parentNodeId);

if (insertedChildren.length < 6) {
  // Retry once with explicit instruction about children
  const retryResult = await ai.chatJSON<typeof result>(
    TREE_SYSTEM + "\n\nIMPORTANT: Each of the 3 top-level branches MUST have 2-3 children. Use the EXACT parent title string in the child's parentTitle field. You returned nodes with missing or mismatched parentTitle values last time.",
    [{ role: "user", content: treeInput }],
    userConfig,
  );
  // Clear previous nodes and re-insert
  store.skillNodes = store.skillNodes.filter(n => n.userId !== userId);
  // ... re-run insertion logic with retryResult
}
```

Apply the same fuzzy-match logic to:
- `src/simulate-llm.ts` — `generateTree()`
- `src/simulate-scripted.ts` — `generateTree()`
- `src/simulate.ts` — `generateTree()`

---

## Fix 5: Tighten Assertions

**Root cause:** Current assertions only check line-start patterns. They miss reasoning that starts mid-message or uses different formatting (bullet + italic labels, numbered bold lists, meta-commentary like "I have asked...").

### Changes

#### `src/simulate-llm.ts` — `ASSERTIONS` array

Expand `no-third-person-narration` patterns:

```typescript
{
  name: "no-third-person-narration",
  check: (msg) => {
    const patterns = [
      /^the user/im,
      /^they (are|have|want|need|feel)/im,
      /^i need to/im,
      /^i should/im,
      /^my (goal|plan|approach)/im,
      /^(focusing|next question|i have (asked|covered|gathered))/im,
      /^(summary points|i must now|transition rule)/im,
      /^\*\s+\*[^*]+\*:/m,     // bullet with italic label
      /^\d+\.\s+\*\*/m,        // numbered bold lists
    ];
    const match = patterns.find(p => p.test(msg));
    return { pass: !match, detail: match ? `Matched: ${match.source}` : undefined };
  }
},
```

Add new assertion `no-meta-commentary`:

```typescript
{
  name: "no-meta-commentary",
  check: (msg) => {
    const meta = /\b(next (question|step|logical)|i('ve| have) (asked|covered|gathered)|warrant the transition|probe (deeper|for)|question focus|constraint check|confidence score)\b/i;
    const match = meta.test(msg);
    return { pass: !match, detail: match ? "Contains meta-commentary about conversation process" : undefined };
  }
},
```

Update the assertion count in the summary output (now 6 assertions instead of 4).

---

## Implementation Order & Checklist

| Step | Fix | Files | Effort |
|------|-----|-------|--------|
| 1 | `<reply>` tag extraction | `ai.ts`, `assessor.ts`, `coach.ts` | 15 min |
| 2 | User-sim cleanup | `simulate-llm.ts` (persona + generateUserResponse) | 10 min |
| 3 | Hardcap clarifying turns | `simulate-llm.ts`, `simulate-scripted.ts` | 10 min |
| 4 | Tree fuzzy-match + retry | `onboarding.ts`, `simulate-llm.ts`, `simulate-scripted.ts`, `simulate.ts` | 25 min |
| 5 | Tighten assertions | `simulate-llm.ts` | 10 min |

**Total: ~70 min**

After all fixes, run: `AI_PROVIDER=openai AI_MODEL=google/gemma-4-e4b AI_BASE_URL=http://172.23.112.1:1234/v1 npx tsx src/simulate-llm.ts`

**Expected outcome:**
- Bot messages contain only the actual reply (no reasoning prefixes)
- User-sim messages are clean 1-3 sentence Telegram replies
- Clarifying phase ends at exactly 3 turns
- Skill tree has 3 roots with 2-3 children each
- Assertions catch real reasoning leaks (many more failures visible, but that's honest reporting — the `<reply>` tag fix should then reduce them to near-zero)

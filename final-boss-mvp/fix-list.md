# Fix List — Post LLM-as-User Test Run

## 1. stripThinking fails on fused reasoning (bot AND user-sim)

**Problem:** Model emits `Plan: some reasoning.Actual response here` — no double-newline between reasoning and reply. The regex requires `\n\n` as boundary and misses these.

**Where:** `src/services/ai.ts` — `stripThinking()`

**Fix options (pick one):**
- A) Require model to wrap output in `<reply>...</reply>` tags. Extract only tag content. Add to all system prompts: `Wrap your response in <reply></reply> tags.` Then in stripThinking: `const match = text.match(/<reply>([\s\S]*?)<\/reply>/); if (match) return match[1].trim();`
- B) Add a fallback: if the text contains a question mark, grab the last sentence ending in `?` as the reply (works for assessor specifically).
- C) Switch to a model that actually follows format instructions (Claude Haiku, GPT-4o-mini).

---

## 2. User-sim reasoning leaks into conversation history

**Problem:** `generateUserResponse()` sends the LLM output through `stripThinking` but it still contains `Plan:`, `*Self-Correction:*`, `My goal is to respond naturally...` prefixes that get sent to the bot as "user input."

**Where:** `src/simulate-llm.ts` — `generateUserResponse()`

**Fix:** Add aggressive cleanup after `stripThinking` for user-sim specifically:
```typescript
// Strip common LLM reasoning prefixes that leak through
let cleaned = response.replace(/^(Plan|Strategy|Self-Correction|My goal is to respond)[^.]*\.\s*/s, "").trim();
// Also strip markdown emphasis used for internal notes
cleaned = cleaned.replace(/^\*[^*]+\*\s*/gm, "").trim();
```

Or use the `<reply>` tag approach in `USER_PERSONA` prompt too.

---

## 3. Skill tree returns 0 children per branch

**Problem:** Model returns 3 root nodes with `parentTitle: null` but either emits no children, or uses `parentTitle` values that don't exact-match root titles.

**Where:** `src/simulate-llm.ts` (and `src/services/onboarding.ts`) — `generateTree()`

**Fix:**
1. Fuzzy-match parentTitle lookup:
```typescript
const parentId = nodeMap.get(node.parentTitle!) 
  ?? [...nodeMap.entries()].find(([k]) => k.toLowerCase().trim() === node.parentTitle!.toLowerCase().trim())?.[1]
  ?? null;
```
2. Add validation + retry after generation:
```typescript
const roots = result.nodes.filter(n => !n.parentTitle);
const children = result.nodes.filter(n => n.parentTitle);
if (roots.length !== 3 || children.length < 6) {
  // retry once with explicit nudge
}
```

---

## 4. Clarifying phase not capped at application level

**Problem:** Prompt says 3-5 questions but model took 6 turns. Relying on model to self-count is unreliable.

**Where:** `src/simulate-llm.ts` (and real bot handler) — clarifying loop / `handleClarifyingAnswer()`

**Fix:** After the 4th user answer, append to the system prompt:
```
You have now asked enough questions. Your NEXT message MUST begin with [READY] followed by your summary.
```
Or: in application code, after 5 stored `clarifyingAnswers`, force transition to `awaiting_current_self` regardless of model output.

---

## 5. Assertions too narrow — give false passes

**Problem:** Assertions pass (4/4) on messages that clearly contain reasoning like "I have asked questions touching on...", "Next question should...", "Focusing on the *behavior* aspect..."

**Where:** `src/simulate-llm.ts` — `ASSERTIONS` array

**Fix:** Add these patterns to `no-third-person-narration`:
```typescript
/^(focusing|next question|i have (asked|covered|gathered))/im,
/^(summary points|i must now|transition rule)/im,
/^\*\s+\*[^*]+\*:/m,  // bullet with italic label like "* *Initial Question Focus:*"
/^\d+\.\s+\*\*/m,     // numbered bold lists (reasoning format)
```

Also add a new assertion:
```typescript
{
  name: "no-meta-commentary",
  check: (msg) => {
    const meta = /\b(next (question|step|logical)|i('ve| have) (asked|covered|gathered)|warrant the transition|probe (deeper|for))\b/i;
    const match = meta.test(msg);
    return { pass: !match, detail: match ? "Contains meta-commentary about conversation process" : undefined };
  }
}
```

---

## Summary Table

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | stripThinking — add `<reply>` tag extraction | 30 min | Fixes everything downstream |
| 2 | User-sim cleanup | 10 min | Stops polluted history |
| 3 | Tree fuzzy-match + retry | 20 min | Fixes broken skill tree |
| 4 | Hardcap clarifying turns | 10 min | Predictable transitions |
| 5 | Tighten assertions | 10 min | Honest test results |

**Recommended order:** 1 → 2 → 4 → 3 → 5

Fix #1 is the root cause of most failures. If you do the `<reply>` tag approach, #2 becomes trivial (same mechanism for user-sim), and many assertion failures from #5 disappear automatically.

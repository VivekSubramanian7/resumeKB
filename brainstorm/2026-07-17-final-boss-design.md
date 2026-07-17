# Final Boss — Product Design Spec

**Working title:** Final Boss
**Date:** 2026-07-17
**Status:** Design complete, pending implementation planning

---

## One-Liner

A personal transformation program disguised as a skill tree. AI-driven daily micro-tasks and conversational check-ins guide you toward your ideal self, with real stakes if you don't show up.

---

## Core Concept

Users define their "final boss" version — who they want to become. They also define who they are today. The app calculates the gap, generates a skill tree representing the path between the two, and then walks the user through it one day at a time with micro-tasks and conversational check-ins.

**Key differentiators:**
- **Skill tree with agency:** User sees the full path but chooses direction at branch points. AI handles the granularity (what to do today).
- **Proactive accountability:** 7-day trial gate filters uncommitted users. Ongoing misses inflate the "time to final boss" estimate.
- **Not a passive journal:** The app drives the interaction. It assigns tasks, initiates conversations, and adjusts the path.

---

## Approach

**Hybrid: RPG mechanics, mature aesthetic.**

The underlying system is gamified (skill tree, unlocks, progressive difficulty, path selection). The visual language is mature and atmospheric — dark UI, constellation-style node graph, warm amber accents. Feels like a premium personal program, not a game.

---

## User Journey

### Phase 1: Onboarding (Day 0)

1. User writes freeform description of their ideal self
2. AI asks 3-5 clarifying questions (dynamic — continues until confident)
3. User describes their current self (same format)
4. AI performs gap analysis — identifies dimensions of change needed
5. System assigns an archetype with explanation
6. Initial skill tree generated — full tree visible
7. User picks first branch to pursue
8. Commitment acknowledgment — user understands the stakes

### Phase 2: The Trial (Days 1-7)

1. Daily push notification with micro-task
2. User completes task + brief reflection
3. Threshold: complete 5 of 7 days
4. **Pass:** Welcome message, full access, "trial complete" milestone on tree
5. **Fail:** Removed from program, placed on waitlist (2-week cooldown before re-entry)
6. Re-entry requires fresh onboarding

### Phase 3: Active Program (Day 8+)

Daily loop:
1. **Morning:** Push notification with today's micro-task
2. **Anytime:** Mark task complete + brief reflection
3. **Evening:** Conversational check-in (AI-initiated, 3-5 message exchange)
4. **Background:** AI extracts signals, adjusts path, recomputes timeline

### Phase 4: Ongoing Accountability

- Missed days → time estimate extends (visible immediately)
- AI adapts before punishing (easier tasks, different angles)
- Warning system after consecutive misses
- Branch timeout: AI intervenes if a branch takes too long
- Monthly retrospective: AI-generated progress summary

---

## Complete Feature Set

### Onboarding System
- Freeform "final boss" description (text + voice input)
- AI clarifying conversation (dynamic length)
- "Current self" assessment
- Gap analysis across growth dimensions
- Archetype assignment with explanation
- Initial skill tree generation
- First branch selection
- Commitment contract acknowledgment

### Skill Tree Engine
- Full visual node graph with branching paths
- Nodes = growth dimensions (discipline, communication, creativity, etc.)
- Sub-milestones within each node
- User picks path at branch points
- Locked nodes visible but dimmed with previews
- Prerequisite-based unlocking
- AI suggests optimal paths; user always chooses
- Tree evolves based on check-in learnings
- "Time to Final Boss" computed from remaining nodes + pace

### Daily Micro-Tasks
- AI-generated, aligned to current branch
- Small and concrete (15-30 min)
- Progressive difficulty within a branch
- Context-aware (weekday/weekend, energy level)
- Task types: action, reflection, social, observation
- Skip mechanism with reason (AI adjusts)
- Bonus/stretch tasks for high performers

### Conversational Check-Ins
- Evening dialogue, AI-initiated
- Back-and-forth conversation (not a form)
- AI probes feelings, learnings, resistance
- Extracts progress/regression signals
- Adjusts tomorrow's task based on today
- Persistent conversation history (AI references past)
- Tone: warm, direct, insightful. A wise friend.

### The Trial (7-Day Gate)
- Clear threshold communicated upfront
- Daily progress indicator
- Fail → waitlist with 2-week cooldown
- Re-entry = fresh onboarding
- Pass → full access + welcome milestone

### Accountability & Consequences
- Time inflation on missed days
- Streak system (visible, not anxiety-inducing)
- Adaptation ladder: softer tasks → different task types → direct conversation
- Warning system after X consecutive misses
- Branch timeout with AI intervention
- Monthly retrospective

### Voice Input
- Voice-to-text for reflections and check-ins
- Voice journaling mode (longer entries)
- Same signal extraction as text

### Analytics & Progress Visualization
- "Time to Final Boss" — headline metric
- Completion rate (daily/weekly/monthly)
- Skill tree progress (% per branch)
- Pattern insights ("strongest on weekday mornings")
- Monthly/quarterly growth reports
- Before/after comparison vs. starting point

### Social Features
- Optional accountability partner (similar journey)
- Anonymous same-archetype community (aggregate progress)
- Milestone sharing (opt-in, external platforms)
- No feed, no likes, no scrolling

### Monetization
- 7-day gate IS the free trial
- Subscription for active program access
- Premium: deeper AI, more check-in depth, priority re-entry
- Possible: commitment deposit (pay upfront, refunded on milestone completion)

### Notifications & Engagement
- Morning: today's task
- Evening: check-in prompt
- Streak-at-risk warning
- Milestone celebration
- Weekly progress summary
- User controls timing/frequency
- Smart timing (learn optimal engagement windows)

### Settings & Personalization
- Redefine goals (with timeline extension consequence)
- Check-in time preferences
- Notification controls
- AI tone adjustment (direct ↔ gentle)
- Data export
- Account deletion

---

## AI System Design

### Four AI Roles

**1. The Assessor (Onboarding)**
- Asks clarifying questions
- Identifies dimensions of change
- Assigns archetype
- Generates initial skill tree

**2. The Architect (Tree Management)**
- Generates and restructures skill tree
- Decides node ordering, prerequisites, timelines
- Runs on milestones, pivots, or major check-in shifts

**3. The Coach (Daily Operations)**
- Generates micro-tasks
- Runs check-in conversations
- Extracts signals
- References past check-ins for continuity
- THE personality of the app

**4. The Analyst (Background)**
- Computes time-to-goal
- Identifies patterns
- Generates retrospectives
- Decides escalation (warnings, timeouts)
- Never user-facing — feeds into Coach's context

### Context Management
- Check-ins get last 7 days of history
- Skill tree state always in context
- Summarized signals from past (not full transcripts)
- Archetype + goal description as system context

### Adaptation Logic
1. Completion rate drops → soften tasks (lower difficulty)
2. Still dropping → change task type (action → reflection → observation)
3. Still dropping → address in check-in directly
4. Pattern detected (e.g., skips social tasks) → probe in check-in, may restructure
5. Breakthrough detected → accelerate (harder tasks, compressed timeline)

### Signal Extraction
From check-in conversations, extract:
- **Progress:** "I did X for the first time," "I noticed I..."
- **Resistance:** "I couldn't," "I didn't feel like," excuses
- **Insight:** "I realized that," "I think the reason is..."
- **Emotional state:** enthusiasm, frustration, indifference

These feed the Analyst for path adjustment.

---

## Technical Architecture

### Stack
- **Frontend:** React Native (Expo) — iOS + Android
- **Backend:** Node.js (Express or Fastify)
- **Database:** PostgreSQL + pgvector for semantic analysis
- **AI:** Provider-agnostic abstraction (Claude, GPT, etc. via JS SDK)
- **Push notifications:** Expo Push + background scheduling
- **Auth:** Email magic-link or social login

### Data Model

```
User
├── archetype
├── current_self_description
├── final_boss_description
├── time_to_final_boss (computed daily)
├── trial_status (pending | active | passed | failed)
└── created_at

SkillTree
├── user_id
├── nodes[]
│   ├── title, description
│   ├── status (locked | available | active | completed)
│   ├── parent_node
│   └── estimated_days
└── generated_by (model + prompt version)

DailyTask
├── user_id
├── skill_node_id
├── task_text
├── task_type (action | reflection | social | observation)
├── status (assigned | completed | skipped | missed)
├── assigned_date
└── reflection

CheckIn
├── user_id
├── date
├── messages[] (role + content)
├── extracted_signals[]
└── path_adjustments[]

ProgressMetric
├── user_id
├── date
├── completion_rate
├── streak_count
└── time_estimate_delta
```

---

## Visual Design Direction

**Aesthetic:** Dark-mode primary. Constellation/star-map metaphor for skill tree.

**Colors:**
- Background: deep navy/charcoal
- Active/unlocked: warm amber/gold
- Locked/future: cool blue/silver
- Progress: soft green
- Warning: muted red

**Typography:** Clean sans-serif (Inter, SF Pro). Large counter for "Time to Final Boss." Monospace for metrics.

**Skill tree rendering:** Glowing nodes connected by thin lines. Active branch pulses gently. Star map, not flowchart.

**Animations:** Minimal, meaningful. Node unlock = soft bloom. Task complete = brief pulse. No confetti.

**Check-in UI:** Elegant chat interface. AI messages distinct from user. Not a chatbot widget.

**Mood references:**
- Star map / constellation navigation (skill tree)
- Premium meditation apps like Endel (atmosphere)
- Whoop (data presentation)
- Dark-mode code editor (quiet confidence)

**Anti-references:**
- No gamification confetti/badges/cartoons
- No generic SaaS dashboard
- No Duolingo energy
- No corporate density

**Key Screens:**
1. **Home:** Today's task + time counter + streak. Clean, focused.
2. **Skill Tree:** Full-screen visual map. Zoomable. Current position marked.
3. **Check-in:** Conversational interface. Evening ritual feel.
4. **Progress:** Timeline of growth, completions, insights.
5. **Onboarding:** Immersive journey-beginning flow.

---

## Open Questions (for implementation planning)

1. Exact archetype taxonomy — how many, what are they?
2. Skill tree generation prompt engineering — how to ensure trees are meaningful and achievable
3. "Time to Final Boss" algorithm — exact computation logic
4. Waitlist mechanics — notification when slot opens? Auto re-invite?
5. How much tree restructuring should AI do autonomously vs. with user permission?
6. Voice input: real-time transcription or record-then-process?
7. Monetization timing — when to gate features vs. ship free and add later?

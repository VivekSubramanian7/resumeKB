/**
 * LLM-as-user conversation driver for Final Boss simulator.
 * Run: npx tsx src/simulate-llm.ts
 *
 * Uses the same configured model to play both the bot AND the simulated user.
 * Logs to both terminal and conversation-log-llm.txt
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import * as ai from "./services/ai.js";
import { ASSESSOR_SYSTEM, ARCHETYPE_SYSTEM } from "./prompts/assessor.js";
import { TREE_SYSTEM } from "./prompts/architect.js";
import { taskGenerationSystem } from "./prompts/coach.js";
import { config } from "./config.js";

// ─── User Persona ─────────────────────────────────────────────────────────────

const USER_PERSONA = `You are simulating a real person talking to a personal transformation bot on Telegram.

Your persona:
- Alex, 28, software engineer, 3 years experience, works remotely
- You want to become disciplined: ship code daily, wake up at 5am, work out, mentor others
- You struggle with: procrastination on hard tasks, starting strong then losing momentum after 2-3 weeks, wasting mornings, chasing new ideas instead of finishing
- You exercise maybe once a week, wake up around 8:30am
- You're somewhat skeptical but genuinely want change
- You know what to do but can't bridge the gap to doing it

RULES:
- Respond naturally to whatever the bot asks. Answer the ACTUAL question being asked.
- Keep responses 1-3 sentences. This is Telegram, not email.
- Be honest and specific about your struggles.
- Don't be overly enthusiastic or robotic. Casual tone.
- Never break character or mention you're an AI.
- Wrap your response in <reply></reply> tags. Everything outside these tags is discarded.
- Output ONLY your response as Alex inside the tags. No thinking, no labels.`;

// ─── Assertion Engine ─────────────────────────────────────────────────────────

interface Assertion {
  name: string;
  check: (botMessage: string) => { pass: boolean; detail?: string };
}

const ASSERTIONS: Assertion[] = [
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
        /^\*\s+\*[^*]+\*:/m,
        /^\d+\.\s+\*\*/m,
      ];
      const match = patterns.find(p => p.test(msg));
      return { pass: !match, detail: match ? `Matched: ${match.source}` : undefined };
    }
  },
  {
    name: "no-meta-commentary",
    check: (msg) => {
      const meta = /\b(next (question|step|logical)|i('ve| have) (asked|covered|gathered)|warrant the transition|probe (deeper|for)|question focus|constraint check|confidence score)\b/i;
      const match = meta.test(msg);
      return { pass: !match, detail: match ? "Contains meta-commentary about conversation process" : undefined };
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
      const pass = msg.length < 500;
      return { pass, detail: pass ? undefined : `${msg.length} chars (max 500)` };
    }
  },
  {
    name: "no-empty-response",
    check: (msg) => ({ pass: msg.trim().length > 0 })
  },
];

// Track assertion results
const assertionResults: { turn: number; name: string; pass: boolean; detail?: string }[] = [];
let turnCounter = 0;

function runAssertions(botMessage: string) {
  turnCounter++;
  for (const assertion of ASSERTIONS) {
    const result = assertion.check(botMessage);
    assertionResults.push({ turn: turnCounter, name: assertion.name, pass: result.pass, detail: result.detail });
    if (!result.pass) {
      log(`   [assertion FAIL] ${assertion.name}${result.detail ? ` — ${result.detail}` : ""}`);
    }
  }
  const passed = ASSERTIONS.filter(a => assertionResults.filter(r => r.turn === turnCounter && r.name === a.name && r.pass).length > 0).length;
  log(`   [assertions: ${passed}/${ASSERTIONS.length} passed]`);
}

// ─── Tree Validation ──────────────────────────────────────────────────────────

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

// ─── In-Memory Store ──────────────────────────────────────────────────────────

interface User {
  id: string;
  telegramId: number;
  telegramUsername: string | null;
  onboardingStatus: string;
  finalBossDescription: string | null;
  currentSelfDescription: string | null;
  clarifyingAnswers: { question: string; answer: string }[];
  archetype: string | null;
  archetypeExplanation: string | null;
  trialStartDate: string | null;
  trialStatus: string;
  timeToFinalBoss: number | null;
  currentStreak: number;
  createdAt: Date;
}

interface SkillNode {
  id: string;
  userId: string;
  parentNodeId: string | null;
  title: string;
  description: string;
  status: string;
  estimatedDays: number;
  orderIndex: number;
  createdAt: Date;
}

interface DailyTask {
  id: string;
  userId: string;
  skillNodeId: string | null;
  taskText: string;
  taskType: string;
  status: string;
  assignedDate: string;
  reflection: string | null;
  createdAt: Date;
}

const store = {
  users: [] as User[],
  skillNodes: [] as SkillNode[],
  dailyTasks: [] as DailyTask[],
  llmSettings: [] as { userId: string; aiProvider: string; aiBaseUrl: string | null; aiApiKey: string; aiModel: string }[],
};

const TELEGRAM_ID = 999999;
const TELEGRAM_USERNAME = "sim_alex";

// ─── Logging ──────────────────────────────────────────────────────────────────

const logFile = path.join(process.cwd(), "conversation-log-llm.txt");
const logStream = fs.createWriteStream(logFile, { flags: "w" });

function log(text: string) {
  console.log(text);
  logStream.write(text.replace(/\x1b\[[0-9;]*m/g, "") + "\n");
}

function userSay(text: string) {
  log(`\n👤 USER: ${text}`);
}

function botSay(text: string, buttons?: { label: string; data: string }[]) {
  log(`\n🤖 BOT: ${text}`);
  if (buttons?.length) {
    log(`   [Buttons]`);
    for (const btn of buttons) {
      log(`   → ${btn.label}`);
    }
  }
  runAssertions(text);
}

// ─── Simulated User LLM ──────────────────────────────────────────────────────

let conversationHistory: { role: "bot" | "user"; text: string }[] = [];

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

// ─── Service Reimplementations ────────────────────────────────────────────────

function getOrCreateUser(telegramId: number, username?: string): User {
  let user = store.users.find((u) => u.telegramId === telegramId);
  if (user) return user;
  user = {
    id: randomUUID(),
    telegramId,
    telegramUsername: username || null,
    onboardingStatus: "not_started",
    finalBossDescription: null,
    currentSelfDescription: null,
    clarifyingAnswers: [],
    archetype: null,
    archetypeExplanation: null,
    trialStartDate: null,
    trialStatus: "pending",
    timeToFinalBoss: null,
    currentStreak: 0,
    createdAt: new Date(),
  };
  store.users.push(user);
  return user;
}

function updateUser(userId: string, updates: Partial<User>) {
  const user = store.users.find((u) => u.id === userId);
  if (user) Object.assign(user, updates);
}

function getUserById(userId: string): User | undefined {
  return store.users.find((u) => u.id === userId);
}

function getUserAIConfig(userId: string) {
  return store.llmSettings.find((s) => s.userId === userId);
}

async function handleFinalBossInput(userId: string, description: string): Promise<string> {
  updateUser(userId, { finalBossDescription: description, onboardingStatus: "clarifying" });
  const userConfig = getUserAIConfig(userId);
  return ai.chat(ASSESSOR_SYSTEM, [
    { role: "user", content: `Here's who I want to become:\n\n${description}` },
  ], userConfig);
}

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

async function handleCurrentSelf(userId: string, description: string): Promise<string> {
  updateUser(userId, { currentSelfDescription: description, onboardingStatus: "assigning" });
  const user = getUserById(userId)!;

  const assignmentInput = `Final boss vision: ${user.finalBossDescription}\n\nCurrent self: ${description}\n\nClarifying answers:\n${(user.clarifyingAnswers || []).map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join("\n")}`;

  const userConfig = getUserAIConfig(userId);
  const result = await ai.chatJSON<{
    archetype: string;
    explanation: string;
    dimensions: { name: string; currentLevel: number; targetLevel: number }[];
  }>(ARCHETYPE_SYSTEM, [{ role: "user", content: assignmentInput }], userConfig);

  updateUser(userId, {
    archetype: result.archetype,
    archetypeExplanation: result.explanation,
    onboardingStatus: "confirming_archetype",
  });

  return result.explanation;
}

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

async function generateTree(userId: string): Promise<SkillNode[]> {
  const user = getUserById(userId)!;
  const treeInput = `Archetype: ${user.archetype}\nGoal: ${user.finalBossDescription}\nCurrent: ${user.currentSelfDescription}\nDimensions identified during assessment.`;

  const userConfig = getUserAIConfig(userId);
  let result = await ai.chatJSON<{
    nodes: { title: string; description: string; estimatedDays: number; parentTitle: string | null; orderIndex: number }[];
  }>(TREE_SYSTEM, [{ role: "user", content: treeInput }], userConfig);

  const nodeMap = new Map<string, string>();
  const roots = result.nodes.filter((n) => !n.parentTitle);

  for (const node of roots) {
    const id = randomUUID();
    store.skillNodes.push({
      id, userId, parentNodeId: null,
      title: node.title, description: node.description,
      status: "available", estimatedDays: node.estimatedDays,
      orderIndex: node.orderIndex, createdAt: new Date(),
    });
    nodeMap.set(node.title, id);
  }

  const children = result.nodes.filter((n) => n.parentTitle);
  for (const node of children) {
    const id = randomUUID();
    const parentId = fuzzyFindParent(node.parentTitle!, nodeMap);
    store.skillNodes.push({
      id, userId, parentNodeId: parentId,
      title: node.title, description: node.description,
      status: "locked", estimatedDays: node.estimatedDays,
      orderIndex: node.orderIndex, createdAt: new Date(),
    });
    nodeMap.set(node.title, id);
  }

  // Validate we have enough children; retry once if not
  const insertedChildren = store.skillNodes.filter(n => n.userId === userId && n.parentNodeId).length;

  if (insertedChildren < 6) {
    // Clear and retry
    store.skillNodes = store.skillNodes.filter(n => n.userId !== userId);
    const retryResult = await ai.chatJSON<typeof result>(
      TREE_SYSTEM + "\n\nIMPORTANT: Each of the 3 top-level branches MUST have 2-3 children. Use the EXACT parent title string in the child's parentTitle field. You returned nodes with missing or mismatched parentTitle values last time.",
      [{ role: "user", content: treeInput }],
      userConfig,
    );
    const retryRoots = retryResult.nodes.filter((n) => !n.parentTitle);
    const retryNodeMap = new Map<string, string>();
    for (const node of retryRoots) {
      const id = randomUUID();
      store.skillNodes.push({
        id, userId, parentNodeId: null,
        title: node.title, description: node.description,
        status: "available", estimatedDays: node.estimatedDays,
        orderIndex: node.orderIndex, createdAt: new Date(),
      });
      retryNodeMap.set(node.title, id);
    }
    const retryChildren = retryResult.nodes.filter((n) => n.parentTitle);
    for (const node of retryChildren) {
      const id = randomUUID();
      const parentId = fuzzyFindParent(node.parentTitle!, retryNodeMap);
      store.skillNodes.push({
        id, userId, parentNodeId: parentId,
        title: node.title, description: node.description,
        status: "locked", estimatedDays: node.estimatedDays,
        orderIndex: node.orderIndex, createdAt: new Date(),
      });
      retryNodeMap.set(node.title, id);
    }
    result = retryResult;
  }

  const totalDays = result.nodes.reduce((sum, n) => sum + n.estimatedDays, 0);
  updateUser(userId, { timeToFinalBoss: totalDays, onboardingStatus: "selecting_branch" });
  return store.skillNodes.filter((n) => n.userId === userId);
}

function selectBranch(userId: string, nodeId: string) {
  const node = store.skillNodes.find((n) => n.id === nodeId);
  if (node) node.status = "active";

  const children = store.skillNodes.filter((n) => n.parentNodeId === nodeId).sort((a, b) => a.orderIndex - b.orderIndex);
  if (children[0]) children[0].status = "active";

  const today = new Date().toISOString().split("T")[0]!;
  updateUser(userId, { onboardingStatus: "complete", trialStatus: "active", trialStartDate: today });
}

async function generateDailyTask(userId: string): Promise<DailyTask> {
  const today = new Date().toISOString().split("T")[0]!;
  const existing = store.dailyTasks.find((t) => t.userId === userId && t.assignedDate === today);
  if (existing) return existing;

  const user = getUserById(userId)!;
  const activeNodes = store.skillNodes.filter((n) => n.userId === userId && n.status === "active");
  const activeNode = activeNodes.find((n) => n.parentNodeId) ?? activeNodes[0];
  if (!activeNode) throw new Error("No active node");

  const recentTasks = store.dailyTasks.filter((t) => t.userId === userId).slice(-5);
  const dayNumber = user.trialStartDate
    ? Math.floor((Date.now() - new Date(user.trialStartDate).getTime()) / (24 * 60 * 60 * 1000)) + 1
    : 1;

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

  const userConfig = getUserAIConfig(userId);
  const result = await ai.chatJSON<{ taskText: string; taskType: string }>(
    system,
    [{ role: "user", content: "Generate today's task." }],
    userConfig,
  );

  const task: DailyTask = {
    id: randomUUID(), userId, skillNodeId: activeNode.id,
    taskText: result.taskText, taskType: result.taskType,
    status: "assigned", assignedDate: today, reflection: null, createdAt: new Date(),
  };
  store.dailyTasks.push(task);
  return task;
}

function completeTask(taskId: string, reflection?: string): { newStreak: number } | undefined {
  const task = store.dailyTasks.find((t) => t.id === taskId);
  if (!task) return undefined;
  task.status = "completed";
  task.reflection = reflection ?? null;
  const user = getUserById(task.userId);
  if (user) {
    user.currentStreak += 1;
    return { newStreak: user.currentStreak };
  }
  return { newStreak: 1 };
}

// ─── Message Handling ─────────────────────────────────────────────────────────

let lastBotMessage = "";
let lastButtons: { label: string; data: string }[] = [];

async function send(text: string) {
  userSay(text);
  const user = getOrCreateUser(TELEGRAM_ID, TELEGRAM_USERNAME);

  if (text.startsWith("[btn]")) {
    const label = text.replace("[btn]", "").trim();
    if (user.onboardingStatus === "selecting_branch") {
      const nodes = store.skillNodes.filter((n) => n.userId === user.id && !n.parentNodeId);
      const match = nodes.find((n) => label.startsWith(n.title));
      if (match) {
        selectBranch(user.id, match.id);
        const msg = "Your journey begins now.\n\nEvery morning you'll get a task. Complete it, then tell me 'done'.\n\nEvery evening I'll check in with you.\n\nYou have 7 days. Complete 5 tasks to stay in the program.\n\nFirst task arrives tomorrow morning. Get some rest.";
        botSay(msg);
        lastBotMessage = msg;
        return;
      }
    }
    botSay(`Unknown button: "${label}"`);
    return;
  }

  if (text === "/start") {
    user.onboardingStatus = "awaiting_final_boss";
    const msg = "Welcome to Final Boss.\n\nThis is a personal transformation program. Not an app you open when you feel like it, a commitment.\n\nYou have 7 days to prove you're serious. Complete 5 of 7 daily tasks, or you're out.\n\nReady? Let's begin.\n\nWho is the final boss version of you?\n\nDescribe who you want to become. Be specific, be ambitious. The person you'd be if you had no excuses.";
    botSay(msg);
    lastBotMessage = msg;
    return;
  }

  if (text === "/status") {
    if (user.onboardingStatus !== "complete") {
      botSay(`Onboarding status: ${user.onboardingStatus}`);
    } else {
      const dayNum = user.trialStartDate
        ? Math.floor((Date.now() - new Date(user.trialStartDate).getTime()) / (24 * 60 * 60 * 1000)) + 1
        : 0;
      const allNodesLlm = store.skillNodes.filter(n => n.userId === user.id);
      const rootNodesLlm = allNodesLlm.filter(n => !n.parentNodeId);
      const completedBranchesLlm = rootNodesLlm.filter(n => n.status === "completed").length;
      const activeBranchLlm = rootNodesLlm.find(n => n.status === "active");
      const totalBranchesLlm = rootNodesLlm.length || 3;
      const progressLineLlm = `Progress: Phase ${completedBranchesLlm + 1} of ${totalBranchesLlm}${activeBranchLlm ? `: ${activeBranchLlm.title}` : ""}`;
      const msg = `📊 Status\n\nArchetype: ${(user.archetype || "").replace(/-/g, " ")}\nTrial: ${user.trialStatus} (day ${dayNum})\nStreak: ${user.currentStreak} 🔥\n${progressLineLlm}`;
      botSay(msg);
      lastBotMessage = msg;
    }
    return;
  }

  if (text === "/generate_task") {
    if (user.onboardingStatus !== "complete") { botSay("Finish onboarding first."); return; }
    botSay("Generating today's task...");
    const task = await generateDailyTask(user.id);
    const msg = `☀️ Your task:\n\n${task.taskText}\n\nReply "done" when complete.`;
    const buttons = [
      { label: "✅ Done", data: `complete_task:${task.id}` },
      { label: "⏭ Skip", data: `skip_task:${task.id}` },
    ];
    botSay(msg, buttons);
    lastBotMessage = msg;
    lastButtons = buttons;
    return;
  }

  // Onboarding
  if (user.onboardingStatus === "awaiting_final_boss") {
    const response = await handleFinalBossInput(user.id, text);
    botSay(response);
    lastBotMessage = response;
    return;
  }

  if (user.onboardingStatus === "clarifying") {
    const { response, isReady } = await handleClarifyingAnswer(user.id, text);
    if (isReady) {
      botSay(response);
      const followup = "Now, who are you today?\n\nBe honest. Where do you actually stand right now? What's your reality?";
      botSay(followup);
      lastBotMessage = followup;
    } else {
      botSay(response);
      lastBotMessage = response;
    }
    return;
  }

  if (user.onboardingStatus === "awaiting_current_self") {
    botSay("Analyzing your gap...");
    const explanation = await handleCurrentSelf(user.id, text);
    const updatedUser = getUserById(user.id)!;
    const archetypeName = (updatedUser.archetype || "").replace(/-/g, " ").toUpperCase();
    const archetypeMsg = `Your archetype: ${archetypeName}\n\n${explanation}`;
    const confirmButtons = [
      { label: "✅ Confirm", data: "confirm_archetype" },
      { label: "🔄 Retry", data: "retry_archetype" },
    ];
    botSay(archetypeMsg, confirmButtons);
    lastBotMessage = archetypeMsg;
    lastButtons = confirmButtons;
    return;
  }

  if (user.onboardingStatus === "confirming_archetype") {
    botSay("You can confirm or retry your archetype using the buttons above.");
    return;
  }

  // Post-onboarding
  if (user.onboardingStatus === "complete") {
    const task = store.dailyTasks.find((t) => t.userId === user.id && t.assignedDate === new Date().toISOString().split("T")[0]);
    const lower = text.toLowerCase().trim();

    if (!task) {
      botSay("No task assigned yet today. Use /generate_task to create one.");
      return;
    }
    if (task.status === "completed") {
      botSay("You already completed today's task. Rest up.");
      return;
    }
    if (lower === "done" || lower === "completed") {
      const msg = "Nice. Any quick reflection? What did you notice? (or send 'skip' to skip)";
      botSay(msg);
      lastBotMessage = msg;
      return;
    }
    if (lower === "skip") {
      const result = completeTask(task.id);
      botSay(`✅ Day logged. Streak: ${result?.newStreak ?? 1} 🔥`);
      return;
    }
    if (text.length > 5) {
      const result = completeTask(task.id, text);
      botSay(`✅ Logged with reflection. Streak: ${result?.newStreak ?? 1} 🔥\n\nSee you tonight for the check-in.`);
      return;
    }
  }

  botSay("Send /start to begin.");
}

// ─── Callback Handler ─────────────────────────────────────────────────────────

async function handleCallback(userId: string, data: string) {
  if (data === "confirm_archetype") {
    updateUser(userId, { onboardingStatus: "generating_tree" });
    botSay("Generating your skill tree...");

    const nodes = await generateTree(userId);
    const rootNodes = nodes.filter((n) => !n.parentNodeId);

    lastButtons = rootNodes.map((node) => ({
      label: `${node.title}`,
      data: `select_branch:${node.id}`,
    }));

    const treeText = rootNodes
      .map((r) => {
        const ch = nodes.filter((n) => n.parentNodeId === r.id);
        const childList = ch.map((c) => `  → ${c.title}`).join("\n");
        return `🌟 ${r.title}\n${r.description}\n${childList}`;
      })
      .join("\n\n");

    const msg = `Here's your path:\n\n${treeText}\n\nChoose your first branch:`;
    botSay(msg, lastButtons);
    lastBotMessage = msg;
  } else if (data === "retry_archetype") {
    updateUser(userId, { onboardingStatus: "awaiting_current_self", archetype: null, archetypeExplanation: null });
    const msg = "Let's try again. Who are you today?\n\nBe honest about your current reality.";
    botSay(msg);
    lastBotMessage = msg;
  } else if (data.startsWith("select_branch:")) {
    const nodeId = data.replace("select_branch:", "");
    selectBranch(userId, nodeId);
    const msg = "Your journey begins now.\n\nEvery morning you'll get a task. Complete it, then tell me 'done'.\n\nEvery evening I'll check in with you.\n\nYou have 7 days. Complete 5 tasks to stay in the program.\n\nFirst task arrives tomorrow morning. Get some rest.";
    botSay(msg);
    lastBotMessage = msg;
  }
}

// ─── Conversation Driver ──────────────────────────────────────────────────────

async function runConversation() {
  log("═══════════════════════════════════════════════════════════");
  log("  FINAL BOSS — LLM-as-User Conversation");
  log(`  Date: ${new Date().toISOString()}`);
  log(`  AI Provider: ${config.aiProvider} | Model: ${config.aiModel}`);
  log(`  Base URL: ${config.aiBaseUrl}`);
  log(`  Mode: LLM generates user responses (not scripted)`);
  log("═══════════════════════════════════════════════════════════\n");

  // Debug hook — logs raw vs cleaned LLM output when they differ
  ai.setDebugHook((raw, cleaned) => {
    if (raw !== cleaned) {
      log(`   [raw]: ${raw.slice(0, 200)}...`);
      log(`   [cleaned]: ${cleaned.slice(0, 200)}`);
    }
  });

  // Step 1: /start
  await send("/start");

  // Step 2: LLM generates the final boss vision
  const vision = await generateUserResponse(
    lastBotMessage,
    "The bot is asking you to describe your ideal future self. Give a specific, ambitious 2-3 sentence vision about who you want to become."
  );
  await send(vision);

  // Step 3: Clarifying loop — bot asks, LLM-user answers naturally
  let clarifyTurns = 0;
  const MAX_CLARIFY_TURNS = 10; // safety valve
  while (true) {
    const user = getUserById(store.users[0]?.id ?? "");
    if (!user || user.onboardingStatus !== "clarifying") break;
    if (clarifyTurns >= MAX_CLARIFY_TURNS) {
      log("\n⚠️  Hit max clarifying turns without [READY]. Breaking.");
      break;
    }
    const userResponse = await generateUserResponse(lastBotMessage);
    await send(userResponse);
    clarifyTurns++;
  }

  log(`\n📍 Clarifying phase ended after ${clarifyTurns} turns.`);

  // Step 4: "Who are you today?"
  const userAfterClarify = getUserById(store.users[0]?.id ?? "");
  if (userAfterClarify?.onboardingStatus === "awaiting_current_self") {
    const currentSelf = await generateUserResponse(
      lastBotMessage,
      "The bot is asking you to honestly describe who you are RIGHT NOW. Be real about your current habits, weaknesses, and daily reality."
    );
    await send(currentSelf);
  }

  // Step 4b: Archetype confirmation — auto-confirm
  const userAfterCurrent = getUserById(store.users[0]?.id ?? "");
  if (userAfterCurrent?.onboardingStatus === "confirming_archetype") {
    log("\n📍 Auto-confirming archetype...");
    await handleCallback(store.users[0]!.id, "confirm_archetype");
  }

  // Step 5: Select first branch
  const userAfterTree = getUserById(store.users[0]?.id ?? "");
  if (userAfterTree?.onboardingStatus === "selecting_branch") {
    const rootNodes = store.skillNodes.filter((n) => n.userId === userAfterTree.id && !n.parentNodeId);
    if (rootNodes[0]) {
      const btnLabel = `${rootNodes[0].title}`;
      log(`\n📍 Auto-selecting first branch: "${rootNodes[0].title}"`);
      await send(`[btn] ${btnLabel}`);
    }
  }

  // Step 6: Generate task, complete it with LLM-generated reflection
  const userFinal = getUserById(store.users[0]?.id ?? "");
  if (userFinal?.onboardingStatus === "complete") {
    await send("/generate_task");
    await send("done");

    const reflection = await generateUserResponse(
      lastBotMessage,
      "The bot is asking for a quick reflection after completing your task. What did you notice? Keep it to 1-2 sentences."
    );
    await send(reflection);

    await send("/status");
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  log("\n═══════════════════════════════════════════════════════════");
  log("  CONVERSATION SUMMARY");
  log("═══════════════════════════════════════════════════════════");
  log(`  Total exchanges: ${conversationHistory.length}`);
  log(`  Clarifying turns: ${clarifyTurns}`);

  const totalAssertions = assertionResults.length;
  const passedAssertions = assertionResults.filter(r => r.pass).length;
  log(`  Assertions passed: ${passedAssertions}/${totalAssertions}`);

  const failures = assertionResults.filter(r => !r.pass);
  if (failures.length > 0) {
    log("  Failures:");
    for (const f of failures) {
      log(`    - Turn ${f.turn}: ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    }
  }

  const user = getUserById(store.users[0]?.id ?? "");
  if (user) {
    log(`  Final status: ${user.onboardingStatus}`);
    log(`  Archetype: ${user.archetype ?? "none"}`);
    log(`  Streak: ${user.currentStreak}`);

    const userNodes = store.skillNodes.filter(n => n.userId === user.id);
    const treeValidation = validateTree(userNodes);
    log(`  Skill tree: ${treeValidation.pass ? "✓ valid" : "✗ INVALID"}`);
    if (!treeValidation.pass) {
      for (const issue of treeValidation.issues) {
        log(`    - ${issue}`);
      }
    }

    const latestTask = store.dailyTasks.filter(t => t.userId === user.id).slice(-1)[0];
    if (latestTask) {
      log(`  Last task: "${latestTask.taskText.slice(0, 80)}..."`);
    }
  }
  log("═══════════════════════════════════════════════════════════");

  logStream.end();
  console.log(`\n📄 Full log saved to: ${logFile}`);
}

runConversation().catch((err) => {
  console.error("Fatal:", err);
  logStream.end();
  process.exit(1);
});

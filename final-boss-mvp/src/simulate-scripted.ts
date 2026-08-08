/**
 * Scripted conversation driver for Final Boss simulator.
 * Run: npx tsx src/simulate-scripted.ts
 *
 * Drives a full onboarding conversation, logs to both terminal and conversation-log.txt
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

// ─── In-Memory Store (same as simulate.ts) ─────────────────────────────────────

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
const TELEGRAM_USERNAME = "sim_user";

// ─── Logging ───────────────────────────────────────────────────────────────────

const logFile = path.join(process.cwd(), "conversation-log.txt");
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
}

// ─── Service Reimplementations ─────────────────────────────────────────────────

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
  const turnCount = answers.length + 1; // +1 for current answer
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
    onboardingStatus: "generating_tree",
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

  const nodeMap = new Map<string, string>();

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

// ─── Callback Handler ─────────────────────────────────────────────────────────

async function handleCallback(userId: string, data: string) {
  if (data === "confirm_archetype") {
    updateUser(userId, { onboardingStatus: "generating_tree" });
    botSay("Generating your skill tree...");
    const nodes = await generateTree(userId);
    const rootNodes = nodes.filter((n) => !n.parentNodeId);
    const buttons = rootNodes.map((node) => ({ label: `${node.title}`, data: `select_branch:${node.id}` }));
    const treeText = rootNodes.map((r) => {
      const children = nodes.filter((n) => n.parentNodeId === r.id);
      const childList = children.map((c) => `  → ${c.title}`).join("\n");
      return `🌟 ${r.title}\n${r.description}\n${childList}`;
    }).join("\n\n");
    botSay(`Here's your path:\n\n${treeText}\n\nChoose your first branch:`, buttons);
  } else if (data === "change_archetype") {
    updateUser(userId, { onboardingStatus: "awaiting_current_self" });
    botSay("Tell me more about what feels off. What's missing from that description?");
  }
}

// ─── Conversation Script ───────────────────────────────────────────────────────

// State tracker for button handling
let lastButtons: { label: string; data: string }[] = [];

async function send(text: string) {
  userSay(text);
  const user = getOrCreateUser(TELEGRAM_ID, TELEGRAM_USERNAME);

  // Button press
  if (text.startsWith("[btn]")) {
    const label = text.replace("[btn]", "").trim();
    if (user.onboardingStatus === "selecting_branch") {
      const nodes = store.skillNodes.filter((n) => n.userId === user.id && !n.parentNodeId);
      const match = nodes.find((n) => label.startsWith(n.title));
      if (match) {
        selectBranch(user.id, match.id);
        botSay("Your journey begins now.\n\nEvery morning you'll get a task. Complete it, then tell me 'done'.\n\nEvery evening I'll check in with you.\n\nYou have 7 days. Complete 5 tasks to stay in the program.\n\nFirst task arrives tomorrow morning. Get some rest.");
        return;
      }
    }
    botSay(`Unknown button: "${label}"`);
    return;
  }

  // /start
  if (text === "/start") {
    user.onboardingStatus = "awaiting_final_boss";
    botSay(
      "Welcome to Final Boss.\n\nThis is a personal transformation program. Not an app you open when you feel like it, a commitment.\n\nYou have 7 days to prove you're serious. Complete 5 of 7 daily tasks, or you're out.\n\nReady? Let's begin.\n\nWho is the final boss version of you?\n\nDescribe who you want to become. Be specific, be ambitious. The person you'd be if you had no excuses."
    );
    return;
  }

  // /status
  if (text === "/status") {
    if (user.onboardingStatus !== "complete") {
      botSay(`Onboarding status: ${user.onboardingStatus}`);
    } else {
      const dayNum = user.trialStartDate
        ? Math.floor((Date.now() - new Date(user.trialStartDate).getTime()) / (24 * 60 * 60 * 1000)) + 1
        : 0;
      const allNodes = store.skillNodes.filter(n => n.userId === user.id);
      const rootNodesStat = allNodes.filter(n => !n.parentNodeId);
      const completedBranchesStat = rootNodesStat.filter(n => n.status === "completed").length;
      const activeBranchStat = rootNodesStat.find(n => n.status === "active");
      const totalBranchesStat = rootNodesStat.length || 3;
      const progressLineStat = `Progress: Phase ${completedBranchesStat + 1} of ${totalBranchesStat}${activeBranchStat ? `: ${activeBranchStat.title}` : ""}`;
      botSay(`📊 Status\n\nArchetype: ${(user.archetype || "").replace(/-/g, " ")}\nTrial: ${user.trialStatus} (day ${dayNum})\nStreak: ${user.currentStreak} 🔥\n${progressLineStat}`);
    }
    return;
  }

  // /generate_task
  if (text === "/generate_task") {
    if (user.onboardingStatus !== "complete") { botSay("Finish onboarding first."); return; }
    botSay("Generating today's task...");
    const task = await generateDailyTask(user.id);
    botSay(`☀️ Your task:\n\n${task.taskText}\n\nReply "done" when complete.`, [
      { label: "✅ Done", data: `complete_task:${task.id}` },
      { label: "⏭ Skip", data: `skip_task:${task.id}` },
    ]);
    return;
  }

  // Onboarding
  if (user.onboardingStatus === "awaiting_final_boss") {
    botSay("Let me think about that...");
    const response = await handleFinalBossInput(user.id, text);
    botSay(response);
    return;
  }

  if (user.onboardingStatus === "clarifying") {
    const { response, isReady } = await handleClarifyingAnswer(user.id, text);
    if (isReady) {
      botSay(response);
      botSay("Now, who are you today?\n\nBe honest. Where do you actually stand right now? What's your reality?");
    } else {
      botSay(response);
    }
    return;
  }

  if (user.onboardingStatus === "awaiting_current_self") {
    botSay("Analyzing your gap...");
    const explanation = await handleCurrentSelf(user.id, text);
    const updatedUser = getUserById(user.id)!;
    // Override status to confirming_archetype
    updateUser(user.id, { onboardingStatus: "confirming_archetype" });
    const archetypeName = (updatedUser.archetype || "").replace(/-/g, " ").toUpperCase();
    botSay(`Your archetype: ${archetypeName}\n\n${explanation}\n\nDoes this feel right?`, [
      { label: "Yes, that's me", data: "confirm_archetype" },
      { label: "Not quite", data: "change_archetype" },
    ]);
    return;
  }

  if (user.onboardingStatus === "confirming_archetype") {
    botSay("Please use the buttons above to confirm or change your archetype.");
    return;
  }

  // Daily task flow (post-onboarding)
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
      botSay("Nice. Any quick reflection? What did you notice? (or send 'skip' to skip)");
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

// ─── Define the conversation script ────────────────────────────────────────────

// Clarifying answers — the script sends these until the AI says [READY]
const CLARIFYING_ANSWERS: string[] = [
  "Shipping means pushing at least one meaningful commit or publishing one piece of content every day. Not just busy work.",
  "Honestly, I start strong for 2-3 weeks then fall off. I get distracted by new ideas and lose momentum on what matters.",
  "I'm a software engineer, 3 years experience. I can build things but I procrastinate on the hard stuff. I exercise maybe once a week. I wake up around 8:30am most days.",
  "My biggest struggle is the gap between knowing what to do and actually doing it. I have all the time in the world but I fill it with low-value stuff.",
  "When I'm in flow I'm unstoppable. The problem is getting into flow — I let small friction stop me.",
  "Discipline for me right now is nonexistent. I set alarms and snooze them. I make plans and break them by noon. I need external structure.",
  "Creatively I'm strong — I have too many ideas if anything. The problem is finishing, not starting.",
  "Relationships are good but surface level. I want to go deeper, actually mentor people, be the person others come to for real advice.",
  "Success for me would be: wake up, no snooze, gym, ship something meaningful, help one person, sleep satisfied. Every single day.",
  "I've tried apps, accountability partners, habit trackers. They all work for 2 weeks then I ghost them.",
];

const CURRENT_SELF_ANSWER = "I'm a decent engineer who's coasting. I have the skills but not the discipline. I work remotely, have flexible hours but waste the morning. I know I could be 10x more impactful if I just showed up consistently.";

const FINAL_BOSS_VISION = "I want to become someone who ships code every single day, builds in public, and has the discipline to wake up at 5am, work out, and still have energy to mentor others. A relentless builder who's also deeply empathetic.";

async function runConversation() {
  log("═══════════════════════════════════════════════════════════");
  log("  FINAL BOSS — Scripted Conversation Log");
  log(`  Date: ${new Date().toISOString()}`);
  log(`  AI Provider: ${config.aiProvider} | Model: ${config.aiModel}`);
  log(`  Base URL: ${config.aiBaseUrl}`);
  log("═══════════════════════════════════════════════════════════\n");

  // Step 1: /start
  await send("/start");

  // Step 2: Final boss vision
  await send(FINAL_BOSS_VISION);

  // Step 3: Answer clarifying questions until AI says [READY]
  let clarifyIdx = 0;
  while (true) {
    const user = getUserById(store.users[0]?.id ?? "");
    if (!user || user.onboardingStatus !== "clarifying") break;
    if (clarifyIdx >= CLARIFYING_ANSWERS.length) {
      log("\n⚠️  Ran out of scripted clarifying answers. AI hasn't said [READY] yet.");
      break;
    }
    await send(CLARIFYING_ANSWERS[clarifyIdx]!);
    clarifyIdx++;
  }

  // Step 4: "Who are you today?"
  const userAfterClarify = getUserById(store.users[0]?.id ?? "");
  if (userAfterClarify?.onboardingStatus === "awaiting_current_self") {
    await send(CURRENT_SELF_ANSWER);
  }

  // Step 4b: Auto-confirm archetype if we're in confirming_archetype state
  const userAfterCurrentSelf = getUserById(store.users[0]?.id ?? "");
  if (userAfterCurrentSelf?.onboardingStatus === "confirming_archetype") {
    await handleCallback(store.users[0]!.id, "confirm_archetype");
  }

  // Step 5: Select first branch
  const userAfterTree = getUserById(store.users[0]?.id ?? "");
  if (userAfterTree?.onboardingStatus === "selecting_branch") {
    const rootNodes = store.skillNodes.filter((n) => n.userId === userAfterTree.id && !n.parentNodeId);
    if (rootNodes[0]) {
      const btnLabel = `${rootNodes[0].title}`;
      await send(`[btn] ${btnLabel}`);
    }
  }

  // Step 6: Generate and complete a task
  const userFinal = getUserById(store.users[0]?.id ?? "");
  if (userFinal?.onboardingStatus === "complete") {
    await send("/generate_task");
    await send("done");
    await send("I noticed I was avoiding the hardest part of the task but once I started it took only 10 minutes.");
    await send("/status");
  }

  log("\n═══════════════════════════════════════════════════════════");
  log("  END OF CONVERSATION");
  log("═══════════════════════════════════════════════════════════");

  logStream.end();
  console.log(`\n📄 Full log saved to: ${logFile}`);
}

runConversation().catch((err) => {
  console.error("Fatal:", err);
  logStream.end();
  process.exit(1);
});

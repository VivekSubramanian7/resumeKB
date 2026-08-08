/**
 * CLI simulator for Final Boss bot.
 * Run: npx tsx src/simulate.ts
 *
 * Mocks Telegram + DB but uses real AI calls.
 * Type messages as a user, see bot replies in the terminal.
 * For inline keyboard buttons, type: [btn] Button Label
 */
import "dotenv/config";
import * as readline from "readline";
import { randomUUID } from "crypto";
import * as ai from "./services/ai.js";
import { ASSESSOR_SYSTEM, ARCHETYPE_SYSTEM } from "./prompts/assessor.js";
import { TREE_SYSTEM } from "./prompts/architect.js";
import { taskGenerationSystem } from "./prompts/coach.js";
import { config } from "./config.js";

// ─── In-Memory Store ───────────────────────────────────────────────────────────

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

// ─── Service Reimplementations (in-memory) ─────────────────────────────────────

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

  answers.push({ question: "(previous AI message)", answer });
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
      id,
      userId,
      parentNodeId: null,
      title: node.title,
      description: node.description,
      status: "available",
      estimatedDays: node.estimatedDays,
      orderIndex: node.orderIndex,
      createdAt: new Date(),
    });
    nodeMap.set(node.title, id);
  }

  const children = result.nodes.filter((n) => n.parentTitle);
  for (const node of children) {
    const id = randomUUID();
    const parentId = nodeMap.get(node.parentTitle!) || null;
    store.skillNodes.push({
      id,
      userId,
      parentNodeId: parentId,
      title: node.title,
      description: node.description,
      status: "locked",
      estimatedDays: node.estimatedDays,
      orderIndex: node.orderIndex,
      createdAt: new Date(),
    });
    nodeMap.set(node.title, id);
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

function getTodayTask(userId: string): DailyTask | undefined {
  const today = new Date().toISOString().split("T")[0]!;
  return store.dailyTasks.find((t) => t.userId === userId && t.assignedDate === today);
}

async function generateDailyTask(userId: string): Promise<DailyTask> {
  const today = new Date().toISOString().split("T")[0]!;
  const existing = getTodayTask(userId);
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
    id: randomUUID(),
    userId,
    skillNodeId: activeNode.id,
    taskText: result.taskText,
    taskType: result.taskType,
    status: "assigned",
    assignedDate: today,
    reflection: null,
    createdAt: new Date(),
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

// ─── Fake Context & Bot Reply Rendering ────────────────────────────────────────

const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function botSay(text: string, buttons?: { label: string; data: string }[]) {
  console.log(`\n${CYAN}🤖 ${text}${RESET}`);
  if (buttons?.length) {
    console.log(`${DIM}   Buttons:${RESET}`);
    for (const btn of buttons) {
      console.log(`${YELLOW}   [btn] ${btn.label}${RESET}`);
    }
  }
}

// ─── Message Router ────────────────────────────────────────────────────────────

// Settings wizard state
let settingsSession: { step: string; provider?: string; baseUrl?: string; apiKey?: string; model?: string } | null = null;

async function routeMessage(text: string) {
  const user = getOrCreateUser(TELEGRAM_ID, TELEGRAM_USERNAME);

  // Handle button presses
  if (text.startsWith("[btn]")) {
    const label = text.replace("[btn]", "").trim();
    await handleButtonPress(user, label);
    return;
  }

  // Commands
  if (text === "/start") {
    await handleStartCommand(user);
    return;
  }
  if (text === "/status") {
    await handleStatusCommand(user);
    return;
  }
  if (text === "/settings") {
    await handleSettingsCommand(user);
    return;
  }
  if (text === "/settings_clear") {
    const s = store.llmSettings.findIndex((x) => x.userId === user.id);
    if (s >= 0) store.llmSettings.splice(s, 1);
    settingsSession = null;
    botSay("LLM config cleared. Using server default.");
    return;
  }
  if (text === "/settings_reset") {
    settingsSession = { step: "provider" };
    botSay("Resetting. Which provider? Reply *anthropic* or *openai*.");
    return;
  }
  if (text === "/generate_task") {
    if (user.onboardingStatus !== "complete") {
      botSay("Finish onboarding first.");
      return;
    }
    botSay("Generating today's task...");
    const task = await generateDailyTask(user.id);
    const dayNum = user.trialStartDate
      ? Math.floor((Date.now() - new Date(user.trialStartDate).getTime()) / (24 * 60 * 60 * 1000)) + 1
      : 1;
    botSay(`☀️ Day ${dayNum} - Your task:\n\n${task.taskText}\n\nReply "done" when complete.`, [
      { label: "✅ Done", data: `complete_task:${task.id}` },
      { label: "⏭ Skip", data: `skip_task:${task.id}` },
    ]);
    return;
  }

  // Settings wizard takes priority
  if (settingsSession) {
    await handleSettingsInput(user, text);
    return;
  }

  // Onboarding flow
  if (user.onboardingStatus !== "complete" && user.onboardingStatus !== "not_started") {
    await handleOnboardingMessage(user, text);
    return;
  }

  // Daily task flow
  if (user.onboardingStatus === "complete") {
    await handleDailyMessage(user, text);
    return;
  }

  // Fallback
  if (user.onboardingStatus === "not_started") {
    botSay("Send /start to begin.");
  }
}

async function handleStartCommand(user: User) {
  if (user.trialStatus === "failed") {
    const trialEnd = user.trialStartDate
      ? new Date(new Date(user.trialStartDate).getTime() + 7 * 24 * 60 * 60 * 1000)
      : null;
    const daysSinceEnd = trialEnd
      ? Math.floor((Date.now() - trialEnd.getTime()) / (24 * 60 * 60 * 1000))
      : 999;

    if (daysSinceEnd < 14) {
      const daysLeft = 14 - daysSinceEnd;
      botSay(`Your trial period ended. You can re-enter in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.\n\nUse this time to reflect on what held you back.`);
      return;
    }

    Object.assign(user, {
      trialStatus: "pending",
      onboardingStatus: "awaiting_final_boss",
      trialStartDate: null,
      currentStreak: 0,
      clarifyingAnswers: [],
      finalBossDescription: null,
      currentSelfDescription: null,
      archetype: null,
      archetypeExplanation: null,
      timeToFinalBoss: null,
    });
  }

  if (user.onboardingStatus === "complete") {
    botSay("Welcome back. Your journey continues. ⚡");
    return;
  }

  if (user.onboardingStatus !== "not_started") {
    botSay("We were in the middle of something. Let's pick up where we left off.\n\nSend me a message to continue.");
    return;
  }

  user.onboardingStatus = "awaiting_final_boss";
  botSay(
    "Welcome to Final Boss.\n\n" +
    "This is a personal transformation program. Not an app you open when you feel like it, a commitment.\n\n" +
    "You have 7 days to prove you're serious. Complete 5 of 7 daily tasks, or you're out.\n\n" +
    "💡 Tip: Use /settings to bring your own LLM API key (Anthropic, OpenAI, or local).\n\n" +
    "Ready? Let's begin.\n\n" +
    "Who is the final boss version of you?\n\n" +
    "Describe who you want to become. Be specific, be ambitious. The person you'd be if you had no excuses."
  );
}

async function handleStatusCommand(user: User) {
  if (user.onboardingStatus !== "complete") {
    botSay(`Onboarding status: ${user.onboardingStatus}\n\nKeep going - send me a message to continue.`);
    return;
  }
  const dayNum = user.trialStartDate
    ? Math.floor((Date.now() - new Date(user.trialStartDate).getTime()) / (24 * 60 * 60 * 1000)) + 1
    : 0;
  const nodes = store.skillNodes.filter(n => n.userId === user.id);
  const rootNodes = nodes.filter(n => !n.parentNodeId);
  const completedBranches = rootNodes.filter(n => n.status === "completed").length;
  const activeBranch = rootNodes.find(n => n.status === "active");
  const totalBranches = rootNodes.length || 3;
  const progressLine = `Progress: Phase ${completedBranches + 1} of ${totalBranches}${activeBranch ? `: ${activeBranch.title}` : ""}`;
  botSay(
    `📊 Status\n\n` +
    `Archetype: ${(user.archetype || "").replace(/-/g, " ")}\n` +
    `Trial: ${user.trialStatus} (day ${dayNum})\n` +
    `Streak: ${user.currentStreak} 🔥\n` +
    progressLine
  );
}

async function handleOnboardingMessage(user: User, text: string) {
  switch (user.onboardingStatus) {
    case "awaiting_final_boss": {
      botSay("Let me think about that...");
      const response = await handleFinalBossInput(user.id, text);
      botSay(response);
      break;
    }

    case "clarifying": {
      const { response, isReady } = await handleClarifyingAnswer(user.id, text);
      if (isReady) {
        botSay(response);
        botSay("Now, who are you today?\n\nBe honest. Where do you actually stand right now? What's your reality?");
      } else {
        botSay(response);
      }
      break;
    }

    case "awaiting_current_self": {
      botSay("Analyzing your gap...");
      const explanation = await handleCurrentSelf(user.id, text);
      const updatedUser = getUserById(user.id)!;
      const archetypeName = (updatedUser.archetype || "").replace(/-/g, " ").toUpperCase();

      botSay(`Your archetype: ${archetypeName}\n\n${explanation}`);
      botSay("Generating your skill tree...");

      const nodes = await generateTree(user.id);
      const rootNodes = nodes.filter((n) => !n.parentNodeId);

      const buttons = rootNodes.map((node) => ({
        label: `${node.title}`,
        data: `select_branch:${node.id}`,
      }));

      const treeText = rootNodes
        .map((r) => {
          const children = nodes.filter((n) => n.parentNodeId === r.id);
          const childList = children.map((c) => `  → ${c.title}`).join("\n");
          return `🌟 ${r.title}\n${r.description}\n${childList}`;
        })
        .join("\n\n");

      botSay(`Here's your path:\n\n${treeText}\n\nChoose your first branch:`, buttons);
      break;
    }

    default:
      botSay("Hold on, something's processing. Give me a moment.");
  }
}

async function handleDailyMessage(user: User, text: string) {
  const task = getTodayTask(user.id);
  const lowerText = text.toLowerCase().trim();

  if (!task) {
    botSay("No task assigned yet today. Use /generate_task to create one, or it'll arrive in the morning.");
    return;
  }

  if (task.status === "completed") {
    botSay("You already completed today's task. Rest up, tomorrow brings a new challenge.");
    return;
  }

  if (lowerText === "done" || lowerText === "completed" || lowerText === "✅") {
    botSay("Nice. Any quick reflection? What did you notice? (or send 'skip' to skip)");
    return;
  }

  if (lowerText === "skip") {
    const result = completeTask(task.id);
    botSay(`✅ Day logged. Streak: ${result?.newStreak ?? 1} 🔥`);
    return;
  }

  if (task.status === "assigned" && text.length > 5 && !text.startsWith("/")) {
    const result = completeTask(task.id, text);
    botSay(`✅ Logged with reflection. Streak: ${result?.newStreak ?? 1} 🔥\n\nSee you tonight for the check-in.`);
    return;
  }

  botSay(`Today's task:\n\n${task.taskText}\n\nReply "done" when finished (+ optional reflection), or tap below:`, [
    { label: "✅ Done", data: `complete_task:${task.id}` },
    { label: "⏭ Skip", data: `skip_task:${task.id}` },
  ]);
}

async function handleButtonPress(user: User, label: string) {
  // Match button label to stored skill nodes or tasks
  if (user.onboardingStatus === "selecting_branch") {
    const nodes = store.skillNodes.filter((n) => n.userId === user.id && !n.parentNodeId);
    const match = nodes.find((n) => label.startsWith(n.title));
    if (match) {
      selectBranch(user.id, match.id);
      botSay(
        "Your journey begins now.\n\n" +
        "Every morning you'll get a task. Complete it, then tell me 'done'.\n\n" +
        "Every evening I'll check in with you.\n\n" +
        "You have 7 days. Complete 5 tasks to stay in the program.\n\n" +
        "First task arrives tomorrow morning. Get some rest.\n\n" +
        `${DIM}(Tip: use /generate_task to manually trigger today's task)${RESET}`
      );
      return;
    }
  }

  // Task buttons
  if (label === "✅ Done") {
    const task = getTodayTask(user.id);
    if (task) {
      const result = completeTask(task.id);
      botSay(`✅ Done! Streak: ${result?.newStreak ?? 1} 🔥`);
      return;
    }
  }
  if (label === "⏭ Skip") {
    const task = getTodayTask(user.id);
    if (task) {
      completeTask(task.id);
      botSay("⏭ Skipped. Tomorrow's a new day.");
      return;
    }
  }

  botSay(`Unknown button: "${label}". Try typing the exact label shown.`);
}

async function handleSettingsCommand(user: User) {
  const existing = store.llmSettings.find((s) => s.userId === user.id);
  if (existing) {
    const masked = existing.aiApiKey.length > 8
      ? existing.aiApiKey.slice(0, 4) + "****" + existing.aiApiKey.slice(-4)
      : "****";
    botSay(`Current LLM config\n\nProvider: ${existing.aiProvider}\nBase URL: ${existing.aiBaseUrl ?? "(default)"}\nAPI Key: ${masked}\nModel: ${existing.aiModel}\n\nSend /settings_reset to reconfigure, or /settings_clear to remove.`);
    return;
  }
  settingsSession = { step: "provider" };
  botSay("Let's configure your LLM.\n\nWhich provider? Reply anthropic or openai (OpenAI-compatible, e.g. LM Studio, Groq, Together).");
}

async function handleSettingsInput(user: User, text: string) {
  if (!settingsSession) return;
  const trimmed = text.trim();

  switch (settingsSession.step) {
    case "provider": {
      const provider = trimmed.toLowerCase();
      if (provider !== "anthropic" && provider !== "openai") {
        botSay("Reply anthropic or openai.");
        return;
      }
      settingsSession.provider = provider;
      if (provider === "openai") {
        settingsSession.step = "base_url";
        botSay("Base URL for your OpenAI-compatible endpoint (e.g. http://localhost:1234/v1).\n\nSend 'skip' to use the server default.");
      } else {
        settingsSession.step = "api_key";
        botSay("Your Anthropic API key:");
      }
      return;
    }
    case "base_url": {
      settingsSession.baseUrl = trimmed.toLowerCase() === "skip" ? undefined : trimmed;
      settingsSession.step = "api_key";
      botSay("Your API key:");
      return;
    }
    case "api_key": {
      if (trimmed.length < 8) {
        botSay("That looks too short. Paste your full API key:");
        return;
      }
      settingsSession.apiKey = trimmed;
      settingsSession.step = "model";
      botSay("Model name (e.g. claude-sonnet-4-6-20250514, gpt-4o, or your local model ID):");
      return;
    }
    case "model": {
      settingsSession.model = trimmed;
      settingsSession.step = "confirm";
      const masked = settingsSession.apiKey!.length > 8
        ? settingsSession.apiKey!.slice(0, 4) + "****" + settingsSession.apiKey!.slice(-4)
        : "****";
      botSay(`Confirm your config:\n\nProvider: ${settingsSession.provider}\nBase URL: ${settingsSession.baseUrl ?? "(default)"}\nAPI Key: ${masked}\nModel: ${settingsSession.model}\n\nSend 'yes' to save, 'no' to cancel.`);
      return;
    }
    case "confirm": {
      if (trimmed.toLowerCase() === "no") {
        settingsSession = null;
        botSay("Cancelled. Your config was not saved.");
        return;
      }
      if (trimmed.toLowerCase() !== "yes") {
        botSay("Send 'yes' to save or 'no' to cancel.");
        return;
      }
      store.llmSettings = store.llmSettings.filter((s) => s.userId !== user.id);
      store.llmSettings.push({
        userId: user.id,
        aiProvider: settingsSession.provider!,
        aiBaseUrl: settingsSession.baseUrl ?? null,
        aiApiKey: settingsSession.apiKey!,
        aiModel: settingsSession.model!,
      });
      settingsSession = null;
      botSay("✅ LLM config saved. Your conversations will now use your own API key and model.");
      return;
    }
  }
}

// ─── REPL ──────────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(`
${CYAN}╔══════════════════════════════════════════════╗
║         FINAL BOSS — CLI Simulator           ║
╚══════════════════════════════════════════════╝${RESET}

${DIM}AI Provider: ${config.aiProvider} | Model: ${config.aiModel}
Base URL: ${config.aiBaseUrl}
Telegram User: @${TELEGRAM_USERNAME} (ID: ${TELEGRAM_ID})${RESET}

${YELLOW}Commands:${RESET} /start, /status, /settings, /settings_reset, /settings_clear, /generate_task
${YELLOW}Buttons:${RESET} Type the exact button label shown (e.g. "Morning Mastery (14d)")
${YELLOW}Exit:${RESET} Ctrl+C

`);

function prompt() {
  rl.question(`${YELLOW}> ${RESET}`, async (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      prompt();
      return;
    }

    try {
      await routeMessage(trimmed);
    } catch (err) {
      console.error(`\n\x1b[31m❌ Error: ${err instanceof Error ? err.message : err}\x1b[0m`);
    }

    prompt();
  });
}

prompt();

import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, skillNodes } from "../db/schema.js";
import * as ai from "./ai.js";
import { getUserAIConfigByUserId } from "./llmSettings.js";
import { ASSESSOR_SYSTEM, ARCHETYPE_SYSTEM } from "../prompts/assessor.js";
import { TREE_SYSTEM } from "../prompts/architect.js";

export async function getOrCreateUser(telegramId: number, username?: string): Promise<typeof users.$inferSelect> {
  const existing = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db.insert(users).values({
    telegramId,
    telegramUsername: username || null,
  }).returning();
  if (!inserted[0]) throw new Error("Failed to create user");
  return inserted[0];
}

export async function handleFinalBossInput(userId: string, description: string): Promise<string> {
  await db.update(users).set({
    finalBossDescription: description,
    onboardingStatus: "clarifying",
  }).where(eq(users.id, userId));

  const userConfig = await getUserAIConfigByUserId(userId);
  const response = await ai.chat(ASSESSOR_SYSTEM, [
    { role: "user", content: `Here's who I want to become:\n\n${description}` },
  ], userConfig);

  return response;
}

export async function handleClarifyingAnswer(userId: string, answer: string): Promise<{ response: string; isReady: boolean }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  const answers = [...(user.clarifyingAnswers || [])];

  // Rebuild conversation for AI
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

  const userConfig = await getUserAIConfigByUserId(userId);
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

  // Store this Q&A pair (use a placeholder for the question since we don't have it cleanly)
  answers.push({ question: "(previous AI message)", answer });

  const newStatus = isReady ? "awaiting_current_self" : "clarifying";
  await db.update(users).set({
    clarifyingAnswers: answers,
    onboardingStatus: newStatus,
  }).where(eq(users.id, userId));

  return { response: cleanResponse, isReady };
}

export async function handleCurrentSelf(userId: string, description: string): Promise<string> {
  await db.update(users).set({
    currentSelfDescription: description,
    onboardingStatus: "assigning",
  }).where(eq(users.id, userId));

  // Assign archetype
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  const assignmentInput = `Final boss vision: ${user!.finalBossDescription}\n\nCurrent self: ${description}\n\nClarifying answers:\n${(user!.clarifyingAnswers || []).map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join("\n")}`;

  const userConfig = await getUserAIConfigByUserId(userId);
  const result = await ai.chatJSON<{
    archetype: string;
    explanation: string;
    dimensions: { name: string; currentLevel: number; targetLevel: number }[];
  }>(ARCHETYPE_SYSTEM, [{ role: "user", content: assignmentInput }], userConfig);

  await db.update(users).set({
    archetype: result.archetype,
    archetypeExplanation: result.explanation,
    onboardingStatus: "generating_tree",
  }).where(eq(users.id, userId));

  return result.explanation;
}

export async function generateTree(userId: string): Promise<typeof skillNodes.$inferSelect[]> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  const treeInput = `Archetype: ${user.archetype}\nGoal: ${user.finalBossDescription}\nCurrent: ${user.currentSelfDescription}\nDimensions identified during assessment.`;

  const userConfig = await getUserAIConfigByUserId(userId);
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

  // Insert root nodes first
  const nodeMap = new Map<string, string>();

  for (const node of roots) {
    const [inserted] = await db.insert(skillNodes).values({
      userId,
      title: node.title,
      description: node.description,
      estimatedDays: node.estimatedDays,
      orderIndex: node.orderIndex,
      status: "available",
    }).returning();
    nodeMap.set(node.title, inserted!.id);
  }

  // Insert children
  const children = result.nodes.filter((n) => n.parentTitle);
  for (const node of children) {
    const parentId = nodeMap.get(node.parentTitle!) || null;
    const [inserted] = await db.insert(skillNodes).values({
      userId,
      parentNodeId: parentId,
      title: node.title,
      description: node.description,
      estimatedDays: node.estimatedDays,
      orderIndex: node.orderIndex,
      status: "locked",
    }).returning();
    nodeMap.set(node.title, inserted!.id);
  }

  // Compute time estimate
  const totalDays = result.nodes.reduce((sum, n) => sum + n.estimatedDays, 0);
  await db.update(users).set({
    timeToFinalBoss: totalDays,
    onboardingStatus: "selecting_branch",
  }).where(eq(users.id, userId));

  return db.select().from(skillNodes).where(eq(skillNodes.userId, userId));
}

export async function selectBranch(userId: string, nodeId: string) {
  await db.update(skillNodes).set({ status: "active" }).where(eq(skillNodes.id, nodeId));

  // Unlock first child of this branch
  const children = await db.select().from(skillNodes).where(eq(skillNodes.parentNodeId, nodeId));
  if (children.length > 0) {
    const first = children.sort((a, b) => a.orderIndex - b.orderIndex)[0];
    await db.update(skillNodes).set({ status: "active" }).where(eq(skillNodes.id, first!.id));
  }

  const today = new Date().toISOString().split("T")[0];
  await db.update(users).set({
    onboardingStatus: "complete",
    trialStatus: "active",
    trialStartDate: today,
  }).where(eq(users.id, userId));
}

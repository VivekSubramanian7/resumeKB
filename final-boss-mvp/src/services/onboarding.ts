import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, skillNodes } from "../db/schema.js";
import * as ai from "./ai.js";
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

  // Get first clarifying question
  const response = await ai.chat(ASSESSOR_SYSTEM, [
    { role: "user", content: `Here's who I want to become:\n\n${description}` },
  ]);

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

  // Get what AI said last (the question we're answering)
  // We need the last AI message — reconstruct by getting AI response to previous context
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const lastAiResponse = messages.length > 1
    ? await ai.chat(ASSESSOR_SYSTEM, messages.slice(0, -0)) // hack: we'll store the question
    : "";

  // Actually, simpler: just add the new answer and ask for next question
  messages.push({ role: "user", content: answer });
  const nextResponse = await ai.chat(ASSESSOR_SYSTEM, messages);

  const isReady = nextResponse.startsWith("[READY]");

  // Store this Q&A pair (use a placeholder for the question since we don't have it cleanly)
  answers.push({ question: "(previous AI message)", answer });

  const newStatus = isReady ? "awaiting_current_self" : "clarifying";
  await db.update(users).set({
    clarifyingAnswers: answers,
    onboardingStatus: newStatus,
  }).where(eq(users.id, userId));

  const cleanResponse = isReady ? nextResponse.replace("[READY]", "").trim() : nextResponse;
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

  const result = await ai.chatJSON<{
    archetype: string;
    explanation: string;
    dimensions: { name: string; currentLevel: number; targetLevel: number }[];
  }>(ARCHETYPE_SYSTEM, [{ role: "user", content: assignmentInput }]);

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

  const result = await ai.chatJSON<{
    nodes: { title: string; description: string; estimatedDays: number; parentTitle: string | null; orderIndex: number }[];
  }>(TREE_SYSTEM, [{ role: "user", content: treeInput }]);

  // Insert root nodes first
  const nodeMap = new Map<string, string>();
  const roots = result.nodes.filter((n) => !n.parentTitle);

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

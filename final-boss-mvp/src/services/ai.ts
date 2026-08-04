import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../config.js";

const anthropicClient = new Anthropic({ apiKey: config.anthropicKey });
const openaiClient = new OpenAI({ baseURL: config.aiBaseUrl, apiKey: config.openaiKey });

type Msg = { role: "user" | "assistant"; content: string };

export type UserAIConfig = {
  aiProvider: string;
  aiBaseUrl: string | null;
  aiApiKey: string;
  aiModel: string;
};

// Strip thinking/reasoning emitted by verbose models before the actual reply.
// Strategy: split into sentences, classify each as self-talk or user-facing,
// return the longest contiguous run of user-facing sentences.
function stripThinking(text: string): string {
  // 1. Tagged blocks (<think>...</think>)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trimStart();
  if (!text) return text;

  // 2. Split into sentences at punctuation boundaries followed by whitespace + uppercase
  const sentences = text.split(/(?<=[.?!])\s+(?=[A-Z])/);
  if (sentences.length <= 1) return text;

  const selfTalkRe = /^(the user|i need to|i should|i will|i must|i have to|my goal|my immediate|since i|since the|first step|next step|let me|now i|here'?s my|my approach|my plan|i'll |i can |okay|alright|\d+\.\s)/i;

  function isSelfTalk(s: string): boolean {
    const t = s.trim();
    if (!t) return true;
    if (selfTalkRe.test(t)) return true;
    // Sentence chunks that are part of a numbered list (end with \n<digit>. or contain \n<digit>.)
    if (/\n\d+\.\s*$/.test(s)) return true;
    // Numbered list items within a sentence chunk
    const lines = t.split("\n").filter((l) => l.trim());
    if (lines.length > 1 && lines.every((l) => /^\d+\.\s/.test(l.trim()))) return true;
    return false;
  }

  const classified = sentences.map((s) => ({ text: s, selfTalk: isSelfTalk(s) }));

  // Find longest contiguous run of non-self-talk sentences
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
  for (let i = 0; i < classified.length; i++) {
    if (!classified[i]!.selfTalk) {
      if (curStart === -1) curStart = i;
      curLen++;
      if (curLen > bestLen) { bestStart = curStart; bestLen = curLen; }
    } else {
      curStart = -1; curLen = 0;
    }
  }

  if (bestStart >= 0 && bestLen < sentences.length) {
    return classified.slice(bestStart, bestStart + bestLen).map((c) => c.text).join(" ").trim();
  }

  return text;
}

function getClients(userConfig?: UserAIConfig) {
  if (!userConfig) return { provider: config.aiProvider, model: config.aiModel, anthropic: anthropicClient, openai: openaiClient };
  const provider = userConfig.aiProvider;
  const model = userConfig.aiModel;
  const anthropic = provider === "anthropic"
    ? new Anthropic({ apiKey: userConfig.aiApiKey })
    : anthropicClient;
  const openai = provider === "openai"
    ? new OpenAI({ baseURL: userConfig.aiBaseUrl ?? undefined, apiKey: userConfig.aiApiKey })
    : openaiClient;
  return { provider, model, anthropic, openai };
}

export async function chat(system: string, messages: Msg[], userConfig?: UserAIConfig): Promise<string> {
  const { provider, model, anthropic, openai } = getClients(userConfig);

  if (provider === "openai") {
    const response = await openai.chat.completions.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "system", content: system }, ...messages],
    });
    const text = response.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error(`Unexpected response: ${JSON.stringify(response).slice(0, 200)}`);
    return stripThinking(text);
  }

  // anthropic path
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages,
  });
  const block = response.content[0];
  if (!block || block.type !== "text") throw new Error("Unexpected response");
  return block.text;
}

export async function chatJSON<T>(system: string, messages: Msg[], userConfig?: UserAIConfig): Promise<T> {
  const { provider, model, anthropic, openai } = getClients(userConfig);

  if (provider === "openai") {
    const response = await openai.chat.completions.create({
      model,
      max_tokens: 2048,
      messages: [
        {
          role: "system",
          content: system + "\n\nRespond with valid JSON only. No markdown fences, no explanation.",
        },
        ...messages,
      ],
      response_format: { type: "json_object" },
    });
    const text = response.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error(`Unexpected response: ${JSON.stringify(response).slice(0, 200)}`);
    return JSON.parse(stripThinking(text)) as T;
  }

  // anthropic path
  const response = await anthropic.messages.create({
    model,
    max_tokens: 2048,
    system: system + "\n\nRespond with valid JSON only. No markdown fences, no explanation.",
    messages,
  });
  const block = response.content[0];
  if (!block || block.type !== "text") throw new Error("Unexpected response");
  return JSON.parse(block.text) as T;
}

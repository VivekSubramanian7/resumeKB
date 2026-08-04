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
function stripThinking(text: string): string {
  // 1. Tagged blocks (<think>...</think>)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trimStart();
  if (!text) return text;

  // 2. Labeled prefix blocks: "Plan:", "Thinking Process:", "Analysis:", etc.
  //    Remove everything from the label up to a double-newline boundary before user-facing text.
  text = text.replace(/^(Plan|Thinking Process|Thinking|Analysis|Reasoning|Internal|Notes?|Step \d+)\s*:.*?(?=\n\n)/gis, "").trimStart();

  // 3. Split into paragraphs (double newline) and classify each
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  if (paragraphs.length <= 1) return text.trim();

  const selfTalkRe = /^(the user|they (are|have|currently|provided|feel|want)|i need to|i should|i will|i must|i have to|my (goal|immediate|first|next)|since (i|the)|first step|next step|let me|now i|here'?s my|my (approach|plan)|i'll |i can |okay|alright|goal:|focus:|next:|strategy:|\d+\.\s+\*\*)/im;

  function isSelfTalk(p: string): boolean {
    const t = p.trim();
    if (!t) return true;
    if (selfTalkRe.test(t)) return true;
    // Numbered list reasoning (1. **Bold label**: explanation)
    const lines = t.split("\n").filter((l) => l.trim());
    if (lines.length > 1 && lines.every((l) => /^\d+\.\s/.test(l.trim()))) return true;
    // Third-person narration about "the user" or "they"
    if (/^(they|the user)\b/i.test(t) && t.length < 200) return true;
    return false;
  }

  const classified = paragraphs.map((p) => ({ text: p, selfTalk: isSelfTalk(p) }));

  // Find longest contiguous run of non-self-talk paragraphs
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

  if (bestStart >= 0 && bestLen < paragraphs.length) {
    return classified.slice(bestStart, bestStart + bestLen).map((c) => c.text).join("\n\n").trim();
  }

  return text.trim();
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
    const noThinkSuffix = "\n\nIMPORTANT: Output ONLY your direct reply to the user. No thinking, no planning, no internal monologue, no labels like 'Plan:' or 'Analysis:'. Just your response.";
    const response = await openai.chat.completions.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "system", content: system + noThinkSuffix }, ...messages],
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

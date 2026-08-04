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

// ponytail: strip thinking emitted by reasoning/verbose models
// Handles: <think>...</think> blocks, and inline reasoning that ends before the real reply.
// Inline heuristic: thinking is self-referential ("The user...", "I need to...", "I will...",
// "I should...") and the actual response starts when the model addresses the user directly.
function stripThinking(text: string): string {
  // 1. Tagged blocks (<think>...</think>)
  text = text.replace(/<think>[\s\S]*?<\/think>/i, "").trimStart();

  // 2. Inline reasoning paragraphs — split on double newline, drop leading paragraphs
  // that are clearly self-talk (third-person refs to "the user" or first-person planning)
  const selfTalkPattern = /^(the user|i need to|i should|i will|i must|i have to|my goal|my immediate|since i|since the)/i;
  const parts = text.split(/\n{2,}/);
  const firstRealIdx = parts.findIndex((p) => !selfTalkPattern.test(p.trim()));
  if (firstRealIdx > 0) return parts.slice(firstRealIdx).join("\n\n").trimStart();

  // 3. No double-newline separator — find last sentence that ends thinking and slice after it.
  // Pattern: thinking ends with ". " or ".\n" immediately before the real reply starting with a capital.
  // Only do this if the whole text starts with self-talk.
  if (selfTalkPattern.test(text.trim())) {
    const match = text.match(/^[\s\S]*?\.\s*([A-Z].*)$/s);
    if (match?.[1]) return match[1].trimStart();
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
    const text = response.choices[0]?.message?.content ?? "";
    if (!text) throw new Error("Unexpected response");
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
    const text = response.choices[0]?.message?.content ?? "";
    if (!text) throw new Error("Unexpected response");
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

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../config.js";

const anthropicClient = new Anthropic({ apiKey: config.anthropicKey });
const openaiClient = new OpenAI({ baseURL: config.aiBaseUrl, apiKey: config.openaiKey });

type Msg = { role: "user" | "assistant"; content: string };

export async function chat(system: string, messages: Msg[]): Promise<string> {
  if (config.aiProvider === "openai") {
    const response = await openaiClient.chat.completions.create({
      model: config.aiModel,
      max_tokens: 1024,
      messages: [{ role: "system", content: system }, ...messages],
    });
    const text = response.choices[0]?.message?.content ?? "";
    if (!text) throw new Error("Unexpected response");
    return text;
  }

  // anthropic path — unchanged behavior
  const response = await anthropicClient.messages.create({
    model: config.aiModel,
    max_tokens: 1024,
    system,
    messages,
  });
  const block = response.content[0];
  if (!block || block.type !== "text") throw new Error("Unexpected response");
  return block.text;
}

export async function chatJSON<T>(system: string, messages: Msg[]): Promise<T> {
  if (config.aiProvider === "openai") {
    const response = await openaiClient.chat.completions.create({
      model: config.aiModel,
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
    return JSON.parse(text) as T;
  }

  // anthropic path — unchanged behavior
  const response = await anthropicClient.messages.create({
    model: config.aiModel,
    max_tokens: 2048,
    system: system + "\n\nRespond with valid JSON only. No markdown fences, no explanation.",
    messages,
  });
  const block = response.content[0];
  if (!block || block.type !== "text") throw new Error("Unexpected response");
  return JSON.parse(block.text) as T;
}

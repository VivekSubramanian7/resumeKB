import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

const client = new Anthropic({ apiKey: config.anthropicKey });

type Msg = { role: "user" | "assistant"; content: string };

export async function chat(system: string, messages: Msg[]): Promise<string> {
  const response = await client.messages.create({
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
  const response = await client.messages.create({
    model: config.aiModel,
    max_tokens: 2048,
    system: system + "\n\nRespond with valid JSON only. No markdown fences, no explanation.",
    messages,
  });
  const block = response.content[0];
  if (!block || block.type !== "text") throw new Error("Unexpected response");
  return JSON.parse(block.text) as T;
}

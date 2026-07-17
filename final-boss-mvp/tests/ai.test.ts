import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the openai module before importing ai.ts
const mockCreate = vi.fn();
vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// Mock config so aiProvider is always "openai" in these tests
vi.mock("../src/config.js", () => ({
  config: {
    aiProvider: "openai",
    aiModel: "test-model",
    aiBaseUrl: "http://localhost:1234/v1",
    openaiKey: "test-key",
    anthropicKey: "test-key",
    databaseUrl: "",
    telegramToken: "",
    port: 3000,
  },
}));

// Import after mocks are registered
const { chat, chatJSON } = await import("../src/services/ai.js");

describe("ai.ts – openai path", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("chat() calls client.chat.completions.create and returns the content string", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Hello from OpenAI" } }],
    });

    const result = await chat("sys", [{ role: "user", content: "hi" }]);

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result).toBe("Hello from OpenAI");
  });

  it("chatJSON() passes response_format json_object and parses JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"score":42}' } }],
    });

    const result = await chatJSON<{ score: number }>("sys", [
      { role: "user", content: "give json" },
    ]);

    const call = mockCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).toBeDefined();
    expect(call["response_format"]).toEqual({ type: "json_object" });
    expect(result).toEqual({ score: 42 });
  });

  it("chat() throws 'Unexpected response' when content is empty", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "" } }],
    });

    await expect(
      chat("sys", [{ role: "user", content: "hi" }])
    ).rejects.toThrow("Unexpected response");
  });

  it("chat() throws 'Unexpected response' when content is null", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    await expect(
      chat("sys", [{ role: "user", content: "hi" }])
    ).rejects.toThrow("Unexpected response");
  });
});

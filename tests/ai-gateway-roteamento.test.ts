import { describe, expect, it } from "vitest";
import { createGovernedModelGateway, isAnthropicModelId } from "@/lib/ai-gateway.server";

describe("roteamento do modelo governado", () => {
  const gateway = createGovernedModelGateway("chave-teste");

  it("anthropic/ vai para o provider Anthropic", () => {
    expect(isAnthropicModelId("anthropic/claude-haiku-4-5")).toBe(true);
    const m = gateway("anthropic/claude-haiku-4-5") as { provider: string; modelId: string };
    expect(m.provider).toMatch(/^anthropic/);
    expect(m.modelId).toBe("anthropic/claude-haiku-4-5");
  });

  it("google/ continua no openai-compatible", () => {
    expect(isAnthropicModelId("google/gemini-3-flash-preview")).toBe(false);
    const m = gateway("google/gemini-3-flash-preview") as { provider: string };
    expect(m.provider).toMatch(/^lovable/);
  });
});

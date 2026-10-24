import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defaultSettingsMiddleware, wrapLanguageModel, type LanguageModel } from "ai";

const GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev/v1";

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: GATEWAY_BASE_URL,
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

/** Claude pelo gateway do Lovable, na rota nativa /v1/messages (sem chave da Anthropic). */
export function createLovableAnthropicProvider(lovableApiKey: string) {
  return createAnthropic({
    baseURL: GATEWAY_BASE_URL,
    apiKey: lovableApiKey,
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

export function isAnthropicModelId(modelId: string): boolean {
  return modelId.startsWith("anthropic/");
}

/**
 * Recebe o model_id da governança e devolve o LanguageModel certo:
 * "anthropic/..." usa o provider Anthropic (raciocínio estendido desligado);
 * o resto continua no openai-compatible.
 */
export function createGovernedModelGateway(lovableApiKey: string) {
  let openaiCompat: ReturnType<typeof createLovableAiGatewayProvider> | null = null;
  let anthropic: ReturnType<typeof createLovableAnthropicProvider> | null = null;
  return (modelId: string): LanguageModel => {
    if (isAnthropicModelId(modelId)) {
      anthropic ??= createLovableAnthropicProvider(lovableApiKey);
      return wrapLanguageModel({
        model: anthropic(modelId),
        middleware: defaultSettingsMiddleware({
          settings: { providerOptions: { anthropic: { thinking: { type: "disabled" } } } },
        }),
      });
    }
    openaiCompat ??= createLovableAiGatewayProvider(lovableApiKey);
    return openaiCompat(modelId);
  };
}

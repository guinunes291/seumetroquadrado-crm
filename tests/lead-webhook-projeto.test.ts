import { describe, expect, it } from "vitest";
import { chatbotSemProdutoInformado } from "@/lib/lead-webhook-projeto";

describe("lead do chatbot sem empreendimento", () => {
  it("token de projeto, chatbot, sem empreendimento: entra sem projeto", () => {
    expect(chatbotSemProdutoInformado({ viaCampanha: false, origem: "chatbot", empreendimento: "" })).toBe(true);
  });
  it("chatbot que informa o empreendimento mantém o projeto", () => {
    expect(chatbotSemProdutoInformado({ viaCampanha: false, origem: "chatbot", empreendimento: "Jardim das Origens" })).toBe(false);
  });
  it("formulário do site pelo token do projeto mantém o projeto", () => {
    expect(chatbotSemProdutoInformado({ viaCampanha: false, origem: "site" })).toBe(false);
  });
  it("token de campanha não entra nessa regra", () => {
    expect(chatbotSemProdutoInformado({ viaCampanha: true, origem: "chatbot" })).toBe(false);
  });
});

// Respostas livres do formulário do Meta (perguntas próprias de cada campanha).
// Antes elas morriam no zod: chave desconhecida era descartada e o corretor
// ligava sem saber que o cliente é investidor ou aceita outra região.
import { describe, expect, it } from "vitest";
import {
  blocoCamposExtras,
  blocoObservacoesCorretor,
  validarPayloadLead,
} from "@/lib/webhook-lead-payload";

const BASE = { nome: "Leonel", telefone: "+5511976316748" };

describe("captura dos campos extras", () => {
  it("payload sem extras continua exatamente como hoje", () => {
    const r = validarPayloadLead({ ...BASE, faixaRenda: "De 4.700,00 a 8.000,00" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.camposExtras).toBeUndefined();
    expect(blocoCamposExtras(r.data.camposExtras)).toBeNull();
    expect(blocoObservacoesCorretor(r.data.camposExtras, null)).toBeNull();
  });

  it("objeto camposExtras vira lista rótulo/valor", () => {
    const r = validarPayloadLead({
      ...BASE,
      camposExtras: {
        "Seu interesse é somente na Vila Prudente?": "Aceito expandir o raio.",
        "Você pretende utilizar o imóvel para": "Investimento",
      },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.camposExtras).toEqual([
      { label: "Seu interesse é somente na Vila Prudente?", valor: "Aceito expandir o raio." },
      { label: "Você pretende utilizar o imóvel para", valor: "Investimento" },
    ]);
    expect(blocoCamposExtras(r.data.camposExtras)).toBe(
      "📝 Respostas do formulário:\n" +
        "• Seu interesse é somente na Vila Prudente?: Aceito expandir o raio.\n" +
        "• Você pretende utilizar o imóvel para: Investimento",
    );
  });

  it("chaves extra_* dão o mesmo resultado e não sobram no validado", () => {
    const r = validarPayloadLead({
      ...BASE,
      "extra_Você pretende utilizar o imóvel para": "Investimento",
      extra_Prefere_falar_por: "WhatsApp",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.camposExtras).toEqual([
      { label: "Você pretende utilizar o imóvel para", valor: "Investimento" },
      { label: "Prefere_falar_por", valor: "WhatsApp" },
    ]);
    expect(Object.keys(r.data).some((k) => k.startsWith("extra_"))).toBe(false);
  });

  it("valor raw snake_case sai legível", () => {
    const r = validarPayloadLead({
      ...BASE,
      camposExtras: { Interesse: "aceito_expandir_o_raio_para_outras_zonas_também." },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.camposExtras?.[0]?.valor).toBe(
      "Aceito expandir o raio para outras zonas também.",
    );
  });

  it("valores vazios ou não textuais são ignorados", () => {
    const r = validarPayloadLead({
      ...BASE,
      camposExtras: { A: "", B: null, C: { x: 1 }, D: 42, E: "ok" },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.camposExtras).toEqual([
      { label: "D", valor: "42" },
      { label: "E", valor: "ok" },
    ]);
  });

  it("mais de 15 extras corta em 15 sem erro", () => {
    const muitos: Record<string, string> = {};
    for (let i = 0; i < 30; i++) muitos[`Pergunta ${i}`] = `Resposta ${i}`;
    const r = validarPayloadLead({ ...BASE, camposExtras: muitos });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.camposExtras).toHaveLength(15);
  });
});

describe("bloco na notificação do corretor", () => {
  it("mostra os extras e acrescenta a finalidade quando não repetida", () => {
    const extras = [{ label: "Prefere falar por", valor: "WhatsApp" }];
    expect(blocoObservacoesCorretor(extras, "Moradia")).toBe(
      "📝 *Observações:*\n• Prefere falar por: WhatsApp\n• Finalidade: Moradia",
    );
  });

  it("não repete a finalidade já presente nos extras", () => {
    const extras = [{ label: "Você pretende utilizar o imóvel para", valor: "Investimento" }];
    expect(blocoObservacoesCorretor(extras, "Investimento")).toBe(
      "📝 *Observações:*\n• Você pretende utilizar o imóvel para: Investimento",
    );
  });
});

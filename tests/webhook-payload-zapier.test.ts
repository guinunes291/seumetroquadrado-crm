// Webhook público de leads — tolerância a payloads de terceiros (Zapier/Meta).
// Incidente 21/08: o Zap de Lead Ads mandava os campos crus do Meta
// (full_name, phone_number, email vazio, origem "Facebook") e o webhook
// respondia 400 "Invalid input", perdendo lead real de campanha. Contrato:
// esses payloads passam; só nome+telefone continuam inegociáveis.
import { describe, expect, it } from "vitest";
import { validarPayloadLead, normalizarPayloadExterno } from "@/lib/webhook-lead-payload";

describe("payload cru do Meta Lead Ads via Zapier", () => {
  it("full_name/phone_number/email vazio/origem 'Facebook' → lead válido", () => {
    const r = validarPayloadLead({
      full_name: "Maria da Silva",
      phone_number: "+5511987654321",
      email: "",
      origem: "Facebook",
      empreendimento: "Vibra Itaquera",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.nome).toBe("Maria da Silva");
    expect(r.data.telefone).toBe("+5511987654321");
    expect(r.data.origem).toBe("facebook");
    expect(r.data.email ?? null).toBeNull();
    expect(r.data.empreendimento).toBe("Vibra Itaquera");
  });

  it("e-mail malformado degrada para null em vez de derrubar o lead", () => {
    const r = validarPayloadLead({
      nome: "João",
      telefone: "11987654321",
      email: "sem email",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.email ?? null).toBeNull();
  });

  it("origem desconhecida cai no default 'outro' em vez de 400", () => {
    const r = validarPayloadLead({
      nome: "João",
      telefone: "11987654321",
      origem: "Meta Ads",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.origem).toBe("outro");
  });

  it("booleans serializados como string ('true'/'false') são aceitos", () => {
    const r = validarPayloadLead({
      nome: "João",
      telefone: "11987654321",
      distribuir: "false",
      aceitouVisita: "true",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.distribuir).toBe(false);
    expect(r.data.aceitouVisita).toBe(true);
  });
});

describe("contrato preferencial segue intacto", () => {
  it("payload documentado (nome/telefone/origem/faixaRenda/zona) passa igual", () => {
    const r = validarPayloadLead({
      nome: "Ana",
      telefone: "11912345678",
      origem: "facebook",
      faixaRenda: "R$ 3.000 a R$ 4.000",
      zona: "Leste",
      bairro: "Tatuapé",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.zona).toBe("Leste");
  });

  it("nome explícito vence o alias (não sobrescreve dado presente)", () => {
    const r = validarPayloadLead({
      nome: "Nome Certo",
      full_name: "Outro Nome",
      telefone: "11912345678",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.nome).toBe("Nome Certo");
  });
});

describe("o que identifica o lead continua obrigatório", () => {
  it("sem nome (em nenhum alias) → 400", () => {
    expect(validarPayloadLead({ telefone: "11987654321" }).success).toBe(false);
  });

  it("telefone dummy do Meta (menos de 10 dígitos) → 400", () => {
    expect(validarPayloadLead({ nome: "Teste", telefone: "12345" }).success).toBe(false);
  });

  it("não muta o objeto original", () => {
    const original = { full_name: "Maria", phone_number: "11987654321", email: "" };
    normalizarPayloadExterno(original);
    expect(original).toEqual({ full_name: "Maria", phone_number: "11987654321", email: "" });
  });
});

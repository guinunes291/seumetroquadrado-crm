import { describe, expect, it } from "vitest";
import { blocosVisiveis, cpfValido, primeiroNome, snapshotSchema, statusProposta } from "@/lib/proposta-link";

const base = {
  modelo: "proposta" as const,
  cliente_primeiro_nome: "João",
  corretor: { nome: "Ana", foto_url: null, whatsapp: null },
  projeto: { id: null, nome: "Parque", construtora: null, capa_url: null, entrega: null, endereco: null, preco_a_partir: null },
  blocos: ["capa", "diferenciais", "fluxo", "aceite", "visita"],
  fluxos: [{ titulo: "A", valor_total: 300000 }],
};

describe("link de proposta", () => {
  it("aceita no máximo 3 opções de fluxo", () => {
    const f = { titulo: "X", valor_total: 1 };
    expect(snapshotSchema.safeParse({ ...base, fluxos: [f, f, f] }).success).toBe(true);
    expect(snapshotSchema.safeParse({ ...base, fluxos: [f, f, f, f] }).success).toBe(false);
  });
  it("apresentação não leva valores", () => {
    expect(snapshotSchema.safeParse({ ...base, modelo: "apresentacao" }).success).toBe(false);
  });
  it("snapshot só aceita primeiro nome, nunca telefone", () => {
    expect(snapshotSchema.safeParse({ ...base, cliente_primeiro_nome: "11999998888" }).success).toBe(false);
    expect(primeiroNome("Maria Silva Souza")).toBe("Maria");
  });
  it("bloco sem dado não aparece", () => {
    const s = snapshotSchema.parse(base);
    expect(blocosVisiveis(s)).toEqual(["capa", "fluxo", "aceite"]);
  });
  it("status segue aceite, revogação, expiração e leitura", () => {
    const p = { revogado_em: null, aceita_em: null, expira_em: "2999-01-01", total_aberturas: 0, leitura_pct: null };
    expect(statusProposta(p)).toBe("Enviada");
    expect(statusProposta({ ...p, total_aberturas: 2, leitura_pct: 64.4 })).toBe("Lida 64%");
    expect(statusProposta({ ...p, expira_em: "2000-01-01" })).toBe("Expirada");
    expect(statusProposta({ ...p, aceita_em: "x", revogado_em: "y" })).toBe("Aceita");
  });
  it("valida CPF", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("111.111.111-11")).toBe(false);
  });
});

import { validadeMaxima } from "@/lib/proposta-link";
describe("validade do link", () => {
  it("proposta enviada dia 25 vence no dia 4 do mês seguinte, 23:59 de Brasília", () => {
    expect(validadeMaxima("proposta", new Date("2026-10-25T15:00:00Z")).toISOString()).toBe("2026-11-05T02:59:59.000Z");
  });
  it("proposta enviada dia 5 para em 15 dias", () => {
    expect(validadeMaxima("proposta", new Date("2026-10-05T15:00:00Z")).toISOString()).toBe("2026-10-20T15:00:00.000Z");
  });
  it("dezembro vira para janeiro", () => {
    expect(validadeMaxima("proposta", new Date("2026-12-28T12:00:00Z")).toISOString()).toBe("2027-01-05T02:59:59.000Z");
  });
  it("apresentação vale 30 dias", () => {
    expect(validadeMaxima("apresentacao", new Date("2026-10-25T15:00:00Z")).toISOString()).toBe("2026-11-24T15:00:00.000Z");
  });
});

import { describe, expect, it } from "vitest";

import { parseFilaFollowUp } from "@/features/followup/fila-client";

const UUID = "3f1c2d34-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const UUID2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function itemValido(over: Record<string, unknown> = {}) {
  return {
    id: UUID,
    nome: "Maria Souza",
    telefone: "11999990000",
    email: null,
    status: "em_atendimento",
    temperatura: "morno",
    origem: "facebook",
    projeto_id: null,
    projeto_nome: null,
    corretor_id: UUID2,
    created_at: "2026-08-01T12:00:00Z",
    ultima_interacao: null,
    proxima_acao: null,
    proximo_followup: "2026-08-27T09:00:00Z",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
    observacoes: null,
    minutos_vencido: 90,
    tentativas: 4,
    respondeu: false,
    ...over,
  };
}

function payload(itens: unknown[]) {
  return { gerado_em: "2026-08-27T12:00:00Z", corretor_id: UUID2, itens };
}

describe("parseFilaFollowUp (fail-closed)", () => {
  it("aceita o shape da followup_fila_v1 e preserva os campos da régua", () => {
    const fila = parseFilaFollowUp(
      payload([itemValido(), itemValido({ id: UUID2, respondeu: true })]),
    );
    expect(fila.itens).toHaveLength(2);
    expect(fila.itens[0].tentativas).toBe(4);
    expect(fila.itens[0].minutos_vencido).toBe(90);
    expect(fila.itens[1].respondeu).toBe(true);
  });

  it("fila vazia é válida", () => {
    expect(parseFilaFollowUp(payload([])).itens).toEqual([]);
  });

  it("UM item malformado derruba o parse inteiro (nunca fila parcial)", () => {
    expect(() =>
      parseFilaFollowUp(payload([itemValido(), itemValido({ id: UUID2, tentativas: "quatro" })])),
    ).toThrow();
    expect(() => parseFilaFollowUp(payload([itemValido({ telefone: null })]))).toThrow();
    expect(() => parseFilaFollowUp(payload([itemValido({ respondeu: "sim" })]))).toThrow();
  });

  it("tentativas/minutos_vencido negativos são inválidos (contrato da RPC)", () => {
    expect(() => parseFilaFollowUp(payload([itemValido({ tentativas: -1 })]))).toThrow();
    expect(() => parseFilaFollowUp(payload([itemValido({ minutos_vencido: -5 })]))).toThrow();
  });

  it("envelope sem itens ou sem corretor é inválido", () => {
    expect(() => parseFilaFollowUp({ gerado_em: "x", corretor_id: UUID2 })).toThrow();
    expect(() => parseFilaFollowUp(null)).toThrow();
  });
});

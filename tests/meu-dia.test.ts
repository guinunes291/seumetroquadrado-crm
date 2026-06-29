import { describe, it, expect } from "vitest";
import {
  filtrarSemAcao,
  tarefaAtrasada,
  contarTarefasAtrasadas,
  somarAtividades,
  telDigits,
  type LeadSemAcaoInput,
} from "@/lib/meu-dia";

const AGORA = new Date("2026-06-29T12:00:00.000Z");

function lead(over: Partial<LeadSemAcaoInput> & { id: string }): LeadSemAcaoInput {
  return {
    nome: "Lead",
    telefone: null,
    status: "em_atendimento",
    temperatura: "morno",
    proximo_followup: null,
    ultima_interacao: null,
    ...over,
  };
}

describe("filtrarSemAcao", () => {
  it("remove leads com tarefa, agenda ou follow-up futuro; mantém os demais", () => {
    const leads = [
      lead({ id: "a" }), // sem nada → fica
      lead({ id: "b" }), // tem tarefa → sai
      lead({ id: "c" }), // tem agenda → sai
      lead({ id: "d", proximo_followup: "2026-06-30T12:00:00Z" }), // follow-up futuro → sai
      lead({ id: "e", proximo_followup: "2026-06-28T12:00:00Z" }), // follow-up vencido → fica
    ];
    const r = filtrarSemAcao(leads, new Set(["b"]), new Set(["c"]), AGORA);
    expect(r.map((l) => l.id).sort()).toEqual(["a", "e"]);
  });

  it("ordena por score de prioridade (desc) e anexa _score", () => {
    const leads = [
      lead({ id: "frio", temperatura: "frio", status: "novo" }),
      lead({ id: "quente", temperatura: "quente", status: "analise_credito" }),
    ];
    const r = filtrarSemAcao(leads, new Set(), new Set(), AGORA);
    expect(r[0].id).toBe("quente");
    expect(r[0]._score.score).toBeGreaterThan(r[1]._score.score);
  });

  it("não fatia o resultado (deixa o limite para o chamador)", () => {
    const leads = Array.from({ length: 20 }, (_, i) => lead({ id: String(i) }));
    expect(filtrarSemAcao(leads, new Set(), new Set(), AGORA)).toHaveLength(20);
  });
});

describe("tarefas atrasadas", () => {
  it("tarefaAtrasada: true só com prazo no passado", () => {
    expect(tarefaAtrasada(null, AGORA)).toBe(false);
    expect(tarefaAtrasada("2026-06-28T12:00:00Z", AGORA)).toBe(true);
    expect(tarefaAtrasada("2026-06-30T12:00:00Z", AGORA)).toBe(false);
    expect(tarefaAtrasada("data-invalida", AGORA)).toBe(false);
  });

  it("contarTarefasAtrasadas conta apenas as vencidas", () => {
    const tarefas = [
      { data_vencimento: "2026-06-28T12:00:00Z" },
      { data_vencimento: "2026-07-01T12:00:00Z" },
      { data_vencimento: null },
    ];
    expect(contarTarefasAtrasadas(tarefas, AGORA)).toBe(1);
  });
});

describe("somarAtividades", () => {
  it("soma colunas e converte vgv_dia (string/number)", () => {
    const t = somarAtividades([
      {
        ligacoes: 2,
        whatsapps: 3,
        agendamentos: 1,
        visitas: 0,
        documentacoes: 1,
        vendas: 0,
        vgv_dia: "100000",
        pontuacao_total: 50,
      },
      {
        ligacoes: 1,
        whatsapps: 0,
        agendamentos: 0,
        visitas: 1,
        documentacoes: 0,
        vendas: 1,
        vgv_dia: 250000,
        pontuacao_total: 1000,
      },
    ]);
    expect(t.ligacoes).toBe(3);
    expect(t.whatsapps).toBe(3);
    expect(t.visitas).toBe(1);
    expect(t.vendas).toBe(1);
    expect(t.vgv).toBe(350000);
    expect(t.pontos).toBe(1050);
  });

  it("array vazio → tudo zero", () => {
    expect(somarAtividades([]).vgv).toBe(0);
  });
});

describe("telDigits", () => {
  it("extrai dígitos e trata vazio/nulo", () => {
    expect(telDigits("(11) 99999-8888")).toBe("11999998888");
    expect(telDigits(null)).toBe("");
    expect(telDigits(undefined)).toBe("");
    expect(telDigits("   ")).toBe("");
  });
});

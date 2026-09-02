/**
 * Metas do dia (popup obrigatório + card de progresso) — lógica pura.
 *
 * O que estes testes blindam:
 *  - o "dia" é o de São Paulo, não o do aparelho (às 23h de Brasília o UTC já
 *    é amanhã; um corretor em Lisboa não pode ganhar um dia novo às 20h);
 *  - a semana é seg–dom e a meta semanal só é herdada dentro da mesma semana;
 *  - o popup bloqueia em dia útil e é opcional no fim de semana;
 *  - o realizado segue as regras combinadas (visita/reunião não automática e
 *    não cancelada; vendas pendentes+aprovadas sem distrato).
 */
import { describe, expect, it } from "vitest";
import {
  contarAgendamentos,
  contarVendasSemana,
  diaSaoPaulo,
  ehDiaUtil,
  fimSemana,
  inicioSemana,
  limitesDoDia,
  metasRecemBatidas,
  normalizarMeta,
  popupBloqueante,
  precisaResponder,
  progresso,
  progressoDasMetas,
  sugestaoInicial,
  type MetaDia,
} from "@/features/metas-dia/metas-dia";

const meta = (over: Partial<MetaDia> = {}): MetaDia => ({
  dia: "2026-09-02",
  semana_inicio: "2026-08-31",
  meta_agendamentos: 3,
  meta_documentacoes: 2,
  meta_vendas_semana: 1,
  ...over,
});

describe("diaSaoPaulo", () => {
  it("usa o fuso da operação, não o UTC", () => {
    // 02/09 23:30 em Brasília = 03/09 02:30 UTC — o dia ainda é 02/09.
    expect(diaSaoPaulo(new Date("2026-09-03T02:30:00Z"))).toBe("2026-09-02");
    // 03/09 03:00 UTC = 03/09 00:00 em Brasília — virou o dia.
    expect(diaSaoPaulo(new Date("2026-09-03T03:00:00Z"))).toBe("2026-09-03");
  });
});

describe("semana seg–dom", () => {
  it("quarta 02/09/2026 pertence à semana de segunda 31/08", () => {
    expect(inicioSemana("2026-09-02")).toBe("2026-08-31");
    expect(fimSemana("2026-09-02")).toBe("2026-09-06");
  });
  it("domingo fecha a semana anterior, segunda abre a nova", () => {
    expect(inicioSemana("2026-09-06")).toBe("2026-08-31");
    expect(inicioSemana("2026-09-07")).toBe("2026-09-07");
  });
  it("atravessa a virada de mês e de ano", () => {
    expect(inicioSemana("2026-10-01")).toBe("2026-09-28");
    expect(inicioSemana("2027-01-01")).toBe("2026-12-28");
  });
  it("dia útil = segunda a sexta", () => {
    expect(ehDiaUtil("2026-09-04")).toBe(true); // sexta
    expect(ehDiaUtil("2026-09-05")).toBe(false); // sábado
    expect(ehDiaUtil("2026-09-06")).toBe(false); // domingo
    expect(ehDiaUtil("2026-09-07")).toBe(true); // segunda
  });
  it("limites do dia carregam o fuso -03:00", () => {
    expect(limitesDoDia("2026-09-02")).toEqual({
      ini: "2026-09-02T00:00:00.000-03:00",
      fim: "2026-09-02T23:59:59.999-03:00",
    });
  });
});

describe("precisaResponder / popupBloqueante", () => {
  it("só corretor responde", () => {
    expect(
      precisaResponder({
        dia: "2026-09-02",
        ehCorretor: false,
        respostaHoje: null,
        puladoHoje: false,
      }),
    ).toBe(false);
  });
  it("abre quando não há resposta de hoje", () => {
    expect(
      precisaResponder({
        dia: "2026-09-02",
        ehCorretor: true,
        respostaHoje: null,
        puladoHoje: false,
      }),
    ).toBe(true);
  });
  it("não abre de novo depois de responder (em qualquer aparelho)", () => {
    expect(
      precisaResponder({
        dia: "2026-09-02",
        ehCorretor: true,
        respostaHoje: meta(),
        puladoHoje: false,
      }),
    ).toBe(false);
  });
  it("em dia útil, pular não é aceito; no fim de semana, é", () => {
    expect(
      precisaResponder({
        dia: "2026-09-02",
        ehCorretor: true,
        respostaHoje: null,
        puladoHoje: true,
      }),
    ).toBe(true);
    expect(
      precisaResponder({
        dia: "2026-09-05",
        ehCorretor: true,
        respostaHoje: null,
        puladoHoje: true,
      }),
    ).toBe(false);
    expect(popupBloqueante("2026-09-02")).toBe(true);
    expect(popupBloqueante("2026-09-05")).toBe(false);
  });
});

describe("sugestaoInicial", () => {
  it("sem histórico e sem gestor: zeros", () => {
    expect(sugestaoInicial({ dia: "2026-09-02", ultima: null, gestor: null })).toEqual({
      meta_agendamentos: 0,
      meta_documentacoes: 0,
      meta_vendas_semana: 0,
    });
  });
  it("sem histórico: usa a sugestão do gestor (vendas diárias × 5 dias úteis)", () => {
    expect(
      sugestaoInicial({
        dia: "2026-09-02",
        ultima: null,
        gestor: { meta_agendamentos: 4, meta_vendas: 1 },
      }),
    ).toEqual({ meta_agendamentos: 4, meta_documentacoes: 0, meta_vendas_semana: 5 });
  });
  it("com resposta de ontem na mesma semana: herda tudo, inclusive a meta semanal", () => {
    const ontem = meta({ dia: "2026-09-01", meta_vendas_semana: 2 });
    expect(
      sugestaoInicial({
        dia: "2026-09-02",
        ultima: ontem,
        gestor: { meta_agendamentos: 9, meta_vendas: 9 },
      }),
    ).toEqual({ meta_agendamentos: 3, meta_documentacoes: 2, meta_vendas_semana: 2 });
  });
  it("virou a semana: a meta semanal da resposta anterior vira só sugestão", () => {
    const sexta = meta({ dia: "2026-09-04", meta_vendas_semana: 2 });
    const r = sugestaoInicial({ dia: "2026-09-07", ultima: sexta, gestor: null });
    expect(r.meta_vendas_semana).toBe(2);
    expect(r.meta_agendamentos).toBe(3);
  });
});

describe("normalizarMeta", () => {
  it("aceita zero e descarta lixo", () => {
    expect(normalizarMeta("")).toBe(0);
    expect(normalizarMeta("abc")).toBe(0);
    expect(normalizarMeta(-3)).toBe(0);
    expect(normalizarMeta("2.9")).toBe(2);
    expect(normalizarMeta(4)).toBe(4);
  });
});

describe("progresso", () => {
  it("meta zero nunca é batida nem produz NaN", () => {
    expect(progresso(0, 0)).toEqual({ realizado: 0, meta: 0, pct: 0, batida: false });
    expect(progresso(3, 0).pct).toBe(0);
  });
  it("satura em 100% e marca batida", () => {
    expect(progresso(1, 3)).toEqual({ realizado: 1, meta: 3, pct: 33, batida: false });
    expect(progresso(5, 3)).toEqual({ realizado: 5, meta: 3, pct: 100, batida: true });
  });
  it("metasRecemBatidas detecta só a transição, e nada no primeiro carregamento", () => {
    const antes = progressoDasMetas(meta(), {
      agendamentos: 2,
      documentacoes: 2,
      vendas_semana: 0,
      vendas_pendentes: 0,
    });
    const depois = progressoDasMetas(meta(), {
      agendamentos: 3,
      documentacoes: 2,
      vendas_semana: 0,
      vendas_pendentes: 0,
    });
    expect(metasRecemBatidas(null, depois)).toEqual([]);
    expect(metasRecemBatidas(antes, depois)).toEqual(["agendamentos"]);
    expect(metasRecemBatidas(depois, depois)).toEqual([]);
  });
});

describe("realizado", () => {
  it("agendamento conta visita/reunião criada pelo corretor, não cancelada", () => {
    const base = { status: "agendado", auto_gerado: false, deleted_at: null };
    expect(
      contarAgendamentos([
        { ...base, tipo: "visita" },
        { ...base, tipo: "reuniao" },
        { ...base, tipo: "ligacao" }, // outro tipo
        { ...base, tipo: "follow_up" },
        { ...base, tipo: "visita", auto_gerado: true }, // gerado pelo sistema
        { ...base, tipo: "visita", status: "cancelado" }, // desfeito
        { ...base, tipo: "visita", deleted_at: "2026-09-02T12:00:00Z" }, // soft-delete
        { ...base, tipo: "visita", status: "confirmado" }, // confirmado ainda conta
      ]),
    ).toBe(3);
  });
  it("vendas da semana: pendente + aprovada, sem distrato", () => {
    expect(
      contarVendasSemana([
        { status_venda: "pendente", distrato: false },
        { status_venda: "aprovada", distrato: false },
        { status_venda: "aprovada", distrato: true },
        { status_venda: "rejeitada", distrato: false },
        { status_venda: "cancelada", distrato: false },
        { status_venda: "rascunho", distrato: false },
      ]),
    ).toEqual({ total: 2, pendentes: 1 });
  });
});

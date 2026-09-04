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

// ---------------------------------------------------------------------------
// Fase 2 — conversão, contatos necessários, balanço e checkpoints
// ---------------------------------------------------------------------------
import {
  avaliarCheckpoint,
  balancoDoDia,
  checkpointDevido,
  contatosNecessarios,
  diasUteisRestantesSemana,
  horaSaoPaulo,
  mensagemCheckpoint,
  normalizarTaxasRpc,
  ritmoEsperado,
  rotuloDoDia,
  taxasConversao,
  umACada,
  type TaxasRpc,
} from "@/features/metas-dia/metas-dia";

const rpc = (over: Partial<TaxasRpc> = {}): TaxasRpc => ({
  dias: 30,
  minhas: { contatos: 100, agendamentos: 10, documentacoes: 5, vendas: 2 },
  time: { contatos: 1000, agendamentos: 50, documentacoes: 20, vendas: 5 },
  corretores: 8,
  ...over,
});

describe("taxasConversao", () => {
  it("normaliza o jsonb da RPC e rejeita shape errado", () => {
    expect(normalizarTaxasRpc(null)).toBeNull();
    expect(normalizarTaxasRpc({ minhas: {} })).toBeNull();
    expect(
      normalizarTaxasRpc({
        dias: "30",
        minhas: { contatos: "7", agendamentos: 1, documentacoes: null, vendas: 0 },
        time: { contatos: 10, agendamentos: 2, documentacoes: 1, vendas: 1 },
        corretores: 3,
      }),
    ).toEqual({
      dias: 30,
      minhas: { contatos: 7, agendamentos: 1, documentacoes: 0, vendas: 0 },
      time: { contatos: 10, agendamentos: 2, documentacoes: 1, vendas: 1 },
      corretores: 3,
    });
  });
  it("com 20+ contatos usa a taxa própria", () => {
    const t = taxasConversao(rpc());
    expect(t.fonte).toBe("minha");
    expect(t.agendamento_por_contato).toBeCloseTo(0.1);
    expect(umACada(t.agendamento_por_contato)).toBe(10);
    expect(umACada(t.documentacao_por_contato)).toBe(20);
    expect(umACada(t.venda_por_contato)).toBe(50);
  });
  it("com menos de 20 contatos cai na taxa do time e avisa a fonte", () => {
    const t = taxasConversao(
      rpc({ minhas: { contatos: 8, agendamentos: 3, documentacoes: 1, vendas: 0 } }),
    );
    expect(t.fonte).toBe("time");
    expect(umACada(t.agendamento_por_contato)).toBe(20);
  });
  it("sem contatos em lugar nenhum: fonte null e taxas null", () => {
    const t = taxasConversao(
      rpc({
        minhas: { contatos: 0, agendamentos: 0, documentacoes: 0, vendas: 0 },
        time: { contatos: 0, agendamentos: 0, documentacoes: 0, vendas: 0 },
      }),
    );
    expect(t.fonte).toBeNull();
    expect(t.agendamento_por_contato).toBeNull();
    expect(taxasConversao(null).fonte).toBeNull();
  });
  it("resultado zero com contatos não vira taxa zero (impossível projetar)", () => {
    const t = taxasConversao(
      rpc({ minhas: { contatos: 40, agendamentos: 4, documentacoes: 0, vendas: 0 } }),
    );
    expect(t.fonte).toBe("minha");
    expect(t.documentacao_por_contato).toBeNull();
  });
});

describe("contatosNecessarios", () => {
  const taxas = taxasConversao(rpc()); // 1 ag / 10 contatos; 1 doc / 20; 1 venda / 50
  it("é o maior entre as três necessidades", () => {
    const r = contatosNecessarios(
      { meta_agendamentos: 3, meta_documentacoes: 1, meta_vendas_semana: 1 },
      taxas,
      0,
      "2026-09-02", // quarta: restam 3 dias úteis
    );
    expect(r.agendamentos).toBe(30);
    expect(r.documentacoes).toBe(20);
    expect(r.vendas).toBe(17); // ceil(1 / 0.02 / 3)
    expect(r.total).toBe(30);
  });
  it("meta zero pede zero contatos; vendas já batidas na semana também", () => {
    const r = contatosNecessarios(
      { meta_agendamentos: 0, meta_documentacoes: 0, meta_vendas_semana: 2 },
      taxas,
      2,
      "2026-09-02",
    );
    expect(r).toEqual({ agendamentos: 0, documentacoes: 0, vendas: 0, vendas_faltam: 0, total: 0 });
  });
  it("sem taxa: null, não NaN nem zero falso", () => {
    const r = contatosNecessarios(
      { meta_agendamentos: 3, meta_documentacoes: 0, meta_vendas_semana: 0 },
      taxasConversao(null),
      0,
      "2026-09-02",
    );
    expect(r.agendamentos).toBeNull();
    expect(r.total).toBeNull();
  });
  it("dias úteis restantes: seg=5 … sex=1, fim de semana=0 (cálculo usa mínimo 1)", () => {
    expect(diasUteisRestantesSemana("2026-09-07")).toBe(5);
    expect(diasUteisRestantesSemana("2026-09-04")).toBe(1);
    expect(diasUteisRestantesSemana("2026-09-05")).toBe(0);
    const sab = contatosNecessarios(
      { meta_agendamentos: 0, meta_documentacoes: 0, meta_vendas_semana: 1 },
      taxas,
      0,
      "2026-09-05",
    );
    expect(sab.vendas).toBe(50);
  });
});

describe("balancoDoDia", () => {
  const realizado = { agendamentos: 2, documentacoes: 2, vendas_semana: 1, vendas_pendentes: 1 };
  it("lista o que faltou e o que foi batido, ignorando metas zero", () => {
    const b = balancoDoDia(
      meta({ dia: "2026-09-01", meta_documentacoes: 0 }),
      realizado,
      "2026-09-02",
    );
    expect(b.itens).toEqual([
      { chave: "agendamentos", meta: 3, realizado: 2, faltou: 1, batida: false },
    ]);
    expect(b.vendas.semana_encerrada).toBe(false);
    expect(b.pct_geral).toBe(67);
  });
  it("na segunda, a semana de sexta já fechou e as vendas entram no balanço", () => {
    const sexta = meta({ dia: "2026-09-04", semana_inicio: "2026-08-31", meta_vendas_semana: 2 });
    const b = balancoDoDia(sexta, realizado, "2026-09-07");
    expect(b.vendas.semana_encerrada).toBe(true);
    expect(b.vendas.faltou).toBe(1);
    // ag 67% + doc 100% + vendas 50% = 72%
    expect(b.pct_geral).toBe(72);
  });
  it("rotuloDoDia: ontem, senão dia da semana com data", () => {
    expect(rotuloDoDia("2026-09-01", "2026-09-02")).toBe("ontem");
    expect(rotuloDoDia("2026-09-04", "2026-09-07")).toBe("sexta-feira (04/09)");
  });
});

describe("checkpoints", () => {
  it("hora em São Paulo, não em UTC", () => {
    expect(horaSaoPaulo(new Date("2026-09-02T18:30:00Z"))).toBe(15);
    expect(horaSaoPaulo(new Date("2026-09-03T02:59:00Z"))).toBe(23);
  });
  it("ritmo esperado: 9h=0%, 12h=33%, 15h=67%, 18h+=100%", () => {
    expect(ritmoEsperado(8)).toBe(0);
    expect(ritmoEsperado(12)).toBeCloseTo(1 / 3);
    expect(ritmoEsperado(15)).toBeCloseTo(2 / 3);
    expect(ritmoEsperado(20)).toBe(1);
  });
  it("dispara só o último checkpoint passado, uma vez, e nunca antes da declaração", () => {
    expect(checkpointDevido(11, [], null)).toBeNull();
    expect(checkpointDevido(12, [], null)).toBe(12);
    expect(checkpointDevido(16, [], null)).toBe(15); // abriu às 16h: só o das 15h
    expect(checkpointDevido(16, [12, 15], null)).toBeNull();
    expect(checkpointDevido(17, [12, 15], null)).toBe(17);
    expect(checkpointDevido(16, [], 16)).toBeNull(); // declarou às 16h
    expect(checkpointDevido(17, [], 16)).toBe(17);
  });
  it("avaliação: compara com o esperado para a hora", () => {
    const av = avaliarCheckpoint(
      meta(),
      { agendamentos: 1, documentacoes: 2, vendas_semana: 0, vendas_pendentes: 0 },
      15,
    );
    // 15h = 67%: esperado ceil(3*0.67)=2 agendamentos (tem 1 → atrasada); doc ceil(2*0.67)=2 (tem 2 → ok)
    expect(av.esperado_pct).toBe(67);
    expect(av.itens.find((i) => i.chave === "agendamentos")).toMatchObject({
      esperado: 2,
      atrasada: true,
      faltam: 2,
    });
    expect(av.atrasadas).toBe(1);
  });
  it("mensagem: atenção quando atrasada, com sugestão de contatos pela taxa", () => {
    const av = avaliarCheckpoint(
      meta(),
      { agendamentos: 1, documentacoes: 2, vendas_semana: 0, vendas_pendentes: 0 },
      15,
    );
    const m = mensagemCheckpoint(av, taxasConversao(rpc()));
    expect(m?.tom).toBe("atencao");
    expect(m?.titulo).toBe("Ritmo abaixo da meta às 15h");
    expect(m?.mensagem).toContain("Faltam 2 agendamentos");
    expect(m?.mensagem).toContain("≈ 20 contatos");
  });
  it("mensagem: ok no ritmo; batidas quando tudo fechou; null sem meta", () => {
    const ok = mensagemCheckpoint(
      avaliarCheckpoint(
        meta(),
        { agendamentos: 2, documentacoes: 2, vendas_semana: 0, vendas_pendentes: 0 },
        12,
      ),
    );
    expect(ok?.tom).toBe("ok");
    expect(ok?.titulo).toBe("No ritmo às 12h");
    const fechou = mensagemCheckpoint(
      avaliarCheckpoint(
        meta(),
        { agendamentos: 3, documentacoes: 2, vendas_semana: 0, vendas_pendentes: 0 },
        17,
      ),
    );
    expect(fechou?.titulo).toBe("Metas de hoje batidas às 17h");
    expect(
      mensagemCheckpoint(
        avaliarCheckpoint(
          meta({ meta_agendamentos: 0, meta_documentacoes: 0 }),
          { agendamentos: 0, documentacoes: 0, vendas_semana: 0, vendas_pendentes: 0 },
          12,
        ),
      ),
    ).toBeNull();
  });
});

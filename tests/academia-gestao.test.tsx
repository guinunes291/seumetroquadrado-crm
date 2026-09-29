import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatarIndicador,
  itensDaRubrica,
  leituraDoEfeito,
  origemDoSelo,
  percentualPorFase,
  pontuacaoDaRubrica,
  resultadoDaRubrica,
  resumoDoGate,
  semAtividade,
  tempoDeEspera,
} from "@/features/academia/gestao/derivacao";
import { mensagemDaGestao } from "@/features/academia/gestao/mensagens";
import { vetoDeInscricao } from "@/features/academia/gestao/aba-participantes";
import { questaoValida } from "@/features/academia/gestao/conteudo-modulo-page";
import { somarDias } from "@/features/academia/gestao/aba-recomendacoes";
import { inicioIso, partesBrasilia } from "@/features/academia/gestao/aba-encontros";
import { estaHabilitado } from "@/features/academia/selo-habilitado";
import { podeGerirAcademia } from "@/features/academia/use-flags-nav";

describe("tempo de espera da prática", () => {
  const agora = new Date("2026-09-29T15:00:00Z");
  it("hh:mm até 24 horas", () => {
    expect(tempoDeEspera("2026-09-29T13:25:00Z", agora)).toBe("01:35");
    expect(tempoDeEspera("2026-09-28T15:01:00Z", agora)).toBe("23:59");
  });
  it("dias depois disso", () => {
    expect(tempoDeEspera("2026-09-28T15:00:00Z", agora)).toBe("1 dia");
    expect(tempoDeEspera("2026-09-25T10:00:00Z", agora)).toBe("4 dias");
  });
});

describe("time", () => {
  it("percentual por fase, e fase sem obrigatório fica sem número", () => {
    const m = percentualPorFase([
      { corretor_id: "a", fase: 0, obrigatorios: 1, concluidos: 1, completa: true },
      { corretor_id: "a", fase: 1, obrigatorios: 4, concluidos: 1, completa: false },
      { corretor_id: "a", fase: 4, obrigatorios: 0, concluidos: 0, completa: false },
    ]);
    expect(m.get("a")?.get(0)).toBe(100);
    expect(m.get("a")?.get(1)).toBe(25);
    expect(m.get("a")?.get(4)).toBeNull();
  });

  it("selo por trilha e por decisão são coisas diferentes", () => {
    expect(origemDoSelo({ habilitado: true, habilitado_override: null })).toBe("trilha");
    expect(origemDoSelo({ habilitado: true, habilitado_override: true })).toBe("decisao");
    expect(origemDoSelo({ habilitado: false, habilitado_override: false })).toBe("nao");
    expect(origemDoSelo({ habilitado: false, habilitado_override: null })).toBe("nao");
  });

  it("sem atividade há 7 dias conta a partir do início da trilha para quem nunca abriu nada", () => {
    const hoje = "2026-09-29";
    expect(semAtividade({ ultima_atividade: null, inicio_trilha: "2026-09-28" }, hoje)).toBe(false);
    expect(semAtividade({ ultima_atividade: null, inicio_trilha: "2026-09-20" }, hoje)).toBe(true);
    expect(
      semAtividade({ ultima_atividade: "2026-09-25T12:00:00Z", inicio_trilha: "2026-09-01" }, hoje),
    ).toBe(false);
    expect(
      semAtividade({ ultima_atividade: "2026-09-22T12:00:00Z", inicio_trilha: "2026-09-01" }, hoje),
    ).toBe(true);
  });
});

describe("rubrica", () => {
  const rubrica = [
    { criterio: "Jornada", peso: 1 },
    { criterio: "Agenda", peso: 1 },
    { criterio: "Nenhum erro fatal", peso: 2 },
    { lixo: true },
  ];
  it("lê critérios e pesos, ignora o que não é critério", () => {
    expect(itensDaRubrica(rubrica)).toEqual([
      { criterio: "Jornada", peso: 1 },
      { criterio: "Agenda", peso: 1 },
      { criterio: "Nenhum erro fatal", peso: 2 },
    ]);
    expect(itensDaRubrica(null)).toEqual([]);
  });
  it("pontua pelo peso e grava o que foi atendido", () => {
    const itens = itensDaRubrica(rubrica);
    const marcados = new Set([0, 2]);
    expect(pontuacaoDaRubrica(itens, marcados)).toEqual({ feitos: 3, total: 4 });
    expect(resultadoDaRubrica(itens, marcados).map((r) => r.atendeu)).toEqual([true, false, true]);
  });
});

describe("indicadores e efeito", () => {
  it("tempo em hh:mm, taxa com uma casa", () => {
    expect(formatarIndicador("tempo_primeiro_contato", 95)).toBe("01:35");
    expect(formatarIndicador("taxa_comparecimento", 52.345)).toBe("52,3%");
    expect(formatarIndicador("taxa_comparecimento", null)).toBe("sem dado");
  });

  it("melhorou depende da direção da regra", () => {
    const base = { amostra_antes: 10, amostra_depois: 12 };
    expect(
      leituraDoEfeito({ ...base, valor_antes: 20, valor_depois: 60, direcao: "menor_e_pior" }),
    ).toEqual({ estado: "melhorou", indicio: false });
    expect(
      leituraDoEfeito({ ...base, valor_antes: 30, valor_depois: 12, direcao: "maior_e_pior" }),
    ).toEqual({ estado: "melhorou", indicio: false });
    expect(
      leituraDoEfeito({ ...base, valor_antes: 30, valor_depois: 45, direcao: "maior_e_pior" })
        .estado,
    ).toBe("piorou");
  });

  it("amostra abaixo de 5 é indício, não prova; sem o depois, aguarda", () => {
    expect(
      leituraDoEfeito({
        valor_antes: 20,
        valor_depois: 60,
        direcao: "menor_e_pior",
        amostra_antes: 10,
        amostra_depois: 4,
      }).indicio,
    ).toBe(true);
    expect(
      leituraDoEfeito({
        valor_antes: 20,
        valor_depois: null,
        direcao: "menor_e_pior",
        amostra_antes: 10,
        amostra_depois: null,
      }).estado,
    ).toBe("aguardando");
  });
});

describe("gate em sombra", () => {
  it("soma os leads por situação e dá o percentual dos não habilitados", () => {
    expect(
      resumoDoGate([
        {
          corretor_id: "a",
          corretor_nome: "A",
          situacao: "nao_habilitado",
          leads_30d: 30,
          pct_do_total: 30,
        },
        {
          corretor_id: "b",
          corretor_nome: "B",
          situacao: "habilitado",
          leads_30d: 50,
          pct_do_total: 50,
        },
        {
          corretor_id: "c",
          corretor_nome: "C",
          situacao: "fora_da_academia",
          leads_30d: 20,
          pct_do_total: 20,
        },
      ]),
    ).toEqual({
      totalLeads: 100,
      leadsNaoHabilitados: 30,
      leadsForaDaAcademia: 20,
      pctNaoHabilitados: 30,
    });
    expect(resumoDoGate([]).pctNaoHabilitados).toBeNull();
  });
});

describe("mensagens das RPCs", () => {
  it("vira frase de gente", () => {
    expect(mensagemDaGestao({ message: "feedback obrigatorio: 1 foco" })).toMatch(/feedback/i);
    expect(mensagemDaGestao({ message: "forbidden" })).toMatch(/permissão/);
    expect(mensagemDaGestao({ message: "revisao pendente: Revisar o texto" })).toContain(
      "Revisar o texto",
    );
    expect(mensagemDaGestao({ message: "canceling statement due to statement timeout" })).toMatch(
      /02:45/,
    );
    expect(mensagemDaGestao({ message: "qualquer outra coisa" })).toMatch(/Tente de novo/);
  });
});

describe("participantes e conteúdo", () => {
  const base = {
    pessoa_id: "x",
    nome: "X",
    email: "x@x",
    papeis: ["corretor"],
    conta_ativa: true,
    eh_bot: false,
    eh_mcp: false,
    participa: false,
    inicio_trilha: null,
    nivel: null,
  };
  it("explica por que alguém não pode entrar", () => {
    expect(vetoDeInscricao(base)).toBeNull();
    expect(vetoDeInscricao({ ...base, eh_bot: true })).toBe("Conta de robô");
    expect(vetoDeInscricao({ ...base, eh_mcp: true })).toBe("Identidade de integração");
    expect(vetoDeInscricao({ ...base, conta_ativa: false })).toBe("Conta inativa");
  });

  it("questão precisa de enunciado, 2 a 6 alternativas e correta entre elas", () => {
    const q = {
      id: null,
      moduloId: "m",
      ordem: 1,
      enunciado: "Pergunta?",
      alternativas: ["a", "b"],
      correta: 1,
      explicacao: null,
      ativa: true,
    };
    expect(questaoValida(q)).toBe(true);
    expect(questaoValida({ ...q, alternativas: ["a"], correta: 0 })).toBe(false);
    expect(questaoValida({ ...q, alternativas: ["a", " "] })).toBe(false);
    expect(questaoValida({ ...q, correta: 2 })).toBe(false);
    expect(questaoValida({ ...q, enunciado: "  " })).toBe(false);
  });
});

describe("datas", () => {
  it("prazo padrão soma dias no calendário", () => {
    expect(somarDias("2026-09-29", 7)).toBe("2026-10-06");
    expect(somarDias("2026-12-28", 7)).toBe("2027-01-04");
  });
  it("encontro guarda horário de Brasília e volta igual", () => {
    const iso = inicioIso("2026-10-01", "08:30");
    expect(iso).toBe("2026-10-01T08:30:00-03:00");
    expect(partesBrasilia(iso)).toEqual({ data: "2026-10-01", hora: "08:30" });
    expect(partesBrasilia("2026-10-01T02:00:00Z")).toEqual({ data: "2026-09-30", hora: "23:00" });
  });
});

describe("quem gere e o selo", () => {
  it("admin sempre; gestor e superintendente só com a flag", () => {
    const base = { isAdmin: false, isGestor: false, isSuperintendente: false, menuLigado: false };
    expect(podeGerirAcademia({ ...base, isAdmin: true })).toBe(true);
    expect(podeGerirAcademia({ ...base, isGestor: true })).toBe(false);
    expect(podeGerirAcademia({ ...base, isGestor: true, menuLigado: true })).toBe(true);
    expect(podeGerirAcademia({ ...base, isSuperintendente: true, menuLigado: true })).toBe(true);
    expect(podeGerirAcademia({ ...base, menuLigado: true })).toBe(false);
  });
  it("selo: decisão manual vence a regra", () => {
    expect(estaHabilitado({ nivel: "iniciante", habilitado_override: null })).toBe(false);
    expect(estaHabilitado({ nivel: "habilitado", habilitado_override: null })).toBe(true);
    expect(estaHabilitado({ nivel: "especialista", habilitado_override: false })).toBe(false);
    expect(estaHabilitado({ nivel: "iniciante", habilitado_override: true })).toBe(true);
  });
});

describe("migration da gestão", () => {
  const sql = readFileSync("supabase/migrations/20261003120000_academia_gestao.sql", "utf8");
  it("não toca em distribuição, roleta, SLA nem transição", () => {
    for (const proibido of [
      "distribuir_lead_ponderado",
      "atribuir_lead_a_corretor",
      "transicionar_lead",
      "UPDATE public.leads",
      "UPDATE public.distribution_log",
      "roleta_participantes",
    ]) {
      expect(sql, proibido).not.toContain(proibido);
    }
  });
  it("agenda o motor às 05:45 UTC (02:45 de Brasília)", () => {
    expect(sql).toContain("'academia-motor-diario', '45 5 * * *'");
  });
});

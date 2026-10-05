import { describe, expect, it } from "vitest";
import {
  CONFIG_ROLETA_SDR_PADRAO as CFG,
  aplicarEfeitos,
  bloqueadoManualmente,
  contarPastas,
  contarVisitas,
  faltaParaMeta,
  formatarPontos,
  lerConfigRoletaSdr,
  montarCascata,
  motivoPausa,
  parseApuracoes,
  parsePlacar,
  pausaAte,
  planejarEfeitos,
  pesoRodizio,
  pontuar,
  resumoFalta,
  semanaDoInstante,
  situacaoNaRoleta,
  statusPrevisto,
  textoAviso,
  ultimaSemanaFechada,
  vendaNaJanela,
  type LinhaPlacar,
  type ParticipanteRoleta,
  type TransicaoBruta,
  type VisitaBruta,
} from "@/lib/roleta-sdr-semanal";

// Outubro/2026: 03 e 10 são SÁBADOS. A semana de apuração 03/10 → 09/10 é
// apurada no sábado 10/10 às 08:00.
const SEMANA = "2026-10-03";

const visita = (o: Partial<VisitaBruta> = {}): VisitaBruta => ({
  corretor_id: "ana",
  lead_id: "lead-1",
  tipo: "visita",
  status: "realizado",
  auto_gerado: false,
  deleted_at: null,
  data_inicio: "2026-10-06T15:00:00-03:00",
  ...o,
});

const pasta = (o: Partial<TransicaoBruta> = {}): TransicaoBruta => ({
  lead_id: "lead-1",
  corretor_id: "ana",
  para_status: "analise_credito",
  created_at: "2026-10-06T15:00:00-03:00",
  ...o,
});

const linha = (o: Partial<LinhaPlacar> & { corretor_id: string }): LinhaPlacar => ({
  nome: o.corretor_id,
  visitas: 0,
  pastas: 0,
  pontos: 0,
  vendas_janela: 0,
  ultima_venda: null,
  bloqueado_admin: false,
  ...o,
});

/** Placar de quem produziu V visitas e P pastas. */
const placar = (id: string, v: number, p: number, extra: Partial<LinhaPlacar> = {}) =>
  linha({
    corretor_id: id,
    visitas: v,
    pastas: p,
    pontos: pontuar({ visitas: v, pastas: p }, CFG),
    ...extra,
  });

const resultadoDe = (lista: ReturnType<typeof montarCascata>, id: string) =>
  lista.find((l) => l.corretor_id === id)?.resultado;

describe("pontuação: visita 1, pasta 1,5, meta 3", () => {
  it.each([
    ["3 visitas", 3, 0, 3, "apto_meta"],
    ["2 pastas", 0, 2, 3, "apto_meta"],
    ["2 visitas + 1 pasta", 2, 1, 3.5, "apto_meta"],
    ["1 visita + 1 pasta", 1, 1, 2.5, "pausado"],
  ] as const)("%s → %s pts", (_, v, p, pts, esperado) => {
    expect(pontuar({ visitas: v, pastas: p }, CFG)).toBe(pts);
    // Cada caso sozinho, com mínimo 0 para isolar a régua da meta da cascata.
    const r = montarCascata([placar("x", v, p)], { ...CFG, minimo_aptos: 0 });
    expect(r[0].resultado).toBe(esperado);
  });

  it("formata como a tela e o banco: vírgula decimal e 'pt' no singular", () => {
    expect(formatarPontos(2.5)).toBe("2,5 pts");
    expect(formatarPontos(3)).toBe("3 pts");
    expect(formatarPontos(0)).toBe("0 pts");
    expect(formatarPontos(1)).toBe("1 pt");
  });
});

describe("o que conta como visita", () => {
  it("mesmo lead com 2 visitas na semana conta 1", () => {
    const r = contarVisitas(
      [visita(), visita({ data_inicio: "2026-10-08T10:00:00-03:00" })],
      SEMANA,
    );
    expect(r.get("ana")).toBe(1);
  });

  it("leads diferentes contam separado", () => {
    const r = contarVisitas([visita(), visita({ lead_id: "lead-2" })], SEMANA);
    expect(r.get("ana")).toBe(2);
  });

  it("no-show e visita sem desfecho não contam", () => {
    const r = contarVisitas(
      [
        visita({ status: "nao_compareceu" }),
        visita({ lead_id: "lead-2", status: "agendado" }), // sem desfecho
        visita({ lead_id: "lead-3", status: "confirmado" }), // sem desfecho
        visita({ lead_id: "lead-4", status: "cancelado" }),
      ],
      SEMANA,
    );
    expect(r.get("ana") ?? 0).toBe(0);
  });

  it("auto-gerada, apagada, sem lead ou de outro tipo não contam", () => {
    const r = contarVisitas(
      [
        visita({ auto_gerado: true }),
        visita({ lead_id: "lead-2", deleted_at: "2026-10-07T10:00:00Z" }),
        visita({ lead_id: null }),
        visita({ lead_id: "lead-3", tipo: "reuniao" }),
      ],
      SEMANA,
    );
    expect(r.get("ana") ?? 0).toBe(0);
  });

  it("sexta 23:30 conta na semana; sábado 00:10 conta na seguinte (relógio de SP)", () => {
    const sexta = visita({ data_inicio: "2026-10-09T23:30:00-03:00" });
    const sabado = visita({ lead_id: "lead-2", data_inicio: "2026-10-10T00:10:00-03:00" });
    expect(contarVisitas([sexta, sabado], SEMANA).get("ana")).toBe(1);
    expect(contarVisitas([sexta, sabado], "2026-10-10").get("ana")).toBe(1);
    // Em UTC a sexta 23:30 já é sábado 02:30 — o calendário é o de SP.
    expect(semanaDoInstante("2026-10-10T02:30:00Z")).toBe(SEMANA);
    expect(semanaDoInstante("2026-10-10T03:10:00Z")).toBe("2026-10-10");
  });
});

describe("o que conta como pasta", () => {
  it("pasta do mesmo lead repetida em menos de 30 dias conta 1", () => {
    const r = contarPastas([pasta(), pasta({ created_at: "2026-10-08T10:00:00-03:00" })], SEMANA);
    expect(r.get("ana")).toBe(1);
  });

  it("lead que entrou em análise há menos de 30 dias (semana passada) não conta de novo", () => {
    const r = contarPastas([pasta({ created_at: "2026-09-20T10:00:00-03:00" }), pasta()], SEMANA);
    expect(r.get("ana") ?? 0).toBe(0);
  });

  it("vale para a entrada anterior de OUTRO corretor no mesmo lead", () => {
    const r = contarPastas(
      [pasta({ corretor_id: "bruno", created_at: "2026-09-25T10:00:00-03:00" }), pasta()],
      SEMANA,
    );
    expect(r.get("ana") ?? 0).toBe(0);
  });

  it("depois de 30 dias a nova entrada conta", () => {
    const r = contarPastas([pasta({ created_at: "2026-09-01T10:00:00-03:00" }), pasta()], SEMANA);
    expect(r.get("ana")).toBe(1);
  });

  it("só a entrada em análise de crédito conta", () => {
    const r = contarPastas([pasta({ para_status: "proposta" })], SEMANA);
    expect(r.get("ana") ?? 0).toBe(0);
  });
});

describe("exceção por venda: janela de 15 dias até a sexta do fechamento", () => {
  it("assinatura há 15 dias entra; há 16 dias não entra", () => {
    // sexta 09/10: 24/09 = 15 dias antes; 23/09 = 16.
    expect(vendaNaJanela("2026-09-24", SEMANA, 15)).toBe(true);
    expect(vendaNaJanela("2026-09-23", SEMANA, 15)).toBe(false);
    expect(vendaNaJanela("2026-10-09", SEMANA, 15)).toBe(true);
    expect(vendaNaJanela("2026-10-10", SEMANA, 15)).toBe(false); // depois da sexta
  });

  it("venda há 16 dias não entra pela exceção (a linha chega com vendas_janela = 0)", () => {
    const r = montarCascata([placar("ana", 0, 0, { vendas_janela: 0 })], CFG);
    expect(r[0].resultado).toBe("pausado");
  });
});

describe("cascata: meta e venda sem teto, complemento até o mínimo de 3", () => {
  it("0 pela meta + 2 com venda em 15 dias + 1 com 2,5 pts → 3 aptos (2 venda + 1 complemento)", () => {
    const r = montarCascata(
      [
        placar("ana", 0, 0, { vendas_janela: 1, ultima_venda: "2026-10-01" }),
        placar("bia", 1, 0, { vendas_janela: 1, ultima_venda: "2026-09-28" }),
        placar("caio", 1, 1), // 2,5
        placar("davi", 1, 0), // 1
        placar("eva", 0, 0),
      ],
      CFG,
    );
    expect(resultadoDe(r, "ana")).toBe("apto_venda");
    expect(resultadoDe(r, "bia")).toBe("apto_venda");
    expect(resultadoDe(r, "caio")).toBe("apto_complemento");
    expect(resultadoDe(r, "davi")).toBe("pausado");
    expect(resultadoDe(r, "eva")).toBe("pausado");
  });

  it("faixa 1 não tem teto: 10 bateram, entram os 10 — e quem vendeu entra também", () => {
    const linhas = Array.from({ length: 10 }, (_, i) => placar(`c${i}`, 3, 0));
    linhas.push(placar("vendedor", 0, 0, { vendas_janela: 1, ultima_venda: "2026-10-05" }));
    linhas.push(placar("sem_venda", 2, 0)); // 2 pts: complemento não abre, mínimo já atingido
    const r = montarCascata(linhas, CFG);
    expect(r.filter((l) => l.resultado === "apto_meta")).toHaveLength(10);
    expect(resultadoDe(r, "vendedor")).toBe("apto_venda");
    expect(resultadoDe(r, "sem_venda")).toBe("pausado");
  });

  it("venda não tem teto: todo mundo com venda entra, mesmo passando do mínimo de 3", () => {
    const r = montarCascata(
      [
        placar("meta1", 3, 0),
        placar("meta2", 0, 2),
        placar("venda_antiga", 1, 0, { vendas_janela: 1, ultima_venda: "2026-09-25" }),
        placar("venda_nova", 1, 0, { vendas_janela: 1, ultima_venda: "2026-10-08" }),
        placar("venda_zerada", 0, 0, { vendas_janela: 1, ultima_venda: "2026-10-01" }),
      ],
      CFG,
    );
    expect(r.filter((l) => l.resultado.startsWith("apto"))).toHaveLength(5);
    expect(resultadoDe(r, "venda_nova")).toBe("apto_venda");
    expect(resultadoDe(r, "venda_antiga")).toBe("apto_venda");
    expect(resultadoDe(r, "venda_zerada")).toBe("apto_venda");
  });

  it("complemento só fecha o que falta para o mínimo depois de meta e venda", () => {
    const r = montarCascata(
      [
        placar("venda", 0, 0, { vendas_janela: 1, ultima_venda: "2026-10-01" }),
        placar("dois", 2, 0),
        placar("um_e_meio", 0, 1),
        placar("um", 1, 0),
      ],
      CFG,
    );
    expect(resultadoDe(r, "venda")).toBe("apto_venda");
    expect(resultadoDe(r, "dois")).toBe("apto_complemento");
    expect(resultadoDe(r, "um_e_meio")).toBe("apto_complemento");
    expect(resultadoDe(r, "um")).toBe("pausado");
  });

  it("complemento exige ponto > 0 e respeita a ordem decrescente", () => {
    const r = montarCascata(
      [placar("um", 1, 0), placar("dois_e_meio", 1, 1), placar("zero", 0, 0)],
      CFG,
    );
    expect(resultadoDe(r, "dois_e_meio")).toBe("apto_complemento");
    expect(resultadoDe(r, "um")).toBe("apto_complemento");
    expect(resultadoDe(r, "zero")).toBe("pausado");
  });

  it("ninguém se qualificou: roleta vazia (todos pausados)", () => {
    const r = montarCascata([placar("a", 0, 0), placar("b", 0, 0)], CFG);
    expect(r.every((l) => l.resultado === "pausado")).toBe(true);
  });

  it("peso no rodízio: meta 2; 1 venda 1; 2+ vendas 2; complemento 1; fora da roleta nada", () => {
    const r = montarCascata(
      [
        placar("meta", 3, 0),
        placar("uma_venda", 0, 0, { vendas_janela: 1, ultima_venda: "2026-10-01" }),
        placar("duas_vendas", 0, 0, { vendas_janela: 2, ultima_venda: "2026-10-02" }),
        placar("meta_e_venda", 2, 1, { vendas_janela: 1, ultima_venda: "2026-10-02" }), // 3,5: meta
        placar("parado", 0, 0),
      ],
      { ...CFG, minimo_aptos: 5 },
    );
    const peso = (id: string) => r.find((l) => l.corretor_id === id)?.peso_rodizio;
    expect(peso("meta")).toBe(2);
    expect(peso("uma_venda")).toBe(1);
    expect(peso("duas_vendas")).toBe(2);
    expect(peso("meta_e_venda")).toBe(2);
    expect(peso("parado")).toBeNull();
    // Complemento sempre peso menor.
    expect(pesoRodizio("apto_complemento", 0, CFG)).toBe(1);
    // vendas_peso_cheio = 0: venda nunca dá peso cheio.
    expect(pesoRodizio("apto_venda", 5, { ...CFG, vendas_peso_cheio: 0 })).toBe(1);
    expect(pesoRodizio("bloqueado_admin", 9, CFG)).toBeNull();
  });

  it("removido manualmente pelo admin nunca entra — nem pela meta", () => {
    const r = montarCascata(
      [placar("removido", 4, 2, { bloqueado_admin: true }), placar("outro", 0, 0)],
      CFG,
    );
    expect(resultadoDe(r, "removido")).toBe("bloqueado_admin");
  });
});

describe("bloqueio manual (log de participantes)", () => {
  const log = (acao: string, feito_por: string | null, created_at: string) => ({
    acao,
    feito_por,
    created_at,
  });

  it("ativo = false com remoção feita por uma pessoa → bloqueado", () => {
    expect(
      bloqueadoManualmente({ ativo: false }, [
        log("incluido", "admin", "2026-09-01T10:00:00Z"),
        log("removido", "admin", "2026-09-20T10:00:00Z"),
      ]),
    ).toBe(true);
  });

  it("remoção por processo automático (feito_por nulo) não bloqueia", () => {
    expect(
      bloqueadoManualmente({ ativo: false }, [log("removido", null, "2026-09-20T10:00:00Z")]),
    ).toBe(false);
  });

  it("quem foi reincluído depois da remoção (ativo) não está bloqueado", () => {
    expect(
      bloqueadoManualmente({ ativo: true }, [log("removido", "admin", "2026-09-20T10:00:00Z")]),
    ).toBe(false);
  });
});

describe("efeito na roleta", () => {
  const agora = new Date("2026-10-10T11:00:00Z"); // sábado 08:00 BRT
  const apurar = (linhas: LinhaPlacar[]) => montarCascata(linhas, CFG);
  const part = (o: Partial<ParticipanteRoleta> & { corretor_id: string }): ParticipanteRoleta => ({
    ativo: true,
    pausado_ate: null,
    motivo_pausa: null,
    ...o,
  });

  it("pausa até o sábado seguinte 09:00 BRT com o motivo da política", () => {
    expect(pausaAte(SEMANA)).toBe("2026-10-17T09:00:00-03:00");
    expect(motivoPausa({ pontos: 2.5, visitas: 1, pastas: 1 }, SEMANA, CFG)).toBe(
      "Regra semanal: 2,5 pts (1 visita, 1 pasta) na semana 03/10 a 09/10. Meta 3 pts.",
    );
  });

  it("apto fora da roleta é incluído; não apto ativo é pausado; não apto fora fica fora", () => {
    const plano = planejarEfeitos({
      apuracao: apurar([placar("novo", 3, 0), placar("fraco", 0, 0), placar("fora", 0, 0)]),
      participantes: [part({ corretor_id: "fraco" })],
      semanaInicio: SEMANA,
      cfg: CFG,
      sombra: false,
      agora,
    });
    expect(plano).toEqual([
      { tipo: "incluir", corretor_id: "novo", log: "incluido" },
      {
        tipo: "pausar",
        corretor_id: "fraco",
        log: "pausado",
        pausado_ate: "2026-10-17T09:00:00-03:00",
        motivo: "Regra semanal: 0 pts (0 visitas, 0 pastas) na semana 03/10 a 09/10. Meta 3 pts.",
      },
    ]);
  });

  it("apto pausado pela regra na semana anterior é despausado (com log)", () => {
    const plano = planejarEfeitos({
      apuracao: apurar([placar("volta", 2, 1)]),
      participantes: [
        part({
          corretor_id: "volta",
          pausado_ate: "2026-10-10T09:00:00-03:00",
          motivo_pausa:
            "Regra semanal: 1 pt (1 visita, 0 pastas) na semana 26/09 a 02/10. Meta 3 pts.",
        }),
      ],
      semanaInicio: SEMANA,
      cfg: CFG,
      sombra: false,
      agora,
    });
    expect(plano).toEqual([{ tipo: "despausar", corretor_id: "volta", log: "reativado" }]);
  });

  it("removido manualmente pelo admin nunca é reincluído", () => {
    const plano = planejarEfeitos({
      apuracao: apurar([placar("removido", 5, 0, { bloqueado_admin: true })]),
      participantes: [part({ corretor_id: "removido", ativo: false })],
      semanaInicio: SEMANA,
      cfg: CFG,
      sombra: false,
      agora,
    });
    expect(plano).toEqual([]);
  });

  it("pausa manual mais longa vale mais que a regra; apto com pausa manual segue pausado", () => {
    const ferias = part({
      corretor_id: "ferias",
      pausado_ate: "2026-10-30T00:00:00-03:00",
      motivo_pausa: "Férias",
    });
    const sla = part({
      corretor_id: "sla",
      pausado_ate: "2026-10-11T00:00:00-03:00",
      motivo_pausa: "Pausa automática: 3 estouros de SLA no dia",
    });
    const plano = planejarEfeitos({
      apuracao: apurar([placar("ferias", 0, 0), placar("sla", 3, 0)]),
      participantes: [ferias, sla],
      semanaInicio: SEMANA,
      cfg: CFG,
      sombra: false,
      agora,
    });
    expect(plano).toEqual([]);
  });

  it("modo sombra grava a apuração sem alterar roleta_participantes (plano vazio)", () => {
    const participantes = [part({ corretor_id: "fraco" })];
    const plano = planejarEfeitos({
      apuracao: apurar([placar("novo", 3, 0), placar("fraco", 0, 0)]),
      participantes,
      semanaInicio: SEMANA,
      cfg: CFG,
      sombra: true,
      agora,
    });
    expect(plano).toEqual([]);
    expect(aplicarEfeitos(participantes, plano)).toEqual(participantes);
  });

  it("idempotência: aplicar e apurar de novo a mesma semana dá plano vazio e o mesmo estado", () => {
    const apuracao = apurar([
      placar("novo", 3, 0),
      placar("fraco", 0, 0),
      placar("volta", 0, 2),
      placar("venda", 0, 0, { vendas_janela: 1, ultima_venda: "2026-10-02" }),
    ]);
    const antes = [
      part({ corretor_id: "fraco" }),
      part({
        corretor_id: "volta",
        pausado_ate: "2026-10-10T09:00:00-03:00",
        motivo_pausa:
          "Regra semanal: 0 pts (0 visitas, 0 pastas) na semana 26/09 a 02/10. Meta 3 pts.",
      }),
    ];
    const args = { apuracao, semanaInicio: SEMANA, cfg: CFG, sombra: false, agora };
    const plano1 = planejarEfeitos({ ...args, participantes: antes });
    const depois1 = aplicarEfeitos(antes, plano1);
    const plano2 = planejarEfeitos({ ...args, participantes: depois1 });
    expect(plano1.length).toBeGreaterThan(0);
    expect(plano2).toEqual([]);
    expect(aplicarEfeitos(depois1, plano2)).toEqual(depois1);
    // E a cascata em si é determinística.
    expect(apurar(apuracao)).toEqual(apuracao);
  });
});

describe("aviso de quarta", () => {
  it("texto do prompt: placar e o que falta pelos dois caminhos", () => {
    expect(textoAviso({ visitas: 1, pastas: 1, pontos: 2.5 }, "recebendo", CFG)).toBe(
      "Sua semana na roleta do SDR: 1 visita realizada e 1 pasta (2,5 pts). Para continuar recebendo agendados a partir de sábado, falta 1 visita ou 1 pasta até sexta.",
    );
  });

  it("zerado: faltam 3 visitas ou 2 pastas; fora da roleta o verbo é entrar", () => {
    expect(textoAviso({ visitas: 0, pastas: 0, pontos: 0 }, "fora", CFG)).toBe(
      "Sua semana na roleta do SDR: nenhuma visita realizada e nenhuma pasta (0 pts). Para entrar na roleta e receber agendados a partir de sábado, faltam 3 visitas ou 2 pastas até sexta.",
    );
  });

  it("pausado: voltar a receber", () => {
    expect(textoAviso({ visitas: 2, pastas: 0, pontos: 2 }, "pausado", CFG)).toContain(
      "Para voltar a receber agendados a partir de sábado, falta 1 visita ou 1 pasta até sexta.",
    );
  });

  it("falta = caminho mais curto de cada lado até ≥ 3", () => {
    expect(faltaParaMeta(2.5, CFG)).toEqual({ pontos: 0.5, visitas: 1, pastas: 1 });
    expect(faltaParaMeta(1, CFG)).toEqual({ pontos: 2, visitas: 2, pastas: 2 });
    expect(faltaParaMeta(1.5, CFG)).toEqual({ pontos: 1.5, visitas: 2, pastas: 1 });
    expect(faltaParaMeta(0, CFG)).toEqual({ pontos: 3, visitas: 3, pastas: 2 });
    expect(faltaParaMeta(3.5, CFG)).toEqual({ pontos: 0, visitas: 0, pastas: 0 });
  });

  it("resumo curto do que falta (card do corretor)", () => {
    expect(resumoFalta(faltaParaMeta(2.5, CFG))).toBe("falta 1 visita ou 1 pasta");
    expect(resumoFalta(faltaParaMeta(1.5, CFG))).toBe("faltam 2 visitas ou 1 pasta");
    expect(resumoFalta(faltaParaMeta(3, CFG))).toBeNull();
  });

  it("peso zerado tira o caminho do texto", () => {
    const semPasta = { ...CFG, peso_pasta: 0 };
    expect(textoAviso({ visitas: 1, pastas: 0, pontos: 1 }, "recebendo", semPasta)).toContain(
      "faltam 2 visitas até sexta.",
    );
  });
});

describe("tela", () => {
  it("situação de hoje e status previsto", () => {
    const agora = new Date("2026-10-07T12:00:00Z");
    expect(
      situacaoNaRoleta({ na_roleta: true, participante_ativo: true, pausado_ate: null }, agora),
    ).toBe("recebendo");
    expect(
      situacaoNaRoleta(
        { na_roleta: true, participante_ativo: true, pausado_ate: "2026-10-10T12:00:00Z" },
        agora,
      ),
    ).toBe("pausado");
    expect(
      situacaoNaRoleta({ na_roleta: false, participante_ativo: false, pausado_ate: null }, agora),
    ).toBe("fora");
    expect(statusPrevisto("apto_meta", "recebendo")).toBe("fica");
    expect(statusPrevisto("apto_venda", "fora")).toBe("entra");
    expect(statusPrevisto("apto_complemento", "pausado")).toBe("volta");
    expect(statusPrevisto("pausado", "recebendo")).toBe("pausa");
    expect(statusPrevisto("pausado", "fora")).toBe("fora");
    expect(statusPrevisto("bloqueado_admin", "fora")).toBe("bloqueado");
  });

  it("última semana fechada no sábado da apuração", () => {
    expect(ultimaSemanaFechada(new Date("2026-10-10T11:00:00Z"))).toBe(SEMANA);
    expect(ultimaSemanaFechada(new Date("2026-10-05T15:00:00Z"))).toBe("2026-09-26");
  });

  it("config: lê o jsonb do banco com tolerância", () => {
    expect(lerConfigRoletaSdr(null)).toEqual(CFG);
    expect(lerConfigRoletaSdr({ regra_ativa: true, peso_pasta: "2", meta_pontos: -1 })).toEqual({
      ...CFG,
      regra_ativa: true,
      peso_pasta: 2,
      meta_pontos: 0,
    });
  });
});

describe("respostas das RPCs (fail-closed)", () => {
  it("placar: converte numeric em número e recusa forma inesperada", () => {
    const linha = {
      corretor_id: "ana",
      nome: null,
      visitas: 1,
      pastas: 1,
      pontos: "2.5",
      vendas_janela: 0,
      ultima_venda: null,
      na_roleta: true,
      participante_ativo: true,
      pausado_ate: null,
      motivo_pausa: null,
      bloqueado_admin: false,
    };
    expect(parsePlacar([linha])[0]).toMatchObject({ pontos: 2.5, nome: "Corretor sem nome" });
    expect(parsePlacar(null)).toEqual([]);
    expect(() => parsePlacar([{ ...linha, bloqueado_admin: "não" }])).toThrow();
  });

  it("apurações: agrupa por semana, da mais recente para a mais antiga; resultado desconhecido é erro", () => {
    const l = (semana_inicio: string, corretor_id: string, resultado = "apto_meta") => ({
      semana_inicio,
      corretor_id,
      nome: corretor_id,
      visitas: 3,
      pastas: 0,
      pontos: 3,
      vendas_janela: 0,
      resultado,
      sombra: false,
      aplicado_em: "2026-10-10T11:00:00Z",
      apurado_em: "2026-10-10T11:00:00Z",
    });
    const semanas = parseApuracoes([
      l("2026-09-26", "a"),
      l("2026-10-03", "b"),
      l("2026-10-03", "c"),
    ]);
    expect(semanas.map((s) => s.semana_inicio)).toEqual(["2026-10-03", "2026-09-26"]);
    expect(semanas[0].linhas.map((x) => x.corretor_id)).toEqual(["b", "c"]);
    expect(() => parseApuracoes([l("2026-10-03", "a", "talvez")])).toThrow();
  });
});

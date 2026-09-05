import { describe, expect, it } from "vitest";
import {
  CALENDARIO_PADRAO,
  agoraSaoPaulo,
  agregarMetas,
  classificar,
  decomporPontos,
  diasUteisAte,
  diasUteisNoMes,
  escalaHeat,
  escopoDe,
  fmtBRL,
  fmtBRLCompacto,
  funilConversao,
  intentDaTaxa,
  itensTicker,
  janelaMesAnteriorComparavel,
  mapaDePosicoes,
  mapearRanking,
  metaPrincipal,
  metaVgvCorretor,
  metasPorCorretor,
  mudancasDePosicao,
  normalizarCalendarioPacing,
  opcoesDeMes,
  ordenar,
  pctMeta,
  pesosDeConfig,
  pesosDivergem,
  pontosPelosPesos,
  posicaoDoMes,
  posicionar,
  projetarMes,
  somarTotais,
  type MetaRow,
  type RankRow,
} from "@/features/ranking/ranking-derive";
import { dateKey } from "@/lib/periodo";

const linha = (over: Partial<RankRow> & { corretorId: string; nome: string }): RankRow => ({
  foto: null,
  equipeId: null,
  pontos: 0,
  ligacoes: 0,
  whatsapp: 0,
  agendamentos: 0,
  visitas: 0,
  documentacoes: 0,
  vendas: 0,
  vgv: 0,
  leads: 0,
  alteracoes: 0,
  ...over,
});

const ANA = linha({
  corretorId: "a",
  nome: "Ana Souza",
  pontos: 1500,
  vendas: 1,
  vgv: 300_000,
  equipeId: "e1",
});
const BRUNO = linha({
  corretorId: "b",
  nome: "Bruno Lima",
  pontos: 1500,
  vendas: 1,
  vgv: 300_000,
  equipeId: "e1",
});
const CARLA = linha({
  corretorId: "c",
  nome: "Carla Reis",
  pontos: 900,
  vendas: 2,
  vgv: 500_000,
  equipeId: "e2",
});
const DANI = linha({ corretorId: "d", nome: "Dani Melo", pontos: 0, equipeId: "e2" });

// Sábado 05/09/2026 12:00 (fuso local) — o "hoje" dos testes de calendário.
const HOJE = new Date(2026, 8, 5, 12, 0, 0);

describe("ranking-derive — mapeamento do RPC", () => {
  it("converte bigint em string para número e enriquece com foto/equipe do perfil", () => {
    const rows = mapearRanking(
      [
        {
          posicao: "1",
          corretor_id: "a",
          nome: " Ana ",
          pontuacao: "1500",
          ligacoes: 3,
          whatsapps: "2",
          agendamentos: null,
          visitas: 1,
          documentacoes: 0,
          vendas: "1",
          vgv: "300000.50",
          leads: 4,
          alteracoes: "9",
        },
        {
          corretor_id: "x",
          nome: null,
          pontuacao: null,
          ligacoes: null,
          whatsapps: null,
          agendamentos: null,
          visitas: null,
          documentacoes: null,
          vendas: null,
          vgv: null,
          leads: null,
          alteracoes: null,
        },
      ],
      new Map([["a", { id: "a", foto: "http://f/a.png", equipeId: "e1" }]]),
    );
    expect(rows[0]).toMatchObject({
      corretorId: "a",
      nome: "Ana",
      foto: "http://f/a.png",
      equipeId: "e1",
      pontos: 1500,
      whatsapp: 2,
      agendamentos: 0,
      vgv: 300000.5,
      alteracoes: 9,
    });
    expect(rows[1]).toMatchObject({ nome: "Sem nome", foto: null, equipeId: null, pontos: 0 });
  });
});

describe("ranking-derive — ordenação e posição com empate", () => {
  it("ordena por pontos > vendas > vgv e desempata pelo nome", () => {
    expect(ordenar([CARLA, BRUNO, ANA, DANI], "pontos").map((r) => r.nome)).toEqual([
      "Ana Souza",
      "Bruno Lima",
      "Carla Reis",
      "Dani Melo",
    ]);
  });

  it("ordena por vendas e por VGV com os desempates certos", () => {
    expect(ordenar([ANA, CARLA, BRUNO], "vendas").map((r) => r.corretorId)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(ordenar([ANA, CARLA], "vgv").map((r) => r.corretorId)).toEqual(["c", "a"]);
  });

  it("empate divide a posição (dense rank) e o próximo vem em pos+1", () => {
    const pos = posicionar(ordenar([CARLA, BRUNO, ANA], "pontos"), "pontos");
    expect(pos.map((r) => [r.nome, r.pos])).toEqual([
      ["Ana Souza", 1],
      ["Bruno Lima", 1],
      ["Carla Reis", 2],
    ]);
  });

  it("classificar remove quem não tem valor no critério", () => {
    expect(classificar([ANA, BRUNO, CARLA, DANI], "pontos").map((r) => r.corretorId)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(classificar([ANA, DANI], "vendas")).toHaveLength(1);
    expect(classificar([], "vgv")).toEqual([]);
  });
});

describe("ranking-derive — totais", () => {
  it("soma tudo, conta ativos e quem vendeu, e calcula ticket médio", () => {
    const t = somarTotais([ANA, BRUNO, CARLA, DANI]);
    expect(t.vendas).toBe(4);
    expect(t.vgv).toBe(1_100_000);
    expect(t.pontos).toBe(3900);
    expect(t.corretoresAtivos).toBe(3);
    expect(t.corretoresComVenda).toBe(3);
    expect(t.ticketMedio).toBe(275_000);
  });

  it("sem vendas o ticket médio é 0 (nunca NaN)", () => {
    expect(somarTotais([DANI]).ticketMedio).toBe(0);
    expect(somarTotais([]).ticketMedio).toBe(0);
  });
});

describe("ranking-derive — metas sem dupla contagem", () => {
  const escopoAdmin = escopoDe([ANA, BRUNO, CARLA, DANI], true);
  const meta = (over: Partial<MetaRow>): MetaRow => ({
    corretor_id: null,
    equipe_id: null,
    meta_vendas: 0,
    meta_visitas: 0,
    meta_leads_atendidos: 0,
    meta_gmv: 0,
    ...over,
  });

  it("com metas individuais, a meta do time é a soma delas — equipe e global são ignoradas", () => {
    const rows = [
      meta({ corretor_id: "a", meta_vendas: 3, meta_gmv: "900000" }),
      meta({ corretor_id: "b", meta_vendas: 3 }),
      meta({ corretor_id: "c", meta_vendas: 4, meta_visitas: 10 }),
      meta({ equipe_id: "e1", meta_vendas: 10 }), // seria dupla contagem
      meta({ meta_vendas: 50 }), // global
    ];
    const t = agregarMetas(rows, escopoAdmin);
    expect(t).toMatchObject({
      vendas: 10,
      visitas: 10,
      vgv: 900_000,
      nivel: "corretor",
      linhas: 3,
    });
  });

  it("gestor só soma as metas dos corretores do SEU escopo", () => {
    const escopoGestor = escopoDe([ANA, BRUNO], false);
    const rows = [
      meta({ corretor_id: "a", meta_vendas: 3 }),
      meta({ corretor_id: "b", meta_vendas: 3 }),
      meta({ corretor_id: "c", meta_vendas: 4 }),
    ];
    expect(agregarMetas(rows, escopoGestor).vendas).toBe(6);
  });

  it("sem meta individual cai na meta de equipe (das equipes do escopo)", () => {
    const rows = [
      meta({ equipe_id: "e1", meta_vendas: 10 }),
      meta({ equipe_id: "e9", meta_vendas: 99 }),
    ];
    expect(agregarMetas(rows, escopoAdmin)).toMatchObject({ vendas: 10, nivel: "equipe" });
  });

  it("meta global só vale para quem vê a operação inteira", () => {
    const rows = [meta({ meta_vendas: 50, meta_gmv: 5_000_000 })];
    expect(agregarMetas(rows, escopoAdmin)).toMatchObject({
      vendas: 50,
      vgv: 5_000_000,
      nivel: "global",
    });
    expect(agregarMetas(rows, escopoDe([ANA], false))).toMatchObject({ vendas: 0, nivel: null });
  });

  it("corretor sozinho (escopo sem time) não herda meta de equipe nem global", () => {
    const soEu = escopoDe([ANA], false, false);
    const rows = [meta({ equipe_id: "e1", meta_vendas: 10 }), meta({ meta_vendas: 50 })];
    expect(agregarMetas(rows, soEu)).toMatchObject({ vendas: 0, nivel: null });
    expect(agregarMetas([meta({ corretor_id: "a", meta_vendas: 3 }), ...rows], soEu)).toMatchObject(
      {
        vendas: 3,
        nivel: "corretor",
      },
    );
  });

  it("metaPrincipal: vendas quando existe; VGV só quando é a única meta", () => {
    const totais = somarTotais([ANA, CARLA]); // 3 vendas, 800 mil
    const comVendas = agregarMetas(
      [meta({ corretor_id: "a", meta_vendas: 6, meta_gmv: 2_000_000 })],
      escopoAdmin,
    );
    expect(metaPrincipal(totais, comVendas)).toMatchObject({
      usaVgv: false,
      definida: true,
      realizado: 3,
      meta: 6,
      gap: 3,
      pct: 50,
    });
    const soVgv = agregarMetas([meta({ corretor_id: "a", meta_gmv: 1_000_000 })], escopoAdmin);
    expect(metaPrincipal(totais, soVgv)).toMatchObject({
      usaVgv: true,
      definida: true,
      realizado: 800_000,
      meta: 1_000_000,
      gap: 200_000,
      pct: 80,
    });
    expect(metaPrincipal(totais, agregarMetas([], escopoAdmin))).toMatchObject({
      usaVgv: false,
      definida: false,
      pct: 0,
    });
  });

  it("sem meta nenhuma: zero e nível null (a tela diz 'meta não definida')", () => {
    expect(agregarMetas([], escopoAdmin)).toMatchObject({ vendas: 0, nivel: null, linhas: 0 });
  });

  it("metasPorCorretor soma linhas repetidas e ignora equipe/global", () => {
    const m = metasPorCorretor([
      meta({ corretor_id: "a", meta_vendas: 2, meta_gmv: "100000" }),
      meta({ corretor_id: "a", meta_vendas: 1 }),
      meta({ equipe_id: "e1", meta_vendas: 10 }),
    ]);
    expect(m.get("a")).toEqual({ vendas: 3, visitas: 0, vgv: 100_000 });
    expect(m.size).toBe(1);
  });

  it("meta de VGV usa meta_gmv cadastrada; só sem ela converte pelo ticket médio", () => {
    expect(metaVgvCorretor({ vendas: 2, visitas: 0, vgv: 700_000 }, 300_000)).toEqual({
      valor: 700_000,
      origem: "meta_gmv",
    });
    expect(metaVgvCorretor({ vendas: 2, visitas: 0, vgv: 0 }, 300_000)).toEqual({
      valor: 600_000,
      origem: "ticket_medio",
    });
    expect(metaVgvCorretor({ vendas: 2, visitas: 0, vgv: 0 }, 0)).toEqual({
      valor: 0,
      origem: null,
    });
    expect(metaVgvCorretor(undefined, 300_000)).toEqual({ valor: 0, origem: null });
  });

  it("pctMeta não grampeia e devolve 0 sem meta", () => {
    expect(pctMeta(12, 10)).toBe(120);
    expect(pctMeta(5, 0)).toBe(0);
  });
});

describe("ranking-derive — calendário, projeção e janela comparável", () => {
  it("conta dias úteis pelo calendário do pacing (padrão seg–sáb) do mês e até um dia", () => {
    expect(diasUteisNoMes(2026, 9)).toBe(26); // setembro/2026: 30 dias, começa numa terça, 4 domingos
    expect(diasUteisAte(2026, 9, 5)).toBe(5); // ter, qua, qui, sex, sáb
    expect(diasUteisAte(2026, 9, 6)).toBe(5); // domingo não conta
    expect(diasUteisAte(2026, 9, 0)).toBe(0);
    expect(diasUteisAte(2026, 9, 99)).toBe(26); // grampeia no fim do mês
    expect(diasUteisNoMes(2026, 2)).toBe(24);
  });

  it("calendário custom: seg–sex com feriado (7 de setembro)", () => {
    const cal = { diasUteis: [1, 2, 3, 4, 5], feriados: ["2026-09-07"] };
    expect(diasUteisNoMes(2026, 9, cal)).toBe(21); // 22 dias seg–sex menos o feriado
    expect(diasUteisAte(2026, 9, 5, cal)).toBe(4);
    expect(diasUteisAte(2026, 9, 7, cal)).toBe(4);
  });

  it("normalizarCalendarioPacing aceita o jsonb da config e cai no padrão", () => {
    expect(
      normalizarCalendarioPacing({ dias_uteis: [1, 2, 3, 4, 5], feriados: ["2026-09-07", "x"] }),
    ).toEqual({
      diasUteis: [1, 2, 3, 4, 5],
      feriados: ["2026-09-07"],
    });
    expect(normalizarCalendarioPacing(null)).toEqual(CALENDARIO_PADRAO);
    expect(normalizarCalendarioPacing({ dias_uteis: [] })).toEqual(CALENDARIO_PADRAO);
    expect(normalizarCalendarioPacing({ dias_uteis: ["2", 9, "b"] }).diasUteis).toEqual([2]);
  });

  it("posicaoDoMes distingue passado, atual e futuro", () => {
    expect(posicaoDoMes(2026, 8, HOJE)).toBe("passado");
    expect(posicaoDoMes(2026, 9, HOJE)).toBe("atual");
    expect(posicaoDoMes(2026, 10, HOJE)).toBe("futuro");
    expect(posicaoDoMes(2025, 12, HOJE)).toBe("passado");
  });

  it("projeta por dia útil no mês atual: 5 vendas em 5 dias úteis de 26 → 26", () => {
    const p = projetarMes({ realizado: 5, meta: 20, ano: 2026, mes: 9, hoje: HOJE });
    expect(p.valor).toBe(26);
    expect(p.pctMeta).toBe(130);
    expect(p.diasUteis).toBe(26);
    expect(p.diasUteisPassados).toBe(5);
    expect(p.posicao).toBe("atual");
  });

  it("projeta com o calendário informado (seg–sex): 4 vendas em 4 dias de 22 → 22", () => {
    const calendario = { diasUteis: [1, 2, 3, 4, 5], feriados: [] };
    const p = projetarMes({ realizado: 4, meta: 20, ano: 2026, mes: 9, hoje: HOJE, calendario });
    expect(p.valor).toBe(22);
    expect(p.pctMeta).toBe(110);
  });

  it("mês fechado projeta o realizado; mês futuro não projeta; sem dia útil passado não projeta", () => {
    expect(projetarMes({ realizado: 7, meta: 10, ano: 2026, mes: 8, hoje: HOJE })).toMatchObject({
      valor: 7,
      pctMeta: 70,
      posicao: "passado",
    });
    expect(projetarMes({ realizado: 0, meta: 10, ano: 2026, mes: 10, hoje: HOJE })).toMatchObject({
      valor: null,
      pctMeta: null,
      posicao: "futuro",
    });
    // 01/11/2026 é domingo: nenhum dia útil passado ainda.
    const domingo = new Date(2026, 10, 1, 10);
    expect(
      projetarMes({ realizado: 1, meta: 10, ano: 2026, mes: 11, hoje: domingo }).valor,
    ).toBeNull();
  });

  it("sem meta a projeção existe mas o % é null", () => {
    const p = projetarMes({ realizado: 5, meta: 0, ano: 2026, mes: 9, hoje: HOJE });
    expect(p.valor).toBe(26);
    expect(p.pctMeta).toBeNull();
  });

  it("mês atual compara com o mês anterior ATÉ O MESMO DIA", () => {
    const j = janelaMesAnteriorComparavel(2026, 9, HOJE);
    expect(dateKey(j.from)).toBe("2026-08-01");
    expect(dateKey(j.to)).toBe("2026-08-05");
    expect(j.parcial).toBe(true);
    expect([j.ano, j.mes]).toEqual([2026, 8]);
  });

  it("mês fechado compara com o mês anterior inteiro; janeiro volta para dezembro", () => {
    const j = janelaMesAnteriorComparavel(2026, 8, HOJE);
    expect(dateKey(j.from)).toBe("2026-07-01");
    expect(dateKey(j.to)).toBe("2026-07-31");
    expect(j.parcial).toBe(false);
    const jan = janelaMesAnteriorComparavel(2026, 1, HOJE);
    expect([jan.ano, jan.mes]).toEqual([2025, 12]);
    expect(dateKey(jan.to)).toBe("2025-12-31");
  });

  it("dia 31 no mês atual grampeia no último dia do mês anterior", () => {
    const j = janelaMesAnteriorComparavel(2026, 10, new Date(2026, 9, 31, 9));
    expect(dateKey(j.to)).toBe("2026-09-30");
  });

  it("agoraSaoPaulo materializa o relógio de São Paulo nos campos locais", () => {
    // 2026-09-05T02:30Z = 04/09 23:30 em São Paulo (UTC-3).
    const sp = agoraSaoPaulo(new Date("2026-09-05T02:30:00Z"));
    expect([
      sp.getFullYear(),
      sp.getMonth() + 1,
      sp.getDate(),
      sp.getHours(),
      sp.getMinutes(),
    ]).toEqual([2026, 9, 4, 23, 30]);
  });

  it("opcoesDeMes lista do mês atual para trás, virando o ano", () => {
    const op = opcoesDeMes(HOJE, 3);
    expect(op.map((o) => o.label)).toEqual(["Set 2026", "Ago 2026", "Jul 2026"]);
    expect(opcoesDeMes(new Date(2026, 0, 10), 2).map((o) => [o.ano, o.mes])).toEqual([
      [2026, 1],
      [2025, 12],
    ]);
  });
});

describe("ranking-derive — pesos e decomposição da pontuação", () => {
  const config = [
    { chave: "ligacao", pontos: 2, ativo: true },
    { chave: "whatsapp", pontos: 1, ativo: true },
    { chave: "agendamento", pontos: 100, ativo: true },
    { chave: "visita", pontos: 250, ativo: true },
    { chave: "documentacao", pontos: 400, ativo: false },
    { chave: "venda", pontos: 1000, ativo: true },
    { chave: "desconhecida", pontos: 9, ativo: true },
  ];

  it("espelha pontos_de(): inativa vale 0, desconhecida é ignorada, vazio é null", () => {
    expect(pesosDeConfig(config)).toEqual({
      ligacao: 2,
      whatsapp: 1,
      agendamento: 100,
      visita: 250,
      documentacao: 0,
      venda: 1000,
    });
    expect(pesosDeConfig([])).toBeNull();
    expect(pesosDeConfig(undefined)).toBeNull();
    expect(pesosDeConfig([{ chave: "venda", pontos: null, ativo: true }])?.venda).toBe(0);
  });

  it("decompõe quantidade × peso por atividade e soma igual à pontuação recalculada", () => {
    const pesos = pesosDeConfig(config)!;
    const r = linha({
      corretorId: "z",
      nome: "Zé",
      ligacoes: 10,
      whatsapp: 5,
      agendamentos: 2,
      visitas: 1,
      documentacoes: 3,
      vendas: 1,
      pontos: 1475,
    });
    const parcelas = decomporPontos(r, pesos);
    expect(parcelas.map((p) => [p.chave, p.pontos])).toEqual([
      ["ligacao", 20],
      ["whatsapp", 5],
      ["agendamento", 200],
      ["visita", 250],
      ["documentacao", 0],
      ["venda", 1000],
    ]);
    expect(pontosPelosPesos(r, pesos)).toBe(1475);
    expect(pesosDivergem([r], pesos)).toBe(false);
  });

  it("detecta quando a pontuação oficial não bate com os pesos vigentes", () => {
    const pesos = pesosDeConfig(config)!;
    const r = linha({ corretorId: "z", nome: "Zé", vendas: 1, pontos: 40 }); // gravado com peso antigo
    expect(pesosDivergem([r], pesos)).toBe(true);
    expect(pesosDivergem([r], null)).toBe(false);
  });
});

describe("ranking-derive — heat, funil, ticker, posições", () => {
  it("escala por quartis dos positivos; zero à parte", () => {
    const heat = escalaHeat([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(heat(0)).toBe("zero");
    expect(heat(1)).toBe("baixo");
    expect(heat(5)).toBe("medio");
    expect(heat(8)).toBe("alto");
    const soZero = escalaHeat([0, 0]);
    expect(soZero(0)).toBe("zero");
    expect(soZero(3)).toBe("alto");
  });

  it("funil: taxa etapa ÷ anterior, pode passar de 100%, sem base é null", () => {
    const f = funilConversao({ leads: 100, agendamentos: 40, visitas: 60, vendas: 6 });
    expect(f.map((e) => e.taxa)).toEqual([null, 40, 150, 10]);
    expect(f[0].largura).toBe(100);
    expect(f[3].largura).toBe(6);
    const vazio = funilConversao({ leads: 0, agendamentos: 0, visitas: 2, vendas: 0 });
    expect(vazio[1].taxa).toBeNull(); // 0 ÷ 0
    expect(vazio[2].taxa).toBeNull(); // 2 ÷ 0
    expect(vazio[3].taxa).toBe(0);
    expect(vazio[0].largura).toBe(4); // largura mínima visível
  });

  it("intent da taxa: ≥60 sucesso, ≥30 alerta, abaixo perigo, null neutro", () => {
    expect(intentDaTaxa(60)).toBe("success");
    expect(intentDaTaxa(59)).toBe("warning");
    expect(intentDaTaxa(29)).toBe("danger");
    expect(intentDaTaxa(null)).toBe("neutral");
  });

  it("ticker lista quem vendeu, por vendas, com VGV formatado", () => {
    const itens = itensTicker([DANI, ANA, CARLA]);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatch(/^Carla — 2 vendas · R\$\s?500\.000$/);
    expect(itens[1]).toMatch(/^Ana — 1 venda · R\$\s?300\.000$/);
  });

  it("mudanças de posição: subiu positivo, desceu negativo, primeira leitura vazia", () => {
    const antes = new Map([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    const depois = mapaDePosicoes(
      posicionar(
        ordenar([CARLA, linha({ corretorId: "a", nome: "Ana", pontos: 100 }), BRUNO], "pontos"),
        "pontos",
      ),
    );
    const mud = mudancasDePosicao(antes, depois);
    expect(mud.get("b")).toBe(1); // 2 → 1
    expect(mud.get("c")).toBe(1); // 3 → 2
    expect(mud.get("a")).toBe(-2); // 1 → 3
    expect(mudancasDePosicao(new Map(), depois).size).toBe(0);
  });
});

describe("ranking-derive — formatação", () => {
  it("BRL cheio e compacto", () => {
    expect(fmtBRL(1234.6)).toMatch(/R\$\s?1\.235/);
    expect(fmtBRLCompacto(1_250_000)).toBe("R$ 1,3 mi");
    expect(fmtBRLCompacto(850_000)).toBe("R$ 850 mil");
    expect(fmtBRLCompacto(900)).toBe("R$ 900");
    expect(fmtBRLCompacto(-2_000_000)).toBe("-R$ 2 mi");
    // Unidade escolhida depois do arredondamento: nada de "R$ 1.000 mil".
    expect(fmtBRLCompacto(999_600)).toBe("R$ 1 mi");
    expect(fmtBRLCompacto(999_999_999)).toBe("R$ 1 bi");
    expect(fmtBRLCompacto(1_450_000_000)).toBe("R$ 1,5 bi");
    expect(fmtBRLCompacto(999.4)).toBe("R$ 999");
  });
});

describe("ranking-derive — variação percentual", () => {
  it("calcula a variação e some sem base", async () => {
    const { variacaoPct } = await import("@/features/ranking/ranking-derive");
    expect(variacaoPct(12, 10)).toBe(20);
    expect(variacaoPct(8, 10)).toBe(-20);
    expect(variacaoPct(3, 0)).toBeUndefined();
  });
});

// Caracterização de src/lib/distribuicao.ts antes da refatoração: a API
// pública, todos os vocabulários (rótulos pt-BR) e cada função pura sobre
// entradas de borda — mapa das filiais, alternância entre filiais, seções de
// campanhas, rodízio, janela de horário, decisão e presença. Complementa
// tests/distribuicao.test.ts e tests/roletas-por-filial-telas.test.tsx.
import { describe, expect, it } from "vitest";
import * as D from "@/lib/distribuicao";

const linha = (
  zona: string,
  roleta: string,
  filial: string | null,
  ordem: number | null,
  extra: Partial<D.ZonaRoletaLinha> = {},
): D.ZonaRoletaLinha => ({
  zona,
  roleta_slug: roleta,
  roleta_nome: `Roleta ${roleta}`,
  roleta_ativa: true,
  filial_slug: filial,
  filial_nome: filial ? filial.replace("filial-", "").replace("-", " ") : null,
  filial_ordem: ordem,
  ...extra,
});

const LINHAS: D.ZonaRoletaLinha[] = [
  linha("Sul", "filial-barra-funda", "filial-barra-funda", 1, { filial_nome: "Barra Funda" }),
  linha("Oeste", "filial-barra-funda", "filial-barra-funda", 1, { filial_nome: "Barra Funda" }),
  linha("Norte", "filial-barra-funda", "filial-barra-funda", 1, { filial_nome: "Barra Funda" }),
  linha("Leste", "filial-liberdade", "filial-liberdade", 2, { filial_nome: "Liberdade" }),
  linha("Centro", "filial-liberdade", "filial-liberdade", 2, { filial_nome: "Liberdade" }),
  linha("Grande SP", "filial-belem", "filial-belem", 3, { filial_nome: "Belém" }),
  linha("Leste", "filial-belem", "filial-belem", 3, { filial_nome: "Belém" }),
  linha("Litoral", "filial-nova", "filial-nova", null, { filial_nome: null }),
  linha("Norte", "zona-norte", null, null),
  linha("Sul", "filial-desligada", "filial-desligada", 0, { roleta_ativa: false }),
  linha("Oeste", "filial-zeta", "filial-zeta", 2, { filial_nome: "Água Branca" }),
];

describe("API e vocabulário", () => {
  it("a API pública do módulo", () => {
    expect(Object.keys(D).sort()).toMatchSnapshot();
  });

  it("todos os rótulos", () => {
    expect({
      roleta: D.ROLETA_LABEL,
      inaptidao: D.MOTIVO_INAPTIDAO_LABEL,
      excecao: D.MOTIVO_EXCECAO_LABEL,
      excecaoStatus: D.EXCECAO_STATUS_LABEL,
      acaoParticipante: D.ACAO_PARTICIPANTE_LABEL,
      resultado: D.RESULTADO_LABEL,
      gatilho: D.GATILHO_LABEL,
      presencaHint: D.PRESENCA_OBRIGATORIA_HINT,
    }).toMatchSnapshot();
  });

  it("rótulos por código, inclusive desconhecidos", () => {
    expect({
      roletaLabel: [
        ["plantao"],
        ["zona-leste"],
        ["filial-belem", "  "],
        ["filial-belem", "Belém Centro"],
        ["campanha-x"],
        [null],
        [undefined, null],
        [""],
      ].map(([s, n]) => D.roletaLabel(s, n)),
      inaptidao: ["pausado", "disjuntor_wip_42", "disjuntor_wip_", "codigo_novo"].map(
        D.motivoInaptidaoLabel,
      ),
      excecao: ["zona_sem_time", "codigo_novo"].map(D.motivoExcecaoLabel),
      gatilho: ["webhook", "campanha_zona", null, undefined, "", "novo"].map(D.gatilhoLabel),
    }).toMatchSnapshot();
  });
});

describe("mapa das filiais", () => {
  const filiais = D.agruparFiliais(LINHAS);

  it("agrupa, ordena e descreve", () => {
    expect({
      ordenarZonas: D.ordenarZonas([
        "Leste",
        "Zeta",
        "Centro",
        "Norte",
        "Alfa",
        "Leste",
        "Grande SP",
      ]),
      filiais,
      daRegiao: D.filiaisDaRegiao(filiais, ["Sul", "Oeste", "Norte", "Leste", "Centro"]),
      daRegiaoVazia: D.filiaisDaRegiao(filiais, []),
      daRegiaoSemZonas: D.filiaisDaRegiao(
        [
          {
            slug: "f0",
            nome: "Sem zonas",
            ordem: 1,
            roletaSlug: "r0",
            roletaNome: "R0",
            zonas: [],
          },
        ],
        ["Sul"],
      ),
      soltas: D.zonasSoltas(filiais, ["Sul", "Oeste", "Leste", "Litoral", "Marte"]),
      uniao: D.uniaoDasZonas(filiais, new Set(["filial-belem", "filial-liberdade", "nenhuma"])),
      rotulos: filiais.map((f) => [D.rotuloFilial(f), D.rotuloFilial(f, " · ")]),
      feminino: ["Belém", "Barra Funda", "Liberdade", "Grande SP", "Sul", "Centro", "belém"].map(
        D.femininoNaFrase,
      ),
      listar: [[], ["A"], ["A", "B"], ["A", "B", "C"]].map(D.listarNomes),
      alternam: filiais.map((f) => [f.slug, D.filiaisQueAlternam(f, filiais)]),
      frases: D.frasesAlternancia(filiais),
      descricoes: filiais.map((f) => D.descricaoRoletaFilial(f, filiais)),
    }).toMatchSnapshot();
  });

  it("seções de campanhas por filial dona", () => {
    const campanhas = [
      { id: "c1", filial_id: "f2" },
      { id: "c2", filial_id: null },
      { id: "c3", filial_id: "f1" },
      { id: "c4", filial_id: "fx" },
      { id: "c5", filial_id: "f2" },
    ];
    const lojas = [
      { id: "f2", nome: "Liberdade", ordem: 2 },
      { id: "f1", nome: "Barra Funda", ordem: 1 },
      { id: "f3", nome: "Belém", ordem: 3 },
    ];
    expect({
      secoes: D.secoesDeCampanhas(campanhas, lojas),
      soSemFilial: D.secoesDeCampanhas([{ id: "c9", filial_id: null }], []),
      nada: D.secoesDeCampanhas([], lojas),
    }).toMatchSnapshot();
  });
});

describe("regras espelhadas do motor", () => {
  it("% trabalhado, participação, origem e janela", () => {
    expect({
      pct: [
        [0, 0],
        [-1, 5],
        [3, 1],
        [7, 0],
        [7, 7],
        [3, 2],
      ].map(([c, a]) => D.calcPctTrabalhado(c, a)),
      participacao: [
        [1, 3],
        [0, 0],
        [5, -1],
        [2, 7],
      ].map(([r, t]) => D.participacaoPercentual(r, t)),
      origem: [
        D.resolverRoletaPorOrigem("meta", null, { meta: "plantao", site: "landing" }),
        D.resolverRoletaPorOrigem("meta", "webhook_landing", { meta: "plantao", site: "landing" }),
        D.resolverRoletaPorOrigem("whatsapp", "webhook", { meta: "plantao" }),
        D.resolverRoletaPorOrigem("site", null, { site: null }),
      ],
      janela: [
        [null, "18:00", "03:00"],
        ["08:00", null, "03:00"],
        ["08:00", "18:00", "08:00"],
        ["08:00", "18:00", "18:00"],
        ["08:00", "18:00", "18:01"],
        ["08:00:00", "18:00:00", "12:30:15"],
        ["20:00", "02:00", "23:59"],
        ["20:00", "02:00", "02:00"],
        ["20:00", "02:00", "02:01"],
        ["20:00", "02:00", "12:00"],
      ].map(([i, f, a]) => D.dentroDoHorario(i, f, a as string)),
    }).toMatchSnapshot();
  });

  it("rodízio: próximo da vez", () => {
    const p = (id: string, apto: boolean, ultimo: string | null, incluido?: string | null) => ({
      corretor_id: id,
      apto,
      ultimo_lead_em: ultimo,
      incluido_em: incluido,
    });
    expect({
      vazio: D.proximoDaVez([]),
      ninguemApto: D.proximoDaVez([p("a", false, null)]),
      nuncaRecebeu: D.proximoDaVez([p("a", true, "2026-10-01"), p("b", true, null)]),
      maisAntigo: D.proximoDaVez([
        p("a", true, "2026-10-03"),
        p("b", true, "2026-10-01"),
        p("c", false, "2026-09-01"),
      ]),
      empatePorInclusao: D.proximoDaVez([
        p("a", true, null, "2026-05-02"),
        p("b", true, null, "2026-05-01"),
      ]),
      empateSemInclusao: D.proximoDaVez([
        p("a", true, "2026-10-01"),
        p("b", true, "2026-10-01", "2026-01-01"),
      ]),
      empateTotal: D.proximoDaVez([
        p("a", true, null, "2026-05-01"),
        p("b", true, null, "2026-05-01"),
      ]),
    }).toMatchSnapshot();
  });

  it("contexto da decisão", () => {
    expect([
      D.resumoDecisao(null),
      D.resumoDecisao("texto"),
      D.resumoDecisao({
        roleta: "plantao",
        gatilho: "webhook",
        regra: "rodizio",
        percentual_minimo: 60,
        aptos: [{ corretor_id: "a", nome: "Ana", ultimo_lead_em: null }],
        inaptos: [{ corretor_id: "b", nome: "Bia", motivos: ["pausado"] }],
        vencedor: { corretor_id: "a", nome: "Ana" },
        corretor_anterior: { corretor_id: "c", ativo: 1, politica: "manter" },
        dedup: { duplicado_id: "lead-9" },
      }),
      D.resumoDecisao({
        roleta: 1,
        percentual_minimo: "60",
        aptos: "x",
        vencedor: ["a"],
        corretor_anterior: { ativo: 0, politica: 2 },
        dedup: { duplicado_id: 9 },
      }),
      D.resumoDecisao({ vencedor: {}, corretor_anterior: {} }),
    ]).toMatchSnapshot();
  });

  it("presença obrigatória e ação da gestão", () => {
    expect({
      obrigatoria: [{ tipo: "sdr" }, { tipo: "zona" }, { tipo: null }, {}].map(
        D.presencaObrigatoria,
      ),
      acao: [
        D.acaoPresencaDaGestao({ corretor_id: "a", presente: true }, "a"),
        D.acaoPresencaDaGestao({ corretor_id: "a", presente: true }, "b"),
        D.acaoPresencaDaGestao({ corretor_id: "a", presente: false }, "a"),
        D.acaoPresencaDaGestao({ corretor_id: "a", presente: false }, "b"),
        D.acaoPresencaDaGestao({ corretor_id: "a", presente: false }, null),
        D.acaoPresencaDaGestao({ corretor_id: "a", presente: false }, undefined),
        D.acaoPresencaDaGestao({ corretor_id: "", presente: false }, ""),
      ],
    }).toMatchSnapshot();
  });
});

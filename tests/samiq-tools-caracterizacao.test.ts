// Caracterização de src/lib/samiq-tools.ts antes da refatoração: o catálogo
// das ferramentas de leitura da Sami, os contratos de entrada, a modelagem de
// cada resultado (o que o modelo vê, com PII redigida), busca/agenda no fuso
// de SP e a telemetria do loop. Complementa tests/samiq-tools.test.ts.
import { describe, expect, it } from "vitest";
import * as T from "@/lib/samiq-tools";
import { ATENDIMENTO_QUEUE_KEYS, type AtendimentoInbox } from "@/features/atendimento/inbox";
import {
  AGENDAMENTOS,
  CLIENTES,
  CREDITO,
  DOCUMENTOS,
  INTERACOES,
  LEAD,
  MATERIAL,
  PROJETOS,
  TAREFAS,
} from "./helpers/samiq-tools-linhas";

describe("catálogo", () => {
  it("a API pública do módulo", () => {
    expect(Object.keys(T).sort()).toMatchSnapshot();
  });

  it("nomes, rótulos, descrições e grupos", () => {
    expect({
      nomes: T.SAMIQ_TOOL_NAMES,
      rotulos: T.SAMIQ_TOOL_LABELS,
      descricoes: T.SAMIQ_TOOL_DESCRIPTIONS,
      grupos: T.GRUPOS_FERRAMENTAS,
      fuso: T.SAMIQ_FUSO,
      maxDiasAgenda: T.MAX_DIAS_AGENDA,
      semResposta: T.SAMIQ_TEXTO_SEM_RESPOSTA,
      ehFerramenta: ["buscar_clientes", "apagar_tudo", "", "detalhe_cliente"].map(
        T.isSamiQToolName,
      ),
    }).toMatchSnapshot();
  });

  it("contratos de entrada aceitam e recusam como antes", () => {
    const contratos = Object.entries(T).filter(
      ([nome, v]) =>
        nome.endsWith("Input") && typeof (v as { safeParse?: unknown }).safeParse === "function",
    ) as Array<
      [
        string,
        {
          safeParse: (v: unknown) => {
            success: boolean;
            data?: unknown;
            error?: { issues: Array<{ path: unknown; code: string }> };
          };
        },
      ]
    >;
    const entradas: unknown[] = [
      {},
      { termo: "Maria", limite: 5 },
      { termo: "", limite: 500 },
      { leadId: "11111111-1111-4111-8111-111111111111" },
      { leadId: "x" },
      { de: "2026-10-24", ate: "2026-10-31" },
      { de: "24/10/2026" },
      { fila: "novos", limite: 3 },
      { etapa: "em_atendimento", ordem: "mais_parados", limite: 10 },
      { etapa: "inexistente" },
      { busca: "Vibra", regiao: "Oeste", rendaMaxima: 5000 },
      { projetoId: "11111111-1111-4111-8111-111111111111" },
      { grupos: ["agenda", "funil"] },
      { grupos: ["inexistente"] },
    ];
    const tabela = Object.fromEntries(
      contratos.map(([nome, schema]) => [
        nome,
        entradas.map((e) => {
          const r = schema.safeParse(e);
          return r.success
            ? { ok: r.data }
            : { erro: r.error?.issues.map((i) => `${String(i.path)}:${i.code}`) };
        }),
      ]),
    );
    expect(tabela).toMatchSnapshot();
  });
});

describe("modelagem do que o modelo vê", () => {
  it("clientes, interações, tarefas, agenda e documentos", () => {
    expect({
      clientes: T.modelarClientes(CLIENTES, 5),
      clientesLimitado: T.modelarClientes(CLIENTES, 1),
      interacoes: T.modelarInteracoes(INTERACOES),
      interacoes3: T.modelarInteracoes(INTERACOES, 3),
      tarefas: T.modelarTarefas(TAREFAS),
      tarefas1: T.modelarTarefas(TAREFAS, 1),
      agenda: T.modelarAgendamentos(AGENDAMENTOS),
      agenda2: T.modelarAgendamentos(AGENDAMENTOS, 2),
      documentos: T.modelarDocumentos(DOCUMENTOS),
      vazios: [T.modelarClientes([], 5), T.modelarTarefas([]), T.modelarDocumentos([])],
    }).toMatchSnapshot();
  });

  it("detalhe do cliente", () => {
    const args = {
      lead: LEAD,
      interacoes: INTERACOES,
      tarefas: TAREFAS,
      agendamentos: [...AGENDAMENTOS, ...AGENDAMENTOS],
      documentos: DOCUMENTOS,
    };
    const semNada = {
      lead: {
        ...LEAD,
        visita_data: null,
        bairro: null,
        zona: null,
        objecoes: null,
        proxima_acao: null,
        observacoes: null,
        motivo_perdido: "sem contato",
      },
      interacoes: [],
      tarefas: [],
      agendamentos: [],
      documentos: [],
    };
    expect({
      cheio: T.modelarDetalheCliente(args),
      vazio: T.modelarDetalheCliente(semNada),
    }).toMatchSnapshot();
  });

  it("funil e fila", () => {
    const funil = Array.from({ length: 22 }, (_, i) => ({
      etapa: `etapa_${i}`,
      quantidade: i,
      followups_vencidos: i % 2 ? i : null,
      parados_ha_7_dias: i % 3 ? i : null,
      sem_proxima_acao: null,
    }));
    const item = (id: string, nome: string, extra: object = {}) => ({
      lead: { id, nome, status: "novo", temperatura: "quente", projeto_nome: "Vibra" },
      score: 50,
      motivo: "novo",
      docsPendentes: 0,
      ...extra,
    });
    const inbox = {
      counts: { novos: 7 },
      filas: {
        novos: [
          item("l1", "Maria da Silva"),
          item("l2", "João 2", { docsPendentes: 2, visitaEm: "2026-10-28T18:00:00Z" }),
          ...Array.from({ length: 6 }, (_, i) =>
            item(`x${i}`, `Pessoa ${String.fromCharCode(65 + i)}`),
          ),
        ],
      },
    } as unknown as AtendimentoInbox;
    expect({
      funil: T.modelarFunil(funil),
      filaTodas: T.modelarFila(inbox),
      filaNovos: T.modelarFila(inbox, "novos", 2),
      chaves: ATENDIMENTO_QUEUE_KEYS,
    }).toMatchSnapshot();
  });

  it("projetos, material, crédito e situação", () => {
    const agora = new Date("2026-10-24T13:00:00Z");
    expect({
      projetos: T.modelarProjetos(PROJETOS),
      projetos1: T.modelarProjetos(PROJETOS, 1),
      material: T.modelarMaterialProjeto(MATERIAL, agora),
      materialNoMes: T.modelarMaterialProjeto(
        { ...MATERIAL, tabela_atualizada_em: "2026-10-02T10:00:00Z" },
        agora,
      ),
      materialMinimo: T.modelarMaterialProjeto(
        {
          ...MATERIAL,
          endereco: "  Av. Paulista, 1000  ",
          logradouro: null,
          dorms_min: null,
          dorms_max: null,
          metragem_min: 40,
          metragem_max: null,
          vagas: null,
          status_entrega: null,
          mes_entrega: null,
          ano_entrega: null,
          argumentos_venda: null,
          book_url: null,
          tabela_precos_url: null,
          tabela_atualizada_em: null,
          disponibilidade_resumo: "",
          perfil_ideal: null,
          status_preco: null,
          regiao: null,
          zona_smq: null,
          bairro: null,
        },
        agora,
      ),
      credito: T.modelarCredito([...CREDITO, ...CREDITO]),
      semCredito: T.modelarCredito([]),
      situacao: T.modelarSituacao({
        presenca: {
          checkin: {
            modo: "loja",
            filial_slug: "filial-lapa",
            apto_roleta: true,
            encerrado_em: null,
          },
          presente: true,
          vendas_mes_anterior: 2,
          vendas_minimas: 1,
          casa_liberada: true,
          exige_localizacao: false,
          filiais: [{ slug: "filial-lapa", nome: "Lapa", lat: 1 }],
        },
        emAtendimento: { em_atendimento: 40, teto: 65, lotado: false, recebe_lead: true },
        lote: { pode_pedir: false, motivo: "lote_em_andamento" },
      }),
      situacaoVazia: T.modelarSituacao({ presenca: null, emAtendimento: null, lote: null }),
    }).toMatchSnapshot();
  });
});

describe("busca, agenda e telemetria", () => {
  it("dia e intervalo da agenda em São Paulo", () => {
    expect({
      hoje: ["2026-10-24T02:59:00Z", "2026-10-24T03:00:00Z", "2026-12-31T23:00:00Z"].map((d) =>
        T.hojeSaoPaulo(new Date(d)),
      ),
      padrao: T.intervaloAgendaSamiQ("2026-10-24"),
      de: T.intervaloAgendaSamiQ("2026-10-24", "2026-10-30"),
      deAte: T.intervaloAgendaSamiQ("2026-10-24", "2026-10-30", "2026-11-02"),
      invertido: T.intervaloAgendaSamiQ("2026-10-24", "2026-10-30", "2026-10-01"),
      longo: T.intervaloAgendaSamiQ("2026-10-24", "2026-10-01", "2027-01-31"),
      invalido: T.intervaloAgendaSamiQ("2026-10-24", "30/10", "amanhã"),
      viradaDeAno: T.intervaloAgendaSamiQ("2026-12-28"),
    }).toMatchSnapshot();
  });

  it("termos de busca", () => {
    const termos = [
      "Lucas 4321",
      "lucas final 98765-4321",
      "Maria (Vibra), 100%*",
      "123",
      "  São   João  ",
      "Conceição Ação 11 9 8765 4321",
      "tel 12.345",
      "x".repeat(120),
    ];
    expect(
      termos.map((t) => ({
        t,
        separado: T.separarTermoBuscaSamiQ(t),
        busca: T.termoBuscaSamiQ(t),
        semAcento: T.termoSemAcentoSamiQ(t),
      })),
    ).toMatchSnapshot();
  });

  it("telemetria e fallback", () => {
    const passos = [
      { content: [{ type: "text" }, { type: "tool-call", toolName: "buscar_clientes" }] },
      { content: [{ type: "tool-call", toolName: "buscar_clientes" }, { type: "tool-error" }] },
      { content: [{ type: "tool-call" }, { type: "tool-call", toolName: "minha_agenda" }] },
    ];
    const muitos = [
      { content: Array.from({ length: 120 }, () => ({ type: "tool-call", toolName: "x" })) },
    ];
    expect({
      contagem: T.contarFerramentasSamiQ(passos),
      teto: T.contarFerramentasSamiQ(muitos),
      vazio: T.contarFerramentasSamiQ([]),
      fallback: [
        "",
        "   ",
        "Não consegui achar",
        '"nao consegui',
        "“Não consegui",
        "Consegui sim",
        "Eu não consegui",
      ].map(T.detectarFallbackSamiQ),
    }).toMatchSnapshot();
  });
});

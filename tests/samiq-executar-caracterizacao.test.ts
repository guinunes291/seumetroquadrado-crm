// Caracterização de src/lib/samiq-executar.server.ts antes da refatoração:
// para cada um dos 25 tipos de ação da Sami, em alguns cenários de banco, a
// SEQUÊNCIA EXATA de chamadas ao CRM (leituras, escritas e RPCs, com os
// argumentos) e o resultado devolvido (ou o erro). O caminho contra o banco
// real continua em tests/db/samiq-v8-executor.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executarPropostaSamiQ } from "@/lib/samiq-executar.server";
import type { PropostaPayload } from "@/lib/samiq-propostas";
import { EXEMPLOS, IDS } from "./helpers/samiq-exemplos";
import { bancoDoExecutor } from "./helpers/samiq-executar-banco";
import { CENARIOS, FALHAS_DE_ESCRITA } from "./helpers/samiq-executar-cenarios";

const mocks = vi.hoisted(() => ({ anexar: vi.fn() }));
vi.mock("@/lib/samiq-anexos.server", () => ({ anexarArquivoDoWhatsApp: mocks.anexar }));

const AGORA = new Date("2026-10-24T13:00:00.000Z");

beforeEach(() => {
  mocks.anexar.mockReset();
  mocks.anexar.mockResolvedValue({ documentoId: "doc-1", status: "recebido", caminho: "x/y.pdf" });
});

async function executar(
  payload: PropostaPayload,
  respostas: Record<string, unknown>,
  erros: readonly string[] = [],
  extra: { executionId?: string | null; contexto?: object } = {},
) {
  const banco = bancoDoExecutor(respostas, erros);
  let saida: unknown;
  try {
    saida = {
      resultado: await executarPropostaSamiQ({
        supabase: banco.cliente,
        userId: "u1",
        propostaId: "prop-1",
        executionId: extra.executionId === undefined ? "exec-1" : extra.executionId,
        payload,
        agora: AGORA,
        contexto: extra.contexto as never,
      }),
    };
  } catch (e) {
    saida = { erro: e instanceof Error ? e.message : String(e) };
  }
  return { ...(saida as object), chamadas: banco.chamadas };
}

describe("cada tipo de ação em cada cenário", () => {
  for (const [tipo, payload] of Object.entries(EXEMPLOS)) {
    it(tipo, async () => {
      const porCenario: Record<string, unknown> = {};
      for (const [nome, respostas] of Object.entries(CENARIOS)) {
        porCenario[nome] = await executar(payload as PropostaPayload, respostas);
      }
      porCenario.escrita_falha = await executar(
        payload as PropostaPayload,
        CENARIOS.feliz,
        FALHAS_DE_ESCRITA,
      );
      expect(porCenario).toMatchSnapshot();
    });
  }
});

describe("auxiliares falham sem derrubar a ação", () => {
  const FALHAS_AUXILIARES = [
    "interacoes:update",
    "leads:update",
    "tarefas:insert",
    "tarefas:update",
    "rpc:cadencia_registrar_tentativa",
  ];
  for (const tipo of [
    "registrar_contato",
    "registrar_retorno",
    "agendar_visita",
    "mudar_etapa",
    "registrar_visita",
    "enviar_analise_credito",
    "remarcar_visita",
    "cancelar_visita",
  ] as const) {
    it(tipo, async () => {
      expect(
        await executar(EXEMPLOS[tipo] as PropostaPayload, CENARIOS.com_tarefas, FALHAS_AUXILIARES),
      ).toMatchSnapshot();
    });
  }
});

describe("variações da entrada", () => {
  const { L1, A1 } = IDS;
  const casos: Array<[string, Record<string, unknown>, string?]> = [
    [
      "contato sem follow-up nem objeções",
      { tipo: "registrar_contato", leadId: L1, canal: "ligacao", resultado: "nao_atendeu" },
      "com_tarefas",
    ],
    [
      "contato lotado",
      {
        tipo: "registrar_contato",
        leadId: L1,
        canal: "whatsapp",
        resultado: "interessado",
        resumo: "quer",
      },
      "prospeccao",
    ],
    [
      "tarefa sem cliente",
      { tipo: "criar_tarefa", titulo: "Revisar agenda", vencimentoEm: "2026-10-26T10:00:00-03:00" },
    ],
    [
      "tarefa no mesmo horário de outra",
      { ...EXEMPLOS.criar_tarefa, vencimentoEm: "2026-10-27T14:00:00-03:00" },
      "com_tarefas",
    ],
    [
      "qualificação com projeto e objeções",
      {
        tipo: "atualizar_qualificacao",
        leadId: L1,
        projetoId: IDS.P1,
        objecoesAdicionar: ["parcela alta", "entrada"],
        rendaInformada: 5000,
      },
    ],
    [
      "qualificação com projeto inexistente",
      { tipo: "atualizar_qualificacao", leadId: L1, projetoId: IDS.P1 },
      "sem_projeto",
    ],
    [
      "objeções no limite da ficha",
      { ...EXEMPLOS.registrar_contato, objecoes: ["nova 1", "nova 2"] },
      "muitas_objecoes",
    ],
    ["visita sem mover etapa", { ...EXEMPLOS.agendar_visita, moverParaAgendado: false }],
    ["visita no passado", { ...EXEMPLOS.agendar_visita, inicioEm: "2026-10-20T15:00:00-03:00" }],
    [
      "etapa para aguardando retorno",
      {
        tipo: "mudar_etapa",
        leadId: L1,
        novoStatus: "aguardando_retorno",
        proximoFollowupEm: "2026-10-30T10:00:00-03:00",
        motivo: "pediu",
        motivoCategoria: "sem_contato",
      },
    ],
    ["retorno esfriou", { ...EXEMPLOS.registrar_retorno, desfecho: "esfriou" }, "com_tarefas"],
    [
      "retorno a mais de 30 dias",
      { ...EXEMPLOS.registrar_retorno, retornoEm: "2027-01-20T10:00:00-03:00" },
    ],
    [
      "perdido sem novo corretor",
      { tipo: "marcar_perdido", leadId: L1, categoria: "sem_contato" },
      "perdido_base",
    ],
    ["troca com retorno", { ...EXEMPLOS.trocar_vaga, desfecho: "pediu_retorno" }],
    [
      "troca com perda",
      {
        tipo: "trocar_vaga",
        entraLeadId: IDS.L2,
        saiLeadId: L1,
        desfecho: "perdido",
        categoriaPerda: "sem_interesse",
      },
    ],
    ["concluir sem resultado", { tipo: "concluir_tarefa", tarefaId: IDS.T1 }],
    [
      "visita não compareceu e reagendou",
      {
        tipo: "registrar_visita",
        leadId: L1,
        agendamentoId: A1,
        compareceu: false,
        reagendarPara: "2026-10-31T10:00:00-03:00",
      },
      "com_tarefas",
    ],
    [
      "visita não compareceu sem agendamento",
      {
        tipo: "registrar_visita",
        leadId: L1,
        compareceu: false,
        proximoFollowupEm: "2026-10-30T10:00:00-03:00",
      },
    ],
    [
      "visita foi direto para análise",
      { ...EXEMPLOS.registrar_visita, proximaEtapa: "analise_credito" },
    ],
    [
      "checklist autônomo solteiro",
      {
        tipo: "documentos_checklist",
        leadId: L1,
        perfil: "autonomo",
        casado: false,
        usaFgts: false,
        declaraIr: true,
      },
      "com_tarefas",
    ],
    ["documento aprovado", { ...EXEMPLOS.atualizar_documento, status: "aprovado" }, "com_tarefas"],
    [
      "análise pendente de documentos",
      { ...EXEMPLOS.enviar_analise_credito, situacao: "pendente_documentos" },
    ],
    [
      "crédito aprovado",
      {
        tipo: "registrar_resultado_credito",
        leadId: L1,
        resultado: "aprovada",
        valorFinanciamento: 180000,
        valorParcela: 1200,
        prazoMeses: 420,
        taxaJurosAnual: 5.5,
        valorSubsidio: 20000,
      },
      "com_tarefas",
    ],
    [
      "crédito reprovado sem análise aberta",
      {
        tipo: "registrar_resultado_credito",
        leadId: L1,
        resultado: "reprovada",
        motivo: "restrição",
      },
      "sem_analise",
    ],
    ["venda com assinatura futura", { ...EXEMPLOS.registrar_venda, dataAssinatura: "2026-11-30" }],
    [
      "venda fora da janela de recebimento",
      { ...EXEMPLOS.registrar_venda, previsaoRecebimento: "2028-01" },
    ],
    [
      "venda sem projeto cadastrado",
      { ...EXEMPLOS.registrar_venda, projetoId: IDS.P1 },
      "sem_projeto",
    ],
    ["check-in em casa", { tipo: "fazer_checkin", modo: "casa" }],
    ["check-in sair", { tipo: "fazer_checkin", modo: "sair" }],
    [
      "cadastro com e-mail",
      { ...EXEMPLOS.criar_lead, email: "joao@exemplo.com", observacao: "veio do plantão" },
    ],
  ];
  for (const [nome, payload, cenario] of casos) {
    it(nome, async () => {
      expect(
        await executar(payload as PropostaPayload, CENARIOS[cenario ?? "feliz"]),
      ).toMatchSnapshot();
    });
  }

  it("sem execução registrada e com localização do WhatsApp", async () => {
    expect(
      await executar(EXEMPLOS.fazer_checkin as PropostaPayload, CENARIOS.feliz, [], {
        executionId: null,
        contexto: { localizacao: { latitude: -23.52, longitude: -46.66, precisao: 12 } },
      }),
    ).toMatchSnapshot();
    expect(
      await executar(EXEMPLOS.anotar as PropostaPayload, CENARIOS.feliz, [], { executionId: null }),
    ).toMatchSnapshot();
  });
});

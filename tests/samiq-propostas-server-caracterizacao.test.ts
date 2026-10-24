// Caracterização de src/lib/samiq-propostas.server.ts antes da refatoração:
// para cada ferramenta de escrita da Sami, em cada etapa do funil, o que ela
// LÊ do banco (na ordem), o que devolve ao modelo e o que vai para o coletor.
// Complementa tests/samiq-propostas-ferramentas.test.ts (autonomia, homônimo,
// cadastro), cobrindo as regras de cada tipo de ação.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolSet } from "ai";
import {
  criarFerramentasDePropostaSamiQ,
  SAMIQ_REGRA_EM_ATENDIMENTO,
  type ExecutorImediato,
  type PropostaColetada,
} from "@/lib/samiq-propostas.server";
import { SAMIQ_PROPOSTA_TIPOS } from "@/lib/samiq-propostas";
import { bancoGravado, ENTRADAS, IDS, type Cenario } from "./helpers/samiq-propostas-banco";

const mocks = vi.hoisted(() => ({ telefoneEhDeCorretor: vi.fn(async (_t: string) => false) }));
vi.mock("@/lib/telefone-corretor.server", () => ({
  telefoneEhDeCorretor: mocks.telefoneEhDeCorretor,
}));

const AGORA = new Date("2026-10-24T13:00:00.000Z");
const ETAPAS = [
  "novo",
  "qualificado",
  "qualificacao_corretor",
  "em_atendimento",
  "agendado",
  "aguardando_retorno",
  "analise_credito",
  "perdido",
];

beforeEach(() => {
  mocks.telefoneEhDeCorretor.mockReset();
  mocks.telefoneEhDeCorretor.mockResolvedValue(false);
});

async function rodar(
  nome: string,
  cenario: Cenario,
  opts: { entrada?: Record<string, unknown>; executar?: ExecutorImediato } = {},
) {
  const banco = bancoGravado(cenario);
  const coletor: PropostaColetada[] = [];
  const citados: string[] = [];
  const ambiguos: string[][] = [];
  const tools: ToolSet = criarFerramentasDePropostaSamiQ({
    supabase: banco.cliente,
    userId: "u1",
    coletor,
    agora: AGORA,
    textoDoCorretor: "o Lucas",
    citar: (c) => citados.push(`${c.nome}${c.etapa ? `@${c.etapa}` : ""}`),
    aoAmbiguo: (ids) => ambiguos.push(ids),
    ...(opts.executar ? { modo: "por_risco" as const, executarAgora: opts.executar } : {}),
  });
  const ferramenta = tools[nome] as unknown as {
    execute: (i: unknown, o: unknown) => Promise<Record<string, unknown>>;
  };
  const resultado = await ferramenta.execute(opts.entrada ?? ENTRADAS[nome], {
    toolCallId: "t1",
    messages: [],
  });
  return {
    resultado,
    leituras: banco.chamadas,
    coletor: coletor.map((c) => ({ leadId: c.leadId, leadNome: c.leadNome, payload: c.payload })),
    citados,
    ambiguos,
  };
}

describe("cada ferramenta em cada etapa do funil (painel: confirmar tudo)", () => {
  it("cobre todos os tipos de ação", () => {
    expect(Object.keys(ENTRADAS).sort()).toEqual([...SAMIQ_PROPOSTA_TIPOS].sort());
  });

  for (const tipo of SAMIQ_PROPOSTA_TIPOS) {
    it(tipo, async () => {
      const porEtapa: Record<string, unknown> = {};
      for (const etapa of ETAPAS) {
        porEtapa[etapa] = await rodar(tipo, {
          leads: { L1: etapa, L2: etapa === "em_atendimento" ? "novo" : "em_atendimento" },
          tarefa: "pendente",
          visita: "agendado",
          anexoUsado: false,
        });
      }
      expect(porEtapa).toMatchSnapshot();
    });
  }
});

describe("travas que dependem do que está no banco", () => {
  const base: Cenario = { leads: { L1: "em_atendimento", L2: "novo" } };
  const casos: Array<[string, string, Cenario, Record<string, unknown>?]> = [
    ["cliente fora da carteira", "anotar", { leads: {} }],
    ["homônimo sem sobrenome no texto", "anotar", { ...base, homonimos: true }],
    ["visita já marcada no horário", "agendar_visita", { ...base, visitaNoHorario: true }],
    [
      "visita sem mover para agendado",
      "agendar_visita",
      { leads: { L1: "novo" } },
      { ...ENTRADAS.agendar_visita, moverParaAgendado: false },
    ],
    ["mudar para a mesma etapa", "mudar_etapa", { leads: { L1: "qualificacao_corretor" } }],
    ["troca: quem sai fora da carteira", "trocar_vaga", { leads: { L2: "novo" } }],
    [
      "troca: quem entra já em atendimento",
      "trocar_vaga",
      { leads: { L1: "em_atendimento", L2: "em_atendimento" } },
    ],
    ["troca válida", "trocar_vaga", { leads: { L1: "em_atendimento", L2: "novo" } }],
    [
      "visita sem comparecimento e sem data",
      "registrar_visita",
      { leads: { L1: "agendado" } },
      { leadId: IDS.L1, compareceu: false },
    ],
    ["venda sem corretor", "registrar_venda", { ...base, semCorretor: true }],
    ["tarefa inexistente", "concluir_tarefa", { ...base, tarefa: null }],
    ["tarefa já concluída", "reagendar_tarefa", { ...base, tarefa: "concluida" }],
    ["tarefa cancelada", "cancelar_tarefa", { ...base, tarefa: "cancelada" }],
    ["visita inexistente", "confirmar_visita", { ...base, visita: null }],
    ["visita já confirmada", "confirmar_visita", { ...base, visita: "confirmado" }],
    ["visita confirmada pode remarcar", "remarcar_visita", { ...base, visita: "confirmado" }],
    ["visita realizada", "cancelar_visita", { ...base, visita: "realizada" }],
    ["anexo sumiu", "anexar_documento", { ...base, anexoUsado: null }],
    ["anexo já usado", "anexar_documento", { ...base, anexoUsado: true }],
    ["filial desconhecida", "fazer_checkin", base, { modo: "loja", filial: "centro" }],
    ["check-in em casa", "fazer_checkin", base, { modo: "casa" }],
    ["telefone já na carteira", "criar_lead", { ...base, telefoneDuplicado: true }],
    [
      "cadastro com espaços duplos no nome",
      "criar_lead",
      base,
      { nome: "João  Pereira", telefone: "11987654321" },
    ],
  ];
  for (const [nome, tipo, cenario, entrada] of casos) {
    it(nome, async () => {
      expect(await rodar(tipo, cenario, { entrada })).toMatchSnapshot();
    });
  }
});

describe("modo por risco (WhatsApp)", () => {
  it("leve grava pelo executor; falha e pesada seguem o mesmo texto", async () => {
    const ok: ExecutorImediato = async () => ({
      ok: true,
      id: "p1",
      efeito: null,
      desfazivel: false,
    });
    const falha: ExecutorImediato = async () => ({ ok: false, erro: "recusado" });
    const base: Cenario = { leads: { L1: "em_atendimento" }, tarefa: "pendente" };
    expect({
      anotar: await rodar("anotar", base, { executar: ok }),
      concluir: await rodar("concluir_tarefa", base, { executar: falha }),
      perdido: await rodar("marcar_perdido", base, { executar: ok }),
    }).toMatchSnapshot();
  });

  it("descrição de cada ferramenta (o manual que chega ao modelo)", () => {
    const tools = criarFerramentasDePropostaSamiQ({
      supabase: bancoGravado({}).cliente,
      userId: "u1",
      coletor: [],
    });
    expect(Object.entries(tools).map(([nome, t]) => `${nome}: ${t.description}`)).toMatchSnapshot();
  });

  it("a regra de Em atendimento continua exportada", () => {
    expect(SAMIQ_REGRA_EM_ATENDIMENTO).toMatchSnapshot();
  });
});

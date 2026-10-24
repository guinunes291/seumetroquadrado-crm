// Cenários de banco para a caracterização do executor da Sami: respostas de
// tabelas e RPCs no formato de tests/helpers/samiq-executar-banco.ts.
import { IDS } from "./samiq-exemplos";

const { L1, L2, T1, A1, P1 } = IDS;

const lead = (status: string, extra: Record<string, unknown> = {}) => ({
  id: L1,
  nome: "Lucas Ferreira",
  corretor_id: "u1",
  status,
  cadencia_etapa: "d1",
  objecoes: ["parcela alta"],
  renda_informada: null,
  renda_estimada: 3000,
  temperatura: "morno",
  projeto_id: null,
  projeto_nome: null,
  ...extra,
});

const base: Record<string, unknown> = {
  "leads:select:unica": lead("em_atendimento"),
  "tarefas:select:unica": {
    id: T1,
    titulo: "Ligar",
    tipo: "ligacao",
    status: "pendente",
    prioridade: "media",
    lead_id: L1,
    data_vencimento: "2026-10-26T13:00:00.000Z",
    data_conclusao: null,
    resultado: null,
  },
  "agendamentos:select:unica": {
    id: A1,
    status: "agendado",
    tipo: "visita",
    lead_id: L1,
    titulo: "Visita Vibra",
    local: "Estande",
    data_inicio: "2026-10-28T18:00:00.000Z",
    data_fim: "2026-10-28T19:00:00.000Z",
    observacoes: null,
  },
  "projetos:select:unica": { id: P1, nome: "Vibra Lapa", construtora: "Vibra" },
  "analises_credito:select:unica": { id: "an-1", status: "enviada", lead_id: L1 },
  "rpc:registrar_contato_lead": {
    interacao_id: "int-1",
    tarefa_id: "tar-1",
    respondeu: true,
    entrou: true,
    moveu: true,
    status: "em_atendimento",
    lotado: null,
  },
  "rpc:transicionar_lead": true,
  "rpc:registrar_retorno_lead": {
    interacao_id: "int-2",
    tarefa_id: "tar-2",
    status: "aguardando_retorno",
  },
  "rpc:marcar_lead_perdido_v2": "u9",
  "rpc:trocar_vaga_em_atendimento": { entrou: L2, saiu: L1, interacao_id: "int-3" },
  "rpc:salvar_modo_visita": { interacao_id: "int-4" },
  "rpc:presenca_checkin": { ok: true, filial: "filial-barra-funda", liberado: true },
  "rpc:criar_lead_dedup": { lead_id: L2, criado: true },
  "rpc:prospeccao_pedir_lote": { lote_id: "lote-1", quantidade: 30 },
};

export const CENARIOS: Record<string, Record<string, unknown>> = {
  feliz: base,
  /** Cliente em prospecção, sem tarefas, RPCs que dizem "não aplicou". */
  prospeccao: {
    ...base,
    "leads:select:unica": lead("novo", { objecoes: null, corretor_id: null }),
    "tarefas:select:unica": { ...(base["tarefas:select:unica"] as object), status: "concluida" },
    "agendamentos:select:unica": {
      ...(base["agendamentos:select:unica"] as object),
      status: "confirmado",
    },
    "rpc:registrar_contato_lead": {
      interacao_id: "int-1",
      tarefa_id: null,
      respondeu: false,
      entrou: false,
      status: "novo",
      lotado: { em_atendimento: 65, teto: 65 },
    },
    "rpc:transicionar_lead": false,
    "rpc:criar_lead_dedup": { lead_id: L1, criado: false, motivo: "duplicado" },
    "rpc:presenca_checkin": { ok: false, motivo: "fora_da_filial" },
    "rpc:prospeccao_pedir_lote": { erro: "sem_vaga" },
  },
  /** Já existe tarefa aberta no mesmo horário e registros relacionados. */
  com_tarefas: {
    ...base,
    "tarefas:select:lista": [
      {
        id: T1,
        titulo: "Ligar",
        tipo: "ligacao",
        status: "pendente",
        prioridade: "media",
        data_vencimento: "2026-10-27T17:00:00.000Z",
        created_at: "2026-10-20T10:00:00.000Z",
      },
      { id: "t-velha", titulo: "Antiga", tipo: "follow_up", status: "pendente", created_at: "x" },
    ],
    "agendamentos:select:lista": [
      { id: A1, status: "agendado", data_inicio: "2026-10-28T18:00:00.000Z" },
    ],
    "documentacoes:select:lista": [{ id: "doc-0", tipo: "cpf", status: "pendente" }],
    "documentacoes:select:unica": { id: "doc-0", tipo: "cpf", status: "pendente" },
    "analises_credito:select:lista": [{ id: "an-1", status: "enviada" }],
    "leads:select:lista": [{ id: L1 }],
  },
  /** Ficha com 29 objeções: as novas param no limite de 30. */
  muitas_objecoes: {
    ...base,
    "leads:select:unica": lead("em_atendimento", {
      objecoes: Array.from({ length: 29 }, (_, i) => `objeção ${i + 1}`),
    }),
  },
  /** Empreendimento não cadastrado. */
  sem_projeto: { ...base, "projetos:select:unica": null },
  /** Nenhuma análise de crédito aberta. */
  sem_analise: { ...base, "analises_credito:select:unica": null },
  /** Perda sem corretor para redistribuir: cliente vai para a base. */
  perdido_base: { ...base, "rpc:marcar_lead_perdido_v2": null },
  /** Leituras vazias: nada encontrado. */
  vazio: { "rpc:transicionar_lead": true },
};

/** Toda escrita e toda RPC falham (o passo principal de cada ação). */
export const FALHAS_DE_ESCRITA = [
  ...[
    "leads",
    "tarefas",
    "interacoes",
    "agendamentos",
    "documentacoes",
    "analises_credito",
    "vendas",
  ].flatMap((t) => [`${t}:insert`, `${t}:update`, `${t}:delete`, `${t}:upsert`]),
  ...[
    "registrar_contato_lead",
    "transicionar_lead",
    "registrar_retorno_lead",
    "marcar_lead_perdido_v2",
    "trocar_vaga_em_atendimento",
    "salvar_modo_visita",
    "presenca_checkin",
    "marcar_presenca",
    "criar_lead_dedup",
    "prospeccao_pedir_lote",
    "cadencia_registrar_tentativa",
  ].map((r) => `rpc:${r}`),
];

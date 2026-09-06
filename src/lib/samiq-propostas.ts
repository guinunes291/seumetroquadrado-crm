// Núcleo PURO das PROPOSTAS de escrita da Sami (Onda S2 — decisões D1, D2,
// D5 e D7 em docs/samiq/2026-09-05-decisoes-copiloto.md).
//
// Doutrina: o modelo nunca grava. As ferramentas `propor_*` produzem uma
// proposta tipada; o painel mostra um card "Registrar N itens?"; um toque do
// corretor executa (samiq-executar.server.ts) com a sessão DELE (RLS) e marca
// o registro com origem 'samiq'. Aqui vivem os contratos (zod), os rótulos, a
// descrição humana de cada proposta e as regras de desfazer — sem rede.

import { z } from "zod";

export const SAMIQ_PROPOSTA_TIPOS = [
  "registrar_contato",
  "anotar",
  "criar_tarefa",
  "atualizar_qualificacao",
  "agendar_visita",
  "mudar_etapa",
] as const;

export type SamiQPropostaTipo = (typeof SAMIQ_PROPOSTA_TIPOS)[number];

export const SAMIQ_PROPOSTA_LABEL: Record<SamiQPropostaTipo, string> = {
  registrar_contato: "Registrar contato",
  anotar: "Anotar",
  criar_tarefa: "Criar tarefa",
  atualizar_qualificacao: "Atualizar qualificação",
  agendar_visita: "Agendar visita",
  mudar_etapa: "Mudar etapa",
};

/** Ferramenta do modelo → tipo de proposta (nomes que o modelo chama). */
export const SAMIQ_FERRAMENTAS_PROPOSTA = {
  propor_registro_contato: "registrar_contato",
  propor_anotacao: "anotar",
  propor_tarefa: "criar_tarefa",
  propor_qualificacao: "atualizar_qualificacao",
  propor_visita: "agendar_visita",
  propor_etapa: "mudar_etapa",
} as const satisfies Record<string, SamiQPropostaTipo>;

export type SamiQFerramentaProposta = keyof typeof SAMIQ_FERRAMENTAS_PROPOSTA;

// ---------------------------------------------------------------------------
// Vocabulários (espelham o que as telas já usam — nunca inventar valor novo)
// ---------------------------------------------------------------------------

export const CANAIS_CONTATO = [
  "ligacao",
  "whatsapp",
  "visita",
  "reuniao",
  "email",
  "sms",
  "outro",
] as const;

/** Mesmos resultados do RegistrarContatoDialog — o título vira a timeline. */
export const RESULTADOS_CONTATO = {
  atendeu: "Contato — atendeu",
  nao_atendeu: "Contato — não atendeu",
  interessado: "Contato — interessado",
  sem_interesse: "Contato — sem interesse",
  pediu_retorno: "Contato — pediu retorno",
} as const;

export type ResultadoContato = keyof typeof RESULTADOS_CONTATO;

export const RESULTADO_CONTATO_LABEL: Record<ResultadoContato, string> = {
  atendeu: "Atendeu",
  nao_atendeu: "Não atendeu",
  interessado: "Interessado",
  sem_interesse: "Sem interesse",
  pediu_retorno: "Pediu retorno",
};

export const TAREFA_TIPOS_PROPOSTA = [
  "ligacao",
  "whatsapp",
  "email",
  "visita",
  "follow_up",
  "documentacao",
  "outro",
] as const;

export const TAREFA_PRIORIDADES_PROPOSTA = ["baixa", "media", "alta", "urgente"] as const;

/**
 * Etapas que a Sami pode propor. Ficam FORA as que exigem os modais
 * obrigatórios com dados próprios (visita realizada → feedback; análise de
 * crédito → parecer; contrato fechado / pós-venda → venda aprovada) e as
 * etapas de entrada (novo, aguardando_*). 'agendado' entra pela proposta de
 * visita (que cria o compromisso e move o lead num gesto só).
 */
export const ETAPAS_PROPONIVEIS = [
  "em_atendimento",
  "aguardando_retorno",
  "qualificacao_corretor",
  "qualificado",
  "proposta_enviada",
  "perdido",
] as const;

/** Espelha MOTIVO_PERDA_CATEGORIAS de lib/leads.ts (CHECK do banco) — o teste
 *  de contrato garante que as duas listas não divergem. */
export const MOTIVOS_PERDA_PROPOSTA = [
  "sem_contato",
  "sumiu_pos_proposta",
  "credito_score",
  "credito_renda",
  "estourou_teto",
  "ja_possui_imovel",
  "preco_parcela",
  "comprou_concorrente",
  "timing_adiou",
  "sem_perfil",
  "outro",
] as const;

const TEMPERATURAS = ["quente", "morno", "frio"] as const;

const ISO_DATA_HORA = z
  .string()
  .min(10)
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), "data/hora inválida (use ISO 8601)");

const uuid = z.string().uuid();
const textoCurto = (max: number) => z.string().trim().min(1).max(max);

// ---------------------------------------------------------------------------
// Contratos de cada proposta (o modelo preenche; servidor e card validam)
// ---------------------------------------------------------------------------

export const RegistrarContatoPayload = z.object({
  tipo: z.literal("registrar_contato"),
  leadId: uuid.describe("id do cliente"),
  canal: z
    .enum(CANAIS_CONTATO)
    .describe("ligacao | whatsapp | visita | reuniao | email | sms | outro"),
  resultado: z
    .enum(["atendeu", "nao_atendeu", "interessado", "sem_interesse", "pediu_retorno"])
    .describe("Desfecho do contato"),
  resumo: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .describe("O que foi conversado, nas palavras do corretor (sem telefone/CPF)"),
  followupEm: ISO_DATA_HORA.nullable()
    .optional()
    .describe("Quando retornar (ISO 8601 com fuso); null = sem follow-up"),
  objecoes: z
    .array(textoCurto(80))
    .max(5)
    .optional()
    .describe("Objeções ditas pelo cliente, uma por item (ex.: 'parcela alta')"),
});

export const AnotarPayload = z.object({
  tipo: z.literal("anotar"),
  leadId: uuid,
  nota: textoCurto(2000).describe("Anotação interna sobre o cliente"),
});

export const CriarTarefaPayload = z.object({
  tipo: z.literal("criar_tarefa"),
  leadId: uuid.nullable().optional().describe("Cliente da tarefa; null = tarefa sem cliente"),
  titulo: textoCurto(160),
  tipoTarefa: z
    .enum(TAREFA_TIPOS_PROPOSTA)
    .describe("ligacao | whatsapp | email | visita | follow_up | documentacao | outro"),
  vencimentoEm: ISO_DATA_HORA.describe("ISO 8601 com fuso"),
  prioridade: z.enum(TAREFA_PRIORIDADES_PROPOSTA).optional().describe("Padrão media"),
});

export const AtualizarQualificacaoPayload = z
  .object({
    tipo: z.literal("atualizar_qualificacao"),
    leadId: uuid,
    rendaInformada: z
      .string()
      .trim()
      .max(60)
      .optional()
      .describe("Renda familiar como o cliente disse, ex.: '4500'"),
    entradaDisponivel: z.string().trim().max(60).optional(),
    usaFgts: z.boolean().optional(),
    temFgts: z.boolean().optional(),
    tipoRenda: z
      .string()
      .trim()
      .max(40)
      .optional()
      .describe("clt | autonomo | servidor | misto | outro"),
    temperatura: z.enum(TEMPERATURAS).optional(),
    projetoInteresse: z
      .string()
      .trim()
      .max(120)
      .optional()
      .describe("Nome do empreendimento de interesse"),
    objecoesAdicionar: z.array(textoCurto(80)).max(5).optional(),
    resumoQualificacao: z
      .string()
      .trim()
      .max(1500)
      .optional()
      .describe("Parecer curto de qualificação"),
  })
  .refine(
    (p) =>
      [
        p.rendaInformada,
        p.entradaDisponivel,
        p.usaFgts,
        p.temFgts,
        p.tipoRenda,
        p.temperatura,
        p.projetoInteresse,
        p.resumoQualificacao,
      ].some((v) => v !== undefined) || (p.objecoesAdicionar?.length ?? 0) > 0,
    "informe pelo menos um campo para atualizar",
  );

export const AgendarVisitaPayload = z.object({
  tipo: z.literal("agendar_visita"),
  leadId: uuid,
  inicioEm: ISO_DATA_HORA.describe("Início da visita, ISO 8601 com fuso"),
  duracaoMin: z.number().int().min(15).max(480).optional().describe("Padrão 60"),
  local: z.string().trim().max(160).optional().describe("Empreendimento ou endereço do estande"),
  titulo: z.string().trim().max(160).optional(),
  moverParaAgendado: z
    .boolean()
    .optional()
    .describe("true (padrão) = também move o cliente para a etapa Agendado"),
});

export const MudarEtapaPayload = z
  .object({
    tipo: z.literal("mudar_etapa"),
    leadId: uuid,
    novoStatus: z.enum(ETAPAS_PROPONIVEIS),
    motivo: z.string().trim().max(1000).optional().describe("Obrigatório ao perder"),
    motivoCategoria: z.enum(MOTIVOS_PERDA_PROPOSTA).optional().describe("Só ao perder"),
    proximaAcao: z.string().trim().max(500).optional(),
    proximoFollowupEm: ISO_DATA_HORA.optional(),
  })
  .refine((p) => p.novoStatus !== "perdido" || !!p.motivo?.trim(), "motivo é obrigatório ao perder")
  .refine(
    (p) => p.novoStatus !== "aguardando_retorno" || !!p.proximoFollowupEm,
    "aguardando retorno exige follow-up",
  );

export const PropostaPayloadSchema = z.discriminatedUnion("tipo", [
  RegistrarContatoPayload,
  AnotarPayload,
  CriarTarefaPayload,
  AtualizarQualificacaoPayload,
  AgendarVisitaPayload,
  MudarEtapaPayload,
]);

export type PropostaPayload = z.infer<typeof PropostaPayloadSchema>;

/** Proposta como o painel recebe (persistida em samiq_propostas). */
export type PropostaSamiQ = {
  id: string;
  tipo: SamiQPropostaTipo;
  payload: PropostaPayload;
  /** Nome do cliente resolvido no servidor (o modelo só manda o id). */
  leadNome: string | null;
  status: "pendente" | "aceita" | "editada" | "rejeitada" | "desfeita" | "falhou";
  /** Até quando dá para desfazer (24 h após confirmar); null = não desfaz. */
  desfazerAte?: string | null;
  erro?: string | null;
};

export const SAMIQ_DESFAZER_JANELA_HORAS = 24;

/** Mudança de etapa passa pela máquina de estados do funil — não se desfaz por botão. */
export function podeDesfazerProposta(tipo: SamiQPropostaTipo): boolean {
  return tipo !== "mudar_etapa";
}

/** Conteúdo da interação = resumo do corretor; sem resumo, o próprio resultado. */
export function conteudoContato(p: z.infer<typeof RegistrarContatoPayload>): string {
  return p.resumo?.trim() || RESULTADO_CONTATO_LABEL[p.resultado];
}

/** Fim da visita = início + duração (padrão 60 min). */
export function fimDaVisita(p: z.infer<typeof AgendarVisitaPayload>): string {
  const inicio = new Date(p.inicioEm).getTime();
  return new Date(inicio + (p.duracaoMin ?? 60) * 60_000).toISOString();
}

export function tituloVisita(
  p: z.infer<typeof AgendarVisitaPayload>,
  leadNome: string | null,
): string {
  if (p.titulo?.trim()) return p.titulo.trim();
  return p.local?.trim() ? `Visita - ${p.local.trim()}` : `Visita - ${leadNome ?? "cliente"}`;
}

function fmtDataHora(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(",", "");
}

export type DescricaoProposta = { titulo: string; detalhes: string[] };

/** Texto humano do card e do retorno da ferramenta (o que o modelo "vê"). */
export function descreverProposta(
  payload: PropostaPayload,
  leadNome: string | null,
): DescricaoProposta {
  const quem = leadNome ?? "cliente";
  switch (payload.tipo) {
    case "registrar_contato": {
      const detalhes = [`${payload.canal} · ${RESULTADO_CONTATO_LABEL[payload.resultado]}`];
      if (payload.resumo?.trim()) detalhes.push(payload.resumo.trim());
      if (payload.objecoes?.length) detalhes.push(`Objeções: ${payload.objecoes.join(", ")}`);
      const fu = fmtDataHora(payload.followupEm);
      detalhes.push(fu ? `Follow-up: ${fu}` : "Sem follow-up");
      return { titulo: `Registrar contato com ${quem}`, detalhes };
    }
    case "anotar":
      return { titulo: `Anotar sobre ${quem}`, detalhes: [payload.nota] };
    case "criar_tarefa": {
      const venc = fmtDataHora(payload.vencimentoEm);
      return {
        titulo: payload.leadId
          ? `Tarefa para ${quem}: ${payload.titulo}`
          : `Tarefa: ${payload.titulo}`,
        detalhes: [
          `${payload.tipoTarefa} · prioridade ${payload.prioridade ?? "media"}`,
          venc ? `Vence: ${venc}` : "Sem vencimento válido",
        ],
      };
    }
    case "atualizar_qualificacao": {
      const detalhes: string[] = [];
      if (payload.rendaInformada !== undefined) detalhes.push(`Renda: ${payload.rendaInformada}`);
      if (payload.entradaDisponivel !== undefined)
        detalhes.push(`Entrada: ${payload.entradaDisponivel}`);
      if (payload.usaFgts !== undefined)
        detalhes.push(`Usa FGTS: ${payload.usaFgts ? "sim" : "não"}`);
      if (payload.temFgts !== undefined)
        detalhes.push(`Tem FGTS: ${payload.temFgts ? "sim" : "não"}`);
      if (payload.tipoRenda !== undefined) detalhes.push(`Tipo de renda: ${payload.tipoRenda}`);
      if (payload.temperatura !== undefined) detalhes.push(`Temperatura: ${payload.temperatura}`);
      if (payload.projetoInteresse !== undefined)
        detalhes.push(`Projeto: ${payload.projetoInteresse}`);
      if (payload.objecoesAdicionar?.length)
        detalhes.push(`Objeções: ${payload.objecoesAdicionar.join(", ")}`);
      if (payload.resumoQualificacao !== undefined)
        detalhes.push(`Parecer: ${payload.resumoQualificacao}`);
      return { titulo: `Atualizar qualificação de ${quem}`, detalhes };
    }
    case "agendar_visita": {
      const quando = fmtDataHora(payload.inicioEm);
      const detalhes = [quando ? `Quando: ${quando}` : "Data inválida"];
      if (payload.local?.trim()) detalhes.push(`Onde: ${payload.local.trim()}`);
      detalhes.push(
        payload.moverParaAgendado === false
          ? "Mantém a etapa atual"
          : "Move o cliente para Agendado",
      );
      return { titulo: `Agendar visita com ${quem}`, detalhes };
    }
    case "mudar_etapa": {
      const detalhes: string[] = [];
      if (payload.motivo?.trim()) detalhes.push(`Motivo: ${payload.motivo.trim()}`);
      if (payload.motivoCategoria) detalhes.push(`Categoria: ${payload.motivoCategoria}`);
      if (payload.proximaAcao?.trim()) detalhes.push(`Próxima ação: ${payload.proximaAcao.trim()}`);
      const fu = fmtDataHora(payload.proximoFollowupEm);
      if (fu) detalhes.push(`Follow-up: ${fu}`);
      detalhes.push("Não dá para desfazer pelo botão — a etapa segue a máquina de estados");
      return { titulo: `Mover ${quem} para ${payload.novoStatus}`, detalhes };
    }
  }
}

/** Texto curto do pacote: "Registrar 3 itens para Maria?" */
export function tituloDoPacote(propostas: ReadonlyArray<{ leadNome: string | null }>): string {
  const n = propostas.length;
  const nomes = [...new Set(propostas.map((p) => p.leadNome).filter(Boolean))];
  const alvo = nomes.length === 1 ? ` para ${nomes[0]}` : "";
  return n === 1 ? `Registrar 1 item${alvo}?` : `Registrar ${n} itens${alvo}?`;
}

/** Marca gravada em interacoes.metadata / resultado — é o que a timeline lê. */
export const SAMIQ_ORIGEM = "samiq" as const;

export function metadataViaSami(args: { executionId?: string | null; propostaId: string }) {
  return {
    origem: SAMIQ_ORIGEM,
    proposta_id: args.propostaId,
    ...(args.executionId ? { execution_id: args.executionId } : {}),
  };
}

/** Interação registrada pela Sami? (lê metadata.origem) */
export function foiViaSami(metadata: unknown): boolean {
  return (
    !!metadata &&
    typeof metadata === "object" &&
    (metadata as { origem?: unknown }).origem === SAMIQ_ORIGEM
  );
}

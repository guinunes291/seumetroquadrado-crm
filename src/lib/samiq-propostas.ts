// Núcleo PURO das AÇÕES de escrita da Sami (Onda S2 → v8 "CRM no WhatsApp").
//
// Doutrina (S2): o modelo nunca grava sozinho. Cada ferramenta de escrita
// produz uma ação tipada (zod); a execução acontece em
// samiq-executar.server.ts com a SESSÃO DO CORRETOR (RLS, triggers e autor
// iguais aos da tela) e fica registrada em samiq_propostas com o resultado
// (ids gravados + snapshot) para o desfazer de 24 h.
//
// v8 (24/10/2026, decisão do Guilherme): autonomia POR RISCO no WhatsApp.
//  * "direto": o que a tela faz num clique e se desfaz (contato, nota,
//    tarefa, qualificação, confirmar/remarcar visita, documento, check-in)
//    grava na hora; o corretor pode responder DESFAZER.
//  * "confirmar": o que muda a etapa do funil, mexe com outra pessoa ou não
//    tem volta (perda, retorno, visita, análise, venda, cadastro, lote) espera
//    o CONFIRMAR do corretor.
// No painel do CRM tudo continua pelo card (um toque já é o atalho).
//
// Aqui vivem os contratos, os rótulos, a descrição humana de cada ação e as
// regras de desfazer — sem rede.

import { z } from "zod";
import { LEAD_STATUS_LABEL, MOTIVO_PERDA_LABEL, type LeadStatus } from "@/lib/leads";
import { DOC_LABEL, DOC_STATUS, PERFIL_RENDA } from "@/lib/documentacao-checklist";
import { fmtDataHoraSP, fmtDiaBr } from "@/lib/samiq-datas";

export const SAMIQ_PROPOSTA_TIPOS = [
  "registrar_contato",
  "anotar",
  "criar_tarefa",
  "atualizar_qualificacao",
  "agendar_visita",
  "mudar_etapa",
  // v8 — CRM no WhatsApp
  "registrar_retorno",
  "marcar_perdido",
  "trocar_vaga",
  "concluir_tarefa",
  "reagendar_tarefa",
  "cancelar_tarefa",
  "confirmar_visita",
  "remarcar_visita",
  "cancelar_visita",
  "registrar_visita",
  "documentos_checklist",
  "atualizar_documento",
  "anexar_documento",
  "enviar_analise_credito",
  "registrar_resultado_credito",
  "registrar_venda",
  "fazer_checkin",
  "criar_lead",
  "pedir_lote",
] as const;

export type SamiQPropostaTipo = (typeof SAMIQ_PROPOSTA_TIPOS)[number];

export const SAMIQ_PROPOSTA_LABEL: Record<SamiQPropostaTipo, string> = {
  registrar_contato: "Registrar contato",
  anotar: "Anotar",
  criar_tarefa: "Criar tarefa",
  atualizar_qualificacao: "Atualizar qualificação",
  agendar_visita: "Agendar visita",
  mudar_etapa: "Mudar etapa",
  registrar_retorno: "Retorno combinado",
  marcar_perdido: "Marcar como perdido",
  trocar_vaga: "Trocar vaga em atendimento",
  concluir_tarefa: "Concluir tarefa",
  reagendar_tarefa: "Reagendar tarefa",
  cancelar_tarefa: "Cancelar tarefa",
  confirmar_visita: "Confirmar visita",
  remarcar_visita: "Remarcar visita",
  cancelar_visita: "Cancelar visita",
  registrar_visita: "Resultado da visita",
  documentos_checklist: "Checklist de documentos",
  atualizar_documento: "Atualizar documento",
  anexar_documento: "Anexar documento",
  enviar_analise_credito: "Enviar para análise de crédito",
  registrar_resultado_credito: "Resultado do crédito",
  registrar_venda: "Registrar venda",
  fazer_checkin: "Check-in",
  criar_lead: "Cadastrar cliente",
  pedir_lote: "Pedir lote de prospecção",
};

/** Ferramenta do modelo → tipo da ação. Na v8 o nome da ferramenta é o próprio tipo. */
export const SAMIQ_FERRAMENTAS_PROPOSTA = Object.fromEntries(
  SAMIQ_PROPOSTA_TIPOS.map((tipo) => [tipo, tipo]),
) as { readonly [K in SamiQPropostaTipo]: K };

export type SamiQFerramentaProposta = keyof typeof SAMIQ_FERRAMENTAS_PROPOSTA;

// ---------------------------------------------------------------------------
// Autonomia por risco (v8)
// ---------------------------------------------------------------------------

export type NivelAcao = "direto" | "confirmar";

export const SAMIQ_NIVEL_ACAO: Record<SamiQPropostaTipo, NivelAcao> = {
  registrar_contato: "direto",
  anotar: "direto",
  criar_tarefa: "direto",
  atualizar_qualificacao: "direto",
  agendar_visita: "confirmar",
  mudar_etapa: "confirmar",
  registrar_retorno: "confirmar",
  marcar_perdido: "confirmar",
  trocar_vaga: "confirmar",
  concluir_tarefa: "direto",
  reagendar_tarefa: "direto",
  cancelar_tarefa: "direto",
  confirmar_visita: "direto",
  remarcar_visita: "direto",
  cancelar_visita: "confirmar",
  registrar_visita: "confirmar",
  documentos_checklist: "direto",
  atualizar_documento: "direto",
  anexar_documento: "direto",
  enviar_analise_credito: "confirmar",
  registrar_resultado_credito: "confirmar",
  registrar_venda: "confirmar",
  fazer_checkin: "direto",
  criar_lead: "confirmar",
  pedir_lote: "confirmar",
};

export type ModoEscritaSamiQ = "por_risco" | "confirmar_tudo";

export function nivelDaAcao(tipo: SamiQPropostaTipo, modo: ModoEscritaSamiQ): NivelAcao {
  return modo === "por_risco" ? SAMIQ_NIVEL_ACAO[tipo] : "confirmar";
}

/**
 * O que o desfazer de 24 h consegue reverter de verdade (o banco espelha esta
 * lista em samiq_decidir_proposta/samiq_desfazer_proposta). Fica de fora o
 * que passa pela máquina de estados do funil (etapa, perda, retorno, visita
 * realizada, análise), o que outra pessoa já pode ter usado (venda, lote)
 * e o que se refaz na hora (check-in, arquivo). Cadastro novo desfaz indo
 * para a lixeira, igual ao que já estava em produção.
 */
export const SAMIQ_TIPOS_DESFAZIVEIS = [
  "registrar_contato",
  "anotar",
  "criar_tarefa",
  "atualizar_qualificacao",
  "agendar_visita",
  "concluir_tarefa",
  "reagendar_tarefa",
  "cancelar_tarefa",
  "confirmar_visita",
  "remarcar_visita",
  "cancelar_visita",
  "atualizar_documento",
  // Cadastro novo: o desfazer manda o cliente para a lixeira (migration 0108).
  "criar_lead",
] as const satisfies readonly SamiQPropostaTipo[];

export function podeDesfazerProposta(tipo: SamiQPropostaTipo): boolean {
  return (SAMIQ_TIPOS_DESFAZIVEIS as readonly string[]).includes(tipo);
}

// ---------------------------------------------------------------------------
// Vocabulários (espelham o que as telas e o banco já usam — nunca inventar valor)
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

export const CANAL_LABEL: Record<(typeof CANAIS_CONTATO)[number], string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  visita: "Visita",
  reuniao: "Reunião",
  email: "E-mail",
  sms: "SMS",
  outro: "Outro canal",
};

/** Mesmos títulos de registrar_contato_lead (é o que aparece na timeline). */
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
 * Etapa que a ferramenta mudar_etapa ainda oferece (v8). Todo o resto tem
 * caminho próprio, igual à tela: Em atendimento é consequência do contato;
 * Aguardando retorno sai por registrar_retorno; Agendado por agendar_visita;
 * Visita realizada por registrar_visita; Análise por enviar_analise_credito;
 * Perdido por marcar_perdido; Venda pela aprovação da gestão.
 */
export const ETAPAS_PROPONIVEIS = ["qualificacao_corretor"] as const;

/** Etapas aceitas em propostas antigas (até a v7) — só para validar o que já está no banco. */
const ETAPAS_DE_PAYLOAD_ANTIGO = [
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

export const FAIXAS_MCMV = ["F1", "F2", "F3", "F4"] as const;

/** Prioridades do card "Perfil do cliente" (perfil-cliente-card.tsx). */
export const PRIORIDADES_CLIENTE = [
  "lazer_completo",
  "perto_metro",
  "pet",
  "seguranca",
  "pronto_para_morar",
  "home_office",
  "varanda",
  "area_verde",
  "escola_perto",
] as const;

/** Leitura de interesse e objeção principal do Modo Visita (salvar_modo_visita). */
export const INTERESSES_VISITA = ["alto", "medio", "baixo", "sem_interesse"] as const;
export const OBJECOES_VISITA = [
  "sem_objecao",
  "preco_parcela",
  "entrada_alta",
  "credito_renda",
  "estourou_teto",
  "metragem",
  "localizacao",
  "prazo_entrega",
  "condominio",
  "decisor_ausente",
  "quer_comparar",
  "timing_adiou",
  "outro",
] as const;

export const ETAPAS_APOS_VISITA = [
  "visita_realizada",
  "aguardando_retorno",
  "analise_credito",
] as const;

/** Slugs de documento do checklist (lib/documentacao-checklist.ts). */
export const DOCUMENTOS_TIPOS = Object.keys(DOC_LABEL) as [string, ...string[]];

export const ORIGENS_CAPTACAO = [
  "captacao_corretor",
  "indicacao",
  "investimento_corretor",
  "whatsapp",
  "telefone",
  "plantao",
  "acao_rua",
  "site",
  "portal",
  "outro",
] as const;

export const ORIGEM_CAPTACAO_LABEL: Record<(typeof ORIGENS_CAPTACAO)[number], string> = {
  captacao_corretor: "captação do corretor",
  indicacao: "indicação",
  investimento_corretor: "investimento do corretor",
  whatsapp: "WhatsApp",
  telefone: "telefone",
  plantao: "plantão",
  acao_rua: "ação de rua",
  site: "site",
  portal: "portal",
  outro: "outro",
};

export const ZONAS_LOTE = ["Norte", "Sul", "Leste", "Oeste", "Centro", "Grande SP"] as const;

export const MODALIDADES_CREDITO = ["mcmv", "sbpe", "pro_cotista", "outro"] as const;

const ISO_DATA_HORA = z
  .string()
  .min(10)
  .max(40)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)),
    "data/hora inválida (use ISO 8601, ex.: 2026-10-25T10:00:00-03:00)",
  );

const DIA_ISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T12:00:00Z`)), "data inválida");

const MES_ISO = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use AAAA-MM");

const uuid = z.string().uuid();
const textoCurto = (max: number) => z.string().trim().min(1).max(max);
const textoOpcional = (max: number) => z.string().trim().max(max).optional();
const valor = z.number().positive().max(100_000_000);

// ---------------------------------------------------------------------------
// Contratos de cada ação (o modelo preenche; servidor e card validam)
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
  proximoPasso: textoOpcional(200).describe(
    "O que fazer no follow-up, ex.: 'Enviar simulação' (padrão: Follow-up com o cliente)",
  ),
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

// Objeto base SEM refine: o zod 4.4+ proíbe .omit() em objeto refinado, e as
// ferramentas precisam do schema sem o campo `tipo`.
export const AtualizarQualificacaoBase = z.object({
  tipo: z.literal("atualizar_qualificacao"),
  leadId: uuid,
  rendaInformada: z
    .string()
    .trim()
    .max(60)
    .optional()
    .describe("Renda familiar como o cliente disse, ex.: '4500'"),
  rendaEstimada: valor.optional().describe("Renda familiar em reais, número (ex.: 4500)"),
  entradaDisponivel: z.string().trim().max(60).optional(),
  usaFgts: z.boolean().optional(),
  temFgts: z.boolean().optional(),
  fgtsValor: z.number().min(0).max(10_000_000).optional().describe("Saldo de FGTS em reais"),
  tipoRenda: z
    .string()
    .trim()
    .max(40)
    .optional()
    .describe("clt | autonomo | servidor | misto | outro"),
  faixaMcmv: z.enum(FAIXAS_MCMV).optional(),
  temperatura: z.enum(TEMPERATURAS).optional(),
  decisor: textoOpcional(120).describe("Quem decide junto (ex.: 'esposa', 'compra sozinho')"),
  zona: textoOpcional(40).describe("Zona de interesse (Norte, Sul, Leste, Oeste, Centro)"),
  bairro: textoOpcional(80).describe("Bairro de interesse"),
  dormsDesejados: z.number().int().min(1).max(5).optional(),
  precisaVaga: z.boolean().optional(),
  prioridades: z
    .array(z.enum(PRIORIDADES_CLIENTE))
    .max(9)
    .optional()
    .describe("Prioridades do cliente (substitui a lista atual)"),
  notaPerfil: textoOpcional(1200).describe("Nota do perfil do cliente (o que ele valoriza)"),
  projetoId: uuid.optional().describe("id do empreendimento de interesse (de catalogo_projetos)"),
  projetoInteresse: z
    .string()
    .trim()
    .max(120)
    .optional()
    .describe("Nome do empreendimento de interesse (só quando não há id)"),
  objecoesAdicionar: z.array(textoCurto(80)).max(5).optional(),
  resumoQualificacao: z
    .string()
    .trim()
    .max(1500)
    .optional()
    .describe("Parecer curto de qualificação"),
});

type QualificacaoCampos = Omit<z.infer<typeof AtualizarQualificacaoBase>, "tipo" | "leadId">;

const CAMPOS_QUALIFICACAO: ReadonlyArray<keyof QualificacaoCampos> = [
  "rendaInformada",
  "rendaEstimada",
  "entradaDisponivel",
  "usaFgts",
  "temFgts",
  "fgtsValor",
  "tipoRenda",
  "faixaMcmv",
  "temperatura",
  "decisor",
  "zona",
  "bairro",
  "dormsDesejados",
  "precisaVaga",
  "prioridades",
  "notaPerfil",
  "projetoId",
  "projetoInteresse",
  "resumoQualificacao",
];

/** Regra da qualificação: pelo menos um campo para atualizar. */
export function qualificacaoTemCampo(p: QualificacaoCampos): boolean {
  return (
    CAMPOS_QUALIFICACAO.some((c) => p[c] !== undefined) || (p.objecoesAdicionar?.length ?? 0) > 0
  );
}
export const MSG_QUALIFICACAO_VAZIA = "informe pelo menos um campo para atualizar";

export const AtualizarQualificacaoPayload = AtualizarQualificacaoBase.refine(
  qualificacaoTemCampo,
  MSG_QUALIFICACAO_VAZIA,
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

export const MudarEtapaBase = z.object({
  tipo: z.literal("mudar_etapa"),
  leadId: uuid,
  novoStatus: z.enum(ETAPAS_DE_PAYLOAD_ANTIGO),
  motivo: z.string().trim().max(1000).optional().describe("Obrigatório ao perder"),
  motivoCategoria: z.enum(MOTIVOS_PERDA_PROPOSTA).optional().describe("Só ao perder"),
  proximaAcao: z.string().trim().max(500).optional(),
  proximoFollowupEm: ISO_DATA_HORA.optional(),
});

/** O que a FERRAMENTA mudar_etapa aceita na v8 (o payload antigo continua válido no banco). */
export const MudarEtapaFerramentaBase = MudarEtapaBase.extend({
  novoStatus: z.enum(ETAPAS_PROPONIVEIS).describe("qualificacao_corretor"),
});

type EtapaCampos = Pick<
  z.infer<typeof MudarEtapaBase>,
  "novoStatus" | "motivo" | "proximoFollowupEm"
>;
export const etapaPerdidoTemMotivo = (p: EtapaCampos) =>
  p.novoStatus !== "perdido" || !!p.motivo?.trim();
export const MSG_ETAPA_PERDIDO = "motivo é obrigatório ao perder";
export const etapaRetornoTemFollowup = (p: EtapaCampos) =>
  p.novoStatus !== "aguardando_retorno" || !!p.proximoFollowupEm;
export const MSG_ETAPA_RETORNO = "aguardando retorno exige follow-up";

export const MudarEtapaPayload = MudarEtapaBase.refine(
  etapaPerdidoTemMotivo,
  MSG_ETAPA_PERDIDO,
).refine(etapaRetornoTemFollowup, MSG_ETAPA_RETORNO);

// --- v8: funil ---------------------------------------------------------------

export const RegistrarRetornoPayload = z.object({
  tipo: z.literal("registrar_retorno"),
  leadId: uuid,
  desfecho: z.enum(["pediu_retorno", "esfriou"]).describe("pediu_retorno | esfriou"),
  retornoEm: ISO_DATA_HORA.describe("Data/hora combinada para retornar (futura)"),
  nota: textoOpcional(500).describe("O que foi combinado"),
  canal: z
    .enum(CANAIS_CONTATO)
    .optional()
    .describe("Canal do contato que gerou o retorno (padrão ligacao)"),
});

export const MarcarPerdidoBase = z.object({
  tipo: z.literal("marcar_perdido"),
  leadId: uuid,
  categoria: z.enum(MOTIVOS_PERDA_PROPOSTA),
  detalhe: textoOpcional(500).describe("Obrigatório quando a categoria é 'outro'"),
});
export const perdaOutroTemDetalhe = (p: { categoria: string; detalhe?: string }) =>
  p.categoria !== "outro" || !!p.detalhe?.trim();
export const MSG_PERDA_OUTRO = "descreva o motivo quando a categoria é 'outro'";
export const MarcarPerdidoPayload = MarcarPerdidoBase.refine(perdaOutroTemDetalhe, MSG_PERDA_OUTRO);

export const TrocarVagaBase = z.object({
  tipo: z.literal("trocar_vaga"),
  entraLeadId: uuid.describe("Cliente que entra em Em atendimento"),
  saiLeadId: uuid.describe("Cliente em Em atendimento que libera a vaga"),
  desfecho: z
    .enum(["pediu_retorno", "esfriou", "perdido"])
    .describe("O que aconteceu com quem sai"),
  retornoEm: ISO_DATA_HORA.optional().describe("Quem sai: data do retorno (pediu_retorno/esfriou)"),
  categoria: z.enum(MOTIVOS_PERDA_PROPOSTA).optional().describe("Quem sai: categoria da perda"),
  detalhe: textoOpcional(500),
  contato: z
    .enum(["ligacao", "whatsapp"])
    .optional()
    .describe("Contato com quem entra, se foi agora"),
  proximoPasso: textoOpcional(200).describe("Próximo passo de quem entra"),
  proximoFollowupEm: ISO_DATA_HORA.optional().describe("Data do próximo passo de quem entra"),
});
export const trocaTemDados = (p: {
  desfecho: string;
  retornoEm?: string;
  categoria?: string;
  entraLeadId: string;
  saiLeadId: string;
}) => p.entraLeadId !== p.saiLeadId && (p.desfecho === "perdido" ? !!p.categoria : !!p.retornoEm);
export const MSG_TROCA =
  "troca precisa de dois clientes diferentes; retorno exige data e perda exige categoria";
export const TrocarVagaPayload = TrocarVagaBase.refine(trocaTemDados, MSG_TROCA);

// --- v8: tarefas -------------------------------------------------------------

export const ConcluirTarefaPayload = z.object({
  tipo: z.literal("concluir_tarefa"),
  tarefaId: uuid.describe("id da tarefa (de minhas_tarefas ou detalhe_cliente)"),
  resultado: textoOpcional(300).describe("Como foi (opcional)"),
});

export const ReagendarTarefaPayload = z.object({
  tipo: z.literal("reagendar_tarefa"),
  tarefaId: uuid,
  novoVencimentoEm: ISO_DATA_HORA.describe("Novo vencimento, ISO 8601 com fuso"),
});

export const CancelarTarefaPayload = z.object({
  tipo: z.literal("cancelar_tarefa"),
  tarefaId: uuid,
  motivo: textoOpcional(300),
});

// --- v8: visitas -------------------------------------------------------------

export const ConfirmarVisitaPayload = z.object({
  tipo: z.literal("confirmar_visita"),
  agendamentoId: uuid.describe("id da visita (de minha_agenda ou detalhe_cliente)"),
});

export const RemarcarVisitaPayload = z.object({
  tipo: z.literal("remarcar_visita"),
  agendamentoId: uuid,
  novoInicioEm: ISO_DATA_HORA.describe("Novo início, ISO 8601 com fuso"),
  duracaoMin: z.number().int().min(15).max(480).optional().describe("Padrão: a mesma da visita"),
});

export const CancelarVisitaPayload = z.object({
  tipo: z.literal("cancelar_visita"),
  agendamentoId: uuid,
  motivo: textoCurto(300).describe("Por que cancelou"),
});

export const RegistrarVisitaBase = z.object({
  tipo: z.literal("registrar_visita"),
  leadId: uuid,
  agendamentoId: uuid.optional().describe("id da visita; vazio = a visita aberta do cliente"),
  compareceu: z.boolean().describe("true = foi à visita; false = não compareceu"),
  interesse: z.enum(INTERESSES_VISITA).optional().describe("Só quando compareceu"),
  objecaoPrincipal: z.enum(OBJECOES_VISITA).optional(),
  observacoes: textoOpcional(2000).describe("Como foi a visita"),
  proximaEtapa: z
    .enum(ETAPAS_APOS_VISITA)
    .optional()
    .describe("Padrão: visita_realizada (compareceu) ou aguardando_retorno (não veio)"),
  proximoPasso: textoOpcional(200),
  proximoFollowupEm: ISO_DATA_HORA.optional().describe("Data do próximo passo"),
  reagendarPara: ISO_DATA_HORA.optional().describe("Nova visita, se já remarcou"),
  realizadaEm: ISO_DATA_HORA.optional().describe("Quando foi (só se a visita não estava agendada)"),
});
export const visitaSemComparecimentoSemInteresse = (p: {
  compareceu: boolean;
  interesse?: string;
  proximaEtapa?: string;
}) => p.compareceu || (!p.interesse && p.proximaEtapa !== "visita_realizada");
export const MSG_VISITA_SEM_COMPARECIMENTO =
  "sem comparecimento não há leitura de interesse nem visita realizada";
export const RegistrarVisitaPayload = RegistrarVisitaBase.refine(
  visitaSemComparecimentoSemInteresse,
  MSG_VISITA_SEM_COMPARECIMENTO,
);

// --- v8: documentos ----------------------------------------------------------

export const DocumentosChecklistPayload = z.object({
  tipo: z.literal("documentos_checklist"),
  leadId: uuid,
  perfil: z
    .enum(PERFIL_RENDA as [string, ...string[]])
    .describe("clt | autonomo | empresario | aposentado"),
  casado: z.boolean().optional(),
  usaFgts: z.boolean().optional(),
  declaraIr: z.boolean().optional(),
});

export const AtualizarDocumentoPayload = z.object({
  tipo: z.literal("atualizar_documento"),
  leadId: uuid,
  documento: z.enum(DOCUMENTOS_TIPOS).describe("Tipo do documento (slug do checklist)"),
  status: z
    .enum(DOC_STATUS as [string, ...string[]])
    .describe("pendente | recebido | aprovado | reprovado"),
  observacao: textoOpcional(300),
});

export const AnexarDocumentoPayload = z.object({
  tipo: z.literal("anexar_documento"),
  leadId: uuid,
  anexoId: uuid.describe("id do arquivo recebido no WhatsApp (vem no cabeçalho)"),
  documento: z.enum(DOCUMENTOS_TIPOS).describe("Tipo do documento (slug do checklist)"),
});

// --- v8: crédito e venda -----------------------------------------------------

export const EnviarAnaliseCreditoPayload = z.object({
  tipo: z.literal("enviar_analise_credito"),
  leadId: uuid,
  situacao: z
    .enum(["enviada", "pendente"])
    .optional()
    .describe("enviada (padrão) | pendente (faltam docs)"),
  observacoes: textoOpcional(1000),
});

export const RegistrarResultadoCreditoBase = z.object({
  tipo: z.literal("registrar_resultado_credito"),
  leadId: uuid,
  resultado: z.enum(["aprovada", "aprovada_condicionada", "reprovada"]),
  motivo: textoOpcional(500).describe("Reprovada: motivo. Condicionada: a condição do banco"),
  banco: textoOpcional(60),
  modalidade: z.enum(MODALIDADES_CREDITO).optional(),
  sistemaAmortizacao: z.enum(["price", "sac"]).optional(),
  valorFinanciamento: valor.optional(),
  valorParcela: valor.optional(),
  prazoMeses: z.number().int().min(1).max(480).optional(),
  taxaJurosAnual: z.number().min(0).max(100).optional().describe("% ao ano"),
  valorFgts: z.number().min(0).max(10_000_000).optional(),
  valorSubsidio: z.number().min(0).max(10_000_000).optional(),
  valorEntrada: z.number().min(0).max(100_000_000).optional(),
  valorImovel: valor.optional().describe("Valor do imóvel usado na simulação"),
  rendaFamiliar: valor.optional(),
  validadeAte: DIA_ISO.optional().describe("Validade da aprovação, AAAA-MM-DD"),
});
export const creditoCoerente = (p: {
  resultado: string;
  motivo?: string;
  valorFinanciamento?: number;
  valorParcela?: number;
}) =>
  (p.resultado === "aprovada" || !!p.motivo?.trim()) &&
  !(p.valorFinanciamento && p.valorParcela && p.valorParcela >= p.valorFinanciamento);
export const MSG_CREDITO =
  "reprovada/condicionada exigem motivo; a parcela tem de ser menor que o financiamento";
export const RegistrarResultadoCreditoPayload = RegistrarResultadoCreditoBase.refine(
  creditoCoerente,
  MSG_CREDITO,
);

export const RegistrarVendaBase = z.object({
  tipo: z.literal("registrar_venda"),
  leadId: uuid,
  projetoId: uuid.optional().describe("id do empreendimento (de catalogo_projetos)"),
  projetoNome: textoOpcional(120).describe("Nome do empreendimento quando não há id"),
  unidade: textoOpcional(60).describe("Torre/apto, ex.: 'T2 ap 104'"),
  valorVenda: valor.describe("Valor da venda em reais"),
  dataAssinatura: DIA_ISO.describe("AAAA-MM-DD, hoje ou antes"),
  previsaoRecebimento: MES_ISO.describe("Mês previsto para receber da construtora, AAAA-MM"),
  contratoAssinado: z.boolean().optional(),
  atoPago: z.boolean().optional(),
  aptoRepasse: z.boolean().optional(),
  observacoes: textoOpcional(500),
});
export const vendaTemProjeto = (p: { projetoId?: string; projetoNome?: string }) =>
  !!p.projetoId || !!p.projetoNome?.trim();
export const MSG_VENDA_PROJETO = "informe o empreendimento (id ou nome)";
export const RegistrarVendaPayload = RegistrarVendaBase.refine(vendaTemProjeto, MSG_VENDA_PROJETO);

// --- v8: presença e prospecção -----------------------------------------------

export const FazerCheckinBase = z.object({
  tipo: z.literal("fazer_checkin"),
  modo: z
    .enum(["loja", "casa", "sair"])
    .describe("loja (filial) | casa | sair (encerrar presença)"),
  filial: textoOpcional(40).describe("Slug da filial: barra-funda | liberdade | belem"),
});
export const checkinTemFilial = (p: { modo: string; filial?: string }) =>
  p.modo !== "loja" || !!p.filial?.trim();
export const MSG_CHECKIN_FILIAL = "check-in na loja precisa da filial";
export const FazerCheckinPayload = FazerCheckinBase.refine(checkinTemFilial, MSG_CHECKIN_FILIAL);

export const CriarLeadPayload = z.object({
  tipo: z.literal("criar_lead"),
  nome: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .describe("Nome do cliente (com sobrenome, se o corretor disse)"),
  // Gravado SÓ com dígitos (DDD + número). O modelo manda o marcador
  // [TELEFONE_n] da mensagem; o servidor troca pelo número e normaliza antes
  // de validar (mesmo formato do cadastro que já estava em produção).
  telefone: z
    .string()
    .regex(/^\d{10,13}$/, "telefone só com dígitos, DDD + número")
    .describe("Telefone do cliente com DDD (só dígitos)"),
  email: textoOpcional(120).describe("E-mail; use o marcador [EMAIL_n] da mensagem"),
  origem: z.enum(ORIGENS_CAPTACAO).optional().describe("Padrão captacao_corretor"),
  projetoId: uuid.optional(),
  projetoNome: textoOpcional(120),
  bairro: textoOpcional(80),
  zona: textoOpcional(40),
  observacoes: textoOpcional(500),
});

/** Entrada da ferramenta criar_lead: o telefone chega como marcador e vira dígitos no servidor. */
export const CriarLeadFerramentaInput = CriarLeadPayload.omit({ tipo: true }).extend({
  telefone: z
    .string()
    .trim()
    .min(4)
    .max(40)
    .describe("Use o marcador [TELEFONE_n] que veio na mensagem (o servidor troca pelo número)"),
});

/**
 * Telefone de cadastro → só dígitos com DDD (10 ou 11), ou null. Aceita +55,
 * zero de operadora/DDD e máscara. Celular precisa começar com 9.
 */
export function normalizarTelefoneCadastro(bruto: string): string | null {
  let d = String(bruto ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("0")) d = d.slice(1); // 011 9xxxx-xxxx
  if (d.length === 12 || d.length === 13) {
    if (!d.startsWith("55")) return null;
    d = d.slice(2);
  }
  if (d.length === 11 && d[2] === "0") d = d.slice(0, 2) + d.slice(3);
  if (d.length !== 10 && d.length !== 11) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return d;
}

export const PedirLotePayload = z.object({
  tipo: z.literal("pedir_lote"),
  zona: z.enum(ZONAS_LOTE),
});

export const PropostaPayloadSchema = z.discriminatedUnion("tipo", [
  RegistrarContatoPayload,
  AnotarPayload,
  CriarTarefaPayload,
  AtualizarQualificacaoPayload,
  AgendarVisitaPayload,
  MudarEtapaPayload,
  RegistrarRetornoPayload,
  MarcarPerdidoPayload,
  TrocarVagaPayload,
  ConcluirTarefaPayload,
  ReagendarTarefaPayload,
  CancelarTarefaPayload,
  ConfirmarVisitaPayload,
  RemarcarVisitaPayload,
  CancelarVisitaPayload,
  RegistrarVisitaPayload,
  DocumentosChecklistPayload,
  AtualizarDocumentoPayload,
  AnexarDocumentoPayload,
  EnviarAnaliseCreditoPayload,
  RegistrarResultadoCreditoPayload,
  RegistrarVendaPayload,
  FazerCheckinPayload,
  CriarLeadPayload,
  PedirLotePayload,
]);

export type PropostaPayload = z.infer<typeof PropostaPayloadSchema>;

/** Ação como o painel e o WhatsApp recebem (persistida em samiq_propostas). */
export type PropostaSamiQ = {
  id: string;
  tipo: SamiQPropostaTipo;
  payload: PropostaPayload;
  /** Nome do cliente resolvido no servidor (o modelo só manda o id). */
  leadNome: string | null;
  status: "pendente" | "aceita" | "editada" | "rejeitada" | "desfeita" | "falhou";
  /** Até quando dá para desfazer (24 h após gravar); null = não desfaz. */
  desfazerAte?: string | null;
  erro?: string | null;
  /** Texto curto do que aconteceu de fato ao gravar (v8, ex.: "entrou em Em atendimento"). */
  efeito?: string | null;
};

export const SAMIQ_DESFAZER_JANELA_HORAS = 24;

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

function rotuloEtapa(s: string): string {
  return LEAD_STATUS_LABEL[s as LeadStatus] ?? s;
}

function brl(n: number | undefined | null): string | null {
  if (n === undefined || n === null || !Number.isFinite(n)) return null;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** "(11) 9****-4321": o corretor reconhece o número sem o WhatsApp repetir o telefone inteiro. */
export function telefoneMascarado(tel: string | null | undefined): string {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length < 8) return "telefone informado";
  return `final ${d.slice(-4)}`;
}

export type DescricaoProposta = { titulo: string; detalhes: string[] };

/** Texto humano do card, da lista do WhatsApp e do retorno da ferramenta. */
export function descreverProposta(
  payload: PropostaPayload,
  leadNome: string | null,
): DescricaoProposta {
  const quem = leadNome ?? "cliente";
  switch (payload.tipo) {
    case "registrar_contato": {
      const detalhes = [
        `${CANAL_LABEL[payload.canal]}, ${RESULTADO_CONTATO_LABEL[payload.resultado].toLowerCase()}`,
      ];
      if (payload.resumo?.trim()) detalhes.push(payload.resumo.trim());
      if (payload.objecoes?.length) detalhes.push(`Objeções: ${payload.objecoes.join(", ")}`);
      const fu = fmtDataHoraSP(payload.followupEm);
      detalhes.push(fu ? `Follow-up ${fu}` : "Sem follow-up");
      return { titulo: `Contato com ${quem}`, detalhes };
    }
    case "anotar":
      return { titulo: `Nota sobre ${quem}`, detalhes: [payload.nota] };
    case "criar_tarefa": {
      const venc = fmtDataHoraSP(payload.vencimentoEm);
      return {
        titulo: payload.leadId
          ? `Tarefa de ${quem}: ${payload.titulo}`
          : `Tarefa: ${payload.titulo}`,
        detalhes: [
          venc ? `Vence ${venc}` : "Sem vencimento válido",
          `Prioridade ${payload.prioridade ?? "media"}`,
        ],
      };
    }
    case "atualizar_qualificacao": {
      const detalhes: string[] = [];
      if (payload.rendaInformada !== undefined) detalhes.push(`Renda: ${payload.rendaInformada}`);
      if (payload.rendaEstimada !== undefined)
        detalhes.push(`Renda: ${brl(payload.rendaEstimada)}`);
      if (payload.entradaDisponivel !== undefined)
        detalhes.push(`Entrada: ${payload.entradaDisponivel}`);
      if (payload.usaFgts !== undefined)
        detalhes.push(`Usa FGTS: ${payload.usaFgts ? "sim" : "não"}`);
      if (payload.temFgts !== undefined)
        detalhes.push(`Tem FGTS: ${payload.temFgts ? "sim" : "não"}`);
      if (payload.fgtsValor !== undefined) detalhes.push(`FGTS: ${brl(payload.fgtsValor)}`);
      if (payload.tipoRenda !== undefined) detalhes.push(`Renda ${payload.tipoRenda}`);
      if (payload.faixaMcmv !== undefined) detalhes.push(`Faixa ${payload.faixaMcmv}`);
      if (payload.temperatura !== undefined) detalhes.push(`Temperatura ${payload.temperatura}`);
      if (payload.decisor !== undefined) detalhes.push(`Decisor: ${payload.decisor}`);
      if (payload.zona !== undefined || payload.bairro !== undefined)
        detalhes.push(`Região: ${[payload.bairro, payload.zona].filter(Boolean).join(", ")}`);
      if (payload.dormsDesejados !== undefined) detalhes.push(`${payload.dormsDesejados} dorm.`);
      if (payload.precisaVaga !== undefined)
        detalhes.push(`Vaga: ${payload.precisaVaga ? "sim" : "não"}`);
      if (payload.prioridades?.length)
        detalhes.push(`Prioridades: ${payload.prioridades.join(", ")}`);
      if (payload.notaPerfil !== undefined) detalhes.push(`Perfil: ${payload.notaPerfil}`);
      if (payload.projetoInteresse !== undefined)
        detalhes.push(`Projeto: ${payload.projetoInteresse}`);
      else if (payload.projetoId) detalhes.push("Projeto de interesse atualizado");
      if (payload.objecoesAdicionar?.length)
        detalhes.push(`Objeções: ${payload.objecoesAdicionar.join(", ")}`);
      if (payload.resumoQualificacao !== undefined)
        detalhes.push(`Parecer: ${payload.resumoQualificacao}`);
      return { titulo: `Qualificação de ${quem}`, detalhes };
    }
    case "agendar_visita": {
      const quando = fmtDataHoraSP(payload.inicioEm);
      const detalhes = [quando ?? "Data inválida"];
      if (payload.local?.trim()) detalhes.push(payload.local.trim());
      detalhes.push(payload.moverParaAgendado === false ? "Mantém a etapa" : "Move para Agendado");
      return { titulo: `Visita de ${quem}`, detalhes };
    }
    case "mudar_etapa": {
      const detalhes: string[] = [];
      if (payload.motivo?.trim()) detalhes.push(`Motivo: ${payload.motivo.trim()}`);
      if (payload.motivoCategoria) detalhes.push(MOTIVO_PERDA_LABEL[payload.motivoCategoria]);
      if (payload.proximaAcao?.trim()) detalhes.push(`Próxima ação: ${payload.proximaAcao.trim()}`);
      const fu = fmtDataHoraSP(payload.proximoFollowupEm);
      if (fu) detalhes.push(`Follow-up ${fu}`);
      return { titulo: `Mover ${quem} para ${rotuloEtapa(payload.novoStatus)}`, detalhes };
    }
    case "registrar_retorno": {
      const quando = fmtDataHoraSP(payload.retornoEm);
      const detalhes = [
        payload.desfecho === "esfriou" ? "Esfriou (fica frio)" : "Pediu retorno",
        quando ? `Retornar ${quando}` : "Data inválida",
      ];
      if (payload.nota?.trim()) detalhes.push(payload.nota.trim());
      return { titulo: `${quem} para Aguardando retorno`, detalhes };
    }
    case "marcar_perdido": {
      const detalhes = [MOTIVO_PERDA_LABEL[payload.categoria]];
      if (payload.detalhe?.trim()) detalhes.push(payload.detalhe.trim());
      detalhes.push("Sai da sua carteira (vai para outro corretor ou para a base)");
      return { titulo: `Perder ${quem}`, detalhes };
    }
    case "trocar_vaga": {
      const sai =
        payload.desfecho === "perdido"
          ? `sai como perdido (${payload.categoria ? MOTIVO_PERDA_LABEL[payload.categoria] : "sem categoria"})`
          : `sai para retorno ${fmtDataHoraSP(payload.retornoEm) ?? ""}`.trim();
      return { titulo: `Troca de vaga: entra ${quem}`, detalhes: [sai] };
    }
    case "concluir_tarefa":
      return {
        titulo: "Concluir tarefa",
        detalhes: payload.resultado?.trim() ? [payload.resultado.trim()] : [],
      };
    case "reagendar_tarefa":
      return {
        titulo: "Reagendar tarefa",
        detalhes: [`Para ${fmtDataHoraSP(payload.novoVencimentoEm) ?? "data inválida"}`],
      };
    case "cancelar_tarefa":
      return {
        titulo: "Cancelar tarefa",
        detalhes: payload.motivo?.trim() ? [payload.motivo.trim()] : [],
      };
    case "confirmar_visita":
      return { titulo: `Visita de ${quem} confirmada`, detalhes: [] };
    case "remarcar_visita":
      return {
        titulo: `Remarcar visita de ${quem}`,
        detalhes: [`Para ${fmtDataHoraSP(payload.novoInicioEm) ?? "data inválida"}`],
      };
    case "cancelar_visita":
      return { titulo: `Cancelar visita de ${quem}`, detalhes: [payload.motivo] };
    case "registrar_visita": {
      const detalhes = [payload.compareceu ? "Foi à visita" : "Não compareceu"];
      if (payload.interesse) detalhes.push(`Interesse ${payload.interesse.replace("_", " ")}`);
      const etapa =
        payload.proximaEtapa ?? (payload.compareceu ? "visita_realizada" : "aguardando_retorno");
      if (payload.reagendarPara)
        detalhes.push(`Nova visita ${fmtDataHoraSP(payload.reagendarPara) ?? ""}`.trim());
      detalhes.push(`Vai para ${rotuloEtapa(etapa)}`);
      return { titulo: `Resultado da visita de ${quem}`, detalhes };
    }
    case "documentos_checklist":
      return {
        titulo: `Checklist de documentos de ${quem}`,
        detalhes: [
          `Perfil ${payload.perfil}`,
          [
            payload.casado ? "casado" : null,
            payload.usaFgts ? "usa FGTS" : null,
            payload.declaraIr ? "declara IR" : null,
          ]
            .filter(Boolean)
            .join(", ") || "sem extras",
        ],
      };
    case "atualizar_documento":
      return {
        titulo: `${DOC_LABEL[payload.documento] ?? payload.documento} de ${quem}`,
        detalhes: [
          `Status ${payload.status}`,
          ...(payload.observacao?.trim() ? [payload.observacao.trim()] : []),
        ],
      };
    case "anexar_documento":
      return {
        titulo: `Anexar ${DOC_LABEL[payload.documento] ?? payload.documento} de ${quem}`,
        detalhes: ["Arquivo recebido no WhatsApp"],
      };
    case "enviar_analise_credito":
      return {
        titulo: `Enviar ${quem} para análise de crédito`,
        detalhes: [
          payload.situacao === "pendente" ? "Pendente (faltam documentos)" : "Enviada ao banco",
          ...(payload.observacoes?.trim() ? [payload.observacoes.trim()] : []),
        ],
      };
    case "registrar_resultado_credito": {
      const rotulo =
        payload.resultado === "aprovada"
          ? "Aprovada"
          : payload.resultado === "aprovada_condicionada"
            ? "Aprovada com condição"
            : "Reprovada";
      const detalhes = [rotulo];
      if (payload.motivo?.trim()) detalhes.push(payload.motivo.trim());
      const fin = brl(payload.valorFinanciamento);
      const parc = brl(payload.valorParcela);
      if (fin || parc)
        detalhes.push(
          [fin && `financiamento ${fin}`, parc && `parcela ${parc}`].filter(Boolean).join(", "),
        );
      return { titulo: `Crédito de ${quem}`, detalhes };
    }
    case "registrar_venda":
      return {
        titulo: `Venda de ${quem}`,
        detalhes: [
          [payload.projetoNome, payload.unidade].filter(Boolean).join(" ") ||
            "Empreendimento cadastrado",
          `${brl(payload.valorVenda)}, assinatura ${fmtDiaBr(payload.dataAssinatura) ?? payload.dataAssinatura}`,
          "Vai para aprovação da gestão",
        ],
      };
    case "fazer_checkin":
      return {
        titulo:
          payload.modo === "sair"
            ? "Encerrar presença de hoje"
            : payload.modo === "casa"
              ? "Check-in em casa"
              : `Check-in na filial ${payload.filial ?? ""}`.trim(),
        detalhes: [],
      };
    case "criar_lead": {
      const detalhes = [
        `Telefone ${telefoneMascarado(payload.telefone)}`,
        `Origem: ${ORIGEM_CAPTACAO_LABEL[payload.origem ?? "captacao_corretor"]}`,
      ];
      if (payload.projetoNome?.trim()) detalhes.push(`Interesse: ${payload.projetoNome.trim()}`);
      if (payload.bairro?.trim() || payload.zona?.trim()) {
        detalhes.push(
          `Região: ${[payload.bairro?.trim(), payload.zona?.trim()].filter(Boolean).join(", ")}`,
        );
      }
      if (payload.observacoes?.trim()) detalhes.push(payload.observacoes.trim());
      detalhes.push("Entra na sua carteira em Aguardando atendimento");
      return { titulo: `Cadastrar cliente ${payload.nome}`, detalhes };
    }
    case "pedir_lote":
      return { titulo: `Pedir lote de 30 leads, zona ${payload.zona}`, detalhes: [] };
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

/** Interação registrada pela Sami? (metadata.origem, ou metadata.via quando a
 *  interação veio de uma RPC oficial que grava a própria origem). */
export function foiViaSami(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const m = metadata as { origem?: unknown; via?: unknown };
  return m.origem === SAMIQ_ORIGEM || m.via === SAMIQ_ORIGEM;
}

// ---------------------------------------------------------------------------
// Etapa que o funil não aplicou (23/10/2026). Os triggers de leads devolvem
// "Em atendimento" a "Aguardando atendimento" quando o lead não tem corretor
// dono (Bolsão). A RPC não dá erro, então a Sami precisa avisar com clareza.

export function mensagemEtapaNaoAplicada(
  pedida: string,
  ficou: string,
  corretorId: string | null,
): string {
  const base = `O funil não mudou a etapa: o cliente continua em ${rotuloEtapa(ficou)} (pedido: ${rotuloEtapa(pedida)}).`;
  if (!corretorId && pedida === "em_atendimento") {
    return `${base} Ele está sem corretor responsável; atribua um corretor antes de colocá-lo em atendimento.`;
  }
  return base;
}

/** Bloqueio na hora de PROPOR: evita card que o funil vai desfazer. */
export function etapaBloqueadaSemDono(
  novoStatus: string,
  corretorId: string | null,
): string | null {
  if (novoStatus === "em_atendimento" && !corretorId) {
    return "cliente sem corretor responsável: Em atendimento exige um corretor dono (atribuir o lead primeiro); registre o contato e a tarefa sem mudar a etapa";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tarefa no mesmo horário (23/10/2026). Um relato vira até 3 ações que
// geram tarefa (mudar_etapa, registrar_contato com follow-up e criar_tarefa).
// Regra: uma tarefa aberta do lead até 2 h antes ou depois do novo vencimento
// é a MESMA tarefa e é reaproveitada.

export const SAMIQ_JANELA_MESMA_TAREFA_MS = 2 * 60 * 60 * 1000;

export type TarefaAbertaResumo = { id: string; data_vencimento: string | null };

/** A tarefa aberta mais próxima do vencimento, dentro da janela; ou null. */
export function tarefaNoMesmoHorario<T extends TarefaAbertaResumo>(
  abertas: T[],
  vencimentoIso: string,
  janelaMs: number = SAMIQ_JANELA_MESMA_TAREFA_MS,
): T | null {
  const alvo = Date.parse(vencimentoIso);
  if (Number.isNaN(alvo)) return null;
  let melhor: T | null = null;
  let menor = Infinity;
  for (const t of abertas) {
    if (!t.data_vencimento) continue;
    const d = Math.abs(Date.parse(t.data_vencimento) - alvo);
    if (!Number.isNaN(d) && d <= janelaMs && d < menor) {
      melhor = t;
      menor = d;
    }
  }
  return melhor;
}

// ---------------------------------------------------------------------------
// Normalização na hora de propor (v8): datas sem fuso viram horário de SP.
// Feita no servidor antes de validar/gravar, para o payload persistido já
// ficar certo (e o card/WhatsApp mostrar a hora que o corretor disse).

const CAMPOS_DATA_HORA = [
  "followupEm",
  "vencimentoEm",
  "inicioEm",
  "proximoFollowupEm",
  "retornoEm",
  "novoVencimentoEm",
  "novoInicioEm",
  "reagendarPara",
  "realizadaEm",
] as const;

export function normalizarDatasDoPayload<T extends Record<string, unknown>>(
  payload: T,
  normalizar: (iso: string) => string,
): T {
  const out: Record<string, unknown> = { ...payload };
  for (const campo of CAMPOS_DATA_HORA) {
    const v = out[campo];
    if (typeof v === "string" && v.trim()) out[campo] = normalizar(v);
  }
  return out as T;
}

/** Datas que precisam estar no futuro na hora de propor (com 5 min de tolerância). */
export function datasQueDevemSerFuturas(
  payload: PropostaPayload,
): Array<{ campo: string; iso: string }> {
  const out: Array<{ campo: string; iso: string }> = [];
  const add = (campo: string, iso: string | null | undefined) => {
    if (iso) out.push({ campo, iso });
  };
  switch (payload.tipo) {
    case "registrar_contato":
      add("followupEm", payload.followupEm);
      break;
    case "criar_tarefa":
      add("vencimentoEm", payload.vencimentoEm);
      break;
    case "agendar_visita":
      add("inicioEm", payload.inicioEm);
      break;
    case "mudar_etapa":
      add("proximoFollowupEm", payload.proximoFollowupEm);
      break;
    case "registrar_retorno":
      add("retornoEm", payload.retornoEm);
      break;
    case "trocar_vaga":
      add("retornoEm", payload.retornoEm);
      add("proximoFollowupEm", payload.proximoFollowupEm);
      break;
    case "reagendar_tarefa":
      add("novoVencimentoEm", payload.novoVencimentoEm);
      break;
    case "remarcar_visita":
      add("novoInicioEm", payload.novoInicioEm);
      break;
    case "registrar_visita":
      add("proximoFollowupEm", payload.proximoFollowupEm);
      add("reagendarPara", payload.reagendarPara);
      break;
    default:
      break;
  }
  return out;
}

/** O cliente (lead) de cada ação — para a checagem de carteira e o nome no texto. */
export function leadIdDaProposta(payload: PropostaPayload): string | null {
  if (payload.tipo === "trocar_vaga") return payload.entraLeadId;
  if ("leadId" in payload && typeof payload.leadId === "string") return payload.leadId;
  return null;
}

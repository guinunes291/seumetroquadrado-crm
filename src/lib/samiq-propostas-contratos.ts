// Sami — os contratos (zod) das ações de cadastro e funil básico: contato, nota,
// tarefa, qualificação, visita e etapa.
// Recortado de samiq-propostas.ts (que reexporta tudo) sem mudança de comportamento.

import { z } from "zod";
import {
  CANAIS_CONTATO,
  ETAPAS_DE_PAYLOAD_ANTIGO,
  ETAPAS_PROPONIVEIS,
  FAIXAS_MCMV,
  ISO_DATA_HORA,
  MOTIVOS_PERDA_PROPOSTA,
  PRIORIDADES_CLIENTE,
  TAREFA_PRIORIDADES_PROPOSTA,
  TAREFA_TIPOS_PROPOSTA,
  TEMPERATURAS,
  textoCurto,
  textoOpcional,
  uuid,
  valor,
} from "./samiq-propostas-catalogos";

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

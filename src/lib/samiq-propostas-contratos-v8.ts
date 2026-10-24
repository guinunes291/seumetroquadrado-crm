// Sami — os contratos (zod) das ações da v8 (funil, tarefas, visitas, documentos,
// crédito, venda, presença, cadastro, lote) e a união PropostaPayloadSchema.
// Recortado de samiq-propostas.ts (que reexporta tudo) sem mudança de comportamento.

import { z } from "zod";
import { DOC_STATUS, PERFIL_RENDA } from "@/lib/documentacao-checklist";
import {
  CANAIS_CONTATO,
  DIA_ISO,
  DOCUMENTOS_TIPOS,
  ETAPAS_APOS_VISITA,
  INTERESSES_VISITA,
  ISO_DATA_HORA,
  MES_ISO,
  MODALIDADES_CREDITO,
  MOTIVOS_PERDA_PROPOSTA,
  OBJECOES_VISITA,
  ORIGENS_CAPTACAO,
  ZONAS_LOTE,
  textoCurto,
  textoOpcional,
  uuid,
  valor,
} from "./samiq-propostas-catalogos";
import {
  AgendarVisitaPayload,
  AnotarPayload,
  AtualizarQualificacaoPayload,
  CriarTarefaPayload,
  MudarEtapaPayload,
  RegistrarContatoPayload,
} from "./samiq-propostas-contratos";

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

// Sami — os vocabulários (canais, resultados, motivos de perda, documentos, origens…)
// e os blocos de validação (datas ISO, uuid, textos) usados pelos contratos.
// Recortado de samiq-propostas.ts (que reexporta tudo) sem mudança de comportamento.

import { z } from "zod";
import { DOC_LABEL } from "@/lib/documentacao-checklist";

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
export const ETAPAS_DE_PAYLOAD_ANTIGO = [
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

export const TEMPERATURAS = ["quente", "morno", "frio"] as const;

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

export const ISO_DATA_HORA = z
  .string()
  .min(10)
  .max(40)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)),
    "data/hora inválida (use ISO 8601, ex.: 2026-10-25T10:00:00-03:00)",
  );

export const DIA_ISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T12:00:00Z`)), "data inválida");

export const MES_ISO = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use AAAA-MM");

export const uuid = z.string().uuid();
export const textoCurto = (max: number) => z.string().trim().min(1).max(max);
export const textoOpcional = (max: number) => z.string().trim().max(max).optional();
export const valor = z.number().positive().max(100_000_000);

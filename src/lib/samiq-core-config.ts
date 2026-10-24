// Sami — limites do turno, os tipos da entrada de responderSamiQ e as
// instruções que dependem do canal.
// Recortado de samiq-core.server.ts sem mudança de comportamento.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { SamiQCanal, SamiQInput } from "@/lib/samiq";
import type { ModoEscritaSamiQ, PropostaSamiQ } from "@/lib/samiq-propostas";
import type { ContextoConversaSamiQ } from "@/lib/samiq-contexto";

export type Db = SupabaseClient<Database>;

// 24k de contexto + ate 7,2k de historico + prompts cabem com margem.
// A finalizacao substitui esta reserva conservadora pelo consumo real.
export const RESERVED_INPUT_TOKENS = 10_000;
// Com ferramentas, cada passo devolve um resultado ao modelo: reserva maior,
// ainda dentro do teto de 50k da RPC.
export const RESERVED_INPUT_TOKENS_COM_FERRAMENTAS = 24_000;
// WhatsApp v8: até 10 passos com o CRM inteiro. Ainda é só a reserva (teto de
// 50k da RPC); a finalização cobra o consumo real.
export const RESERVED_INPUT_TOKENS_WHATSAPP = 40_000;
export const MAX_CONTEXT_CHARS = 24_000;
/** Pergunta do painel (campo de 500) e do WhatsApp (áudio transcrito cabe em 4000). */
export const LIMITE_PERGUNTA: Record<SamiQCanal, number> = { painel: 500, whatsapp: 4000 };
/** Histórico: o WhatsApp reenvia 16 mensagens de até 1200 caracteres (a conversa É o CRM). */
export const LIMITE_HISTORICO: Record<SamiQCanal, number> = { painel: 600, whatsapp: 1200 };
/**
 * Teto de tempo do turno. WhatsApp abaixo do timeout do n8n (90 s): se o n8n
 * desistir antes, o corretor vê erro mas o que foi gravado fica, e ele reenvia.
 */
export const TEMPO_MAXIMO_MS: Record<SamiQCanal, number> = { painel: 60_000, whatsapp: 75_000 };
/** Ferramentas de controle da fila da conversa: ativas sempre que existem. */
export const FERRAMENTAS_DE_CONTROLE = [
  "confirmar_pendentes",
  "descartar_pendentes",
  "desfazer_acoes",
];

export type RecentesDaConversa = {
  /** Esperando o OK, na numeração que o corretor viu (CONFIRMAR 2). */
  pendentes: PropostaSamiQ[];
  /** Gravadas no último recibo, na numeração do DESFAZER 2. */
  executadas: PropostaSamiQ[];
};

/** Arquivo que o corretor mandou (o conteúdo nunca vai ao modelo). */
export type AnexoDoTurno = {
  id: string;
  mime: string;
  tamanho: number;
  legenda: string | null;
  nome: string | null;
  /** true = chegou nesta mensagem; false = chegou antes e ainda não foi anexado. */
  agora: boolean;
};

export type LocalizacaoDoTurno = {
  latitude: number;
  longitude: number;
  precisao?: number | null;
  /** true = veio nesta mensagem. */
  agora: boolean;
};

export type ResponderSamiQArgs = {
  supabase: Db;
  userId: string;
  data: SamiQInput;
  canal: SamiQCanal;
  /** WhatsApp: a mensagem veio de um áudio transcrito pelo n8n (D8). */
  origemMidia?: "texto" | "audio";
  /** v8: "por_risco" grava as ações leves na hora (WhatsApp). Padrão: confirmar tudo. */
  modoEscrita?: ModoEscritaSamiQ;
  corretorNome?: string | null;
  /** v8: memória de trabalho da conversa (clientes citados, numerações, escolha). */
  contexto?: ContextoConversaSamiQ;
  recentes?: RecentesDaConversa;
  /** Arquivos ainda não anexados (o desta mensagem primeiro), no máximo 5. */
  anexos?: AnexoDoTurno[];
  localizacao?: LocalizacaoDoTurno | null;
  /** v8: contexto que só o n8n tem (material enviado fora do CRM, últimas mensagens). */
  contextoCanal?: string | null;
  /** v8: o que sobrou do tempo do n8n depois da fila (o turno nunca passa disso). */
  tempoMaximoMs?: number;
  agora?: Date;
};

/** Instruções que dependem do canal: vão no cabeçalho da mensagem, não no prompt versionado. */
export function instrucoesDoCanal(canal: SamiQCanal, origemMidia?: "texto" | "audio"): string[] {
  const linhas: string[] = [];
  if (canal === "whatsapp") {
    linhas.push(
      "Canal: WhatsApp (o corretor está no celular). Responda em texto corrido, sem markdown e sem travessão, em até 8 linhas curtas. O sistema anexa sozinho, depois do seu texto, o recibo do que foi gravado e a lista do que espera o OK, com as instruções de CONFIRMAR e DESFAZER: não repita essas listas, ids nem instruções. Fale do cliente, do resultado e do próximo passo.",
    );
  }
  if (origemMidia === "audio") {
    linhas.push(
      "A mensagem foi ditada por áudio e transcrita automaticamente: tolere erros de transcrição e nomes aproximados (confirme o cliente com buscar_clientes antes de registrar).",
    );
  }
  return linhas;
}

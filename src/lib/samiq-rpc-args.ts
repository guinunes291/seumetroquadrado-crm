/**
 * Formas NULAS dos argumentos de RPC da SamiQ.
 *
 * `src/integrations/supabase/types.ts` é gerado e, desde que a plataforma
 * passou a bloquear edição manual do arquivo, não dá mais para manter as
 * formas à mão lá dentro (o gerador não sabe que `_conversa_id`, `_lead_id` e
 * `_execution_id` aceitam NULL, nem que `_canal` é união fechada). Elas moram
 * AQUI, num arquivo nosso, que nenhuma regeneração apaga.
 *
 * A regra continua a mesma: esses parâmetros NÃO têm DEFAULT nas migrations
 * S1/S2/S4. Passar `undefined` (omitir a chave) faz o PostgREST não achar a
 * função (PGRST202) e o turno some em silêncio. Sempre `null`, nunca omitir.
 */
import type { Database, Json } from "@/integrations/supabase/types";

type GravarTurnoGerado = Database["public"]["Functions"]["samiq_gravar_turno"]["Args"];
type RegistrarPropostasGerado =
  Database["public"]["Functions"]["samiq_registrar_propostas"]["Args"];

export type SamiQCanalRpc = "painel" | "whatsapp";

export interface SamiQGravarTurnoArgs {
  _user_id: string;
  _conversa_id: string | null;
  _lead_id: string | null;
  _pergunta: string;
  _resposta: string;
  _ferramentas?: string[];
  _execution_id?: string | null;
  _canal?: SamiQCanalRpc;
}

export interface SamiQRegistrarPropostasArgs {
  _user_id: string;
  _execution_id: string | null;
  _conversa_id: string | null;
  _propostas: Json;
}

/** Ponte para a assinatura gerada, que declara os mesmos campos sem o null. */
export const argsTurno = (a: SamiQGravarTurnoArgs): GravarTurnoGerado =>
  a as unknown as GravarTurnoGerado;

export const argsPropostas = (a: SamiQRegistrarPropostasArgs): RegistrarPropostasGerado =>
  a as unknown as RegistrarPropostasGerado;

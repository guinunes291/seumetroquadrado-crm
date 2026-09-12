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
import type { Json } from "@/integrations/supabase/types";

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

// Fronteira tipada das duas RPCs, no molde de features/atendimento/
// atendimento-rpc.ts: a assinatura gerada declara os campos sem o null, e a
// ponte por cast duplo estourava o orçamento de escapes de tipo
// (147/145, CI do main vermelho em 12/09/2026). Aqui o cliente é visto por um
// holder estrutural e a chamada leva as formas nulas de verdade — nenhum
// escape, nenhuma edição em types.ts.
type ResultadoRpc<T> = PromiseLike<{
  data: T | null;
  error: { code?: string; message?: string } | null;
}>;
type ClientHolder = { rpc: unknown };

/** As duas assinaturas, com as formas nulas: o nome da função fica no ponto
 *  da chamada (a governança confere por texto que a memória só grava por
 *  `rpc("samiq_gravar_turno"`). */
export type SamiQRpc = {
  (fn: "samiq_gravar_turno", args: SamiQGravarTurnoArgs): ResultadoRpc<string>;
  (fn: "samiq_registrar_propostas", args: SamiQRegistrarPropostasArgs): ResultadoRpc<Json>;
};

export function samiqRpc(client: ClientHolder): SamiQRpc {
  const rpc = client.rpc as (fn: string, args: unknown) => unknown;
  return ((fn: string, args: unknown) => rpc.call(client, fn, args)) as SamiQRpc;
}

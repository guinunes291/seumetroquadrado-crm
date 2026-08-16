// Fronteira ÚNICA de acesso do cliente à tabela `chamadas` (os types gerados
// ainda não a conhecem) — tipos estruturais no molde de mensagens-client.ts,
// sem gastar o orçamento de type escapes. Ao regenerar os types do Supabase
// com a migration de telefonia aplicada, troque pelos tipos gerados.

import { supabase } from "@/integrations/supabase/client";

export type ChamadaDirecao = "entrada" | "saida";

export type Chamada = {
  id: string;
  lead_id: string | null;
  corretor_id: string | null;
  direcao: ChamadaDirecao;
  origem: "click2call" | "campanha" | "receptivo" | "agendada";
  provider: string;
  provider_call_id: string | null;
  numero: string;
  ramal: string | null;
  status: string;
  duracao_segundos: number | null;
  gravacao_url: string | null;
  tabulacao: string | null;
  criado_em: string;
};

type ResultadoDb<T> = PromiseLike<{
  data: T | null;
  error: { code?: string; message?: string } | null;
}>;
type SelectChamadas = {
  order: (
    col: "criado_em",
    opts: { ascending: boolean },
  ) => { limit: (n: number) => ResultadoDb<Chamada[]> };
};
type ChamadasTable = { select: (cols: string) => SelectChamadas };
type ClientHolder = { from: unknown };
type FromChamadas = (tabela: "chamadas") => ChamadasTable;

function tabelaChamadas(): ChamadasTable {
  const holder: ClientHolder = supabase;
  return (holder.from as FromChamadas).call(supabase, "chamadas");
}

const COLUNAS =
  "id, lead_id, corretor_id, direcao, origem, provider, provider_call_id, numero, ramal, status, duracao_segundos, gravacao_url, tabulacao, criado_em";

/** Códigos de "tabela ainda não existe" (migration de telefonia pendente). */
const TABELA_AUSENTE = new Set(["PGRST205", "PGRST202", "42P01"]);

export type ChamadasLista = { rows: Chamada[]; tabelaAusente: boolean };

/**
 * As N chamadas mais recentes visíveis ao usuário (RLS recorta: corretor vê
 * as da própria carteira/ramal; gestão vê tudo). Sem a migration aplicada
 * devolve tabelaAusente:true — a aba mostra o estado explicativo em vez de
 * quebrar (mesmo espírito da Central de Mensagens).
 */
export async function listarChamadasRecentes(limit = 500): Promise<ChamadasLista> {
  const { data, error } = await tabelaChamadas()
    .select(COLUNAS)
    .order("criado_em", { ascending: false })
    .limit(limit);
  if (error) {
    if (TABELA_AUSENTE.has(error.code ?? "")) return { rows: [], tabelaAusente: true };
    throw new Error(error.message || "Não foi possível carregar as chamadas.");
  }
  return { rows: data ?? [], tabelaAusente: false };
}

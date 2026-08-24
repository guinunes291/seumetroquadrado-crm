// Fronteira ÚNICA de acesso do cliente à tabela `chamadas`, já com os types
// gerados do Supabase (a migration de telefonia está no schema). Mantém o
// fallback de "tabela ausente" para ambientes onde a migration ainda não
// rodou — a aba mostra o estado explicativo em vez de quebrar.

import { supabase } from "@/integrations/supabase/client";

export type ChamadaDirecao = "entrada" | "saida";
export type ChamadaOrigem = "click2call" | "campanha" | "receptivo" | "agendada";

export type Chamada = {
  id: string;
  lead_id: string | null;
  corretor_id: string | null;
  direcao: ChamadaDirecao;
  origem: ChamadaOrigem;
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
  const { data, error } = await supabase
    .from("chamadas")
    .select(COLUNAS)
    .order("criado_em", { ascending: false })
    .limit(limit);
  if (error) {
    if (TABELA_AUSENTE.has(error.code ?? "")) return { rows: [], tabelaAusente: true };
    throw new Error(error.message || "Não foi possível carregar as chamadas.");
  }
  return { rows: (data ?? []) as Chamada[], tabelaAusente: false };
}

export type KpisChamadasHoje = { total: number; atendidas: number; perdidas: number };

const STATUS_ATENDIDAS = ["atendida", "falando", "concluida"];
const STATUS_PERDIDAS = ["nao_atendida", "falha"];

/**
 * KPIs do dia por CONTAGEM no servidor (head:true, sem tráfego de linhas): o
 * histórico da tela é uma janela das N mais recentes, mas os cartões precisam
 * contar TODAS as chamadas de hoje visíveis ao papel — num dia de campanha
 * pesada a janela sozinha subconta.
 */
export async function contarChamadasHoje(): Promise<KpisChamadasHoje> {
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const desde = inicioHoje.toISOString();
  const contar = async (statuses?: string[]): Promise<number> => {
    let q = supabase
      .from("chamadas")
      .select("id", { count: "exact", head: true })
      .gte("criado_em", desde);
    if (statuses) q = q.in("status", statuses);
    const { count, error } = await q;
    if (error) {
      if (TABELA_AUSENTE.has(error.code ?? "")) return 0;
      throw new Error(error.message || "Não foi possível contar as chamadas de hoje.");
    }
    return count ?? 0;
  };
  const [total, atendidas, perdidas] = await Promise.all([
    contar(),
    contar(STATUS_ATENDIDAS),
    contar(STATUS_PERDIDAS),
  ]);
  return { total, atendidas, perdidas };
}

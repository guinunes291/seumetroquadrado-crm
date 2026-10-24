// Executor da Sami — o que todas as ações usam: tipos da execução, leitura
// do cliente e das tarefas, o auxiliar que não derruba a ação e o retrato
// da ficha/tarefa depois da gravação (o desfazer compara com ele).
// Recortado de samiq-executar.server.ts sem mudança de comportamento.

import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads";
import { metadataViaSami, type PropostaPayload } from "@/lib/samiq-propostas";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

export type Db = SupabaseClient<Database>;

export type ResultadoExecucao = Record<string, Json | undefined>;

/** O que o turno sabe e a ação pode precisar (v8): a localização mandada no WhatsApp. */
export type ContextoExecucao = {
  localizacao?: { latitude: number; longitude: number; precisao?: number | null } | null;
};

export type ExecutarArgs = {
  supabase: Db;
  userId: string;
  propostaId: string;
  executionId: string | null;
  payload: PropostaPayload;
  agora?: Date;
  contexto?: ContextoExecucao;
};

/** O que cada ação recebe de executarPropostaSamiQ (o switch por tipo). */
export type AcaoCtx = {
  supabase: Db;
  userId: string;
  agora: Date;
  metadata: ReturnType<typeof metadataViaSami>;
  marca: Record<string, Json>;
  args: ExecutarArgs;
};

/** O payload já estreitado para o(s) tipo(s) da ação. */
export type PayloadDe<T extends PropostaPayload["tipo"]> = Extract<PropostaPayload, { tipo: T }>;

export const DIA_MS = 24 * 60 * 60 * 1000;
export const HORA_MS = 60 * 60 * 1000;

/** Linha do banco como Json (cópia sem undefined, para guardar no resultado). */
export function paraJson(valor: unknown): Json {
  return JSON.parse(JSON.stringify(valor ?? null)) as Json;
}

export function erroDb(contexto: string, error: { message?: string; code?: string } | null): never {
  const detalhe = error?.message ? ` (${error.message.slice(0, 140)})` : "";
  throw new Error(`${contexto}${detalhe}`);
}

export function rotuloEtapa(s: string | null | undefined): string {
  return LEAD_STATUS_LABEL[(s ?? "") as LeadStatus] ?? s ?? "";
}

export const LEAD_COLS =
  "id, nome, corretor_id, status, cadencia_etapa, objecoes, renda_informada, renda_estimada, entrada_disponivel, usa_fgts, tem_fgts, fgts_valor, tipo_renda, faixa_mcmv, temperatura, decisor, zona, bairro, dorms_desejados, precisa_vaga, prioridades, nota_perfil_cliente, projeto_id, projeto_nome, construtora, resumo_qualificacao";

export type LeadAtual = {
  id: string;
  nome: string;
  corretor_id: string | null;
  status: string;
  cadencia_etapa: string | null;
  objecoes: string[];
  [coluna: string]: unknown;
};

export async function carregarLead(supabase: Db, leadId: string): Promise<LeadAtual> {
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_COLS)
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) erroDb("Não foi possível ler o cliente", error);
  if (!data) throw new Error("Cliente não encontrado na sua carteira.");
  return { ...data, objecoes: data.objecoes ?? [] } as LeadAtual;
}

export async function statusAtual(supabase: Db, leadId: string): Promise<string | null> {
  const { data } = await supabase.from("leads").select("status").eq("id", leadId).maybeSingle();
  return data?.status ?? null;
}

/** Auxiliar que nunca derruba a ação: devolve o aviso em vez de lançar. */
export async function auxiliar(
  avisos: string[],
  rotulo: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    avisos.push(`${rotulo}: ${e instanceof Error ? e.message.slice(0, 120) : "falhou"}`);
  }
}

export type EstadoTarefa = {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  prioridade: string;
  data_vencimento: string | null;
  data_conclusao: string | null;
  resultado: string | null;
};

/**
 * Tarefas abertas do lead ANTES de uma ação que pode reaproveitar uma delas
 * (o registrar_contato_lead escolhe a data padrão sozinho quando o corretor
 * não diz quando volta). Com isso o desfazer sabe o que foi criado e o que já
 * existia, e devolve a que já existia ao estado de antes em vez de apagá-la.
 */
export async function tarefasAbertasDoLead(supabase: Db, leadId: string): Promise<EstadoTarefa[]> {
  const { data, error } = await supabase
    .from("tarefas")
    .select("id, titulo, tipo, status, prioridade, data_vencimento, data_conclusao, resultado")
    .eq("lead_id", leadId)
    .in("status", ["pendente", "em_andamento"])
    .is("deleted_at", null)
    .limit(100);
  if (error) erroDb("Não foi possível conferir as tarefas do cliente", error);
  return (data ?? []) as EstadoTarefa[];
}

/**
 * Como a tarefa ficou depois da Sami: o desfazer só devolve o estado anterior
 * se ninguém mexeu nela depois (senão mantém o que o corretor fez na tela).
 */
export async function estadoDepoisDaTarefa(supabase: Db, id: string): Promise<Json | undefined> {
  const { data } = await supabase
    .from("tarefas")
    .select("status, data_vencimento")
    .eq("id", id)
    .maybeSingle();
  return data
    ? ({ status: data.status, data_vencimento: data.data_vencimento } as Json)
    : undefined;
}

/** Valores das colunas da ficha logo depois da gravação (o desfazer compara com eles). */
export async function fichaDepois(
  supabase: Db,
  leadId: string,
  colunas: string[],
): Promise<Record<string, Json> | undefined> {
  if (colunas.length === 0) return undefined;
  const { data } = await supabase
    .from("leads")
    .select(colunas.join(", "))
    .eq("id", leadId)
    .maybeSingle();
  const linha = paraJson(data);
  if (!linha || typeof linha !== "object" || Array.isArray(linha)) return undefined;
  return Object.fromEntries(colunas.map((c) => [c, linha[c] ?? null]));
}

export const CAMPOS_QUALIFICACAO_COLUNA = {
  rendaInformada: "renda_informada",
  rendaEstimada: "renda_estimada",
  entradaDisponivel: "entrada_disponivel",
  usaFgts: "usa_fgts",
  temFgts: "tem_fgts",
  fgtsValor: "fgts_valor",
  tipoRenda: "tipo_renda",
  faixaMcmv: "faixa_mcmv",
  temperatura: "temperatura",
  decisor: "decisor",
  zona: "zona",
  bairro: "bairro",
  dormsDesejados: "dorms_desejados",
  precisaVaga: "precisa_vaga",
  prioridades: "prioridades",
  notaPerfil: "nota_perfil_cliente",
  projetoInteresse: "projeto_nome",
  resumoQualificacao: "resumo_qualificacao",
} as const;

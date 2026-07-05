import { supabase } from "@/integrations/supabase/client";
import { normalizeSearch, onlyDigits } from "@/lib/validators";
import { renderTemplate } from "@/lib/templates";
import { fetchAllPaged } from "@/lib/fetch-all-paged";
import type { LeadStatus } from "@/lib/leads";

export type OfertaStatus = "rascunho" | "ativa" | "concluida" | "arquivada";

export type OfertaFiltros = {
  status: string[];
  temperatura: string[];
  projetoId: string[];
  origem: string[];
  zona: string[];
  semInteracaoHaDias?: number;
};

export const ZONA_OPTIONS = [
  "Centro",
  "Zona Sul",
  "Zona Norte",
  "Zona Leste",
  "Zona Oeste",
  "Grande SP",
];

export type OfertaAtiva = {
  id: string;
  nome: string;
  descricao: string | null;
  status: OfertaStatus;
  corretor_id: string | null;
  criado_por: string | null;
  filtros: OfertaFiltros;
  created_at: string;
  updated_at: string;
  totalLeads: number;
  totalContatados: number;
  totalAvancados: number;
};

export type OfertaPreview = {
  count: number;
  sample: { id: string; nome: string }[];
};

/** Dados do lead embutidos no vínculo (select estreito de `getOferta`).
 *  `corretor_id`/`projeto_id` alimentam os modais de etapa (StageLead). */
export type OfertaLeadInfo = {
  id: string;
  nome: string;
  telefone: string;
  projeto_nome: string | null;
  projeto_id: string | null;
  corretor_id: string | null;
  observacoes: string | null;
  status: LeadStatus;
};

/** Linha de `oferta_ativa_leads` com o lead embutido (null se fora do escopo). */
export type OfertaLeadRow = {
  id: string;
  contatado: boolean;
  contatado_em: string | null;
  avancado: boolean;
  lead: OfertaLeadInfo | null;
};

export const STATUS_LEAD_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "aguardando_atendimento", label: "Aguardando" },
  { value: "em_atendimento", label: "Em atendimento" },
  { value: "qualificado", label: "Qualificado" },
  { value: "agendado", label: "Agendado" },
  { value: "visita_realizada", label: "Visita realizada" },
  { value: "analise_credito", label: "Análise de crédito" },
  { value: "perdido", label: "Perdido" },
];

export const TEMPERATURA_OPTIONS = [
  { value: "quente", label: "🔥 Quente" },
  { value: "morno", label: "🟡 Morno" },
  { value: "frio", label: "🔵 Frio" },
];

export const ORIGEM_OPTIONS_OA = [
  { value: "facebook", label: "Facebook" },
  { value: "google_sheets", label: "Google Sheets" },
  { value: "site", label: "Site" },
  { value: "indicacao", label: "Indicação" },
  { value: "captacao_corretor", label: "Captação corretor" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telefone", label: "Telefone" },
  { value: "plantao", label: "Plantão" },
  { value: "outro", label: "Outro" },
];

export type OfertaStats = {
  total: number;
  contatados: number;
  avancados: number;
  pctContatados: number;
  pctAvancados: number;
};

/**
 * Estatísticas da campanha. `contatado`/`avancado` medem o progresso feito
 * DEPOIS que o lead entrou na lista (semântica delta) e são mantidos pelo
 * banco: o trigger `trg_oferta_sync_status` (migration
 * 20260704230000_oferta_ativa_sync_carteira.sql) marca os vínculos a cada
 * mudança de status do lead na carteira — sem depender do join com `leads`,
 * que a RLS anula para corretores.
 */
export function computeOfertaStats(
  rows: Array<{ contatado: boolean; avancado: boolean }>,
): OfertaStats {
  const total = rows.length;
  const contatados = rows.filter((r) => r.contatado).length;
  const avancados = rows.filter((r) => r.avancado).length;
  return {
    total,
    contatados,
    avancados,
    pctContatados: total ? Math.round((contatados / total) * 100) : 0,
    pctAvancados: total ? Math.round((avancados / total) * 100) : 0,
  };
}

export type OfertaLeadFiltro = {
  busca?: string;
  status?: string[];
  contato?: "todos" | "contatados" | "nao_contatados";
};

/**
 * Filtra os vínculos da lista no cliente: busca por nome/projeto (sem acentos)
 * ou telefone (dígitos), status do lead e situação de contato.
 */
export function filterOfertaLeads<T extends OfertaLeadRow>(
  rows: T[],
  filtro: OfertaLeadFiltro,
): T[] {
  const busca = normalizeSearch(filtro.busca);
  const digitos = onlyDigits(filtro.busca);
  const statusSet = filtro.status && filtro.status.length > 0 ? new Set(filtro.status) : null;

  return rows.filter((row) => {
    if (filtro.contato === "contatados" && !row.contatado) return false;
    if (filtro.contato === "nao_contatados" && row.contatado) return false;
    if (statusSet && (!row.lead || !statusSet.has(row.lead.status))) return false;
    if (busca) {
      const l = row.lead;
      if (!l) return false;
      const texto = normalizeSearch(`${l.nome} ${l.projeto_nome ?? ""}`);
      const telefone = onlyDigits(l.telefone);
      const matchTexto = texto.includes(busca);
      const matchTelefone = digitos.length >= 3 && telefone.includes(digitos);
      if (!matchTexto && !matchTelefone) return false;
    }
    return true;
  });
}

/** Reidrata `filtros` vindos do jsonb com defaults seguros (arrays sempre presentes). */
export function normalizeOfertaFiltros(json: unknown): OfertaFiltros {
  const o = (json && typeof json === "object" && !Array.isArray(json) ? json : {}) as Record<
    string,
    unknown
  >;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const diasRaw = o.semInteracaoHaDias;
  const dias =
    typeof diasRaw === "number"
      ? diasRaw
      : typeof diasRaw === "string" && diasRaw.trim() !== ""
        ? Number(diasRaw)
        : undefined;
  return {
    status: arr(o.status),
    temperatura: arr(o.temperatura),
    projetoId: arr(o.projetoId),
    origem: arr(o.origem),
    zona: arr(o.zona),
    semInteracaoHaDias:
      dias !== undefined && Number.isFinite(dias) && dias > 0 ? Math.floor(dias) : undefined,
  };
}

/**
 * Mensagem de WhatsApp para um lead da lista. Sem template usa a mensagem
 * padrão da campanha; com template renderiza os placeholders
 * (`{{nome}}`, `{{primeiro_nome}}`, `{{projeto}}`) como no detalhe do lead.
 */
export function buildMensagemOferta(
  lead: { nome: string; projeto_nome: string | null },
  conteudo?: string,
): string {
  const primeiroNome = lead.nome.trim().split(/\s+/)[0] || lead.nome;
  if (conteudo && conteudo.trim() !== "") {
    return renderTemplate(conteudo, {
      nome: lead.nome,
      primeiro_nome: primeiroNome,
      projeto: lead.projeto_nome ?? "",
    });
  }
  const projeto = lead.projeto_nome ? ` sobre o ${lead.projeto_nome}` : "";
  return `Olá, ${primeiroNome}! Aqui é da Seu Metro Quadrado${projeto}. Recebemos seu contato e gostaríamos de te ajudar. Posso te chamar agora?`;
}

export function statusLabel(s: string) {
  return (
    {
      rascunho: "Rascunho",
      ativa: "Ativa",
      concluida: "Concluída",
      arquivada: "Arquivada",
    }[s] ?? s
  );
}

export function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "ativa") return "default";
  if (s === "concluida") return "secondary";
  return "outline";
}

/** Lista as ofertas com estatísticas. `arquivadas` filtra no servidor — evita
 *  refazer o fetch paginado dos vínculos das listas da outra aba. */
export async function listOfertas(arquivadas = false): Promise<OfertaAtiva[]> {
  let query = supabase.from("ofertas_ativas").select("*").order("created_at", { ascending: false });
  query = arquivadas ? query.eq("status", "arquivada") : query.neq("status", "arquivada");
  const { data: ofertas, error } = await query;
  if (error) throw error;

  const filtered = ofertas ?? [];
  if (filtered.length === 0) return [];

  const ids = filtered.map((o) => o.id);
  type VinculoStats = {
    oferta_id: string;
    contatado: boolean;
    avancado: boolean;
  };
  // Sem join com `leads`: as flags são mantidas pelo trigger de sincronização
  // no banco, então a contagem é idêntica (e à prova de RLS) para todo papel.
  const leadsRows = await fetchAllPaged<VinculoStats>(async (from, to) => {
    const { data, error: e } = await supabase
      .from("oferta_ativa_leads")
      .select("oferta_id, contatado, avancado")
      .in("oferta_id", ids)
      .order("id")
      .range(from, to);
    if (e) throw e;
    return (data ?? []) as unknown as VinculoStats[];
  });

  const stats = new Map<string, { total: number; contatados: number; avancados: number }>();
  for (const row of leadsRows) {
    const s = stats.get(row.oferta_id) ?? { total: 0, contatados: 0, avancados: 0 };
    s.total += 1;
    if (row.contatado) s.contatados += 1;
    if (row.avancado) s.avancados += 1;
    stats.set(row.oferta_id, s);
  }

  return filtered.map((o) => {
    const s = stats.get(o.id) ?? { total: 0, contatados: 0, avancados: 0 };
    return {
      ...(o as Omit<OfertaAtiva, "totalLeads" | "totalContatados" | "totalAvancados" | "filtros">),
      filtros: normalizeOfertaFiltros(o.filtros),
      totalLeads: s.total,
      totalContatados: s.contatados,
      totalAvancados: s.avancados,
    } as OfertaAtiva;
  });
}

export async function previewFiltros(
  filtros: OfertaFiltros,
  corretorId?: string,
): Promise<OfertaPreview> {
  const { data, error } = await supabase.rpc("preview_oferta_ativa", {
    _filtros: filtros as never,
    _corretor: corretorId ?? undefined,
  });
  if (error) throw error;
  return (data as unknown as OfertaPreview) ?? { count: 0, sample: [] };
}

export async function createOferta(input: {
  nome: string;
  descricao?: string;
  filtros: OfertaFiltros;
  corretorId?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_oferta_ativa", {
    _nome: input.nome,
    _descricao: input.descricao ?? "",
    _filtros: input.filtros as never,
    _corretor: input.corretorId ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

export async function archiveOferta(id: string) {
  const { error } = await supabase
    .from("ofertas_ativas")
    .update({ status: "arquivada" })
    .eq("id", id);
  if (error) throw error;
}

export async function restaurarOferta(id: string) {
  const { error } = await supabase.from("ofertas_ativas").update({ status: "ativa" }).eq("id", id);
  if (error) throw error;
}

export async function concluirOferta(id: string) {
  const { error } = await supabase
    .from("ofertas_ativas")
    .update({ status: "concluida" })
    .eq("id", id);
  if (error) throw error;
}

export async function updateOferta(id: string, dados: { nome: string; descricao: string | null }) {
  const { error } = await supabase
    .from("ofertas_ativas")
    .update({ nome: dados.nome, descricao: dados.descricao })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteOferta(id: string) {
  const { error } = await supabase.from("ofertas_ativas").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Atribui a lista a um ou mais corretores.
 * - 1 corretor: apenas troca o dono da lista.
 * - N corretores: cria N novas listas ("… — parte i/N") com os leads divididos
 *   igualmente ao acaso e arquiva a original.
 */
export async function atribuirOferta(
  ofertaId: string,
  corretorIds: string[],
): Promise<{ modo: "single" | "split"; criadas?: string[]; total_leads?: number }> {
  const { data, error } = await supabase.rpc("atribuir_oferta_ativa", {
    _oferta_id: ofertaId,
    _corretor_ids: corretorIds,
  });
  if (error) throw error;
  return data as never;
}

/** Só a linha da oferta (sem vínculos) — usada no prefill do "Duplicar lista". */
export async function getOfertaResumo(id: string) {
  const { data, error } = await supabase
    .from("ofertas_ativas")
    .select("id, nome, descricao, corretor_id, filtros")
    .eq("id", id)
    .single();
  if (error) throw error;
  return { ...data, filtros: normalizeOfertaFiltros(data.filtros) };
}

export async function getOferta(id: string) {
  const { data: oferta, error } = await supabase
    .from("ofertas_ativas")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const vinculos = await fetchAllPaged<OfertaLeadRow>(async (from, to) => {
    const { data, error: e } = await supabase
      .from("oferta_ativa_leads")
      .select(
        "id, contatado, contatado_em, avancado, lead:leads(id, nome, telefone, projeto_nome, projeto_id, corretor_id, observacoes, status)",
      )
      .eq("oferta_id", id)
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to);
    if (e) throw e;
    return (data ?? []) as unknown as OfertaLeadRow[];
  });

  return {
    oferta: { ...oferta, filtros: normalizeOfertaFiltros(oferta.filtros) },
    leads: vinculos,
  };
}

export async function marcarContatado(vinculoId: string, valor: boolean) {
  const { error } = await supabase
    .from("oferta_ativa_leads")
    .update({ contatado: valor, contatado_em: valor ? new Date().toISOString() : null })
    .eq("id", vinculoId);
  if (error) throw error;
}

/** Marca/desmarca contato em massa — um UPDATE por lote de 100 ids, não N chamadas. */
export async function marcarContatadosEmMassa(vinculoIds: string[], valor: boolean) {
  const contatado_em = valor ? new Date().toISOString() : null;
  for (let i = 0; i < vinculoIds.length; i += 100) {
    const lote = vinculoIds.slice(i, i + 100);
    const { error } = await supabase
      .from("oferta_ativa_leads")
      .update({ contatado: valor, contatado_em })
      .in("id", lote);
    if (error) throw error;
  }
}

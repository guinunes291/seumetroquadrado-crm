import { supabase } from "@/integrations/supabase/client";

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

export function statusVariant(
  s: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (s === "ativa") return "default";
  if (s === "concluida") return "secondary";
  return "outline";
}

export async function listOfertas(incluirArquivadas = false): Promise<OfertaAtiva[]> {
  const { data: ofertas, error } = await supabase
    .from("ofertas_ativas")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const filtered = (ofertas ?? []).filter((o) =>
    incluirArquivadas ? true : o.status !== "arquivada",
  );

  if (filtered.length === 0) return [];

  const ids = filtered.map((o) => o.id);
  const { data: leadsRows } = await supabase
    .from("oferta_ativa_leads")
    .select("oferta_id, contatado, avancado")
    .in("oferta_id", ids);

  const stats = new Map<string, { total: number; contatados: number; avancados: number }>();
  for (const row of leadsRows ?? []) {
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
      filtros: (o.filtros ?? {}) as OfertaFiltros,
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
  const { error } = await supabase
    .from("ofertas_ativas")
    .update({ status: "ativa" })
    .eq("id", id);
  if (error) throw error;
}

export async function getOferta(id: string) {
  const { data: oferta, error } = await supabase
    .from("ofertas_ativas")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: vinculos, error: e2 } = await supabase
    .from("oferta_ativa_leads")
    .select("id, contatado, contatado_em, avancado, lead:leads(*)")
    .eq("oferta_id", id);
  if (e2) throw e2;

  return {
    oferta: { ...oferta, filtros: (oferta.filtros ?? {}) as OfertaFiltros },
    leads: vinculos ?? [],
  };
}

export async function marcarContatado(vinculoId: string, valor: boolean) {
  const { error } = await supabase
    .from("oferta_ativa_leads")
    .update({ contatado: valor, contatado_em: valor ? new Date().toISOString() : null })
    .eq("id", vinculoId);
  if (error) throw error;
}

// Fronteira do painel da pré-venda (migration 20261014120000): a passagem do
// discador, a confirmação com resultado e o painel. As RPCs não estão nos
// types gerados: passam pela fronteira `rpc` de features/dashboard/queries e a
// resposta é validada aqui (fail-closed), sem escape de tipo.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/features/dashboard/queries";
import { restricaoCpfValida, type FormPassagem, type RestricaoCpf } from "@/lib/sdr";
import { useInvalidarSdr } from "./client";

function erro(e: { message?: string; code?: string } | null, fallback: string): Error {
  // O código do Postgres segue junto (SMQP1 = faltou campo, SMQZ2 = zona...).
  return Object.assign(new Error(e?.message || fallback), { code: e?.code });
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------
const texto = z.string().nullable().catch(null);

const visitaSchema = z.object({
  agendamento_id: z.string(),
  lead_id: z.string(),
  nome: z.string(),
  telefone: texto,
  data_inicio: z.string(),
  local: texto,
  status: z.string(),
  corretor_nome: texto,
});

const marcoSchema = z.object({
  lead_id: z.string(),
  nome: z.string(),
  em: z.string(),
  corretor_nome: texto,
});

const semVisitaSchema = z.object({
  lead_id: z.string(),
  nome: z.string(),
  telefone: texto,
  status: z.string(),
  ultima_atividade_em: texto,
});

const entregaSchema = z.object({
  lead_id: z.string(),
  nome: z.string(),
  corretor_nome: texto,
  renda_informada: texto,
  tipo_renda: texto,
  usa_fgts: z.boolean().nullable().catch(null),
  restricao_cpf: texto,
  sdr_entregue_em: z.string(),
  proxima_visita: texto,
  regra: texto,
});

const painelSchema = z.object({
  semana: z.object({ de: z.string(), ate: z.string() }),
  a_confirmar: z.array(visitaSchema),
  confirmada: z.array(visitaSchema),
  realizada: z.array(visitaSchema),
  pasta: z.array(marcoSchema),
  venda: z.array(marcoSchema),
  reagendar: z.array(visitaSchema),
  sem_visita: z.array(semVisitaSchema),
  ultima_entrega: entregaSchema.nullable().catch(null),
  base_total: z.number().catch(0),
  roleta: z.object({
    aptos: z.number(),
    regra_semanal: z.boolean().catch(false),
    sombra: z.boolean().catch(true),
    zona_estrita: z.boolean().catch(true),
  }),
});

export type PainelSdr = z.infer<typeof painelSchema>;
export type VisitaPainel = z.infer<typeof visitaSchema>;
export type MarcoPainel = z.infer<typeof marcoSchema>;
export type SemVisitaPainel = z.infer<typeof semVisitaSchema>;
export type EntregaPainel = z.infer<typeof entregaSchema>;
export type RoletaPainel = PainelSdr["roleta"];

export function lerPainel(data: unknown): PainelSdr {
  return painelSchema.parse(data);
}

export const PAINEL_KEY = (sdrId: string | null | undefined) =>
  ["sdr:painel", sdrId ?? "eu"] as const;

export function usePainelSdr(sdrId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: PAINEL_KEY(sdrId),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("sdr_painel", { _sdr: sdrId ?? null });
      if (error) throw erro(error, "Não foi possível carregar o painel da pré-venda.");
      return lerPainel(data);
    },
  });
}

function useInvalidarPainel() {
  const qc = useQueryClient();
  const invalidarSdr = useInvalidarSdr();
  return (leadId?: string) => {
    void qc.invalidateQueries({ queryKey: ["sdr:painel"] });
    void qc.invalidateQueries({ queryKey: ["sdr:tarefas"] });
    void qc.invalidateQueries({ queryKey: ["sdr:visitas"] });
    invalidarSdr(leadId);
  };
}

// ---------------------------------------------------------------------------
// Passagem do discador
// ---------------------------------------------------------------------------
const passagemSchema = z.object({
  ok: z.boolean(),
  modo: z.enum(["visita", "documentacao"]),
  lead_id: z.string(),
  novo: z.boolean().catch(false),
  puxado: z.boolean().catch(false),
  corretor_origem_id: texto,
  corretor_id: z.string().optional(),
  corretor_nome: z.string().nullable().optional(),
  regra: z.string().optional(),
  agendamento_id: z.string().optional(),
  data_inicio: z.string().optional(),
});
export type ResultadoPassagem = z.infer<typeof passagemSchema>;

export async function passarCliente(
  payload: Record<string, string | null>,
): Promise<ResultadoPassagem> {
  const { data, error } = await rpc("sdr_passar_cliente", { _payload: payload });
  if (error) throw erro(error, "Não foi possível passar o cliente.");
  return passagemSchema.parse(data);
}

export function usePassarCliente() {
  const invalidar = useInvalidarPainel();
  return useMutation({
    mutationFn: passarCliente,
    onSuccess: (res) => invalidar(res.lead_id),
  });
}

/** O que a ficha já sabe do cliente, para a passagem não perguntar de novo. */
const prefillSchema = z.object({
  nome: z.string(),
  telefone: z.string(),
  renda_informada: texto,
  tipo_renda: texto,
  tem_fgts: z.boolean().nullable().catch(null),
  usa_fgts: z.boolean().nullable().catch(null),
  decisor: texto,
  restricao_cpf: texto,
  resumo_qualificacao: texto,
  zona: texto,
});

export async function carregarPrefillPassagem(leadId: string): Promise<Partial<FormPassagem>> {
  const { data, error } = await supabase
    .from("leads")
    .select(
      "nome, telefone, renda_informada, tipo_renda, tem_fgts, usa_fgts, decisor, restricao_cpf, resumo_qualificacao, zona",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw erro(error, "Não foi possível ler a ficha do cliente.");
  if (!data) return {};
  const l = prefillSchema.parse(data);
  const fgts = l.tem_fgts ?? l.usa_fgts;
  const restricao: RestricaoCpf | null = restricaoCpfValida(l.restricao_cpf)
    ? l.restricao_cpf
    : null;
  return {
    nome: l.nome,
    telefone: l.telefone,
    renda: l.renda_informada ?? "",
    tipoRenda: l.tipo_renda ?? "",
    fgts: fgts == null ? null : fgts ? "sim" : "nao",
    decisor: l.decisor ?? "",
    restricaoCpf: restricao,
    resumo: l.resumo_qualificacao ?? "",
    zona: l.zona,
  };
}

export function usePrefillPassagem(leadId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["sdr:prefill-passagem", leadId],
    enabled: enabled && !!leadId,
    // Lida uma vez por abertura: o SDR alterna com o discador o tempo todo, e
    // um refetch na volta do foco apagaria o que ele já digitou.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    gcTime: 0,
    queryFn: () => carregarPrefillPassagem(leadId!),
  });
}

// ---------------------------------------------------------------------------
// Confirmação D-1/D-0 com resultado
// ---------------------------------------------------------------------------
export type ResultadoConfirmacao = "confirmou" | "remarcar" | "nao_atendeu";

export async function registrarConfirmacao(input: {
  agendamentoId: string;
  resultado: ResultadoConfirmacao;
  novoInicio?: string | null;
  nota?: string | null;
}): Promise<{ agendamento_id: string; data_inicio: string }> {
  const { data, error } = await rpc("sdr_registrar_confirmacao", {
    _agendamento_id: input.agendamentoId,
    _resultado: input.resultado,
    _novo_inicio: input.novoInicio ?? null,
    _nota: input.nota ?? null,
  });
  if (error) throw erro(error, "Não foi possível registrar a confirmação.");
  return z.object({ agendamento_id: z.string(), data_inicio: z.string() }).parse(data);
}

export function useRegistrarConfirmacao() {
  const invalidar = useInvalidarPainel();
  return useMutation({
    mutationFn: registrarConfirmacao,
    onSuccess: () => invalidar(),
  });
}

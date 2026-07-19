// Métricas agregadas da aba Saúde da Gestão (P2-12): o painel baixava até
// 10.000 interações do período e agregava no navegador. O caminho novo pede os
// agregados prontos à RPC gestao_metricas (SECURITY INVOKER — a RLS recorta);
// o caminho antigo vira o fallback via rpcWithFallback, então a tela fica
// idêntica com ou sem a migration aplicada no ambiente.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpcWithFallback } from "@/lib/supabase-errors";

export type AtividadeAutor = {
  autor_id: string | null;
  ligacao: number;
  whatsapp: number;
  visita: number;
  outras: number;
  total: number;
};

export type AderenciaLeads = {
  total: number;
  semCorretor: number;
  semEmail: number;
  semRenda: number;
};

export type GestaoMetricas = {
  /** Interações do período agregadas por autor, ordenadas por total desc. */
  atividade: AtividadeAutor[];
  /** Qualidade do cadastro sobre a base de leads ativos. */
  aderencia: AderenciaLeads;
  /** true só no fallback, quando o período estourou o limite de linhas. */
  truncado: boolean;
};

/** Limite do caminho antigo (fallback) — o mesmo valor que a tela usava. */
export const LIMITE_ATIVIDADE = 10000;

// Status fora do funil ativo — base de "leads ativos" da aderência.
const FORA_DO_FUNIL = "(perdido,contrato_fechado,pos_venda)";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function parseMetricas(raw: unknown): GestaoMetricas {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const atividade: AtividadeAutor[] = Array.isArray(o.atividade)
    ? o.atividade.map((item) => {
        const lin = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return {
          autor_id: typeof lin.autor_id === "string" ? lin.autor_id : null,
          ligacao: num(lin.ligacao),
          whatsapp: num(lin.whatsapp),
          visita: num(lin.visita),
          outras: num(lin.outras),
          total: num(lin.total),
        };
      })
    : [];
  const ad = (o.aderencia && typeof o.aderencia === "object" ? o.aderencia : {}) as Record<
    string,
    unknown
  >;
  return {
    atividade,
    aderencia: {
      total: num(ad.total),
      semCorretor: num(ad.sem_corretor),
      semEmail: num(ad.sem_email),
      semRenda: num(ad.sem_renda),
    },
    truncado: false,
  };
}

/** Caminho antigo preservado como fallback: linhas cruas + reduce no cliente. */
async function metricasViaLinhas(range: { di: string; df: string }): Promise<GestaoMetricas> {
  const baseLeads = () =>
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("na_lixeira", false)
      .not("status", "in", FORA_DO_FUNIL);

  const [interacoesRes, tot, semCorr, semEmail, semRenda] = await Promise.all([
    supabase
      .from("interacoes")
      .select("autor_id, tipo")
      .is("deleted_at", null)
      .gte("ocorreu_em", `${range.di}T00:00:00`)
      .lte("ocorreu_em", `${range.df}T23:59:59`)
      .order("ocorreu_em", { ascending: false })
      .limit(LIMITE_ATIVIDADE),
    baseLeads(),
    baseLeads().is("corretor_id", null),
    baseLeads().is("email", null),
    baseLeads().is("renda_informada", null),
  ]);
  if (interacoesRes.error) throw interacoesRes.error;

  const rows = (interacoesRes.data ?? []) as { autor_id: string | null; tipo: string }[];
  const porAutor = new Map<string, AtividadeAutor>();
  for (const r of rows) {
    const chave = r.autor_id ?? "__sem_autor__";
    let lin = porAutor.get(chave);
    if (!lin) {
      lin = { autor_id: r.autor_id, ligacao: 0, whatsapp: 0, visita: 0, outras: 0, total: 0 };
      porAutor.set(chave, lin);
    }
    if (r.tipo === "ligacao") lin.ligacao++;
    else if (r.tipo === "whatsapp") lin.whatsapp++;
    else if (r.tipo === "visita") lin.visita++;
    else lin.outras++;
    lin.total++;
  }

  return {
    atividade: Array.from(porAutor.values()).sort((a, b) => b.total - a.total),
    aderencia: {
      total: tot.count ?? 0,
      semCorretor: semCorr.count ?? 0,
      semEmail: semEmail.count ?? 0,
      semRenda: semRenda.count ?? 0,
    },
    truncado: rows.length >= LIMITE_ATIVIDADE,
  };
}

export function useGestaoMetricas(
  range: { di: string; df: string; campoData?: "criacao" | "evento" },
  enabled = true,
) {
  const campoData = range.campoData ?? "criacao";
  return useQuery({
    queryKey: ["gestao:metricas", range.di, range.df, campoData],
    enabled,
    staleTime: 60_000,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          // RPC fora dos types gerados (migration pode não estar aplicada).
          const res = (await supabase.rpc("gestao_metricas", {
            _periodo_start: `${range.di}T00:00:00`,
            _periodo_end: `${range.df}T23:59:59`,
            _campo_data: campoData,
          })) as { data: unknown; error: { code?: string; message?: string } | null };
          if (res.error) throw res.error;
          return parseMetricas(res.data);
        },
        () => metricasViaLinhas(range),
      ),
  });
}

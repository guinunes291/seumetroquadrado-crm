// Ponte de contexto das telas TRANSVERSAIS → sidebar.
//
// sistemaAtivo é (e continua sendo) função pura de pathname+search; mas a
// fase da jornada de um lead não vive na URL da ficha — vive no dado. Este
// módulo é o fio que liga os dois: a tela transversal PUBLICA a fase do lead
// que está mostrando, e a sidebar a consome via useSyncExternalStore para
// resolver com sistemaAtivoContextual (features/nav/sistemas).
//
// Regras: publica-se SÓ dado determinístico (etapa vinda do banco) — nunca
// referrer/histórico; a tela limpa o contexto ao desmontar; enquanto a fase
// não chega, o valor é null e a resolução padrão por path vale (fallback =
// comportamento antigo, sem flicker de sidebar errada).

import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { faseDoStatus } from "@/features/nav/sistemas";
import type { FaseFunil } from "@/lib/leads";

let faseAtual: FaseFunil | null = null;
const ouvintes = new Set<() => void>();

function assinar(cb: () => void): () => void {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

function publicar(fase: FaseFunil | null): void {
  if (faseAtual === fase) return;
  faseAtual = fase;
  ouvintes.forEach((f) => f());
}

/** A fase da jornada publicada pela tela transversal atual (null = nenhuma). */
export function useFaseDaJornada(): FaseFunil | null {
  return useSyncExternalStore(
    assinar,
    () => faseAtual,
    () => null,
  );
}

/** Para a tela que JÁ carregou o lead (ficha): publica a fase da etapa e
 *  limpa ao desmontar. Passe null enquanto o lead carrega. */
export function usePublicarFaseDoLead(status: string | null | undefined): void {
  const fase = faseDoStatus(status);
  useEffect(() => {
    publicar(fase);
    return () => publicar(null);
  }, [fase]);
}

/** Para telas que só têm o id (?leadId na Vitrine/ficha de projeto): busca SÓ
 *  a etapa (RLS recorta; cacheada) e publica. Sem leadId, não publica nada. */
export function usePublicarFaseDoLeadPorId(leadId: string | null | undefined): void {
  const statusQ = useQuery({
    queryKey: ["fase-jornada-lead", leadId ?? null],
    enabled: !!leadId,
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("leads")
        .select("status")
        .eq("id", leadId!)
        .maybeSingle();
      if (error) throw error;
      return data?.status ?? null;
    },
  });
  usePublicarFaseDoLead(leadId ? statusQ.data : null);
}

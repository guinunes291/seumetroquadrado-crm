// Leitura e gravação do estado do onboarding do próprio corretor.
//
// Fronteira única com o banco: as RPCs onboarding_corretor_status e
// onboarding_corretor_concluir (migration 20260916190000). Banco sem a
// migration → status null e a trilha simplesmente não abre sozinha.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { OnboardingStatus } from "@/features/onboarding/onboarding";

export const ONBOARDING_KEY = "onboarding:status";

function normalizar(raw: unknown): OnboardingStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const origem = r.origem === "onboarding" || r.origem === "manual" ? r.origem : null;
  return {
    concluido_em: typeof r.concluido_em === "string" ? r.concluido_em : null,
    origem,
    eh_corretor: r.eh_corretor === true,
    tem_interacao: r.tem_interacao === true,
  };
}

// Ligado ao client: `supabase.rpc` solto perde o `this` e a chamada nunca resolve.
const rpc = ((fn: string, args?: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => unknown)(
    fn,
    args,
  )) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * Status do onboarding. Revalida ao voltar o foco da janela — é assim que o
 * passo 6 percebe que o corretor registrou um desfecho em outra aba, sem
 * polling.
 */
export function useOnboardingStatus() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: [ONBOARDING_KEY, uid],
    enabled: !!uid,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<OnboardingStatus | null> => {
      const { data, error } = await rpc("onboarding_corretor_status");
      if (error) {
        console.warn("onboarding_corretor_status indisponível:", error.message);
        return null;
      }
      return normalizar(data);
    },
  });
}

export function useConcluirOnboarding() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (): Promise<{ ok: boolean; status: OnboardingStatus | null }> => {
      const { data, error } = await rpc("onboarding_corretor_concluir");
      if (error) throw new Error(error.message);
      const obj = (data ?? {}) as Record<string, unknown>;
      return { ok: obj.ok === true, status: normalizar(data) };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ONBOARDING_KEY, user?.id] });
    },
  });
}

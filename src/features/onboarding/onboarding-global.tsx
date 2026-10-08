// Host global do onboarding. Montado no shell /_authenticated ANTES do
// MetasDiaGlobal: não faz sentido pedir a meta do dia para quem ainda não
// sabe operar a fila.
//
// Desde outubro/2026 o onboarding é o TREINO PRÁTICO (telas de treino com
// cliques obrigatórios). Para corretor que ainda não concluiu a versão atual
// (PREF_ONBOARDING_PRATICO), abre sozinho e não fecha até concluir — inclusive
// para quem já tinha concluído a trilha antiga. O item "Como usar o CRM" do
// menu dispara EVENTO_ABRIR_ONBOARDING e reabre o treino, aí podendo fechar.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { usePreference } from "@/hooks/use-preference";
import { pullPrefs } from "@/lib/user-prefs";
import { EVENTO_ABRIR_ONBOARDING } from "@/features/onboarding/onboarding";
import { PREF_ONBOARDING_PRATICO, praticoConcluido } from "@/features/onboarding/pratico";
import { OnboardingPratico } from "@/features/onboarding/onboarding-pratico";
import { useConcluirOnboarding, useOnboardingStatus } from "@/features/onboarding/use-onboarding";

export function OnboardingGlobal() {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const { isCorretor, loading: papeisCarregando } = useUserRoles();
  const [conclusao, setConclusao] = usePreference<unknown>(PREF_ONBOARDING_PRATICO, null);
  // Mesma query que o usePreference usa: espera o servidor antes de obrigar,
  // para não abrir para quem concluiu em outro aparelho.
  const prefs = useQuery({
    queryKey: ["user-prefs", uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: () => pullPrefs(uid),
  });
  const [reaberto, setReaberto] = useState(false);
  // A conclusão antiga (banco) é requisito da roleta: grava junto, best-effort.
  const { data: statusAntigo } = useOnboardingStatus();
  const concluirAntigo = useConcluirOnboarding();

  useEffect(() => {
    const abrir = () => setReaberto(true);
    window.addEventListener(EVENTO_ABRIR_ONBOARDING, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_ONBOARDING, abrir);
  }, []);

  if (!user) return null;

  const obrigatorio =
    !papeisCarregando && isCorretor && prefs.isFetched && !praticoConcluido(conclusao);

  return (
    <OnboardingPratico
      open={obrigatorio || reaberto}
      obrigatorio={obrigatorio}
      onConcluir={() => {
        setConclusao({ concluido_em: new Date().toISOString() });
        setReaberto(false);
        if (statusAntigo && !statusAntigo.concluido_em) concluirAntigo.mutate();
      }}
      onFechar={() => setReaberto(false)}
    />
  );
}

export default OnboardingGlobal;

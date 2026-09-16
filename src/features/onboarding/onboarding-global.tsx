// Host global da trilha de onboarding. Montado no shell /_authenticated ANTES
// do MetasDiaGlobal: não faz sentido pedir a meta do dia para quem ainda não
// sabe o que é a fila.
//
// Não é bloqueante: dá para fechar e voltar depois. Fechado, reabre no próximo
// acesso enquanto não estiver concluído. O item "Como usar o CRM" do menu
// dispara EVENTO_ABRIR_ONBOARDING e reabre a qualquer momento.

import { useEffect, useState } from "react";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import {
  EVENTO_ABRIR_ONBOARDING,
  deveAbrirSozinho,
} from "@/features/onboarding/onboarding";
import { useOnboardingStatus } from "@/features/onboarding/use-onboarding";
import { OnboardingDialog } from "@/features/onboarding/onboarding-dialog";

export function OnboardingGlobal() {
  const { user } = useAuth();
  const { isCorretor, loading: papeisCarregando } = useUserRoles();
  const { data: status } = useOnboardingStatus();
  const [aberto, setAberto] = useState(false);
  const [fechadoNestaSessao, setFechadoNestaSessao] = useState(false);

  useEffect(() => {
    const abrir = () => setAberto(true);
    window.addEventListener(EVENTO_ABRIR_ONBOARDING, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_ONBOARDING, abrir);
  }, []);

  useEffect(() => {
    if (papeisCarregando || aberto) return;
    if (deveAbrirSozinho({ status, ehCorretor: isCorretor, fechadoNestaSessao })) {
      setAberto(true);
    }
  }, [aberto, fechadoNestaSessao, isCorretor, papeisCarregando, status]);

  if (!user) return null;

  return (
    <OnboardingDialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) setFechadoNestaSessao(true);
      }}
      status={status ?? null}
      uid={user.id}
    />
  );
}

export default OnboardingGlobal;

// Guarda de sessão do Modo Obrigatório: quando a trava liga no meio do uso
// (lead novo chegou, o polling percebeu), leva o corretor para /obrigatorio.
// Quando a lista zera, avisa que o CRM foi liberado. Não renderiza nada.

import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { idsDaLista, useModoObrigatorio } from "@/features/modo-obrigatorio/use-modo-obrigatorio";
import { ROTA_OBRIGATORIO, rotaPermitidaTravado } from "@/features/modo-obrigatorio/rotas";

export function ModoObrigatorioGuard() {
  const { data } = useModoObrigatorio();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const eraTravado = useRef<boolean | null>(null);

  useEffect(() => {
    if (!data) return;
    if (data.travado && !rotaPermitidaTravado(pathname, idsDaLista(data))) {
      void navigate({ to: ROTA_OBRIGATORIO, replace: true });
    }
    if (eraTravado.current === true && !data.travado) {
      toast.success("Processo concluído — CRM liberado.");
    }
    if (eraTravado.current === false && data.travado) {
      toast.warning("Chegou pendência obrigatória. Conclua o processo para seguir.");
    }
    eraTravado.current = data.travado;
  }, [data, pathname, navigate]);

  return null;
}

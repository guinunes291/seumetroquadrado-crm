// Faixa "faça seu check-in" no topo do CRM — substitui o auto check-in do
// login (auth-guard), que marcava presença sozinho e sem dizer onde. Só para
// corretor, só enquanto não houver check-in aberto hoje, e fora das telas que
// já mostram o card de check-in.

import { Link, useLocation } from "@tanstack/react-router";
import { Storefront } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useUserRoles } from "@/hooks/use-auth";
import { useMinhaPresenca } from "./presenca-client";
import { precisaCheckin } from "./presenca-derive";

const TELAS_COM_CARD = ["/presenca", "/meu-perfil"];

export function CheckinPendenteBanner() {
  const { isCorretor, loading } = useUserRoles();
  const location = useLocation();
  const q = useMinhaPresenca(isCorretor);

  if (loading || !isCorretor || !precisaCheckin(q.data)) return null;
  if (TELAS_COM_CARD.some((t) => location.pathname.startsWith(t))) return null;

  const encerrado = !!q.data?.checkin?.encerrado_em;
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-sm">
        <Storefront className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <span>
          <strong>
            {encerrado ? "Sua presença de hoje foi encerrada." : "Faça o check-in de hoje."}
          </strong>{" "}
          Escolha a filial em que você está (ou se está em casa) para entrar nas roletas de leads.
        </span>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link to="/presenca">Fazer check-in</Link>
      </Button>
    </div>
  );
}

// Faixa "faça seu check-in" no topo do CRM — substitui o auto check-in do
// login (auth-guard), que marcava presença sozinho e sem dizer onde. Só para
// corretor, fora das telas que já mostram o card de check-in. O PRIMEIRO
// check-in do dia é cobrado pelo diálogo obrigatório
// (checkin-obrigatorio-global.tsx); a faixa fica para quem encerrou a
// presença, para as telas em que o diálogo não abre e para quem a localização
// barrou (check-in aberto numa filial que não vale): sem ela, quem tocou
// "Continuar fora das roletas" ficaria sem aviso nenhum.

import { Link, useLocation } from "@tanstack/react-router";
import { MapPinSimpleArea, Storefront } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useUserRoles } from "@/hooks/use-auth";
import { TELAS_COM_CARD_CHECKIN } from "./checkin-obrigatorio";
import { useMinhaPresenca } from "./presenca-client";
import { precisaCheckin, precisaRefazerCheckin } from "./presenca-derive";

export function CheckinPendenteBanner() {
  const { isCorretor, loading } = useUserRoles();
  const location = useLocation();
  const q = useMinhaPresenca(isCorretor);

  if (loading || !isCorretor) return null;
  const barrado = precisaRefazerCheckin(q.data);
  if (!barrado && !precisaCheckin(q.data)) return null;
  if (TELAS_COM_CARD_CHECKIN.some((t) => location.pathname.startsWith(t))) return null;

  const encerrado = !!q.data?.checkin?.encerrado_em;
  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={barrado ? "faixa-checkin-barrado" : "faixa-checkin"}
    >
      <div className="flex items-start gap-2 text-sm">
        {barrado ? (
          <MapPinSimpleArea className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        ) : (
          <Storefront className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        )}
        {barrado ? (
          <span>
            <strong>
              Seu check-in em {q.data?.checkin?.filial_nome ?? "uma filial"} não valeu: a
              localização não confirmou a loja.
            </strong>{" "}
            Chegou à loja? Refaça o check-in.
          </span>
        ) : (
          <span>
            <strong>
              {encerrado ? "Sua presença de hoje foi encerrada." : "Faça o check-in de hoje."}
            </strong>{" "}
            Escolha a filial em que você está (ou se está em casa) para entrar nas roletas de leads.
          </span>
        )}
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link to="/presenca">{barrado ? "Refazer check-in" : "Fazer check-in"}</Link>
      </Button>
    </div>
  );
}

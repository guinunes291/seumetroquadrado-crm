// Faixa "faça seu check-in" no topo do CRM — substitui o auto check-in do
// login (auth-guard), que marcava presença sozinho e sem dizer onde. Só para
// corretor, fora das telas que já mostram o card de check-in. O PRIMEIRO
// check-in do dia é cobrado pelo diálogo obrigatório
// (checkin-obrigatorio-global.tsx); a faixa fica para quem encerrou a
// presença, para as telas em que o diálogo não abre e para quem a localização
// barrou (check-in aberto numa filial que não vale): sem ela, quem tocou
// "Continuar fora das roletas" ficaria sem aviso nenhum.
//
// Enquanto mostra o barrado, relê a presença (15 s, aba e janela): quando a
// gestão confirmar no plantão (ou o interruptor liberar), a faixa some
// sozinha — e não empurra o corretor para refazer um check-in que já vale.
//
// Barrado SEM localização (13/10/2026): o celular não informou a posição, e
// "Refazer check-in" em /presenca obrigava a escolher a filial de novo. A
// faixa ganha "Incluir localização": o GPS é lido NO TOQUE (o navegador só
// mostra o pedido de permissão de dentro do gesto — "Pedir localização no
// check-in", dono, 13/10) e a leitura vai junto no pedido (pedirCheckinNoToque).
// O diálogo abre no barrado e refaz na mesma filial com essa leitura — se ela
// falhar, nada é gravado; se o check-in de hoje já vale (a gestão confirmou),
// a leitura é descartada. A faixa nunca chama a RPC: só pede. O barrado FORA da
// filial e a faixa de quem não fez (ou encerrou) o check-in continuam como antes.

import { Link, useLocation } from "@tanstack/react-router";
import { MapPinSimpleArea, Storefront } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useUserRoles } from "@/hooks/use-auth";
import { telaComCardCheckin } from "./checkin-obrigatorio";
import { useMinhaPresenca } from "./presenca-client";
import { precisaCheckin, precisaRefazerCheckin } from "./presenca-derive";
import { pedirCheckinNoToque } from "./use-checkin-obrigatorio";

export function CheckinPendenteBanner() {
  const { isCorretor, loading } = useUserRoles();
  const location = useLocation();
  // Nas telas com o card, quem relê o barrado é o card.
  const telaComCard = telaComCardCheckin(location.pathname);
  const q = useMinhaPresenca(isCorretor, {
    releitura: (p) => !telaComCard && precisaRefazerCheckin(p),
  });

  if (loading || !isCorretor) return null;
  const barrado = precisaRefazerCheckin(q.data);
  if (!barrado && !precisaCheckin(q.data)) return null;
  if (telaComCard) return null;

  const c = q.data?.checkin;
  const filial = c?.filial_nome ?? "uma filial";
  const encerrado = !!c?.encerrado_em;
  const semLocalizacao = barrado && c?.motivo === "sem_localizacao";
  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={barrado ? "faixa-checkin-barrado" : "faixa-checkin"}
      data-motivo={barrado ? (c?.motivo ?? undefined) : undefined}
    >
      <div className="flex items-start gap-2 text-sm">
        {barrado ? (
          <MapPinSimpleArea className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        ) : (
          <Storefront className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        )}
        {semLocalizacao ? (
          <span>
            <strong>
              Seu check-in em {filial} ficou sem a localização e não vale para as roletas.
            </strong>{" "}
            Está na loja? Inclua a localização para ser liberado.
          </span>
        ) : barrado ? (
          <span>
            <strong>Seu check-in em {filial} não valeu: a localização não confirmou a loja.</strong>{" "}
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
      {semLocalizacao ? (
        // O diálogo atende o pedido: abre no barrado, lê o GPS e refaz. O
        // link continua para quem prefere escolher outra filial em /presenca.
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            onClick={() => pedirCheckinNoToque("incluir-localizacao", "faixa", location.pathname)}
          >
            Incluir localização
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/presenca">Refazer check-in</Link>
          </Button>
        </div>
      ) : (
        <Button asChild size="sm" className="shrink-0">
          <Link to="/presenca">{barrado ? "Refazer check-in" : "Fazer check-in"}</Link>
        </Button>
      )}
    </div>
  );
}

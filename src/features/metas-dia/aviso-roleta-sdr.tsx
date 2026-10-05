// Aviso de quarta da roleta do SDR DENTRO do CRM (migration 20261011120400):
// pop-up com o card do placar da semana do próprio corretor. Decisão de
// 05/10/2026 — só no CRM, sem WhatsApp (docs/politica-roleta-sdr-semanal.md).
//
// O aviso é o MESMO alerta que o cron grava no sino às 18h de quarta para quem
// ainda não bateu a meta (roleta_sdr_meu_aviso o encontra pelo ref_id):
//   * alerta não lido já na primeira leitura (abriu o CRM depois das 18h) →
//     o pop-up abre sozinho, assim que nenhum outro pop-up estiver na frente;
//   * alerta que chega com o CRM aberto → toast "Ver placar", sem tomar a
//     tela de quem está no meio de um atendimento;
//   * "Entendi" (ou fechar) marca o alerta como lido — some do sino também;
//   * o link do sino (/fila#aviso-roleta-sdr) reabre o pop-up a qualquer hora.
// O card lê o placar AO VIVO: quem fez visita na quinta já vê o número novo.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle, Fire, Target } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  cardAvisoRoletaSdr,
  HASH_AVISO_ROLETA_SDR,
  semanaEmCurso,
  situacaoNaRoleta,
  textoAviso,
  type CardAvisoRoletaSdr,
} from "@/lib/roleta-sdr-semanal";
import {
  useMarcarAvisoRoletaSdrLido,
  useMeuAvisoRoletaSdr,
  usePlacarRoletaSdr,
  useRoletaSdrConfig,
} from "@/features/distribuicao/roleta-sdr-semanal-queries";

const COR_SITUACAO: Record<CardAvisoRoletaSdr["situacao"], string> = {
  recebendo: "bg-success",
  pausado: "bg-warning",
  fora: "bg-muted-foreground",
};

/** O pop-up em si: só desenha o card que a regra pura montou. */
export function AvisoRoletaSdrDialog({
  open,
  card,
  descricao,
  sombra,
  onClose,
}: {
  open: boolean;
  card: CardAvisoRoletaSdr;
  /** Texto corrido do aviso (o mesmo do sino), para leitores de tela. */
  descricao: string;
  sombra: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-sm gap-0 overflow-hidden p-0 [&>button.absolute]:text-white/80 [&>button.absolute]:hover:text-white"
        data-testid="aviso-roleta-sdr"
      >
        {/* Faixa navy da marca: é a "imagem" do placar. */}
        <div className="relative overflow-hidden bg-gradient-command px-5 pb-5 pt-5 text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-gold-400/20 blur-3xl"
          />
          <div className="relative">
            <div className="flex items-center gap-2 pr-6">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-300">
                <Fire className="h-3.5 w-3.5" weight="fill" /> Roleta do SDR
              </span>
              {sombra && (
                <span className="rounded-full border border-white/30 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-white/80">
                  Teste
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-white/60">Semana {card.semana}</p>

            <DialogTitle className="mt-4 font-display text-xl font-semibold leading-tight text-white">
              {card.primeiroNome ? `Olá, ${card.primeiroNome}!` : "Olá!"}
            </DialogTitle>

            <div className="mt-3 flex items-baseline gap-2">
              <span
                className="font-display text-5xl font-bold leading-none tabular-nums"
                data-testid="aviso-roleta-sdr-pontos"
              >
                {card.pontos}
              </span>
              <span className="text-sm text-white/70">de {card.meta}</span>
              <span className="ml-auto text-sm font-semibold tabular-nums text-gold-300">
                {card.pct}%
              </span>
            </div>
            <div
              className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/15"
              role="progressbar"
              aria-label={`${card.pct}% da meta da semana`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={card.pct}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  card.batida ? "bg-success" : "bg-gradient-gold",
                )}
                style={{ width: `${card.pct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            {[card.visitas, card.pastas].map((t) => (
              <div key={t.rotulo} className="rounded-xl border bg-muted/40 p-3">
                <div className="font-display text-2xl font-semibold tabular-nums">{t.qtd}</div>
                <div className="text-xs text-muted-foreground">{t.rotulo}</div>
                <div className="mt-1 text-xs font-medium">= {t.vale}</div>
              </div>
            ))}
          </div>

          {(card.falta || card.objetivo) && (
            <div
              className={cn(
                "flex gap-3 rounded-xl p-3",
                card.batida ? "bg-success/10 text-success" : "bg-gold-400/10",
              )}
            >
              {card.batida ? (
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" weight="fill" />
              ) : (
                <Target className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" weight="duotone" />
              )}
              <div className="min-w-0">
                {card.falta && (
                  <p className="font-display font-semibold leading-snug">{card.falta}</p>
                )}
                {card.objetivo && (
                  <p
                    className={cn("text-sm", card.batida ? "font-medium" : "text-muted-foreground")}
                  >
                    {card.objetivo}
                  </p>
                )}
              </div>
            </div>
          )}

          <p className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={cn("h-2 w-2 shrink-0 rounded-full", COR_SITUACAO[card.situacao])}
            />
            {card.situacaoTexto}
          </p>

          {sombra && (
            <p className="text-xs text-muted-foreground">
              Fase de teste: por enquanto a roleta não muda por esta regra.
            </p>
          )}

          <DialogDescription className="sr-only">{descricao}</DialogDescription>

          <Button className="w-full" onClick={onClose} data-testid="aviso-roleta-sdr-entendi">
            Entendi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Decide quando o pop-up abre. `bloqueado` = outro pop-up na frente (metas do
 * dia, onboarding, estudo do funil) ou tela em que o card atrapalha.
 */
export function AvisoRoletaSdrHost({ uid, bloqueado }: { uid: string; bloqueado: boolean }) {
  const semana = useMemo(() => semanaEmCurso(new Date()), []);
  const cfgQ = useRoletaSdrConfig(!!uid);
  const cfg = cfgQ.data;
  const ligada = !!cfg?.regra_ativa;
  const avisoQ = useMeuAvisoRoletaSdr(semana, !!uid && ligada);
  const aviso = avisoQ.data ?? null;

  const [aberto, setAberto] = useState(false);
  // Pedido explícito (link do sino): abre mesmo com o alerta já lido.
  const [pedido, setPedido] = useState(false);

  const placarQ = usePlacarRoletaSdr(semana, ligada && (!!aviso || pedido));
  const minha = placarQ.data?.find((l) => l.corretor_id === uid);
  const marcarLido = useMarcarAvisoRoletaSdrLido();

  // O alerta visto na PRIMEIRA leitura abre sozinho; um alerta novo depois
  // disso chegou com o CRM aberto e vira toast. undefined = ainda não leu.
  const primeiraLeitura = useRef<string | null | undefined>(undefined);
  const toastDe = useRef<string | null>(null);
  const dispensados = useRef(new Set<string>());

  useEffect(() => {
    if (avisoQ.isSuccess && primeiraLeitura.current === undefined) {
      primeiraLeitura.current = avisoQ.data?.alerta_id ?? null;
    }
  }, [avisoQ.isSuccess, avisoQ.data]);

  // Link do sino: /fila#aviso-roleta-sdr (carga nova ou só troca de hash).
  useEffect(() => {
    const ver = () => {
      if (window.location.hash !== HASH_AVISO_ROLETA_SDR) return;
      setPedido(true);
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    };
    ver();
    window.addEventListener("hashchange", ver);
    return () => window.removeEventListener("hashchange", ver);
  }, []);

  const podeMostrar = !!cfg && ligada && !!minha && !minha.bloqueado_admin;

  useEffect(() => {
    if (!podeMostrar || bloqueado || aberto) return;
    if (pedido) {
      setPedido(false);
      setAberto(true);
      return;
    }
    if (!aviso || aviso.lida || dispensados.current.has(aviso.alerta_id)) return;
    if (aviso.alerta_id === primeiraLeitura.current) {
      setAberto(true);
      return;
    }
    if (primeiraLeitura.current !== undefined && toastDe.current !== aviso.alerta_id) {
      toastDe.current = aviso.alerta_id;
      toast("Roleta do SDR: seu placar da semana chegou", {
        description: "Veja o que falta até sexta para receber agendados a partir de sábado.",
        action: { label: "Ver placar", onClick: () => setPedido(true) },
        duration: 20_000,
      });
    }
  }, [podeMostrar, bloqueado, aberto, pedido, aviso]);

  if (!podeMostrar || !cfg || !minha) return null;

  const agora = new Date();
  const fechar = () => {
    setAberto(false);
    if (aviso && !aviso.lida && !dispensados.current.has(aviso.alerta_id)) {
      dispensados.current.add(aviso.alerta_id);
      marcarLido.mutate(aviso.alerta_id);
    }
  };

  return (
    <AvisoRoletaSdrDialog
      open={aberto}
      card={cardAvisoRoletaSdr(minha, semana, cfg, agora)}
      descricao={textoAviso(minha, situacaoNaRoleta(minha, agora), cfg)}
      sombra={cfg.modo_sombra}
      onClose={fechar}
    />
  );
}

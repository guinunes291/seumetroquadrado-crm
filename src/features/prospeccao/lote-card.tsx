// Cartão do lote de prospecção, no topo do Modo Foco.
//
// É a porta de base nova do corretor (além da roleta e da redistribuição):
// pede até 30 clientes do Bolsão numa zona. Os clientes entram direto na
// cadência e ficam FORA da carteira ativa enquanto estão nela — por isso não
// aparecem nas três bases do Modo Foco; o trabalho deles é na Fila do Dia da
// cadência, onde as ligações e o WhatsApp contam para a etapa andar.
//
// Travas e regras no banco (prospeccao_pedir_lote / prospeccao_lote_status_v1,
// migration 20261005120000); textos e validação em lote-client.ts.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Package } from "@phosphor-icons/react";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import type { ZonaProjeto } from "@/lib/zonas";
import {
  TAMANHO_LOTE,
  zonasDoLote,
  bancoDoLoteAtualizado,
  fetchStatusLote,
  rotuloDaZona,
  mensagemDoPedido,
  motivoBloqueio,
  pedirLote,
  resumoDoLote,
} from "@/features/prospeccao/lote-client";

export const LOTE_STATUS_KEY = "prospeccao:lote-status";

export function LoteProspeccaoCard() {
  const { user } = useAuth();
  const { isCorretor } = useUserRoles();
  const qc = useQueryClient();
  const [zona, setZona] = useState<ZonaProjeto | "">("");

  const statusQ = useQuery({
    queryKey: [LOTE_STATUS_KEY, user?.id],
    enabled: !!user && isCorretor,
    queryFn: fetchStatusLote,
  });

  // O placar anda com a cadência (resposta, vencimento, avanço de fase).
  useRealtimeInvalidate("leads", [[LOTE_STATUS_KEY]], { enabled: !!user && isCorretor });

  const pedir = useMutation({
    mutationFn: (z: ZonaProjeto) => pedirLote(z),
    onSuccess: (r) => {
      const m = mensagemDoPedido(r, statusQ.data);
      if (m.tipo === "sucesso") toast.success(m.titulo, { description: m.descricao });
      else if (m.tipo === "info") toast.info(m.titulo, { description: m.descricao });
      else toast.error(m.titulo);
      if (r.ok) setZona("");
      for (const k of [LOTE_STATUS_KEY, "prospeccao:contagens", "leads", "cadencia", "nav-badges"])
        void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: () => toast.error("Não foi possível pedir o lote. Tente de novo."),
  });

  if (!isCorretor) return null;

  const s = statusQ.data;
  const bloqueio = s ? motivoBloqueio(s) : null;
  const resumo = s ? resumoDoLote(s) : null;
  const naCadencia = s ? (s.em_cadencia_total ?? s.em_cadencia) : 0;
  const atualizado = s ? bancoDoLoteAtualizado(s) : false;
  const podePedir = !!s?.pode_pedir && atualizado && !pedir.isPending;

  return (
    <section
      aria-labelledby="lote-prospeccao-titulo"
      className="rounded-xl border border-border-subtle bg-card p-5 shadow-elev-1"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Package className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 id="lote-prospeccao-titulo" className="font-display font-semibold leading-snug">
              Pedir lote de {s?.tamanho ?? TAMANHO_LOTE} do Bolsão
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Clientes sem dono de uma zona da sua região de atuação. Entram direto na sua cadência
              e não ocupam vaga da sua carteira ativa — quem responder fica com você.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={zona}
            onValueChange={(v) => setZona(v as ZonaProjeto)}
            disabled={!podePedir}
          >
            <SelectTrigger className="w-40" aria-label="Zona do lote">
              <SelectValue placeholder="Escolha a zona" />
            </SelectTrigger>
            <SelectContent>
              {zonasDoLote(s).map((z) => (
                <SelectItem key={z} value={z}>
                  {rotuloDaZona(z)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!podePedir || !zona} onClick={() => zona && pedir.mutate(zona)}>
            {pedir.isPending ? "Separando o lote…" : "Pedir lote"}
          </Button>
        </div>
      </div>

      {statusQ.isLoading ? (
        <Skeleton className="mt-4 h-5 w-72" />
      ) : statusQ.isError ? (
        <p className="mt-4 text-sm text-destructive">
          Não foi possível carregar o seu lote.{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => void statusQ.refetch()}
          >
            Tentar de novo
          </button>
        </p>
      ) : (
        (resumo || bloqueio || naCadencia > 0 || (s && !atualizado)) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="space-y-0.5">
              {resumo && <p>{resumo}</p>}
              {bloqueio && <p className="text-muted-foreground">{bloqueio}</p>}
              {s && !atualizado && (
                <p className="text-muted-foreground">
                  O lote está sendo atualizado no banco. O botão libera assim que a atualização for
                  aplicada.
                </p>
              )}
            </div>
            {naCadencia > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/cadencia">
                  Trabalhar na Fila do Dia
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        )
      )}
    </section>
  );
}

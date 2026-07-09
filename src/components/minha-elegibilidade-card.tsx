// Card "Minhas roletas" — o corretor vê se está APTO ou INAPTO em cada
// roleta e o MOTIVO exato (transparência da distribuição v3), sem enxergar
// dados dos colegas.

import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { motivoInaptidaoLabel } from "@/lib/distribuicao";
import { useMinhaElegibilidade } from "@/features/distribuicao/queries";

export function MinhaElegibilidadeCard() {
  const q = useMinhaElegibilidade();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <ShieldCheck className="h-4 w-4 text-primary" /> Minhas roletas de leads
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          (q.data ?? []).map((r) => (
            <div key={r.roleta_slug} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{r.roleta_nome}</span>
                {!r.participante ? (
                  <StatusBadge intent="neutral">Não participo</StatusBadge>
                ) : r.apto ? (
                  <StatusBadge intent="success">Apto — recebendo leads</StatusBadge>
                ) : (
                  <StatusBadge intent="warning">Inapto no momento</StatusBadge>
                )}
              </div>
              {r.participante && (
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  {typeof r.pct_trabalhado === "number" && (
                    <span>
                      % trabalhado:{" "}
                      <span
                        className={
                          r.pct_trabalhado < 90 ? "font-semibold text-warning" : "text-success"
                        }
                      >
                        {r.pct_trabalhado}%
                      </span>
                    </span>
                  )}
                  {typeof r.carteira_total === "number" && (
                    <span>
                      carteira: {r.carteira_total} ({r.aguardando ?? 0} aguardando)
                    </span>
                  )}
                  {typeof r.recebidos_hoje === "number" && (
                    <span>
                      hoje: {r.recebidos_hoje}/{r.limite_diario ?? "—"}
                    </span>
                  )}
                  {typeof r.recebidos_mes === "number" && <span>mês: {r.recebidos_mes}</span>}
                </div>
              )}
              {r.participante && !r.apto && r.motivos.length > 0 && (
                <p className="mt-1.5 text-xs text-warning">
                  Motivo: {r.motivos.map(motivoInaptidaoLabel).join(" · ")}
                  {r.motivos.includes("pct_trabalhado_abaixo_minimo") &&
                    " — atenda os leads em “Aguardando atendimento” para voltar à roleta."}
                  {r.motivos.includes("ausente_hoje") &&
                    " — marque presença (“Cheguei”) para receber leads."}
                </p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

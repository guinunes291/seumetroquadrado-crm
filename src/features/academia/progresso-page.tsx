import { Link } from "@tanstack/react-router";
import { ArrowLeft, Certificate, ClockCounterClockwise } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { useProgresso } from "./academia-client";
import { EsqueletoAcademia } from "./guard";
import { ROTULO_NIVEL } from "./niveis";

const QUANDO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function ProgressoPage() {
  const q = useProgresso();

  if (q.isPending) return <EsqueletoAcademia />;
  if (q.isError) {
    return (
      <div className="p-4 md:p-6">
        <QueryErrorState
          title="Não foi possível carregar seu progresso."
          error={q.error}
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }

  const { certificados, historico } = q.data;

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Meu progresso"
        description="Seus certificados e a linha do tempo dos níveis."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/academia">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Trilha
            </Link>
          </Button>
        }
      />

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Certificados</h2>
        {certificados.length === 0 ? (
          <EmptyState
            icon={Certificate}
            title="Nenhum certificado ainda."
            description="O primeiro sai quando você concluir a fase de Integração."
          />
        ) : (
          <div className="space-y-2">
            {certificados.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-center gap-3 py-4">
                  <Certificate className="h-7 w-7 shrink-0 text-primary" weight="duotone" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{ROTULO_NIVEL[c.nivel]}</p>
                    <p className="text-xs text-muted-foreground">
                      Emitido em {QUANDO.format(new Date(c.emitido_em))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Verificação
                    </p>
                    <p className="font-mono text-sm">{c.codigo}</p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/academia/certificado/$codigo" params={{ codigo: c.codigo }}>
                      Abrir
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Histórico</h2>
        {historico.length === 0 ? (
          <EmptyState
            icon={ClockCounterClockwise}
            title="Sem mudanças de nível até agora."
            description="Cada subida de nível fica registrada aqui, com o motivo."
          />
        ) : (
          <ol className="space-y-2">
            {historico.map((h) => (
              <li key={h.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {h.de
                    ? `${ROTULO_NIVEL[h.de]} para ${ROTULO_NIVEL[h.para]}`
                    : ROTULO_NIVEL[h.para]}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {QUANDO.format(new Date(h.em))}. {h.motivo}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

// Sub-aba CORRETORES dos Relatórios: um card por corretor; clicar abre o
// Raio-X do Corretor — o relatório individual completo (resultado vs. time,
// funil dele, evolução, perdas, comissões, com export) já usado na aba Time
// do hub — sem sair da página de relatórios.

import { lazy, Suspense, useState } from "react";
import { User } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { useCorretoresAtivos } from "@/features/dashboard/relatorios-nominais";

const RaioXCorretor = lazy(() =>
  import("@/features/inteligencia/raio-x-corretor").then(({ RaioXCorretor }) => ({
    default: RaioXCorretor,
  })),
);

export function RelatoriosCorretoresTab() {
  const corretoresQ = useCorretoresAtivos();
  const [selecionado, setSelecionado] = useState<string | null>(null);

  if (selecionado) {
    return (
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <RaioXCorretor corretorId={selecionado} onVoltar={() => setSelecionado(null)} />
      </Suspense>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Clique num corretor para abrir o relatório individual completo (Raio-X).
      </p>
      <AsyncBoundary
        isLoading={corretoresQ.isLoading}
        isError={corretoresQ.isError}
        error={corretoresQ.error}
        errorTitle="Não foi possível carregar os corretores."
        onRetry={() => corretoresQ.refetch()}
        loadingFallback={<Skeleton className="h-40 w-full" />}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(corretoresQ.data ?? []).map((c) => {
            const foto = c.foto_url || c.avatar_url;
            return (
              <button
                key={c.id}
                type="button"
                className="text-left"
                onClick={() => setSelecionado(c.id)}
              >
                <Card className="transition-all hover:border-primary/40 hover:shadow-sm">
                  <CardContent className="flex items-center gap-3 p-4">
                    {foto ? (
                      <img
                        src={foto}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.nome}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.cargo || "Corretor"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </AsyncBoundary>
    </div>
  );
}

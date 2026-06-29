import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type QueryLike<T> = {
  isLoading: boolean;
  isError: boolean;
  data: T | undefined;
  refetch?: () => unknown;
};

/**
 * Padroniza os estados de um card que depende de uma query:
 * - carregando  → esqueleto (nunca pisca 0/"vazio")
 * - erro        → mensagem amigável + "Tentar novamente" (refetch); NUNCA mostra
 *                 0/vazio (evita "zero falso" quando a query falhou)
 * - vazio       → mensagem informada
 * - com dados   → children(data)
 */
export function CardAsync<T>({
  query,
  isEmpty,
  empty,
  skeleton,
  skeletonRows = 3,
  errorLabel = "Não foi possível carregar agora.",
  children,
}: {
  query: QueryLike<T>;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  skeleton?: ReactNode;
  skeletonRows?: number;
  errorLabel?: string;
  children: (data: T) => ReactNode;
}) {
  // Erro real → nunca renderiza 0/vazio (evita "zero falso").
  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-sm text-muted-foreground">{errorLabel}</p>
        {query.refetch && (
          <Button variant="outline" size="sm" onClick={() => query.refetch?.()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Tentar novamente
          </Button>
        )}
      </div>
    );
  }

  // Carregando OU ainda não rodou (query desabilitada / pendente) → esqueleto.
  if (query.isLoading || query.data === undefined) {
    return (
      <>
        {skeleton ?? (
          <div className="space-y-2" aria-busy="true" aria-live="polite">
            {Array.from({ length: skeletonRows }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
      </>
    );
  }

  const data = query.data;
  if (isEmpty?.(data)) {
    return <>{empty ?? <p className="text-sm text-muted-foreground">Nada por aqui.</p>}</>;
  }

  return <>{children(data)}</>;
}

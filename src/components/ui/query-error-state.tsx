import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type QueryErrorStateProps = {
  /** Mensagem curta do que falhou (ex.: "Não foi possível carregar as tarefas."). */
  title?: string;
  error?: unknown;
  /** Handler de "Tentar novamente" — normalmente o `refetch` da query. */
  onRetry?: () => void;
  className?: string;
};

/**
 * Estado de ERRO padronizado para listas/painéis. Existe para que uma falha de
 * rede não se disfarce de "lista vazia": mostra que algo deu errado, o detalhe
 * técnico e um botão de tentar de novo.
 */
export function QueryErrorState({
  title = "Não foi possível carregar os dados.",
  error,
  onRetry,
  className,
}: QueryErrorStateProps) {
  const detalhe = error instanceof Error ? error.message : error ? String(error) : null;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/40 px-6 py-10 text-center",
        className,
      )}
    >
      <AlertTriangle className="h-8 w-8 text-destructive/70" />
      <p className="text-sm font-medium">{title}</p>
      {detalhe && <p className="max-w-sm text-xs text-muted-foreground">{detalhe}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

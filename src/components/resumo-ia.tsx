import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { gerarResumoLeadIA } from "@/lib/lead-resumo-ia.functions";

/**
 * Briefing rápido das interações do lead, gerado por IA sob demanda.
 * Componente compartilhado entre o Modo Blitz e a página do lead, para que o
 * corretor tenha o mesmo resumo onde quer que decida o próximo passo.
 *
 * O resultado é cacheado por lead (`["resumo-ia", leadId]`), então ao voltar
 * para o mesmo lead o briefing já aparece sem gerar de novo. A geração continua
 * sob demanda (não dispara sozinha ao abrir o lead) para não custar IA à toa.
 */
export function ResumoIA({ leadId }: { leadId: string }) {
  const gerar = useServerFn(gerarResumoLeadIA);
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["resumo-ia", leadId],
    queryFn: () => gerar({ data: { leadId } }),
    enabled: false, // só gera quando o corretor clica
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  });

  return (
    <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-accent/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Histórico do lead (IA)
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Gerando…
            </>
          ) : data ? (
            "Regenerar"
          ) : (
            "Gerar resumo"
          )}
        </Button>
      </div>
      {data && (
        <div className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">
          {data.resumo}
          <div className="mt-2 text-xs text-muted-foreground">
            Baseado em {data.totalInteracoes} interação(ões).
          </div>
        </div>
      )}
      {error && (
        <div className="mt-3 text-sm text-destructive">
          {(error as Error).message ?? "Falha ao gerar resumo."}
        </div>
      )}
      {!data && !error && !isFetching && (
        <p className="mt-2 text-xs text-muted-foreground">
          Clique em "Gerar resumo" para um briefing rápido das interações deste lead.
        </p>
      )}
    </div>
  );
}

import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { gerarResumoLeadIA } from "@/lib/lead-resumo-ia.functions";

/**
 * Briefing rápido das interações do lead, gerado por IA sob demanda.
 * Componente compartilhado entre o Modo Blitz e a página do lead, para que o
 * corretor tenha o mesmo resumo onde quer que decida o próximo passo.
 */
export function ResumoIA({ leadId }: { leadId: string }) {
  const gerar = useServerFn(gerarResumoLeadIA);
  const mutation = useMutation({
    mutationFn: () => gerar({ data: { leadId } }),
  });

  // Reset ao trocar de lead.
  useEffect(() => {
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  return (
    <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-accent/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Histórico do lead (IA)
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Gerando…
            </>
          ) : mutation.data ? (
            "Regenerar"
          ) : (
            "Gerar resumo"
          )}
        </Button>
      </div>
      {mutation.data && (
        <div className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">
          {mutation.data.resumo}
          <div className="mt-2 text-xs text-muted-foreground">
            Baseado em {mutation.data.totalInteracoes} interação(ões).
          </div>
        </div>
      )}
      {mutation.error && (
        <div className="mt-3 text-sm text-destructive">
          {(mutation.error as Error).message ?? "Falha ao gerar resumo."}
        </div>
      )}
      {!mutation.data && !mutation.error && !mutation.isPending && (
        <p className="mt-2 text-xs text-muted-foreground">
          Clique em "Gerar resumo" para um briefing rápido das interações deste lead.
        </p>
      )}
    </div>
  );
}

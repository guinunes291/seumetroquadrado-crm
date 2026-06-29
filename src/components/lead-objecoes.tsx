import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageCircleWarning, X, Plus } from "lucide-react";

type Props = {
  leadId: string;
  objecoes: string[] | null;
};

/**
 * Objeções do cliente como chips estruturados (substitui o "texto solto na nota").
 * As sugestões vêm da biblioteca de objeções (tabela `objecoes`); o corretor
 * também pode digitar uma objeção livre. O conjunto fica salvo em `leads.objecoes`
 * e alimenta a sugestão de mensagem por IA no WhatsApp.
 */
export function LeadObjecoes({ leadId, objecoes }: Props) {
  const qc = useQueryClient();
  const atuais = objecoes ?? [];
  const [novo, setNovo] = useState("");

  const { data: biblioteca = [] } = useQuery({
    queryKey: ["objecoes-lib"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("objecoes")
        .select("objecao")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []).map((o) => o.objecao as string);
    },
    staleTime: 5 * 60_000,
  });

  const salvar = useMutation({
    mutationFn: async (lista: string[]) => {
      const { error } = await supabase
        .from("leads")
        .update({ objecoes: lista } as never)
        .eq("id", leadId);
      if (error) throw error;
      return lista;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const adicionar = (o: string) => {
    const v = o.trim();
    if (!v || atuais.includes(v)) return;
    salvar.mutate([...atuais, v]);
    setNovo("");
  };
  const remover = (o: string) => salvar.mutate(atuais.filter((x) => x !== o));

  // Sugestões da biblioteca ainda não marcadas neste lead.
  const sugestoes = biblioteca.filter((o) => !atuais.includes(o)).slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <MessageCircleWarning className="h-4 w-4 text-primary" /> Objeções do cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {atuais.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {atuais.map((o) => (
              <span
                key={o}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary"
              >
                {o}
                <button
                  type="button"
                  onClick={() => remover(o)}
                  className="hover:text-destructive"
                  aria-label={`Remover ${o}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nenhuma objeção registrada. Marque o que trava a decisão do cliente.
          </p>
        )}

        {sugestoes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sugestoes.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => adicionar(o)}
                disabled={salvar.isPending}
                className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
              >
                + {o}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1.5">
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                adicionar(novo);
              }
            }}
            placeholder="Outra objeção…"
            className="h-8"
            maxLength={120}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            onClick={() => adicionar(novo)}
            disabled={salvar.isPending || !novo.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

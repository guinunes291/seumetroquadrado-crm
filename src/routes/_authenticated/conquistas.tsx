import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/conquistas")({
  head: () => ({ meta: [{ title: "Conquistas — Seu Metro Quadrado" }] }),
  component: ConquistasPage,
});

type Tipo = {
  id: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  pontos_bonus: number;
  ordem: number;
};
type Minha = { tipo_conquista_id: string; conquistado_em: string };

function ConquistasPage() {
  const { user } = useAuth();

  const tiposQ = useQuery({
    queryKey: ["conquistas:tipos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_conquista" as never)
        .select("id, nome, descricao, icone, pontos_bonus, ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as Tipo[];
    },
  });

  const minhasQ = useQuery({
    queryKey: ["conquistas:minhas", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("conquistas" as never)
        .select("tipo_conquista_id, conquistado_em")
        .eq("corretor_id", user!.id);
      return (data ?? []) as unknown as Minha[];
    },
  });

  const ganhasMap = useMemo(() => {
    const m = new Map<string, string>();
    (minhasQ.data ?? []).forEach((c) => m.set(c.tipo_conquista_id, c.conquistado_em));
    return m;
  }, [minhasQ.data]);

  const tipos = tiposQ.data ?? [];
  const ganhas = tipos.filter((t) => ganhasMap.has(t.id)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conquistas"
        description={`Você desbloqueou ${ganhas} de ${tipos.length} medalhas.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tipos.map((t) => {
          const em = ganhasMap.get(t.id);
          const unlocked = !!em;
          return (
            <Card
              key={t.id}
              className={cn(
                "relative overflow-hidden transition-all",
                unlocked
                  ? "border-amber-400/50 bg-gradient-to-br from-amber-400/10 to-transparent"
                  : "opacity-70",
              )}
            >
              <CardContent className="pt-6 text-center">
                <div className={cn("mx-auto text-4xl", !unlocked && "grayscale")}>
                  {t.icone ?? "🏅"}
                </div>
                <div className="mt-2 font-semibold">{t.nome}</div>
                {t.descricao && (
                  <div className="mt-1 text-xs text-muted-foreground">{t.descricao}</div>
                )}
                <div className="mt-3 flex items-center justify-center gap-2">
                  {unlocked ? (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      Conquistada {new Date(em!).toLocaleDateString("pt-BR")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Lock className="h-3 w-3" /> Bloqueada
                    </Badge>
                  )}
                </div>
                {t.pontos_bonus > 0 && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    +{t.pontos_bonus} pts bônus
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {tipos.length === 0 && !tiposQ.isLoading && (
          <p className="text-sm text-muted-foreground">Nenhuma conquista configurada.</p>
        )}
      </div>
    </div>
  );
}

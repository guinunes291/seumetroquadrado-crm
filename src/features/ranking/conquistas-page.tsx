import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreRing } from "@/components/ui/score-ring";
import { celebrate } from "@/components/ui/celebration";
import { Medal, type MedalTier } from "@/features/ranking/medal";
import { cn } from "@/lib/utils";
import { Award, Lock } from "lucide-react";

type Tipo = {
  id: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  pontos_bonus: number;
  ordem: number;
};
type Minha = { tipo_conquista_id: string; conquistado_em: string };

/** Raridade = intensidade da medalha: bônus alto → ouro; médio → prata. */
function tierDoBonus(pontosBonus: number): MedalTier {
  if (pontosBonus >= 50) return "ouro";
  if (pontosBonus >= 20) return "prata";
  return "bronze";
}

export function ConquistasPage() {
  const { user } = useAuth();

  const tiposQ = useQuery({
    queryKey: ["conquistas:tipos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_conquista")
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
        .from("conquistas")
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

  // Só a conquista MAIS RECENTE ganha a varredura de brilho (animate-shine).
  const maisRecenteId = useMemo(() => {
    let id: string | null = null;
    let ts = -Infinity;
    for (const [tipoId, em] of ganhasMap) {
      const t = new Date(em).getTime();
      if (Number.isFinite(t) && t > ts) {
        ts = t;
        id = tipoId;
      }
    }
    return id;
  }, [ganhasMap]);

  // Celebração global apenas quando uma conquista NOVA chega em runtime
  // (refetch com id inédito) — nunca no primeiro carregamento nem em render.
  const vistasRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!minhasQ.data) return;
    const atuais = new Set(minhasQ.data.map((c) => c.tipo_conquista_id));
    const vistas = vistasRef.current;
    vistasRef.current = atuais;
    if (vistas && [...atuais].some((id) => !vistas.has(id))) celebrate("conquista");
  }, [minhasQ.data]);

  const tipos = tiposQ.data ?? [];
  const ganhas = tipos.filter((t) => ganhasMap.has(t.id)).length;
  const pctGanhas = tipos.length > 0 ? Math.round((ganhas / tipos.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conquistas"
        description={`Você desbloqueou ${ganhas} de ${tipos.length} medalhas.`}
        actions={
          tipos.length > 0 ? (
            <ScoreRing
              value={pctGanhas}
              size={48}
              strokeWidth={5}
              intent={pctGanhas >= 100 ? "success" : "info"}
              title={`${pctGanhas}% das medalhas desbloqueadas`}
            />
          ) : undefined
        }
      />

      {tiposQ.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : tipos.length === 0 ? (
        <EmptyState
          icon={Award}
          title="Nenhuma conquista configurada."
          description="Os tipos de conquista são cadastrados pela gestão — assim que existirem, suas medalhas aparecem aqui."
        />
      ) : (
        <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tipos.map((t) => {
            const em = ganhasMap.get(t.id);
            const unlocked = !!em;
            const tier = tierDoBonus(t.pontos_bonus);
            return (
              <Card
                key={t.id}
                className={cn(
                  "relative overflow-hidden transition-all",
                  unlocked
                    ? "border-amber-400/50 bg-gradient-to-br from-amber-400/10 to-transparent shadow-elev-1"
                    : "opacity-70",
                )}
              >
                <CardContent className="pt-6 text-center">
                  <Medal
                    tier={tier}
                    size="xl"
                    locked={!unlocked}
                    shine={unlocked && t.id === maisRecenteId}
                    title={
                      unlocked ? `Medalha de ${tier} — ${t.nome}` : `Medalha bloqueada — ${t.nome}`
                    }
                    className="mx-auto"
                  >
                    {t.icone ?? "🏅"}
                  </Medal>
                  <div className="mt-3 font-semibold">{t.nome}</div>
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
                    <div className="mt-2 text-[11px] text-muted-foreground tabular-nums">
                      +{t.pontos_bonus} pts bônus
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

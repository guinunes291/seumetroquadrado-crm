import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TIER_LABEL } from "@/lib/comissao-tier";

type Regra = {
  tier: string;
  ordem: number;
  min_vendas: number;
  pct_lead_empresa: number;
  pct_lead_proprio: number;
  pct_marquinhos: number;
  pct_sdr: number;
};
type Linha = {
  corretor_id: string;
  nome: string;
  vendas_trimestre_anterior: number;
  vendas_trimestre_atual: number;
  tier_atual: string;
  tier_proximo: string;
};

const CAMPOS: Array<{ k: keyof Regra; label: string }> = [
  { k: "min_vendas", label: "Vendas mín." },
  { k: "pct_lead_empresa", label: "Lead empresa %" },
  { k: "pct_lead_proprio", label: "Lead próprio %" },
  { k: "pct_marquinhos", label: "Marquinhos %" },
  { k: "pct_sdr", label: "SDR %" },
];

/** Ranking por tier trimestral + parâmetros de comissão por esteira. */
export function TiersPage() {
  const { isAdmin } = useUserRoles();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Record<string, Partial<Regra>>>({});

  const regras = useQuery({
    queryKey: ["comissao-tier-regras"],
    queryFn: async () => {
      const { data, error } = await supabase.from("comissao_tier_regras").select("*").order("ordem");
      if (error) throw error;
      return data as unknown as Regra[];
    },
  });
  const ranking = useQuery({
    queryKey: ["ranking-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ranking_tiers_corretores");
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      for (const [tier, patch] of Object.entries(edit)) {
        const { error } = await supabase
          .from("comissao_tier_regras")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("tier", tier);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Parâmetros de comissão salvos");
      setEdit({});
      qc.invalidateQueries({ queryKey: ["comissao-tier-regras"] });
      qc.invalidateQueries({ queryKey: ["ranking-tiers"] });
      qc.invalidateQueries({ queryKey: ["comissao-sugerida"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comissão por tier e esteira</CardTitle>
          <p className="text-sm text-muted-foreground">
            Percentual da comissão total da venda que vai para o corretor. O tier vem das vendas
            aprovadas do trimestre anterior (data de assinatura) e vale para o trimestre todo.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {regras.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-3">Tier</th>
                  {CAMPOS.map((c) => (
                    <th key={c.k} className="py-2 pr-3">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regras.data?.map((r) => (
                  <tr key={r.tier} className="border-t border-border">
                    <td className="py-2 pr-3 font-medium">{TIER_LABEL[r.tier] ?? r.tier}</td>
                    {CAMPOS.map((c) => (
                      <td key={c.k} className="py-2 pr-3">
                        {isAdmin ? (
                          <Input
                            className="h-9 w-24"
                            inputMode="decimal"
                            defaultValue={String(r[c.k])}
                            onChange={(e) => {
                              const n = Number(e.target.value.replace(",", "."));
                              if (!Number.isFinite(n)) return;
                              setEdit((p) => ({ ...p, [r.tier]: { ...p[r.tier], [c.k]: n } }));
                            }}
                          />
                        ) : (
                          String(r[c.k])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {isAdmin && (
            <div className="mt-3 flex justify-end">
              <Button
                onClick={() => salvar.mutate()}
                disabled={!Object.keys(edit).length || salvar.isPending}
              >
                {salvar.isPending ? "Salvando…" : "Salvar parâmetros"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking de tiers</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {ranking.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Corretor</th>
                  <th className="py-2 pr-3">Tier atual</th>
                  <th className="py-2 pr-3">Vendas trim. anterior</th>
                  <th className="py-2 pr-3">Vendas trim. atual</th>
                  <th className="py-2 pr-3">Tier do próximo trimestre</th>
                </tr>
              </thead>
              <tbody>
                {ranking.data?.map((l, i) => (
                  <tr key={l.corretor_id} className="border-t border-border">
                    <td className="py-2 pr-3 tabular-nums">{i + 1}</td>
                    <td className="py-2 pr-3">{l.nome}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="secondary">{TIER_LABEL[l.tier_atual] ?? l.tier_atual}</Badge>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{l.vendas_trimestre_anterior}</td>
                    <td className="py-2 pr-3 tabular-nums">{l.vendas_trimestre_atual}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline">{TIER_LABEL[l.tier_proximo] ?? l.tier_proximo}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

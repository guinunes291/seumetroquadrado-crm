import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trophy, Medal } from "lucide-react";
import { computeAgentMetrics, rankAgents, MESES_PT } from "@/lib/metas";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({ meta: [{ title: "Ranking — Seu Metro Quadrado" }] }),
  component: RankingPage,
});

function RankingPage() {
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);

  const leadsQ = useQuery({
    queryKey: ["ranking:leads"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("status, corretor_id, created_at");
      return data ?? [];
    },
  });
  const agendQ = useQuery({
    queryKey: ["ranking:agendamentos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("status, corretor_id, data_inicio");
      return data ?? [];
    },
  });
  const profQ = useQuery({
    queryKey: ["ranking:profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome");
      return data ?? [];
    },
  });
  const transicoesQ = useQuery({
    queryKey: ["ranking:transicoes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_status_transitions")
        .select("para_status, corretor_id, created_at")
        .eq("para_status", "contrato_fechado");
      return data ?? [];
    },
  });

  const ranking = useMemo(() => {
    const m = computeAgentMetrics(
      leadsQ.data ?? [],
      agendQ.data ?? [],
      ano,
      mes,
      transicoesQ.data ?? [],
    );
    const nomes = new Map<string, string>();
    (profQ.data ?? []).forEach((p: any) => nomes.set(p.id, p.nome));
    return rankAgents(m, nomes);
  }, [leadsQ.data, agendQ.data, profQ.data, transicoesQ.data, ano, mes]);

  const podio = ranking.slice(0, 3);
  const resto = ranking.slice(3);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Ranking"
        description={`Top corretores de ${MESES_PT[mes - 1]}/${ano}`}
        actions={
          <div className="flex gap-2">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES_PT.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {ranking.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Trophy className="h-10 w-10 mx-auto mb-2 opacity-40" />
            Ainda não há dados de performance neste período.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-3">
            {podio.map((r) => (
              <Card key={r.corretor_id} className={r.posicao === 1 ? "border-gold" : ""}>
                <CardContent className="p-5 text-center">
                  <Medal
                    className={`h-8 w-8 mx-auto mb-2 ${r.posicao === 1 ? "text-yellow-500" : r.posicao === 2 ? "text-gray-400" : "text-amber-700"}`}
                  />
                  <div className="text-3xl font-bold">{r.posicao}º</div>
                  <div className="font-medium mt-1 truncate">{r.nome ?? "—"}</div>
                  <div className="mt-3 flex justify-center gap-2 flex-wrap">
                    <Badge>{r.vendas} vendas</Badge>
                    <Badge variant="secondary">{r.visitas} visitas</Badge>
                    <Badge variant="outline">{r.taxa_conversao}%</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {resto.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <ul className="divide-y">
                  {resto.map((r) => (
                    <li key={r.corretor_id} className="flex items-center gap-3 py-2.5">
                      <span className="w-8 text-center font-semibold text-muted-foreground">
                        {r.posicao}º
                      </span>
                      <span className="flex-1 truncate">{r.nome ?? r.corretor_id.slice(0, 8)}</span>
                      <Badge>{r.vendas} vendas</Badge>
                      <Badge variant="secondary">{r.visitas} visitas</Badge>
                      <Badge variant="outline">{r.leads_atendidos} atend.</Badge>
                      <Badge variant="outline">{r.taxa_conversao}%</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

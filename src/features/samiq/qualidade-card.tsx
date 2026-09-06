// Painel de qualidade da Sami (decisão D17) — o que a Elô mede: uso, fallback,
// nota, latência e custo. Vive em Configurações › Qualidade; só gestão vê
// (a RPC também exige: admin/superintendente = operação, gestor = equipe).
// KPI row de StatTiles — números em tokens de texto, sem cor por série; a
// tendência entra pelo sparkline do próprio tile.

import { useQuery } from "@tanstack/react-query";
import {
  ChatsCircle,
  CurrencyCircleDollar,
  ThumbsUp,
  Timer,
  UsersThree,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { SamiMark } from "@/components/ui/sami-mark";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import {
  MetricasSamiQSchema,
  derivarIndicadoresSamiQ,
  formatarMs,
  formatarPct,
  periodoUltimosDias,
  type MetricasSamiQ,
} from "@/features/samiq/qualidade-derive";

const DIAS = 30;

async function carregarMetricas(): Promise<MetricasSamiQ | null> {
  const { data, error } = await supabase.rpc("samiq_metricas_periodo", periodoUltimosDias(DIAS));
  if (error) {
    // Migration S1 ainda não aplicada neste ambiente: o card some, nada quebra.
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  return MetricasSamiQSchema.parse(data);
}

export function SamiQQualidadeCard() {
  const { isAdmin, isGestor, isSuperintendente, loading: rolesLoading } = useUserRoles();
  const permitido = isAdmin || isGestor || isSuperintendente;
  const metricas = useQuery({
    queryKey: ["samiq:metricas", DIAS],
    enabled: !rolesLoading && permitido,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: carregarMetricas,
  });

  if (!permitido || metricas.data === null) return null;

  const m = metricas.data;
  const ind = m ? derivarIndicadoresSamiQ(m) : null;
  const loading = metricas.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SamiMark className="h-5 w-5" /> Sami — qualidade nos últimos {DIAS} dias
        </CardTitle>
        <CardDescription>
          {m?.escopo === "equipe" ? "Sua equipe" : "Operação inteira"}: uso, respostas sem dado
          (fallback), avaliação dos corretores, latência e custo. Sem conteúdo das conversas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {metricas.isError && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <WarningCircle className="h-4 w-4" /> Não foi possível carregar as métricas da Sami.
          </p>
        )}
        <StatGrid>
          <StatTile
            title="Conversas"
            icon={ChatsCircle}
            intent="info"
            loading={loading}
            value={m?.conversas ?? 0}
            hint={m ? `${m.execucoes} respostas geradas` : undefined}
            spark={ind?.sparkExecucoes}
          />
          <StatTile
            title="Corretores ativos"
            icon={UsersThree}
            intent="info"
            loading={loading}
            value={m?.usuarios_ativos ?? 0}
            hint={
              m && m.usuarios_ativos > 0
                ? `${(m.conversas / m.usuarios_ativos).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} conversas por corretor`
                : "ninguém usou no período"
            }
          />
          <StatTile
            title="Fallback"
            icon={Warning}
            intent={ind?.fallbackPct != null && ind.fallbackPct > 2 ? "warning" : "success"}
            loading={loading}
            value={formatarPct(ind?.fallbackPct ?? null)}
            hint={
              m
                ? `${m.fallbacks} de ${m.concluidas} respostas sem dado suficiente · meta < 1%`
                : undefined
            }
          />
          <StatTile
            title="Aprovação"
            icon={ThumbsUp}
            intent={ind?.aprovacaoPct != null && ind.aprovacaoPct < 70 ? "warning" : "success"}
            loading={loading}
            value={formatarPct(ind?.aprovacaoPct ?? null)}
            hint={
              ind
                ? ind.totalAvaliacoes > 0
                  ? `${m?.avaliacoes_positivas} 👍 · ${m?.avaliacoes_negativas} 👎`
                  : "nenhuma resposta avaliada ainda"
                : undefined
            }
          />
          <StatTile
            title="Latência p95"
            icon={Timer}
            intent="neutral"
            loading={loading}
            value={formatarMs(m?.latencia_p95_ms ?? null)}
            hint={m ? `mediana ${formatarMs(m.latencia_p50_ms)}` : undefined}
          />
          <StatTile
            title="Erros de ferramenta"
            icon={WarningCircle}
            intent={
              ind?.erroFerramentaPct != null && ind.erroFerramentaPct > 5 ? "warning" : "neutral"
            }
            loading={loading}
            value={formatarPct(ind?.erroFerramentaPct ?? null)}
            hint={m ? `${m.tool_errors} de ${m.tool_calls} consultas à carteira` : undefined}
          />
          <StatTile
            title={ind?.custoReais != null ? "Custo estimado" : "Tokens"}
            icon={CurrencyCircleDollar}
            intent="neutral"
            loading={loading}
            value={
              ind?.custoReais != null
                ? ind.custoReais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                : (m?.tokens ?? 0).toLocaleString("pt-BR")
            }
            hint={
              ind?.custoReais != null
                ? "pela tabela de preço da versão ativa"
                : "sem tabela de preço na versão ativa — custo em R$ aparece quando ela existir"
            }
          />
        </StatGrid>
        {m && m.por_acao.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Mais usadas:{" "}
            {m.por_acao
              .slice(0, 4)
              .map((a) => `${a.action} (${a.total})`)
              .join(" · ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

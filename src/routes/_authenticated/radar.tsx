import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { leadStatusLabel, LEAD_STATUS_BADGE_TONE, type LeadStatus } from "@/lib/leads";
import { buildWhatsAppUrl } from "@/lib/templates";
import { formatRelativeTime } from "@/lib/interacoes";
import {
  probabilidadeFechamento,
  ETAPAS_RADAR,
  FECHAMENTO_TIER_LABEL,
  FECHAMENTO_TIER_TONE,
  FECHAMENTO_TIER_DOT,
  type FechamentoTier,
} from "@/lib/fechamento";
import { Crosshair, Phone, MessageCircle, ArrowRight } from "lucide-react";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub.
export const Route = createFileRoute("/_authenticated/radar")({
  beforeLoad: () => {
    throw redirect({ to: "/projetos", search: { tab: "radar" } });
  },
});

type LeadRadar = {
  id: string;
  nome: string;
  telefone: string | null;
  status: string;
  temperatura: string | null;
  ultima_interacao: string | null;
  proximo_followup: string | null;
  projeto_nome: string | null;
};

export function RadarFechamentoPage() {
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["radar-fechamento"],
    staleTime: 60_000,
    queryFn: async (): Promise<LeadRadar[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, nome, telefone, status, temperatura, ultima_interacao, proximo_followup, projeto_nome",
        )
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .in("status", ETAPAS_RADAR as LeadStatus[])
        .limit(500);
      if (error) throw error;
      return (data ?? []) as LeadRadar[];
    },
  });

  const ranqueados = useMemo(() => {
    return leads
      .map((l) => ({
        lead: l,
        f: probabilidadeFechamento({
          status: l.status,
          temperatura: l.temperatura,
          ultimaInteracao: l.ultima_interacao,
          proximoFollowup: l.proximo_followup,
        }),
      }))
      .sort((a, b) => b.f.probabilidade - a.f.probabilidade);
  }, [leads]);

  const contagem = useMemo(() => {
    const c: Record<FechamentoTier, number> = { alta: 0, media: 0, baixa: 0 };
    ranqueados.forEach((r) => (c[r.f.tier] += 1));
    return c;
  }, [ranqueados]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Radar de fechamento"
        description="Os negócios mais perto da venda — priorize quem tem maior chance de fechar agora."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <ResumoTier tier="alta" valor={contagem.alta} />
        <ResumoTier tier="media" valor={contagem.media} />
        <ResumoTier tier="baixa" valor={contagem.baixa} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
          ) : ranqueados.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Nenhum lead em negociação no momento.
            </p>
          ) : (
            <ul className="divide-y">
              {ranqueados.map(({ lead, f }) => {
                const tone = LEAD_STATUS_BADGE_TONE[lead.status as LeadStatus];
                const waUrl = buildWhatsAppUrl(
                  lead.telefone ?? "",
                  `Olá ${lead.nome.split(" ")[0]}, tudo bem?`,
                );
                const telHref = `tel:${(lead.telefone ?? "").replace(/[^\d+]/g, "")}`;
                return (
                  <li
                    key={lead.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent/40"
                  >
                    <span
                      className={cn(
                        "h-2.5 w-2.5 shrink-0 rounded-full",
                        FECHAMENTO_TIER_DOT[f.tier],
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{lead.nome}</span>
                        <Badge variant="outline" className={cn("shrink-0", tone)}>
                          {leadStatusLabel(lead.status)}
                        </Badge>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {f.motivo}
                        {lead.projeto_nome ? ` · ${lead.projeto_nome}` : ""}
                        {lead.ultima_interacao
                          ? ` · ${formatRelativeTime(lead.ultima_interacao)}`
                          : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-lg font-bold leading-none">{f.probabilidade}%</div>
                        <div
                          className={cn(
                            "mt-0.5 rounded-full border px-1.5 py-px text-[10px]",
                            FECHAMENTO_TIER_TONE[f.tier],
                          )}
                        >
                          {FECHAMENTO_TIER_LABEL[f.tier]}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-emerald-600"
                        title="WhatsApp"
                        onClick={() => window.open(waUrl, "_blank", "noopener,noreferrer")}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8" title="Ligar" asChild>
                        <a href={telHref}>
                          <Phone className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
                          Abrir <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Probabilidade estimada por etapa do funil, temperatura e momento (recência). É um guia de
        foco — não uma previsão garantida.
      </p>
    </div>
  );
}

function ResumoTier({ tier, valor }: { tier: FechamentoTier; valor: number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", FECHAMENTO_TIER_DOT[tier])} />
          {FECHAMENTO_TIER_LABEL[tier]}
        </div>
        <div className="mt-1 text-2xl font-bold">{valor}</div>
      </CardContent>
    </Card>
  );
}

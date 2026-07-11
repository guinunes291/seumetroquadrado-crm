// Modo Fechamento: os negócios mais perto da venda, ordenados pela
// probabilidade de fechar (lib/fechamento.ts), com documentação pendente à
// vista. Na segunda quinzena, o banner vira chamada de guerra — é quando o
// mês se decide. Evolução do antigo /radar (a rota redireciona para cá).

import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/ui/score-ring";
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
import { Phone, MessageCircle, ArrowRight, FileWarning, Flag } from "lucide-react";

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

export function FechamentoView() {
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

  // Documentação pendente dos 30 primeiros — o gargalo silencioso do fechamento.
  const topIds = useMemo(() => ranqueados.slice(0, 30).map((r) => r.lead.id), [ranqueados]);
  const { data: docsPendentes } = useQuery({
    queryKey: ["fechamento:docs", topIds],
    enabled: topIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentacoes")
        .select("lead_id, status")
        .in("lead_id", topIds)
        .in("status", ["pendente", "reprovado"]);
      if (error) throw error;
      const m = new Map<string, number>();
      (data ?? []).forEach((d: { lead_id: string }) => {
        m.set(d.lead_id, (m.get(d.lead_id) ?? 0) + 1);
      });
      return m;
    },
  });

  const contagem = useMemo(() => {
    const c: Record<FechamentoTier, number> = { alta: 0, media: 0, baixa: 0 };
    ranqueados.forEach((r) => (c[r.f.tier] += 1));
    return c;
  }, [ranqueados]);

  const hoje = new Date();
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const diasRestantes = ultimoDia - hoje.getDate();
  const segundaQuinzena = hoje.getDate() > 15;

  return (
    <div className="space-y-6">
      {/* Banner de quinzena: contexto de tempo + foco */}
      <GlassCard glow={segundaQuinzena} className="p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Flag className={cn("h-8 w-8", segundaQuinzena ? "text-primary" : "text-info")} />
            <div>
              <div className="font-display text-lg font-semibold tracking-tight">
                {segundaQuinzena ? "Reta final do mês" : "Modo Fechamento"}
              </div>
              <div className="text-sm text-muted-foreground">
                {segundaQuinzena
                  ? `${diasRestantes} dia(s) para fechar o mês — priorize os de alta probabilidade e destrave documentação.`
                  : "Acompanhe quem está mais perto de fechar e remova os obstáculos cedo."}
              </div>
            </div>
          </div>
          <div className="font-display text-3xl font-semibold tabular-nums text-primary">
            {contagem.alta}
            <span className="ml-1 text-sm font-normal text-muted-foreground">com alta chance</span>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-3">
        {(["alta", "media", "baixa"] as FechamentoTier[]).map((tier) => (
          <Card key={tier}>
            <CardContent className="pt-5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full", FECHAMENTO_TIER_DOT[tier])} />
                {FECHAMENTO_TIER_LABEL[tier]}
              </div>
              <div className="font-display mt-1 text-2xl font-bold tabular-nums">
                {contagem[tier]}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
          ) : ranqueados.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
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
                const docs = docsPendentes?.get(lead.id) ?? 0;
                return (
                  <li
                    key={lead.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent/40"
                  >
                    <ScoreRing
                      value={f.probabilidade}
                      size={40}
                      intent={
                        f.tier === "alta" ? "success" : f.tier === "media" ? "warning" : "neutral"
                      }
                      title={`Probabilidade de fechamento ${f.probabilidade}%`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{lead.nome}</span>
                        <Badge variant="outline" className={cn("shrink-0", tone)}>
                          {leadStatusLabel(lead.status)}
                        </Badge>
                        {docs > 0 && (
                          <Badge
                            variant="secondary"
                            className="shrink-0 gap-1 bg-warning/15 text-warning"
                            title={`${docs} documento(s) pendente(s) ou reprovado(s)`}
                          >
                            <FileWarning className="h-3 w-3" /> {docs} doc
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {f.motivo}
                        {lead.projeto_nome ? ` · ${lead.projeto_nome}` : ""}
                        {lead.ultima_interacao
                          ? ` · ${formatRelativeTime(lead.ultima_interacao)}`
                          : ""}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <div
                        className={cn(
                          "rounded-full border px-1.5 py-px text-[10px]",
                          FECHAMENTO_TIER_TONE[f.tier],
                        )}
                      >
                        {FECHAMENTO_TIER_LABEL[f.tier]}
                      </div>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-success"
                        title="WhatsApp"
                        onClick={() => window.open(waUrl, "_blank", "noopener,noreferrer")}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        title="Ligar"
                        asChild
                      >
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

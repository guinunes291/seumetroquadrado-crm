import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsiveTabs, ResponsiveTabsContent } from "@/components/ui/responsive-tabs";
import { StickyActionRail } from "@/components/ui/sticky-action-rail";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Phone,
  PhoneCall,
  RefreshCw,
  MessageCircle,
  Check,
  Sparkles,
  FileText,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  LEAD_STATUS_LABEL,
  FUNNEL_STAGES,
  PROXIMA_ACAO,
  leadStatusLabel,
  resolveStageAction,
  type StageLead,
  type LeadStatus,
} from "@/lib/leads";
import {
  LeadStageModals,
  type StageModalState,
  type PerdidoState,
} from "@/components/lead-stage/lead-stage-modals";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { ResumoIA } from "@/components/resumo-ia";
import { GlassCard } from "@/components/ui/glass-card";
import { ScoreRing } from "@/components/ui/score-ring";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { diasDesde, scoreLead } from "@/lib/priority";
import { DocumentacaoTab } from "@/components/documentacao-tab";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import type { DossieLead } from "@/features/leads/dossie/types";
import { TimelineTab, useInteracoesLead } from "@/features/leads/dossie/timeline-tab";
import { DadosTab } from "@/features/leads/dossie/dados-tab";
import { QualificacaoTab } from "@/features/leads/dossie/qualificacao-tab";
import { TarefasTab, useTarefasLead } from "@/features/leads/dossie/tarefas-tab";
import { AgendamentosTab, useAgendamentosLead } from "@/features/leads/dossie/agendamentos-tab";
import { LeadStatusCards } from "@/features/leads/dossie/lead-status-cards";
import { WhatsappLeadDialog } from "@/features/leads/dossie/whatsapp-dialog";
import { EditarLeadDialog } from "@/features/leads/dossie/editar-lead-dialog";

const LEAD_TABS = [
  "timeline",
  "dados",
  "qualificacao",
  "tarefas",
  "agendamentos",
  "documentacao",
] as const;
type LeadTab = (typeof LEAD_TABS)[number];

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  // `tab` permite deep-linkar/recarregar mantendo a aba ativa (padrão: timeline).
  validateSearch: (search: Record<string, unknown>): { tab?: LeadTab } => ({
    tab: LEAD_TABS.includes(search.tab as LeadTab) ? (search.tab as LeadTab) : undefined,
  }),
  head: () => ({ meta: [{ title: "Lead — Seu Metro Quadrado" }] }),
  component: LeadDetailPage,
});

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: LeadTab = tab ?? "timeline";
  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);
  const [waOpen, setWaOpen] = useState(false);
  const [contatoOpen, setContatoOpen] = useState(false);

  const {
    data: lead,
    isLoading,
    isError: leadError,
    refetch: refetchLead,
  } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: async (): Promise<DossieLead | null> => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw error;
      return (data as DossieLead) ?? null;
    },
  });

  // As queries das abas moram nos módulos de dossie/ e são reusadas aqui só
  // para os contadores dos rótulos (mesma queryKey → um único fetch).
  const { data: interacoes = [] } = useInteracoesLead(leadId);
  const { data: tarefas = [] } = useTarefasLead(leadId);
  // Carrega só quando a aba Agendamentos é aberta (evita fetch em toda visita).
  const { data: agendamentosData } = useAgendamentosLead(leadId, activeTab === "agendamentos");
  const agendamentos = agendamentosData ?? [];

  // Badge de risco do resumo executivo: documentos pendentes/reprovados.
  const { data: docsPendentes = 0 } = useQuery({
    queryKey: ["lead-docs-pendentes", leadId],
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("documentacoes")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", leadId)
        .in("status", ["pendente", "reprovado"]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const mudarStatus = useLeadStatusMutation({
    invalidateKeys: [["lead", leadId], ["interacoes", leadId], ["leads"], ["leads-kanban"]],
    onSuccess: () => toast.success("Status atualizado"),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  // Erro de rede não é "lead não encontrado": oferece tentar de novo.
  if (leadError) {
    return (
      <div>
        <Link to="/leads" className="text-sm text-primary hover:underline">
          ← Voltar para leads
        </Link>
        <Card className="mt-4">
          <CardContent className="py-12 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive opacity-70" />
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar o lead. Verifique sua conexão e tente novamente.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetchLead()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!lead) {
    return (
      <div>
        <Link to="/leads" className="text-sm text-primary hover:underline">
          ← Voltar para leads
        </Link>
        <div className="mt-4 text-muted-foreground">Lead não encontrado.</div>
      </div>
    );
  }

  // Forma mínima usada pelos modais/menu de etapa (mesma rota da lista e do Kanban).
  const stageLead: StageLead = {
    id: lead.id,
    nome: lead.nome,
    status: lead.status,
    corretor_id: lead.corretor_id,
    projeto_id: lead.projeto_id,
    projeto_nome: lead.projeto_nome,
    observacoes: lead.observacoes,
  };

  // Roteamento único de etapa: direto, modal (captura dados) ou perdido.
  const goToStage = (target: LeadStatus) => {
    if (target === lead.status) return;
    const action = resolveStageAction(target);
    if (action.kind === "perdido") setPerdidoLead(stageLead);
    else if (action.kind === "modal") setModalState({ modal: action.modal, lead: stageLead });
    else mudarStatus.mutate({ id: lead.id, status: target });
  };

  // Ação comercial sugerida para a etapa atual (botão inteligente).
  const acaoSugerida = PROXIMA_ACAO[lead.status as LeadStatus] ?? null;

  const telHref = `tel:${(lead.telefone ?? "").replace(/[^\d+]/g, "")}`;

  // Instrumentos do resumo executivo: score de prioridade + sinais de risco.
  const scoreInfo = scoreLead({
    temperatura: lead.temperatura,
    status: lead.status,
    ultimaInteracao: lead.ultima_interacao,
  });
  const diasSemContato = diasDesde(lead.ultima_interacao ?? lead.created_at, new Date());

  return (
    <div className="pb-44 md:pb-0">
      <Link
        to="/leads"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar para leads
      </Link>

      <PageHeader
        title={lead.nome}
        description={`${lead.telefone}${lead.email ? " · " + lead.email : ""}`}
        actions={
          <div className="hidden flex-wrap gap-2 md:flex">
            <Button asChild variant="outline">
              <a href={telHref}>
                <Phone className="h-4 w-4 mr-2" /> Ligar
              </a>
            </Button>
            <Button variant="outline" onClick={() => setContatoOpen(true)}>
              <PhoneCall className="h-4 w-4 mr-2" /> Registrar contato
            </Button>
            <WhatsappLeadDialog
              open={waOpen}
              onOpenChange={setWaOpen}
              leadId={leadId}
              lead={{
                nome: lead.nome,
                telefone: lead.telefone,
                projeto_nome: lead.projeto_nome,
                objecoes: lead.objecoes,
              }}
            />
            <EditarLeadDialog leadId={leadId} lead={lead} />
          </div>
        }
      />

      {/* Resumo executivo — quem é, quão urgente, o que fazer agora e o
          briefing por IA, tudo em um painel só (dossiê inteligente). */}
      <GlassCard className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center md:p-5">
          <ScoreRing
            value={scoreInfo.score}
            size={52}
            intent={
              scoreInfo.tier === "alta"
                ? "danger"
                : scoreInfo.tier === "media"
                  ? "warning"
                  : "neutral"
            }
            title={`Score de prioridade ${scoreInfo.score} — ${scoreInfo.motivo}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Próxima melhor ação
            </div>
            <div className="font-display text-base font-semibold tracking-tight md:text-lg">
              {acaoSugerida ? acaoSugerida.label : "Registrar um contato e definir o próximo passo"}
            </div>
            {/* Sinais de risco: temperatura + tempo parado + documentação */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <TemperatureChip temperatura={lead.temperatura} size="sm" />
              {diasSemContato !== null && diasSemContato >= 2 && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "gap-1",
                    diasSemContato >= 5
                      ? "bg-destructive/15 text-destructive"
                      : "bg-warning/15 text-warning",
                  )}
                >
                  <AlertTriangle className="h-3 w-3" /> {diasSemContato}d sem contato
                </Badge>
              )}
              {docsPendentes > 0 && (
                <Badge variant="secondary" className="gap-1 bg-warning/15 text-warning">
                  <FileText className="h-3 w-3" /> {docsPendentes} doc pendente
                  {docsPendentes > 1 ? "s" : ""}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{scoreInfo.motivo}</span>
            </div>
          </div>
          <div className="hidden shrink-0 gap-2 md:flex">
            {acaoSugerida && (
              <Button
                size="sm"
                disabled={mudarStatus.isPending}
                className="bg-gradient-gold text-navy-900 hover:opacity-90"
                onClick={() => goToStage(acaoSugerida.target)}
              >
                {acaoSugerida.label} <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        {/* Briefing por IA — promovido da aba Timeline para o topo do dossiê. */}
        <div className="border-t border-glass-border px-4 py-3 md:px-5">
          <ResumoIA leadId={leadId} />
        </div>
      </GlassCard>

      <Card className="mb-6 hidden md:block">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Etapas do funil</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {FUNNEL_STAGES.map((s) => {
              const currentIdx = FUNNEL_STAGES.indexOf(lead.status as LeadStatus);
              const idx = FUNNEL_STAGES.indexOf(s);
              const isCurrent = s === lead.status;
              const isPast = currentIdx >= 0 && idx < currentIdx;
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={isCurrent ? "default" : isPast ? "secondary" : "outline"}
                  className={cn("h-8", isCurrent && "ring-2 ring-primary/40")}
                  disabled={isCurrent || mudarStatus.isPending}
                  onClick={() => goToStage(s)}
                  title={LEAD_STATUS_LABEL[s]}
                >
                  {isPast && <Check className="h-3.5 w-3.5 mr-1" />}
                  {LEAD_STATUS_LABEL[s]}
                </Button>
              );
            })}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-destructive hover:text-destructive"
              disabled={lead.status === "perdido"}
              onClick={() => setPerdidoLead(stageLead)}
            >
              Marcar como perdido
            </Button>
          </div>
        </CardContent>
      </Card>

      <LeadStatusCards leadId={leadId} lead={lead} />

      <ResponsiveTabs
        value={activeTab}
        onValueChange={(v) =>
          navigate({ search: { tab: v === "timeline" ? undefined : (v as LeadTab) } })
        }
        ariaLabel="Seções do dossiê do lead"
        items={[
          { value: "timeline", label: `Timeline (${interacoes.length})` },
          { value: "dados", label: "Dados" },
          { value: "qualificacao", label: "Qualificação" },
          { value: "tarefas", label: `Tarefas (${tarefas.length})` },
          {
            value: "agendamentos",
            label: `Agendamentos${agendamentosData ? ` (${agendamentos.length})` : ""}`,
          },
          { value: "documentacao", label: "Documentação" },
        ]}
      >
        <ResponsiveTabsContent value="timeline" className="mt-4">
          <TimelineTab leadId={leadId} />
        </ResponsiveTabsContent>

        <ResponsiveTabsContent value="dados" className="mt-4">
          <DadosTab lead={lead} />
        </ResponsiveTabsContent>

        <ResponsiveTabsContent value="qualificacao" className="mt-4 space-y-4">
          <QualificacaoTab lead={lead} />
        </ResponsiveTabsContent>

        <ResponsiveTabsContent value="tarefas" className="mt-4 space-y-3">
          <TarefasTab leadId={leadId} corretorId={lead.corretor_id} />
        </ResponsiveTabsContent>

        <ResponsiveTabsContent value="agendamentos" className="mt-4">
          <AgendamentosTab leadId={leadId} />
        </ResponsiveTabsContent>

        <ResponsiveTabsContent value="documentacao" className="mt-4">
          <DocumentacaoTab
            leadId={leadId}
            lead={{
              nome: lead.nome,
              telefone: lead.telefone,
              corretor_id: lead.corretor_id,
              status: lead.status,
              projeto_id: lead.projeto_id,
              projeto_nome: lead.projeto_nome,
              construtora: lead.construtora,
            }}
          />
        </ResponsiveTabsContent>
      </ResponsiveTabs>

      <StickyActionRail
        statusMessage={`Etapa atual: ${leadStatusLabel(lead.status)}. ${
          acaoSugerida ? `Próxima etapa: ${acaoSugerida.label}.` : "Sem próxima etapa sugerida."
        }`}
      >
        <Button asChild variant="outline" className="flex-1 px-2">
          <a href={telHref} aria-label={`Ligar para ${lead.nome}`}>
            <Phone aria-hidden="true" />
            <span>Ligar</span>
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1 px-2 text-success hover:text-success"
          onClick={() => setWaOpen(true)}
        >
          <MessageCircle aria-hidden="true" />
          <span>WhatsApp</span>
        </Button>
        <Button
          type="button"
          className="flex-1 px-2"
          disabled={!acaoSugerida || mudarStatus.isPending}
          aria-label={acaoSugerida ? `Próxima etapa: ${acaoSugerida.label}` : "Sem próxima etapa"}
          onClick={() => acaoSugerida && goToStage(acaoSugerida.target)}
        >
          <ArrowRight aria-hidden="true" />
          <span>Próxima etapa</span>
        </Button>
      </StickyActionRail>

      {/* Os próprios modais invalidam lead/interações/agendamentos no onSuccess;
          fechar/cancelar não precisa refazer as queries. */}
      <LeadStageModals
        modalState={modalState}
        onModalOpenChange={(o) => !o && setModalState(null)}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(o) => !o && setPerdidoLead(null)}
      />

      <RegistrarContatoDialog
        open={contatoOpen}
        onOpenChange={setContatoOpen}
        lead={{ id: lead.id, nome: lead.nome, corretor_id: lead.corretor_id }}
      />
    </div>
  );
}

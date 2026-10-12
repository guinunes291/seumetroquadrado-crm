// Modo Volume de Atender (item 2.7) — o antigo Modo Blitz, movido de
// src/routes/_authenticated/blitz.tsx sem mudança de comportamento: um lead
// por vez, priorizado por score, com atalhos de teclado. Desde o PR (c),
// /blitz é redirect para /atendimento?modo=volume e este componente só monta
// dentro de Atender — o cabeçalho é o da página.
//
// Padrão Lançamento (Fase 2, 12/10/2026): o topo responde "como está a
// carteira" em três números com dono (na carteira · SLA estourado · sem
// contato há 5+ dias), todos contados do que esta tela JÁ carrega (a fila e o
// leads_com_sla) — nenhuma consulta nova. A área de trabalho é o cartão no
// molde do próximo lead da Prospecção (ProximoLeadCard): temperatura e etapa,
// "N de M", nome, seis campos e Registrar contato como a única ação navy, ao
// lado de Ligar (useLigarLead: 3C Plus com recuo para o tel:) e WhatsApp.
// Mudar etapa, Agendar visita e Abrir dossiê vão para o "…"; observações e o
// Resumo da Sami ficam atrás de "Ver resumo". Não mudou: a fila, a ordem
// (scoreLead + chegada), as chaves de cache e os atalhos.

import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl } from "@/lib/templates";
import {
  LEAD_STATUS_LABEL,
  PROXIMA_ACAO,
  resolveStageAction,
  type LeadStatus,
  type StageLead,
} from "@/lib/leads";
import { origemLabel } from "@/lib/origem";
import { formatRelativeTime } from "@/lib/interacoes";
import { INTENT_BADGE } from "@/lib/status-tones";
import { isTypingTarget } from "@/lib/shortcuts";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { useLigarLead } from "@/hooks/use-ligar-lead";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { LeadStageMenuItems } from "@/components/lead-stage-menu";
import {
  LeadStageModals,
  type StageModalState,
  type PerdidoState,
} from "@/components/lead-stage/lead-stage-modals";
import {
  ArrowSquareOut,
  CalendarCheck,
  CaretDown,
  CaretLeft,
  CaretRight,
  DotsThree,
  Phone,
  Tray,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { ResumoIA } from "@/components/resumo-ia";
import { scoreLead } from "@/lib/priority";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import { Campo, ultimoContato } from "@/features/prospeccao/proximo-lead-card";
import { DIAS_SEM_CONTATO, resumoDoVolume, ultimoToque } from "./volume-resumo";

type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string;
  cpf: string | null;
  status: string;
  origem: string;
  corretor_id: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  observacoes: string | null;
  temperatura: string | null;
  proximo_followup: string | null;
  ultima_interacao: string | null;
  ultimo_contato: string | null;
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean | null;
  campanha: string | null;
  created_at: string;
};

type SlaRow = {
  lead_id: string;
  sla_status: string;
  minutos_decorridos: number;
  sla_minutos: number;
};

// Texto integral dos atalhos (leitor de tela); na tela, a linha discreta com
// Kbd mostra só os que não estão nos botões (← → e A).
const ATALHOS = "Atalhos: ← → navegar · L ligar · W WhatsApp · R registrar contato · A agendar.";

/** Número do topo: a cor só acende acima de zero. */
function NumeroComDono({ valor, cor }: { valor: number; cor: string }) {
  return <span className={cn(valor > 0 && cor)}>{valor}</span>;
}

function fgts(v: boolean | null): string {
  return v == null ? "—" : v ? "Sim" : "Não";
}

export function VolumeView() {
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);
  const [contatoOpen, setContatoOpen] = useState(false);
  const [resumoAberto, setResumoAberto] = useState(false);
  const { ligar: discar, discando } = useLigarLead();

  const leadsQ = useQuery({
    queryKey: ["blitz-queue", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, nome, email, telefone, cpf, status, origem, corretor_id, projeto_id, projeto_nome, observacoes, temperatura, proximo_followup, ultima_interacao, ultimo_contato, renda_informada, entrada_disponivel, usa_fgts, campanha, created_at",
        )

        .eq("corretor_id", user!.id)
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .not("status", "in", "(contrato_fechado,pos_venda,perdido)")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const slaQ = useQuery({
    queryKey: ["blitz-sla", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args?: Record<string, unknown>,
        ) => Promise<{ data: SlaRow[] | null; error: unknown }>
      )("leads_com_sla");
      if (error) throw error;
      return (data ?? []) as SlaRow[];
    },
    staleTime: 60_000,
  });

  const slaMap = useMemo(() => {
    const m = new Map<string, SlaRow>();
    (slaQ.data ?? []).forEach((r) => m.set(r.lead_id, r));
    return m;
  }, [slaQ.data]);

  const fila = useMemo(() => {
    const arr = [...(leadsQ.data ?? [])];
    // Ordena pelo Score de prioridade (temperatura + etapa + SLA + tempo parado).
    // Mais recentes primeiro desempata. Mesmo critério usado no Meu Dia.
    const scoreOf = (l: Lead) =>
      scoreLead({
        temperatura: l.temperatura,
        status: l.status,
        slaStatus: slaMap.get(l.id)?.sla_status,
        ultimaInteracao: l.ultima_interacao,
      }).score;
    arr.sort((a, b) => {
      const diff = scoreOf(b) - scoreOf(a);
      if (diff !== 0) return diff;
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
    return arr;
  }, [leadsQ.data, slaMap]);

  const resumo = useMemo(() => resumoDoVolume(fila, slaMap, new Date()), [fila, slaMap]);

  useRealtimeInvalidate("leads", [["blitz-queue"], ["blitz-sla"]]);

  // Mantém o índice dentro dos limites quando a fila muda.
  useEffect(() => {
    setIndex((i) => (fila.length === 0 ? 0 : Math.min(i, fila.length - 1)));
  }, [fila.length]);

  const updateStatus = useLeadStatusMutation({
    optimisticKeys: [["blitz-queue"]],
    invalidateKeys: [["blitz-queue"], ["blitz-sla"], ["leads-kanban"], ["leads"]],
  });

  const current = fila[index];

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, fila.length - 1)), [fila.length]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  // Ligar pelo 3C Plus quando o corretor tem a integração; sem ela o próprio
  // hook avisa e cai no tel: do aparelho — o mesmo da Fila Única e da
  // Prospecção (antes este botão abria só o tel:).
  const ligar = useCallback(() => {
    if (current) discar({ id: current.id, nome: current.nome, telefone: current.telefone });
  }, [current, discar]);

  const whatsapp = useCallback(() => {
    if (current?.telefone) {
      const url = buildWhatsAppUrl(current.telefone, `Olá ${current.nome}, tudo bem?`);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [current]);

  const agendar = useCallback(() => {
    if (current) setModalState({ modal: "agendado", lead: current as StageLead });
  }, [current]);

  // Atalhos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalState || perdidoLead || contatoOpen) return;
      // ⌘K, Ctrl+L e afins são do navegador/da busca, não do Volume.
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      // Com o "…" do cartão aberto as setas andam no menu, não na fila.
      if (document.querySelector("[role='menu']")) return;
      if (e.key === "ArrowRight" || e.key === "n") next();
      else if (e.key === "ArrowLeft" || e.key === "p") prev();
      else if (e.key.toLowerCase() === "w") whatsapp();
      else if (e.key.toLowerCase() === "l") ligar();
      else if (e.key.toLowerCase() === "a") agendar();
      else if (e.key.toLowerCase() === "r" && current) setContatoOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, whatsapp, ligar, agendar, modalState, perdidoLead, contatoOpen, current]);

  const sla = current ? slaMap.get(current.id) : undefined;
  // A próxima etapa do funil (Agendar visita, Marcar visita realizada…) vai
  // para o "…". Antes de Em atendimento a ação é Registrar contato — o botão
  // navy do cartão — e "Agendar visita" já tem item próprio (A).
  const proxima = current ? PROXIMA_ACAO[current.status as LeadStatus] : undefined;
  const proximaEtapa =
    proxima && "target" in proxima && proxima.target !== "agendado" ? proxima : null;

  return (
    <div className="space-y-4">
      {leadsQ.isError ? (
        <QueryErrorState
          title="Não foi possível carregar sua fila do Blitz."
          error={leadsQ.error}
          onRetry={() => leadsQ.refetch()}
        />
      ) : leadsQ.isLoading ? (
        <div className="space-y-4" aria-busy="true">
          <StatGrid className="sm:grid-cols-3 xl:grid-cols-3">
            <StatTile title="Na carteira" value={null} loading />
            <StatTile title="Com SLA estourado" value={null} loading />
            <StatTile title={`Sem contato há ${DIAS_SEM_CONTATO}+ dias`} value={null} loading />
          </StatGrid>
          <div className="space-y-4 rounded-2xl border border-border-subtle bg-card p-5 md:p-6">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      ) : !current ? (
        <EmptyState
          icon={Tray}
          title="Sua fila está vazia"
          description="Nenhum lead ativo atribuído a você no momento. Novos leads entram aqui automaticamente."
          action={
            <Button asChild variant="outline">
              <Link to="/leads">Ir para Meus Leads</Link>
            </Button>
          }
          className="py-16"
        />
      ) : (
        <>
          <section aria-label="Como está a carteira">
            <StatGrid className="sm:grid-cols-3 xl:grid-cols-3">
              <StatTile
                title="Na carteira"
                value={
                  <>
                    {resumo.naCarteira}
                    <Progress
                      value={((index + 1) / fila.length) * 100}
                      className="mt-2 h-1.5"
                      aria-label={`Você está no lead ${index + 1} de ${fila.length}`}
                    />
                  </>
                }
                hint={
                  <>
                    você está no{" "}
                    <b className="font-semibold text-foreground">
                      {index + 1} de {fila.length}
                    </b>
                  </>
                }
              />
              <StatTile
                title="Com SLA estourado"
                loading={slaQ.isLoading}
                value={
                  slaQ.isError ? (
                    "—"
                  ) : (
                    <NumeroComDono valor={resumo.slaEstourado} cor="text-destructive" />
                  )
                }
                hint={
                  slaQ.isError
                    ? "SLA indisponível agora"
                    : resumo.slaMaisAntigoMin !== null
                      ? `o mais antigo ${formatRelativeTime(
                          new Date(Date.now() - resumo.slaMaisAntigoMin * 60_000).toISOString(),
                        )}`
                      : "todos no prazo"
                }
              />
              <StatTile
                title={`Sem contato há ${DIAS_SEM_CONTATO}+ dias`}
                value={<NumeroComDono valor={resumo.semContato} cor="text-warning" />}
                hint={
                  resumo.semContatoMaisAntigoDias !== null
                    ? `o mais antigo há ${resumo.semContatoMaisAntigoDias} dias`
                    : "todos com contato recente"
                }
              />
            </StatGrid>
          </section>

          <section
            aria-label={`Lead da vez: ${current.nome}`}
            className="flex min-h-[300px] flex-col rounded-2xl border border-border-subtle bg-card p-5 text-card-foreground shadow-elev-1 md:p-6"
          >
            <div className="flex flex-wrap items-center gap-2">
              <TemperatureChip temperatura={current.temperatura} />
              <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-800 dark:bg-gold-500/15 dark:text-gold-300">
                {LEAD_STATUS_LABEL[current.status as LeadStatus] ??
                  current.status.replace(/_/g, " ")}
              </span>
              {sla?.sla_status === "estourado" && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    INTENT_BADGE.danger,
                  )}
                >
                  SLA estourado
                </span>
              )}
              <span className="ml-auto text-xs font-medium tabular-nums text-muted-foreground">
                {index + 1} de {fila.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="md:h-8 md:w-8"
                onClick={prev}
                disabled={index === 0}
                aria-label="Lead anterior"
                aria-keyshortcuts="ArrowLeft"
              >
                <CaretLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="md:h-8 md:w-8"
                onClick={next}
                disabled={index >= fila.length - 1}
                aria-label="Próximo lead"
                aria-keyshortcuts="ArrowRight"
              >
                <CaretRight />
              </Button>
            </div>

            <h2 className="mt-4 truncate font-display text-3xl font-bold tracking-tight">
              {current.nome}
            </h2>

            <div className="mt-5 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Campo rotulo="Empreendimento" valor={current.projeto_nome ?? "—"} />
              <Campo rotulo="Origem" valor={origemLabel(current.origem)} />
              <Campo rotulo="Renda" valor={current.renda_informada ?? "—"} />
              <Campo rotulo="FGTS" valor={fgts(current.usa_fgts)} />
              <Campo rotulo="Entrada" valor={current.entrada_disponivel ?? "—"} />
              <Campo
                rotulo="Último contato"
                valor={ultimoContato({
                  ultima_interacao: ultimoToque(current),
                  created_at: current.created_at,
                })}
              />
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
              <Button variant="outline" onClick={ligar} disabled={discando}>
                <Phone />
                {discando ? "Chamando…" : "Ligar"}
                <Kbd className="hidden md:inline-flex">L</Kbd>
              </Button>
              <Button variant="outline" onClick={whatsapp}>
                <WhatsappLogo />
                WhatsApp
                <Kbd className="hidden md:inline-flex">W</Kbd>
              </Button>
              <Button onClick={() => setContatoOpen(true)}>
                Registrar contato
                <Kbd className="hidden border-claro/30 bg-claro/15 text-claro md:inline-flex">
                  R
                </Kbd>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground md:h-9 md:w-9"
                    aria-label="Mais ações: mudar etapa, agendar visita, abrir dossiê"
                    title="Mudar etapa · Agendar visita · Abrir dossiê"
                  >
                    <DotsThree weight="bold" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  {proximaEtapa && (
                    <DropdownMenuItem
                      disabled={updateStatus.isPending}
                      onSelect={() => {
                        const action = resolveStageAction(proximaEtapa.target);
                        if (action.kind === "modal")
                          setModalState({ modal: action.modal, lead: current as StageLead });
                        else if (action.kind === "perdido") setPerdidoLead(current as StageLead);
                        else updateStatus.mutate({ id: current.id, status: proximaEtapa.target });
                      }}
                    >
                      <CaretRight />
                      {proximaEtapa.label}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={agendar}>
                    <CalendarCheck />
                    Agendar visita
                    <Kbd className="ml-auto hidden md:inline-flex">A</Kbd>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/leads/$leadId" params={{ leadId: current.id }}>
                      <ArrowSquareOut />
                      Abrir dossiê
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <LeadStageMenuItems
                    lead={current}
                    onPickDirect={(target: LeadStatus) => {
                      updateStatus.mutate({ id: current.id, status: target });
                      next();
                    }}
                    onPickModal={(modal) => setModalState({ modal, lead: current as StageLead })}
                    onPickPerdido={() => setPerdidoLead(current as StageLead)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </section>

          <Collapsible open={resumoAberto} onOpenChange={setResumoAberto}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-card px-4 py-3.5 text-left text-sm font-semibold shadow-elev-1 transition-colors hover:bg-accent/40"
              >
                <span>
                  Ver resumo{" "}
                  <span className="font-medium text-muted-foreground">
                    · observações do lead e resumo da Sami
                  </span>
                </span>
                <CaretDown
                  aria-hidden="true"
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    resumoAberto && "rotate-180",
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <div className="rounded-2xl border border-border-subtle bg-card p-4">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Observações
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground/90">
                  {current.observacoes?.trim() || "Nenhuma observação registrada."}
                </p>
              </div>
              <ResumoIA leadId={current.id} />
            </CollapsibleContent>
          </Collapsible>

          <p className="hidden flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-xs text-muted-foreground md:flex">
            <span className="sr-only">{ATALHOS}</span>
            <span aria-hidden="true" className="contents">
              Atalhos: <Kbd>←</Kbd>
              <Kbd>→</Kbd> navegam entre os leads · <Kbd>A</Kbd> agenda visita
            </span>
          </p>
        </>
      )}

      <LeadStageModals
        modalState={modalState}
        onModalOpenChange={(o) => !o && setModalState(null)}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(o) => !o && setPerdidoLead(null)}
      />

      {current && (
        <RegistrarContatoDialog
          open={contatoOpen}
          onOpenChange={setContatoOpen}
          lead={{
            id: current.id,
            nome: current.nome,
            corretor_id: current.corretor_id,
            status: current.status,
          }}
          onDone={next}
        />
      )}
    </div>
  );
}

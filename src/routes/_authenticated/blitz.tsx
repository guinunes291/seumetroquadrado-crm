import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl } from "@/lib/templates";
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_BADGE_TONE,
  type LeadStatus,
  type StageLead,
} from "@/lib/leads";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { LeadStageMenu } from "@/components/lead-stage-menu";
import {
  LeadStageModals,
  type StageModalState,
  type PerdidoState,
} from "@/components/lead-stage/lead-stage-modals";
import {
  Phone,
  MessageCircle,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  Flame,
  Inbox,
  Wallet,
  PiggyBank,
  Landmark,
  IdCard,
  ExternalLink,
  CalendarClock,
  PhoneCall,
} from "lucide-react";
import { ResumoIA } from "@/components/resumo-ia";
import { scoreLead } from "@/lib/priority";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";

export const Route = createFileRoute("/_authenticated/blitz")({
  head: () => ({ meta: [{ title: "Modo Blitz — Seu Metro Quadrado" }] }),
  component: BlitzPage,
});

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

const SLA_META: Record<string, { label: string; cls: string }> = {
  estourado: { label: "SLA estourado", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  atencao: { label: "Atenção", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  ok: { label: "No prazo", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
};
const TEMP_CLS: Record<string, string> = {
  quente: "bg-red-500/15 text-red-700 dark:text-red-300",
  morno: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  frio: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
};

function BlitzPage() {
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);
  const [contatoOpen, setContatoOpen] = useState(false);

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

  const ligar = useCallback(() => {
    if (current?.telefone) window.location.href = `tel:${current.telefone}`;
  }, [current]);

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
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight" || e.key === "n") next();
      else if (e.key === "ArrowLeft" || e.key === "p") prev();
      else if (e.key.toLowerCase() === "w") whatsapp();
      else if (e.key.toLowerCase() === "l") ligar();
      else if (e.key.toLowerCase() === "a") agendar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, whatsapp, ligar, agendar, modalState, perdidoLead, contatoOpen]);

  const sla = current ? slaMap.get(current.id) : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Modo Blitz"
        description="Atenda um lead por vez, priorizado por urgência. Atalhos: ← → navegar · L ligar · W WhatsApp · A agendar."
        actions={
          <Badge variant="secondary" className="text-xs">
            {fila.length === 0 ? "0 leads" : `${index + 1} de ${fila.length}`}
          </Badge>
        }
      />

      {fila.length > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${((index + 1) / fila.length) * 100}%` }}
          />
        </div>
      )}

      {!current ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Inbox className="h-10 w-10" />
            <div className="font-medium">Sua fila está vazia</div>
            <div className="text-sm">Nenhum lead ativo atribuído a você no momento.</div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mx-auto max-w-4xl">
          <CardContent className="space-y-6 p-6 md:p-8">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-2xl font-bold md:text-3xl">{current.nome}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {current.projeto_nome && <span>{current.projeto_nome}</span>}
                  {current.campanha && <span>· {current.campanha}</span>}
                  <span>· {current.origem}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link to="/leads/$leadId" params={{ leadId: current.id }}>
                    <ExternalLink className="mr-1 h-4 w-4" /> Abrir
                  </Link>
                </Button>
                <LeadStageMenu
                  lead={current}
                  onPickDirect={(target: LeadStatus) => {
                    updateStatus.mutate({ id: current.id, status: target });
                    next();
                  }}
                  onPickModal={(modal) => setModalState({ modal, lead: current as StageLead })}
                  onPickPerdido={() => setPerdidoLead(current as StageLead)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className={cn(LEAD_STATUS_BADGE_TONE[current.status as LeadStatus])}
              >
                {LEAD_STATUS_LABEL[current.status as LeadStatus] ?? current.status}
              </Badge>
              {current.temperatura && (
                <Badge
                  variant="secondary"
                  className={cn("uppercase", TEMP_CLS[current.temperatura])}
                >
                  <Flame className="mr-1 h-3 w-3" />
                  {current.temperatura}
                </Badge>
              )}
              {sla && SLA_META[sla.sla_status] && (
                <Badge variant="secondary" className={cn("gap-1", SLA_META[sla.sla_status].cls)}>
                  <Clock className="h-3 w-3" />
                  {SLA_META[sla.sla_status].label} · {sla.minutos_decorridos}/{sla.sla_minutos} min
                </Badge>
              )}
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <InfoLine icon={Phone} label="Telefone" value={current.telefone} />
              <InfoLine icon={Mail} label="E-mail" value={current.email ?? "—"} />
              <InfoLine icon={IdCard} label="CPF" value={current.cpf ?? "—"} />
              <InfoLine
                icon={CalendarClock}
                label="Último contato"
                value={fmtDate(current.ultimo_contato ?? current.ultima_interacao)}
              />
            </div>

            <Separator />

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Perfil financeiro
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <InfoTile icon={Wallet} label="Renda" value={current.renda_informada ?? "Não informada"} />
                <InfoTile
                  icon={PiggyBank}
                  label="Entrada"
                  value={current.entrada_disponivel ?? "Não informada"}
                />
                <InfoTile
                  icon={Landmark}
                  label="FGTS"
                  value={
                    current.usa_fgts === true
                      ? "Sim, usa"
                      : current.usa_fgts === false
                        ? "Não usa"
                        : "Não informado"
                  }
                />
              </div>
            </div>

            {current.observacoes && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Observações
                </div>
                <p className="rounded-md bg-muted/40 p-3 text-sm text-foreground/90 whitespace-pre-wrap">
                  {current.observacoes}
                </p>
              </div>
            )}

            <ResumoIA leadId={current.id} />

            <Button className="w-full" onClick={() => setContatoOpen(true)}>
              <PhoneCall className="mr-1 h-4 w-4" /> Registrar contato
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={ligar}>
                <Phone className="mr-1 h-4 w-4" /> Ligar
              </Button>
              <Button
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={whatsapp}
              >
                <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
              </Button>
              <Button variant="outline" onClick={agendar}>
                <CalendarCheck className="mr-1 h-4 w-4" /> Agendar
              </Button>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <Button variant="ghost" onClick={prev} disabled={index === 0}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
              </Button>
              <Button onClick={next} disabled={index >= fila.length - 1}>
                Próximo <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
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
          lead={{ id: current.id, nome: current.nome, corretor_id: current.corretor_id }}
          onDone={next}
        />
      )}
    </div>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}



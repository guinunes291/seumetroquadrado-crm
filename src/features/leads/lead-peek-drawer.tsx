// Dossiê-relâmpago do lead: contexto e ação sem sair da lista. Abrir a página
// completa vira exceção — o corretor decide e age daqui (WhatsApp, ligar,
// próxima etapa). Sheet à direita no desktop; bottom-drawer (vaul) no mobile.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MessageCircle, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/ui/score-ring";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  describeInteracao,
  formatRelativeTime,
  type InteracaoDirecao,
  type InteracaoTipo,
} from "@/lib/interacoes";
import {
  LEAD_STATUS_BADGE_TONE,
  PROXIMA_ACAO,
  leadStatusLabel,
  type LeadStatus,
} from "@/lib/leads";
import { scoreLead } from "@/lib/priority";

/** Campos mínimos que o peek precisa — o Lead da listagem satisfaz por estrutura. */
export type PeekLead = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  origem: string;
  status: string;
  temperatura: string | null;
  projeto_nome: string | null;
  corretor_id: string | null;
  created_at: string;
  ultima_interacao: string | null;
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean | null;
};

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

function PeekBody({
  lead,
  corretorNome,
  onWhatsApp,
  onProximaAcao,
}: {
  lead: PeekLead;
  corretorNome?: string;
  onWhatsApp: (lead: PeekLead) => void;
  onProximaAcao?: (lead: PeekLead) => void;
}) {
  const score = scoreLead({
    temperatura: lead.temperatura,
    status: lead.status,
    ultimaInteracao: lead.ultima_interacao,
  });
  const proxima = PROXIMA_ACAO[lead.status as LeadStatus];

  const interacoesQ = useQuery({
    queryKey: ["lead-peek:interacoes", lead.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interacoes")
        .select("id, tipo, direcao, titulo, conteudo, ocorreu_em")
        .eq("lead_id", lead.id)
        .order("ocorreu_em", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        tipo: InteracaoTipo;
        direcao: InteracaoDirecao;
        titulo: string | null;
        conteudo: string;
        ocorreu_em: string;
      }>;
    },
  });

  const tarefasQ = useQuery({
    queryKey: ["lead-peek:tarefas", lead.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("id, titulo, data_vencimento")
        .eq("lead_id", lead.id)
        .in("status", ["pendente", "em_andamento"])
        .order("data_vencimento", { ascending: true, nullsFirst: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4 overflow-y-auto px-4 pb-6">
      {/* Identidade + prioridade */}
      <div className="flex items-center gap-3">
        <ScoreRing
          value={score.score}
          size={52}
          intent={score.tier === "alta" ? "danger" : score.tier === "media" ? "warning" : "neutral"}
          title={`Score de prioridade ${score.score} — ${score.motivo}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <TemperatureChip temperatura={lead.temperatura} size="sm" pulse={false} />
            <Badge
              variant="secondary"
              className={LEAD_STATUS_BADGE_TONE[lead.status as LeadStatus]}
            >
              {leadStatusLabel(lead.status)}
            </Badge>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{score.motivo}</div>
        </div>
      </div>

      {/* Ações principais — o motivo de o peek existir */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="bg-gradient-gold text-navy-900 hover:opacity-90"
          onClick={() => onWhatsApp(lead)}
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={`tel:${lead.telefone.replace(/\D/g, "")}`}>
            <Phone className="h-4 w-4" /> Ligar
          </a>
        </Button>
        {proxima && onProximaAcao && (
          <Button size="sm" variant="outline" onClick={() => onProximaAcao(lead)}>
            {proxima.label}
          </Button>
        )}
      </div>

      <Separator />

      {/* Contexto em uma olhada */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <InfoCell label="Telefone" value={lead.telefone} />
        <InfoCell label="E-mail" value={lead.email} />
        <InfoCell
          label="Origem"
          value={<span className="capitalize">{lead.origem.replace(/_/g, " ")}</span>}
        />
        <InfoCell label="Empreendimento" value={lead.projeto_nome} />
        <InfoCell label="Renda" value={lead.renda_informada} />
        <InfoCell label="Entrada" value={lead.entrada_disponivel} />
        <InfoCell
          label="FGTS"
          value={lead.usa_fgts == null ? "—" : lead.usa_fgts ? "Sim" : "Não"}
        />
        <InfoCell
          label="Corretor"
          value={corretorNome ?? (lead.corretor_id ? "…" : "sem corretor")}
        />
        <InfoCell label="Criado em" value={new Date(lead.created_at).toLocaleDateString("pt-BR")} />
        <InfoCell
          label="Último contato"
          value={lead.ultima_interacao ? formatRelativeTime(lead.ultima_interacao) : "nunca"}
        />
      </div>

      {/* Próximo passo agendado */}
      {(tarefasQ.data?.length ?? 0) > 0 && (
        <>
          <Separator />
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              Próximos passos
            </div>
            <div className="space-y-1.5">
              {tarefasQ.data!.map((t) => (
                <div key={t.id} className="rounded-md border p-2 text-sm">
                  <div className="truncate font-medium">{t.titulo}</div>
                  {t.data_vencimento && (
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.data_vencimento).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Histórico resumido */}
      <Separator />
      <div>
        <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          Últimas interações
        </div>
        {interacoesQ.isLoading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (interacoesQ.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma interação registrada ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {interacoesQ.data!.map((i) => (
              <div key={i.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {i.titulo || describeInteracao(i.tipo, i.direcao)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(i.ocorreu_em)}
                  </span>
                </div>
                {i.conteudo && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{i.conteudo}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Button asChild variant="outline" className="w-full">
        <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
          Abrir dossiê completo <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

export function LeadPeekDrawer({
  lead,
  onOpenChange,
  corretorNome,
  onWhatsApp,
  onProximaAcao,
}: {
  lead: PeekLead | null;
  onOpenChange: (open: boolean) => void;
  corretorNome?: string;
  onWhatsApp: (lead: PeekLead) => void;
  onProximaAcao?: (lead: PeekLead) => void;
}) {
  const isMobile = useIsMobile();
  const open = !!lead;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          {lead && (
            <>
              <DrawerHeader className="pb-2 text-left">
                <DrawerTitle className="font-display truncate">{lead.nome}</DrawerTitle>
              </DrawerHeader>
              <PeekBody
                lead={lead}
                corretorNome={corretorNome}
                onWhatsApp={onWhatsApp}
                onProximaAcao={onProximaAcao}
              />
            </>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md">
        {lead && (
          <>
            <SheetHeader className="px-4 pb-2 pt-4">
              <SheetTitle className="font-display truncate pr-8">{lead.nome}</SheetTitle>
            </SheetHeader>
            <PeekBody
              lead={lead}
              corretorNome={corretorNome}
              onWhatsApp={onWhatsApp}
              onProximaAcao={onProximaAcao}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

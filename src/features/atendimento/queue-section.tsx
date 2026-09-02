import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { cn } from "@/lib/utils";
import { leadStatusLabel, type LeadStatus, type StageModal } from "@/lib/leads";
import { LeadStageMenu } from "@/components/lead-stage-menu";
import { TIER_DOT } from "@/lib/priority";
import {
  CalendarCheck,
  Copy,
  Phone,
  PhoneCall,
  WhatsappLogo,
  type Icon as IconComponent,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  QUEUE_HINT,
  QUEUE_LABEL,
  scriptParaFila,
  type QueueItem,
  type QueueKey,
} from "@/features/atendimento/derive";
import type { ReactNode } from "react";

const QUEUE_ACCENT: Record<QueueKey, string> = {
  novos: "border-primary/30",
  responder: "border-destructive/30",
  followups: "border-warning/30",
  esfriando: "border-info/30",
  confirmar_visita: "border-success/30",
  docs: "border-border",
};

/**
 * Uma fila do Atendimento: cabeçalho com propósito + linhas com ação em
 * 1 clique. O WhatsApp abre já com o script certo para o momento da fila,
 * registrar o contato e mudar a etapa não exigem abrir o lead — são as
 * ações mais repetidas do dia.
 */
export function QueueSection({
  queue,
  items,
  totalCount,
  icon: Icon,
  iconClass,
  action,
  onWhatsApp,
  onPeek,
  onRegistrarContato,
  onEtapaDirect,
  onEtapaModal,
  onEtapaPerdido,
  onConfirmarVisita,
}: {
  queue: QueueKey;
  items: QueueItem[];
  totalCount?: number;
  icon: IconComponent;
  iconClass: string;
  /** Ação do cabeçalho (ex.: link para o hub dono da fila) — opcional. */
  action?: ReactNode;
  onWhatsApp: (item: QueueItem, mensagem: string) => void;
  onPeek: (item: QueueItem) => void;
  onRegistrarContato: (item: QueueItem) => void;
  onEtapaDirect: (item: QueueItem, target: LeadStatus) => void;
  onEtapaModal: (item: QueueItem, modal: StageModal, target: LeadStatus) => void;
  onEtapaPerdido: (item: QueueItem) => void;
  onConfirmarVisita: (item: QueueItem) => void;
}) {
  if (items.length === 0) return null;

  const copiarScript = (item: QueueItem) => {
    const msg = scriptParaFila(queue, item.lead.nome, item.lead.projeto_nome);
    navigator.clipboard.writeText(msg);
    toast.success("Script copiado — cole no WhatsApp ou adapte antes de enviar.");
  };

  return (
    <Card className={QUEUE_ACCENT[queue]}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-1.5 text-sm">
          <Icon className={cn("h-4 w-4", iconClass)} /> {QUEUE_LABEL[queue]}
          <Badge variant="secondary">
            {totalCount && totalCount > items.length
              ? `${items.length} de ${totalCount}`
              : (totalCount ?? items.length)}
          </Badge>
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {QUEUE_HINT[queue]}
          </span>
          {action && <span className="ml-auto font-normal">{action}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, i) => {
          const l = item.lead;
          const mensagem = scriptParaFila(queue, l.nome, l.projeto_nome);
          return (
            <div
              key={l.id}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest("a,button,input")) return;
                onPeek(item);
              }}
              className="animate-slide-fade motion-reduce:animate-none flex cursor-pointer items-center justify-between gap-2 rounded-md border p-2 transition-colors hover:bg-accent/40"
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", TIER_DOT[item.tier])}
                    title={`Prioridade ${item.tier} · score ${item.score}`}
                  />
                  <span className="truncate text-sm font-medium">{l.nome}</span>
                  <TemperatureChip temperatura={l.temperatura} size="sm" pulse={false} />
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {leadStatusLabel(l.status)} · {item.motivo}
                  {l.projeto_nome ? ` · ${l.projeto_nome}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {/* Ação da fila nova (item 2.5): confirmar a visita sem abrir
                    o formulário de agenda — é o clique que a tarefa #5b pedia. */}
                {item.agendamentoId && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-success hover:bg-success/10"
                    title="Confirmar a visita agendada"
                    onClick={() => onConfirmarVisita(item)}
                  >
                    <CalendarCheck className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:bg-muted"
                  title="Copiar script sugerido"
                  onClick={() => copiarScript(item)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-success hover:bg-success/10"
                  title={`WhatsApp — abre com o script da fila "${QUEUE_LABEL[queue]}"`}
                  onClick={() => onWhatsApp(item, mensagem)}
                >
                  <WhatsappLogo className="h-4 w-4" />
                </Button>
                <Button
                  asChild
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-info hover:bg-info/10"
                  title="Ligar"
                >
                  <a href={`tel:${l.telefone.replace(/\D/g, "")}`}>
                    <Phone className="h-4 w-4" />
                  </a>
                </Button>
                {/* Fecha o ciclo da fila sem sair dela: ligou/falou, registra
                    aqui. Antes exigia abrir o peek do lead primeiro. */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-primary hover:bg-primary/10"
                  title="Registrar contato e marcar o próximo follow-up"
                  onClick={() => onRegistrarContato(item)}
                >
                  <PhoneCall className="h-4 w-4" />
                </Button>
                {/* Etapa in-line (auditoria ux-ia-2026-08, item 1.8): agendou ou
                    perdeu na própria ligação, move aqui — sem abrir o peek. Os
                    modais obrigatórios continuam valendo (roteados pela rota). */}
                <LeadStageMenu
                  lead={{ id: l.id, nome: l.nome, status: l.status }}
                  onPickDirect={(target) => onEtapaDirect(item, target)}
                  onPickModal={(modal, target) => onEtapaModal(item, modal, target)}
                  onPickPerdido={() => onEtapaPerdido(item)}
                  triggerClassName="h-7 w-7 text-muted-foreground hover:bg-muted"
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

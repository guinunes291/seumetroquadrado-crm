import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { cn } from "@/lib/utils";
import { leadStatusLabel } from "@/lib/leads";
import { TIER_DOT } from "@/lib/priority";
import { Copy, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import {
  QUEUE_HINT,
  QUEUE_LABEL,
  scriptParaFila,
  type QueueItem,
  type QueueKey,
} from "@/features/atendimento/derive";
import type { LucideIcon } from "lucide-react";

const QUEUE_ACCENT: Record<QueueKey, string> = {
  responder: "border-destructive/30",
  followups: "border-warning/30",
  esfriando: "border-info/30",
  docs: "border-border",
};

/**
 * Uma fila do Atendimento: cabeçalho com propósito + linhas com ação em
 * 1 clique. O WhatsApp abre já com o script certo para o momento da fila.
 */
export function QueueSection({
  queue,
  items,
  totalCount,
  icon: Icon,
  iconClass,
  onWhatsApp,
  onPeek,
}: {
  queue: QueueKey;
  items: QueueItem[];
  totalCount?: number;
  icon: LucideIcon;
  iconClass: string;
  onWhatsApp: (item: QueueItem, mensagem: string) => void;
  onPeek: (item: QueueItem) => void;
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
                  <MessageCircle className="h-4 w-4" />
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
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

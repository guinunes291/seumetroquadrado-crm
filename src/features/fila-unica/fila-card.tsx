// Card de um lead na Fila Única — apresentação pura (recebe callbacks, nunca
// consulta o banco). Responde, na ordem em que o olho lê: quem é, em que
// etapa e projeto está, POR QUE está na fila, qual é o próximo passo e o
// prazo dele. As ações são as mesmas do card de Atender (WhatsApp com o
// script da fila, ligar, registrar contato, Sami, etapa in-line) mais o
// "Resumo": a leitura da Sami e o atalho para o histórico, sem sair da fila.

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { SamiMark } from "@/components/ui/sami-mark";
import { LeadStageMenu } from "@/components/lead-stage-menu";
import { ResumoIA } from "@/components/resumo-ia";
import { abrirSamiQ, textoRegistrarComSami } from "@/components/samiq/abrir-samiq";
import { cn } from "@/lib/utils";
import { leadStatusLabel, type LeadStatus, type StageModal } from "@/lib/leads";
import { TIER_DOT } from "@/lib/priority";
import { formatDuration } from "@/lib/duracao";
import {
  Buildings,
  CalendarCheck,
  CaretDown,
  ClockCountdown,
  Phone,
  PhoneCall,
  WhatsappLogo,
} from "@phosphor-icons/react";
import type { FilaUnicaItem } from "@/features/fila-unica/derive";

const ACCENT: Record<FilaUnicaItem["bucket"], string> = {
  sla: "border-l-warning",
  fundo: "border-l-destructive",
  responder: "border-l-info",
  followup: "border-l-warning",
  sem_acao: "border-l-destructive",
  esfriando: "border-l-info",
  docs: "border-l-border",
};

export type FilaCardProps = {
  item: FilaUnicaItem;
  onWhatsApp: (item: FilaUnicaItem) => void;
  onLigar: (item: FilaUnicaItem) => void;
  onRegistrarContato: (item: FilaUnicaItem) => void;
  onHistorico: (item: FilaUnicaItem) => void;
  onEtapaDirect: (item: FilaUnicaItem, target: LeadStatus) => void;
  onEtapaModal: (item: FilaUnicaItem, modal: StageModal, target: LeadStatus) => void;
  onEtapaPerdido: (item: FilaUnicaItem) => void;
  onConfirmarVisita: (item: FilaUnicaItem) => void;
  /** Índice na lista — só para a cascata de entrada. */
  index?: number;
};

/** Linha do próximo passo: o prazo manda no tom — vencido em vermelho, hoje
 *  em âmbar, sem passo definido em vermelho (é a causa nº 1 de perda). */
function ProximoPasso({ item }: { item: FilaUnicaItem }): ReactNode {
  if (!item.proximoPasso && !item.prazo) {
    return (
      <span className="text-destructive">
        <strong>nenhum próximo passo definido</strong> · defina agora
      </span>
    );
  }
  let prazo: ReactNode = null;
  if (item.vencidoMin > 0) {
    prazo = (
      <strong className="text-destructive">venceu há {formatDuration(item.vencidoMin)}</strong>
    );
  } else if (item.venceHoje) {
    prazo = <strong className="text-warning">vence hoje</strong>;
  } else if (item.prazo) {
    prazo = <span>{new Date(item.prazo).toLocaleDateString("pt-BR")}</span>;
  }
  return (
    <>
      {item.proximoPasso && <span>“{item.proximoPasso}”</span>}
      {item.proximoPasso && prazo && <span> · </span>}
      {prazo}
    </>
  );
}

export function FilaCard({
  item,
  onWhatsApp,
  onLigar,
  onRegistrarContato,
  onHistorico,
  onEtapaDirect,
  onEtapaModal,
  onEtapaPerdido,
  onConfirmarVisita,
  index = 0,
}: FilaCardProps) {
  const l = item.lead;
  const [resumoAberto, setResumoAberto] = useState(false);

  return (
    <div
      data-testid="fila-card"
      className={cn(
        "animate-slide-fade motion-reduce:animate-none rounded-lg border border-l-4 bg-card p-3 transition-shadow hover:shadow-elev-2",
        ACCENT[item.bucket],
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", TIER_DOT[item.tier])}
              title={`Prioridade ${item.tier} · score ${item.score}`}
            />
            <span className="truncate text-sm font-semibold">{l.nome}</span>
            <TemperatureChip temperatura={l.temperatura} size="sm" pulse={false} />
            <Badge variant="outline" className="font-normal">
              {leadStatusLabel(l.status)}
            </Badge>
            {/* O projeto de interesse sempre que existir: é o que o corretor
                precisa lembrar antes de ligar. */}
            {l.projeto_nome && (
              <Badge variant="secondary" className="gap-1 font-normal" title="Projeto de interesse">
                <Buildings className="h-3 w-3" />
                {l.projeto_nome}
              </Badge>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {item.motivo}
            {item.diasParado !== null && item.diasParado >= 1 && (
              <span> · {item.diasParado} dia(s) sem movimento</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <ClockCountdown className="h-3.5 w-3.5 shrink-0" />
            <span>
              Próximo passo: <ProximoPasso item={item} />
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {item.agendamentoId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-success hover:bg-success/10"
              title="Confirmar a visita agendada"
              onClick={() => onConfirmarVisita(item)}
            >
              <CalendarCheck className="h-4 w-4" />
              Confirmar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2"
            aria-expanded={resumoAberto}
            title="Resumo da Sami e histórico do lead, sem sair da fila"
            onClick={() => setResumoAberto((v) => !v)}
          >
            <SamiMark className="h-4 w-4" />
            Resumo
            <CaretDown
              className={cn("h-3 w-3 transition-transform", resumoAberto && "rotate-180")}
            />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-success hover:bg-success/10"
            title="WhatsApp — abre com o script certo para o momento"
            onClick={() => onWhatsApp(item)}
          >
            <WhatsappLogo className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-info hover:bg-info/10"
            title="Ligar"
            onClick={() => onLigar(item)}
          >
            <Phone className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-primary hover:bg-primary/10"
            title="Registrar contato e marcar o próximo follow-up"
            onClick={() => onRegistrarContato(item)}
          >
            <PhoneCall className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:bg-primary/10"
            title="Registrar com a Sami — conte o que rolou e ela prepara o registro"
            onClick={() =>
              abrirSamiQ({
                leadId: l.id,
                leadNome: l.nome,
                texto: textoRegistrarComSami(l.nome),
                origem: "fila-unica",
              })
            }
          >
            <SamiMark className="h-4 w-4" />
          </Button>
          <LeadStageMenu
            lead={{ id: l.id, nome: l.nome, status: l.status }}
            onPickDirect={(target) => onEtapaDirect(item, target)}
            onPickModal={(modal, target) => onEtapaModal(item, modal, target)}
            onPickPerdido={() => onEtapaPerdido(item)}
            triggerClassName="h-7 w-7 text-muted-foreground hover:bg-muted"
          />
        </div>
      </div>

      {/* Resumo: a leitura da Sami (gerada sob demanda, cacheada por lead) e a
          porta do histórico completo. Monta só quando aberto — nada custa IA
          nem consulta sem o corretor pedir. */}
      {resumoAberto && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <ResumoIA leadId={l.id} />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {l.renda_informada && <span>Renda: {l.renda_informada}</span>}
            {l.usa_fgts !== null && <span>· FGTS: {l.usa_fgts ? "sim" : "não"}</span>}
            {l.entrada_disponivel && <span>· Entrada: {l.entrada_disponivel}</span>}
            {l.origem && <span>· Origem: {l.origem}</span>}
            <Button
              size="sm"
              variant="link"
              className="h-auto px-0 text-xs"
              onClick={() => onHistorico(item)}
            >
              Ver histórico completo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

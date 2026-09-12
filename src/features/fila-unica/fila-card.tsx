// Card de um lead na Fila Única — apresentação pura (recebe callbacks, nunca
// consulta o banco). Desenho do mockup aprovado, celular primeiro: quem é e
// há quanto tempo está parado (o número grande à direita é a chave de ordem
// do fundo do funil), em que etapa e projeto está, POR QUE está na fila, qual
// é o próximo passo e o prazo dele, e quatro botões de polegar — Ligar,
// WhatsApp, Resumo e Registrar. O que é raro (Sami, mudar etapa) fica no "⋯"
// do canto; a visita a confirmar ganha um botão inteiro, porque é o motivo
// do card.

import { useState, type MouseEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { SamiMark } from "@/components/ui/sami-mark";
import { LeadStageMenuItems } from "@/components/lead-stage-menu";
import { ResumoIA } from "@/components/resumo-ia";
import { abrirSamiQ, textoRegistrarComSami } from "@/components/samiq/abrir-samiq";
import { cn } from "@/lib/utils";
import {
  LEAD_STATUS_BADGE_TONE,
  leadStatusLabel,
  type LeadStatus,
  type StageModal,
} from "@/lib/leads";
import { TIER_DOT } from "@/lib/priority";
import { formatDuration } from "@/lib/duracao";
import { formatRelativeTime } from "@/lib/interacoes";
import {
  Buildings,
  CalendarCheck,
  CaretDown,
  CircleNotch,
  ClockCountdown,
  DotsThree,
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
  /** O discador está em chamada (é um por corretor: trava o Ligar de todos). */
  ligando?: boolean;
  /** A confirmação DESTA visita está em voo. */
  confirmando?: boolean;
  /** Índice na lista — só para a cascata de entrada. */
  index?: number;
  /** Relógio injetável (testes). */
  agora?: Date;
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

/** O número grande do card: o que está em jogo. No fundo do funil e nos
 *  demais baldes, dias sem movimento (a chave de ordem); no SLA, há quanto
 *  tempo o lead chegou. Sem data conhecida, diz isso — nunca inventa. */
function EmJogo({ item, agora }: { item: FilaUnicaItem; agora: Date }) {
  if (item.bucket === "sla") {
    const chegada = item.lead.created_at ? formatRelativeTime(item.lead.created_at, agora) : null;
    return (
      <div className="shrink-0 text-right">
        <div className="font-display text-base font-semibold leading-none text-warning">
          {chegada ? chegada.replace(/^há /, "") : "—"}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">na mesa</div>
      </div>
    );
  }
  const dias = item.diasParado;
  const critico = dias === null || dias >= 5;
  return (
    <div className="shrink-0 text-right" title="Dias sem movimento (interação ou contato)">
      <div
        className={cn(
          "font-display text-base font-semibold leading-none tabular-nums",
          critico ? "text-destructive" : "text-foreground",
        )}
      >
        {dias === null ? "—" : `${dias} d`}
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">
        {dias === null ? "sem data" : dias === 0 ? "hoje" : "parado"}
      </div>
    </div>
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
  ligando = false,
  confirmando = false,
  index = 0,
  agora,
}: FilaCardProps) {
  const l = item.lead;
  const [resumoAberto, setResumoAberto] = useState(false);
  const relogio = agora ?? new Date();

  // Clique no corpo do card abre o histórico (peek), como a linha de Atender.
  // Botões, links e menus (o "⋯" é portaled: o alvo nem está dentro do card
  // no DOM) e o painel do Resumo — onde o corretor seleciona texto — ficam
  // de fora.
  const abrirPeek = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target)) return;
    if (target.closest("a,button,input,[data-peek-ignore]")) return;
    onHistorico(item);
  };

  // Alvo de 44 px no celular (identidade v3, decisão 16); 32 px no desktop.
  // Abaixo de `sm` os botões vão sem ícone e a 12 px, como no mockup: quatro
  // rótulos lado a lado cabem em 360 px; com ícone, não.
  const acao =
    "h-11 min-w-0 gap-1.5 px-1.5 text-xs font-semibold sm:px-2 sm:text-[13px] md:h-8 md:px-2.5 md:text-xs md:font-medium";
  const icone = "hidden h-4 w-4 sm:inline";

  return (
    <div
      data-testid="fila-card"
      onClick={abrirPeek}
      className={cn(
        "animate-slide-fade motion-reduce:animate-none grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 rounded-xl border border-l-4 bg-card p-3 transition-colors hover:bg-accent/40 md:gap-x-4",
        ACCENT[item.bucket],
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      {/* Quem é, por quê, próximo passo. No desktop ocupa as duas linhas da
          coluna da esquerda; à direita, em cima o número e o "⋯", embaixo as
          ações — a coluna lateral do mockup. */}
      <div className="min-w-0 md:row-span-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", TIER_DOT[item.tier])}
            title={`Prioridade ${item.tier} · score ${item.score}`}
          />
          <span className="truncate text-[15px] font-semibold md:text-sm">{l.nome}</span>
          <TemperatureChip temperatura={l.temperatura} size="sm" pulse={false} />
        </div>
        <div className="mt-1 text-[13px] leading-snug text-muted-foreground md:text-xs">
          <Badge
            variant="secondary"
            className={cn(
              "mr-1 align-middle px-1.5 py-0 text-[10.5px] font-semibold",
              LEAD_STATUS_BADGE_TONE[l.status as LeadStatus],
            )}
          >
            {leadStatusLabel(l.status)}
          </Badge>
          {/* O projeto de interesse sempre que existir: é o que o corretor
              precisa lembrar antes de ligar. */}
          {l.projeto_nome && (
            <>
              <span
                className="inline-flex items-center gap-1 whitespace-nowrap align-middle"
                title="Projeto de interesse"
              >
                <Buildings className="h-3 w-3 shrink-0" />
                {l.projeto_nome}
              </span>
              {" · "}
            </>
          )}
          <span className="align-middle">{item.motivo}</span>
        </div>
        <div className="mt-1 flex items-start gap-1 text-[12.5px] text-muted-foreground md:text-xs">
          <ClockCountdown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Próximo passo: <ProximoPasso item={item} />
          </span>
        </div>
      </div>

      <div className="flex items-start gap-1 md:justify-self-end">
        <EmJogo item={item} agora={relogio} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="-mr-2 -mt-1.5 h-9 w-9 px-0 text-muted-foreground"
              aria-label="Mais ações: Sami e etapa do lead"
              title="Mais ações"
            >
              <DotsThree className="h-5 w-5" weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onSelect={() =>
                abrirSamiQ({
                  leadId: l.id,
                  leadNome: l.nome,
                  texto: textoRegistrarComSami(l.nome),
                  origem: "fila-unica",
                })
              }
            >
              <SamiMark className="h-4 w-4" />
              Registrar com a Sami
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <LeadStageMenuItems
              lead={{ id: l.id, nome: l.nome, status: l.status }}
              onPickDirect={(target) => onEtapaDirect(item, target)}
              onPickModal={(modal, target) => onEtapaModal(item, modal, target)}
              onPickPerdido={() => onEtapaPerdido(item)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Ações: quatro botões de polegar no celular; no desktop a mesma fila,
          compacta, no pé da coluna da direita. A visita a confirmar vem
          antes, inteira — é o motivo do card. */}
      <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1 md:col-start-2 md:items-end md:self-end">
        {item.agendamentoId && (
          <Button
            size="sm"
            variant="outline"
            className={cn(
              acao,
              "w-full border-success/40 text-success hover:bg-success/10 md:w-auto",
            )}
            title="Confirmar a visita agendada"
            loading={confirmando}
            onClick={() => onConfirmarVisita(item)}
          >
            <CalendarCheck className="h-4 w-4" />
            Confirmar visita
            {item.visitaEm && (
              <span className="font-normal text-muted-foreground">
                {new Date(item.visitaEm).toLocaleString("pt-BR", {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </Button>
        )}
        <div className="grid grid-cols-[1fr_1fr_1.3fr_1.3fr] gap-1.5 md:flex md:justify-end">
          <Button
            size="sm"
            variant="outline"
            className={cn(acao, "text-info")}
            title={ligando ? "Discando…" : "Ligar"}
            disabled={ligando}
            aria-busy={ligando || undefined}
            onClick={() => onLigar(item)}
          >
            {ligando ? (
              <CircleNotch aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className={icone} />
            )}
            <span className="truncate">Ligar</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn(acao, "text-success")}
            title="WhatsApp — abre com o script certo para o momento"
            onClick={() => onWhatsApp(item)}
          >
            <WhatsappLogo className={icone} />
            <span className="truncate sm:hidden">Zap</span>
            <span className="hidden truncate sm:inline">WhatsApp</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={acao}
            aria-expanded={resumoAberto}
            title="Resumo da Sami e histórico do lead, sem sair da fila"
            onClick={() => setResumoAberto((v) => !v)}
          >
            <SamiMark className={icone} />
            <span className="truncate">Resumo</span>
            <CaretDown
              className={cn(
                "hidden h-3 w-3 transition-transform sm:inline",
                resumoAberto && "rotate-180",
              )}
            />
          </Button>
          <Button
            size="sm"
            className={acao}
            title="Registrar contato e marcar o próximo follow-up"
            onClick={() => onRegistrarContato(item)}
          >
            <PhoneCall className={icone} />
            <span className="truncate">Registrar</span>
          </Button>
        </div>
      </div>

      {/* Resumo: a leitura da Sami (gerada sob demanda, cacheada por lead) e a
          porta do histórico completo. Monta só quando aberto — nada custa IA
          nem consulta sem o corretor pedir. */}
      {resumoAberto && (
        <div className="col-span-2 space-y-2 border-t pt-3" data-peek-ignore>
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

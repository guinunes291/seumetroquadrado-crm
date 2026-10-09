// Próximo lead da base escolhida — o card da direita da Prospecção na
// identidade Lançamento (como no vídeo de lançamento): quem é, o que se sabe
// dele e as três ações do primeiro contato, sem abrir nada. Para trabalhar a
// fila inteira, um por um com J/K, o Modo Foco abre a partir daqui.
//
// Nenhuma escrita nova: ligar é o useLigarLead (3C Plus com recuo para o
// tel:), WhatsApp é o useWhatsAppLead e registrar é o RegistrarContatoDialog —
// os mesmos caminhos da Fila Única e do Modo Foco. Os atalhos W/L/R/F valem só
// com o card visível, fora de campos de texto, sem diálogo aberto e com o Modo
// Foco fechado (lá dentro ele tem os próprios W/L/R — duas escutas disparariam
// a ação duas vezes).

import { useEffect, useState } from "react";
import { ArrowRight, Crosshair } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import { useLigarLead } from "@/hooks/use-ligar-lead";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { formatRelativeTime } from "@/lib/interacoes";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads";
import { origemLabel } from "@/lib/origem";
import { isTypingTarget } from "@/lib/shortcuts";
import { useLeadDetail, type LeadDetail } from "@/features/leads/use-lead-detail";

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {rotulo}
      </div>
      <div className="mt-0.5 truncate text-[15px] font-semibold">{valor}</div>
    </div>
  );
}

/** "lead novo · há 4 min" quando ninguém falou com ele ainda. */
export function ultimoContato(lead: Pick<LeadDetail, "ultima_interacao" | "created_at">): string {
  if (lead.ultima_interacao) return formatRelativeTime(lead.ultima_interacao);
  return `lead novo · ${formatRelativeTime(lead.created_at)}`;
}

function fgts(v: boolean | null): string {
  return v == null ? "—" : v ? "Sim" : "Não";
}

export function ProximoLeadCard({
  leadId,
  posicao,
  total,
  focoAberto,
  onAbrirFoco,
  onTrabalhado,
}: {
  leadId: string;
  /** 1 = o primeiro da fila da base. */
  posicao: number;
  total: number;
  /** Com o Modo Foco aberto, os atalhos daqui se calam. */
  focoAberto: boolean;
  onAbrirFoco: () => void;
  /** Contato registrado: a base pode ter mudado (o lead anda de etapa). */
  onTrabalhado: () => void;
}) {
  const { lead } = useLeadDetail(leadId);
  const { ligar, discando } = useLigarLead();
  const abrirWhatsApp = useWhatsAppLead();
  const [contatoOpen, setContatoOpen] = useState(false);
  const l = lead.data;

  useEffect(() => {
    if (!l || focoAberto || contatoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      // Um diálogo de outra parte da tela (⌘K, Novo lead…) também cala o card.
      if (document.querySelector("[role='dialog']")) return;
      const k = e.key.toLowerCase();
      if (k === "w") abrirWhatsApp(l);
      else if (k === "l") ligar(l);
      else if (k === "r") setContatoOpen(true);
      else if (k === "f") onAbrirFoco();
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [l, focoAberto, contatoOpen, abrirWhatsApp, ligar, onAbrirFoco]);

  if (lead.isError) {
    return (
      <QueryErrorState
        title="Não foi possível carregar o próximo lead."
        error={lead.error}
        onRetry={() => void lead.refetch()}
      />
    );
  }
  if (!l) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  const etapa = LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status.replace(/_/g, " ");

  return (
    <article aria-label={`Próximo lead: ${l.nome}`} className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <TemperatureChip temperatura={l.temperatura} />
        <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-800 dark:bg-gold-500/15 dark:text-gold-300">
          {etapa}
        </span>
        <span className="ml-auto text-xs font-medium tabular-nums text-muted-foreground">
          {posicao} de {total}
        </span>
      </div>

      <h2 className="mt-4 truncate font-display text-3xl font-bold tracking-tight">{l.nome}</h2>

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Campo rotulo="Empreendimento" valor={l.projeto_nome ?? "—"} />
        <Campo rotulo="Origem" valor={origemLabel(l.origem)} />
        <Campo rotulo="Renda" valor={l.renda_informada ?? "—"} />
        <Campo rotulo="FGTS" valor={fgts(l.usa_fgts)} />
        <Campo rotulo="Entrada" valor={l.entrada_disponivel ?? "—"} />
        <Campo rotulo="Último contato" valor={ultimoContato(l)} />
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
        <Button
          onClick={() => ligar(l)}
          disabled={discando}
          className="bg-success text-success-foreground hover:bg-success/90"
        >
          {discando ? "Chamando…" : "Ligar"}
          <Kbd className="hidden border-claro/30 bg-claro/15 text-claro md:inline-flex">L</Kbd>
        </Button>
        <Button variant="outline" onClick={() => abrirWhatsApp(l)}>
          WhatsApp
          <Kbd className="hidden md:inline-flex">W</Kbd>
        </Button>
        <Button variant="outline" onClick={() => setContatoOpen(true)}>
          Registrar contato
          <Kbd className="hidden md:inline-flex">R</Kbd>
        </Button>
        <Button variant="ghost" className="ml-auto text-primary" onClick={onAbrirFoco}>
          <Crosshair className="h-4 w-4" />
          Trabalhar a fila
          <Kbd className="hidden md:inline-flex">F</Kbd>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <RegistrarContatoDialog
        open={contatoOpen}
        onOpenChange={setContatoOpen}
        lead={{ id: l.id, nome: l.nome, corretor_id: l.corretor_id, status: l.status }}
        onDone={onTrabalhado}
      />
    </article>
  );
}

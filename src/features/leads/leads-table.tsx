// Tabela premium da listagem de leads — envolve o DataTable do design system
// com as MESMAS células e ações da <Table> manual que vivia em leads.index.tsx
// (TempIcon, FinanceiroPopover, TransferSlaBadge, IniciarSplitButton,
// LeadRowMenu), mais os chips de flags operacionais e a borda de intent por
// linha. O estado de erro fica na página (o Card de retry cobre também counts
// e follow-ups), por isso este componente não recebe error/onRetry — um único
// caminho de erro, sem duplicação.

import { Link } from "@tanstack/react-router";
import type { OnChangeFn } from "@tanstack/react-table";
import { Ban, MessageCircle, Phone, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableColumnHeader,
  type ColumnDef,
  type DataTableProps,
  type SortingState,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { TransferSlaBadge } from "@/components/transfer-sla-badge";
import { FLAG_META, leadFlags, leadRowIntent } from "@/lib/lead-flags";
import {
  LEAD_STATUS_BADGE_TONE,
  PROXIMA_ACAO,
  leadStatusLabel,
  type LeadStatus,
  type StageModal,
} from "@/lib/leads";
import type { Intent } from "@/lib/status-tones";
import { abrirNovoLead } from "./novo-lead-dialog";
import { TempIcon, InatividadeBadge } from "./lead-indicators";
import { FinanceiroPopover, LeadRowMenu, IniciarSplitButton } from "./row-actions";
import type { Lead } from "./types";

/**
 * Borda esquerda pela pior flag da linha — classes ESTÁTICAS mapeadas por
 * intent (interpolação dinâmica não sobreviveria ao purge do Tailwind).
 */
const ROW_INTENT_CLASS: Record<Intent, string | undefined> = {
  danger: "border-l-2 border-l-destructive/60",
  warning: "border-l-2 border-l-warning/60",
  info: "border-l-2 border-l-info/60",
  success: "border-l-2 border-l-success/60",
  neutral: undefined,
};

/** Chips compactos das flags do lead (máx. `max` + contador do excedente). */
export function FlagChips({ lead, max = 2 }: { lead: Lead; max?: number }) {
  const flags = leadFlags(lead);
  if (flags.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {flags.slice(0, max).map((f) => (
        <Badge key={f} variant="outline" className="px-1.5 py-0 text-[10px]">
          {FLAG_META[f].label}
        </Badge>
      ))}
      {flags.length > max && (
        <span className="text-[10px] text-muted-foreground">+{flags.length - max}</span>
      )}
    </span>
  );
}

type TransferInfo = {
  data_distribuicao: string | null;
  tentativas_redistribuicao: number | null;
  via_webhook: boolean;
};

export type LeadsTableProps = {
  leads: Lead[];
  loading: boolean;
  /**
   * Origem dos dados da lista. Com a v2 o servidor aplica o sort da coluna
   * (whitelist) OU a prioridade operacional; no fallback v1 o clique no
   * cabeçalho só alterna o indicador — a RPC antiga não conhece `_sort`,
   * então a ordem não muda (aceitável enquanto a migration não é aplicada).
   */
  source: "v1" | "v2";
  canManage: boolean;
  userId: string | undefined;
  corretoresMap: Map<string, string>;
  /** Map origem→timeout (useTransferTimeouts), evita 1 query por linha. */
  transferTimeouts: Map<string, number>;
  transferInfoMap: Map<string, TransferInfo>;
  lastContactType: "ligacao" | "whatsapp";
  iniciarPending: boolean;
  proximaAcaoPending: boolean;
  selected: Set<string>;
  onSelectedChange: (ids: Set<string>) => void;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  pagination?: DataTableProps<Lead>["pagination"];
  onRowClick: (lead: Lead) => void;
  onWhatsApp: (lead: Lead) => void;
  onIniciar: (lead: Lead, tipo: "ligacao" | "whatsapp") => void;
  onEscolherContato: (lead: Lead) => void;
  onProximaAcao: (lead: Lead) => void;
  onPickDirect: (lead: Lead, target: LeadStatus) => void;
  onPickModal: (lead: Lead, modal: StageModal) => void;
  onPickPerdido: (lead: Lead) => void;
  onRoleta: (lead: Lead) => void;
  onTransferir: (lead: Lead) => void;
  onLixeira: (lead: Lead) => void;
};

export function LeadsTable({
  leads,
  loading,
  canManage,
  userId,
  corretoresMap,
  transferTimeouts,
  transferInfoMap,
  lastContactType,
  iniciarPending,
  proximaAcaoPending,
  selected,
  onSelectedChange,
  sorting,
  onSortingChange,
  pagination,
  onRowClick,
  onWhatsApp,
  onIniciar,
  onEscolherContato,
  onProximaAcao,
  onPickDirect,
  onPickModal,
  onPickPerdido,
  onRoleta,
  onTransferir,
  onLixeira,
}: LeadsTableProps) {
  // Sem useMemo de propósito: os handlers chegam da página como arrows novas
  // a cada render, então a memoização nunca acertaria o cache. Os ids das
  // colunas sortáveis (nome/created_at/status) casam com a whitelist da RPC.
  const columns: ColumnDef<Lead, unknown>[] = [
    {
      accessorKey: "nome",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nome" />,
      meta: { label: "Nome" },
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div>
            <div className="flex items-center gap-2">
              <TempIcon temp={l.temperatura} />
              <Link
                to="/leads/$leadId"
                params={{ leadId: l.id }}
                className="font-medium hover:underline"
              >
                {l.nome}
              </Link>
              <FinanceiroPopover lead={l} />
            </div>
            {l.projeto_nome && (
              <div className="text-xs text-muted-foreground">{l.projeto_nome}</div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <FlagChips lead={l} />
              <InatividadeBadge lead={l} />
            </div>
          </div>
        );
      },
    },
    {
      id: "contato",
      header: "Contato",
      enableSorting: false,
      meta: { label: "Contato" },
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div className="flex items-center gap-2">
            <div className="min-w-0">
              <div className="text-sm">{l.telefone}</div>
              <div className="text-xs text-muted-foreground truncate">{l.email ?? "—"}</div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="text-success hover:text-success hover:bg-success/10"
                aria-label={`Abrir WhatsApp de ${l.nome}`}
                title="Abrir WhatsApp com mensagem pronta"
                onClick={() => onWhatsApp(l)}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button
                asChild
                size="icon"
                variant="ghost"
                className="text-info hover:text-info hover:bg-info/10"
                aria-label={`Ligar para ${l.nome}`}
                title="Ligar"
              >
                <a href={`tel:${l.telefone.replace(/\D/g, "")}`}>
                  <Phone className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "origem",
      header: "Origem",
      enableSorting: false,
      meta: { label: "Origem", hideBelow: "md" },
      cell: ({ row }) => (
        <span className="capitalize text-sm">{row.original.origem.replace(/_/g, " ")}</span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      meta: { label: "Status" },
      cell: ({ row }) => {
        const l = row.original;
        const info = transferInfoMap.get(l.id);
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge className={LEAD_STATUS_BADGE_TONE[l.status as LeadStatus]} variant="secondary">
              {leadStatusLabel(l.status)}
            </Badge>
            {info && (
              <TransferSlaBadge
                leadId={l.id}
                origem={l.origem}
                status={l.status}
                dataDistribuicao={info.data_distribuicao}
                tentativas={info.tentativas_redistribuicao}
                timeouts={transferTimeouts}
                viaWebhook={info.via_webhook}
                compact
                showBar
              />
            )}
          </div>
        );
      },
    },
    {
      id: "corretor",
      header: "Corretor",
      enableSorting: false,
      meta: { label: "Corretor", hideBelow: "lg" },
      cell: ({ row }) => {
        const l = row.original;
        return l.corretor_id ? (
          <span className="text-sm">{corretoresMap.get(l.corretor_id) ?? "—"}</span>
        ) : (
          <span className="text-sm text-muted-foreground italic">sem corretor</span>
        );
      },
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Data" />,
      meta: { label: "Data", hideBelow: "sm" },
      cell: ({ row }) => {
        const l = row.original;
        return (
          <span className="text-xs text-muted-foreground">
            {l.status === "contrato_fechado" && l.data_venda
              ? new Date(`${l.data_venda}T00:00:00`).toLocaleDateString("pt-BR")
              : new Date(l.created_at).toLocaleDateString("pt-BR")}
          </span>
        );
      },
    },
    {
      id: "acoes",
      header: "Ações",
      enableSorting: false,
      enableHiding: false,
      meta: { label: "Ações", align: "right" },
      cell: ({ row }) => {
        const l = row.original;
        const canAct = canManage || l.corretor_id === userId;
        const proxima = PROXIMA_ACAO[l.status as LeadStatus];
        return (
          <div className="flex items-center justify-end gap-1" data-no-row-click>
            {!l.na_lixeira && l.status === "aguardando_atendimento" && canAct && (
              <IniciarSplitButton
                lead={l}
                lastContactType={lastContactType}
                pending={iniciarPending}
                onIniciar={onIniciar}
                onEscolher={onEscolherContato}
              />
            )}
            {!l.na_lixeira && canAct && l.status !== "aguardando_atendimento" && proxima && (
              <Button
                size="sm"
                variant="outline"
                disabled={proximaAcaoPending}
                onClick={() => onProximaAcao(l)}
              >
                {proxima.label}
              </Button>
            )}
            <LeadRowMenu
              lead={l}
              canManage={canManage}
              canAct={canAct}
              onPickDirect={(target) => onPickDirect(l, target)}
              onPickModal={(modal) => onPickModal(l, modal)}
              onPickPerdido={() => onPickPerdido(l)}
              onRoleta={() => onRoleta(l)}
              onTransferir={() => onTransferir(l)}
              onLixeira={() => onLixeira(l)}
            />
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      tableId="leads"
      aria-label="Leads"
      columns={columns}
      data={leads}
      loading={loading}
      enableSelection
      selected={selected}
      onSelectedChange={onSelectedChange}
      manualSorting
      sorting={sorting}
      onSortingChange={onSortingChange}
      pagination={pagination}
      onRowClick={onRowClick}
      rowClassName={(l) => {
        const intent = leadRowIntent(leadFlags(l));
        return intent ? ROW_INTENT_CLASS[intent] : undefined;
      }}
      empty={
        <EmptyState
          icon={UserPlus}
          title="Nenhum lead encontrado"
          description="Ajuste os filtros ou cadastre um novo lead."
          action={
            <Button size="sm" onClick={abrirNovoLead}>
              <UserPlus className="h-4 w-4 mr-1" /> Novo lead
            </Button>
          }
        />
      }
    />
  );
}

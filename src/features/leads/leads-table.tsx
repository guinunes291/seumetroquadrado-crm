// Tabela premium da listagem de leads — envolve o DataTable do design system
// com as MESMAS células e ações da <Table> manual que vivia em leads.index.tsx
// (TempIcon, FinanceiroPopover, TransferSlaBadge, IniciarSplitButton,
// LeadRowMenu), mais os chips de flags operacionais e a borda de intent por
// linha. O estado de erro fica na página (o Card de retry cobre também counts
// e follow-ups), por isso este componente não recebe error/onRetry — um único
// caminho de erro, sem duplicação.

import { Link } from "@tanstack/react-router";
import type { OnChangeFn } from "@tanstack/react-table";
import { MessageCircle, Phone, Thermometer, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableColumnHeader,
  type ColumnDef,
  type DataTableProps,
  type SortingState,
} from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreRing } from "@/components/ui/score-ring";
import { TransferSlaBadge } from "@/components/transfer-sla-badge";
import { FLAG_META, leadFlags, leadFlagsDetalhadas, leadRowIntent } from "@/lib/lead-flags";
import { formatRelativeTime } from "@/lib/interacoes";
import { scoreLead, TIER_LABEL } from "@/lib/priority";
import {
  LEAD_STATUS_BADGE_TONE,
  PROXIMA_ACAO,
  leadStatusLabel,
  type LeadStatus,
  type StageModal,
} from "@/lib/leads";
import type { Intent } from "@/lib/status-tones";
import { abrirNovoLead } from "./novo-lead-dialog";
import { TempIcon } from "./lead-indicators";
import { FinanceiroPopover, LeadRowMenu, IniciarSplitButton } from "./row-actions";
import type { Lead } from "./types";
import { origemLabel } from "@/lib/origem";

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

/** Chips compactos das flags do lead (máx. `max` + contador do excedente).
 *  Os rótulos vêm de leadFlagsDetalhadas (régua única, com dias embutidos:
 *  "Parado · 12d"); o "+N" ganha title com as flags escondidas. */
export function FlagChips({ lead, max = 2 }: { lead: Lead; max?: number }) {
  const flags = leadFlagsDetalhadas(lead);
  if (flags.length === 0) return null;
  const escondidas = flags.slice(max);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {flags.slice(0, max).map((f) => (
        <Badge key={f.flag} variant="outline" className="px-1.5 py-0 text-[10px]">
          {f.label}
        </Badge>
      ))}
      {escondidas.length > 0 && (
        <span
          className="text-[10px] text-muted-foreground"
          title={escondidas.map((f) => f.label).join(", ")}
        >
          +{escondidas.length}
        </span>
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
   * Origem dos dados da lista. Com v2/v3/v4 o servidor aplica o sort da coluna
   * (whitelist) OU a prioridade operacional; no fallback v1 a RPC antiga não
   * conhece `_sort`, então o sort é DESABILITADO nos cabeçalhos (antes o
   * indicador alternava sem reordenar). O sort por score exige v3+.
   */
  source: "v1" | "v2" | "v3" | "v4" | "v5";
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
  /** Troca de temperatura em 1 clique (chip clicável na célula Nome). */
  onSetTemperatura: (lead: Lead, temp: "quente" | "morno" | "frio") => void;
  /** Item "Focar a partir daqui" do menu da linha (modo foco com startId). */
  onFocar: (lead: Lead) => void;
  /** Item "+ Follow-up" do menu da linha (reusa o diálogo de follow-up). */
  onFollowup: (lead: Lead) => void;
};

export function LeadsTable({
  leads,
  loading,
  source,
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
  onSetTemperatura,
  onFocar,
  onFollowup,
}: LeadsTableProps) {
  // No fallback v1 a RPC não conhece `_sort`: clicar no cabeçalho mudaria só o
  // indicador, sem reordenar — melhor não oferecer o affordance do que mentir.
  const sortable = source !== "v1";
  // O sort por score só existe a partir da v3; na v2 o clique cairia na ordem padrão.
  const sortableScore = source === "v3" || source === "v4";
  // Sem useMemo de propósito: os handlers chegam da página como arrows novas
  // a cada render, então a memoização nunca acertaria o cache. Os ids das
  // colunas sortáveis casam com a whitelist da RPC (v3).
  // Colunas AGRUPADAS de propósito (sem scroll lateral): o bloco "Lead" reúne
  // identidade + contato + flags; origem vira legenda do Status; a data vira
  // legenda do Corretor; e-mail fica no popover $ (Resumo do lead). Antes eram
  // 10 colunas e as ações só apareciam rolando para o lado.
  const columns: ColumnDef<Lead, unknown>[] = [
    {
      accessorKey: "nome",
      header: ({ column }) =>
        sortable ? <DataTableColumnHeader column={column} title="Lead" /> : <>Lead</>,
      enableSorting: sortable,
      meta: { label: "Lead" },
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div className="min-w-0 max-w-[340px]">
            <div className="flex items-center gap-1.5">
              {/* Temperatura clicável: 1 clique para requalificar sem abrir o lead. */}
              <span data-no-row-click>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
                      aria-label={`Mudar temperatura de ${l.nome}`}
                      title="Mudar temperatura"
                    >
                      {l.temperatura ? (
                        <TempIcon temp={l.temperatura} />
                      ) : (
                        // Sem temperatura ainda: ícone apagado como convite a definir.
                        <Thermometer
                          className="h-3.5 w-3.5 text-muted-foreground/50"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {(
                      [
                        { key: "quente", label: "🔥 Quente" },
                        { key: "morno", label: "🌡️ Morno" },
                        { key: "frio", label: "❄️ Frio" },
                      ] as const
                    ).map((opt) => (
                      <DropdownMenuItem
                        key={opt.key}
                        disabled={l.temperatura === opt.key}
                        onSelect={() => onSetTemperatura(l, opt.key)}
                      >
                        {opt.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
              <Link
                to="/leads/$leadId"
                params={{ leadId: l.id }}
                className="min-w-0 truncate font-medium hover:underline"
              >
                {l.nome}
              </Link>
              <FinanceiroPopover lead={l} />
              <span className="flex items-center" data-no-row-click>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-success hover:text-success hover:bg-success/10"
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
                  className="h-7 w-7 text-info hover:text-info hover:bg-info/10"
                  aria-label={`Ligar para ${l.nome}`}
                  title="Ligar"
                >
                  <a href={`tel:${l.telefone.replace(/\D/g, "")}`}>
                    <Phone className="h-4 w-4" />
                  </a>
                </Button>
              </span>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {l.telefone}
              {l.projeto_nome ? ` · ${l.projeto_nome}` : ""}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <FlagChips lead={l} />
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) =>
        sortable ? <DataTableColumnHeader column={column} title="Status" /> : <>Status</>,
      enableSorting: sortable,
      meta: { label: "Status" },
      cell: ({ row }) => {
        const l = row.original;
        const info = transferInfoMap.get(l.id);
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge className={LEAD_STATUS_BADGE_TONE[l.status as LeadStatus]} variant="secondary">
              {leadStatusLabel(l.status)}
            </Badge>
            <span className="text-[11px] capitalize text-muted-foreground">
              {origemLabel(l.origem)}
            </span>
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
      // Score de prioridade 0-100 — na v3 vem do servidor (com componente de
      // SLA); nos fallbacks é calculado no cliente (sem SLA) só para exibição.
      id: "score",
      header: ({ column }) =>
        sortableScore ? (
          <DataTableColumnHeader column={column} title="Prioridade" />
        ) : (
          <>Prioridade</>
        ),
      enableSorting: sortableScore,
      meta: { label: "Prioridade", hideBelow: "sm" },
      cell: ({ row }) => {
        const l = row.original;
        const client = scoreLead({
          temperatura: l.temperatura,
          status: l.status,
          ultimaInteracao: l.ultima_interacao,
        });
        const valor = typeof l.score === "number" ? l.score : client.score;
        const tier = valor >= 60 ? "alta" : valor >= 35 ? "media" : "baixa";
        const intent = tier === "alta" ? "danger" : tier === "media" ? "warning" : "neutral";
        return (
          <ScoreRing
            value={valor}
            size={32}
            strokeWidth={3}
            intent={intent}
            title={`Prioridade ${TIER_LABEL[tier]} (${valor}) — ${client.motivo}`}
          />
        );
      },
    },
    {
      accessorKey: "ultima_interacao",
      header: ({ column }) =>
        sortable ? (
          <DataTableColumnHeader column={column} title="Último contato" />
        ) : (
          <>Último contato</>
        ),
      enableSorting: sortable,
      meta: { label: "Último contato", hideBelow: "md" },
      cell: ({ row }) => {
        const l = row.original;
        return l.ultima_interacao ? (
          <span
            className="text-xs text-muted-foreground"
            title={new Date(l.ultima_interacao).toLocaleString("pt-BR")}
          >
            {formatRelativeTime(l.ultima_interacao)}
          </span>
        ) : (
          <span className="text-xs italic text-muted-foreground">nunca</span>
        );
      },
    },
    {
      // Corretor + data (criação, ou assinatura na Venda) num bloco só. O sort
      // por created_at saiu do cabeçalho: recência já é o desempate da ordem
      // padrão e o recorte temporal tem o filtro de período.
      id: "corretor",
      header: "Corretor",
      enableSorting: false,
      meta: { label: "Corretor", hideBelow: "lg" },
      cell: ({ row }) => {
        const l = row.original;
        const data =
          l.status === "contrato_fechado" && l.data_venda
            ? new Date(`${l.data_venda}T00:00:00`).toLocaleDateString("pt-BR")
            : new Date(l.created_at).toLocaleDateString("pt-BR");
        return (
          <div className="min-w-0">
            {l.corretor_id ? (
              <div className="truncate text-sm">{corretoresMap.get(l.corretor_id) ?? "—"}</div>
            ) : (
              <div className="text-sm italic text-muted-foreground">sem corretor</div>
            )}
            <div
              className="text-[11px] text-muted-foreground"
              title={
                l.status === "contrato_fechado" && l.data_venda ? "Data da venda" : "Criado em"
              }
            >
              {data}
            </div>
          </div>
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
                compact
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
            {/* "Descartar" vive só no menu ⋯ ("Marcar como perdido") — o botão
                Ban duplicado saiu para reduzir ruído na linha. */}
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
              onFocar={canAct && !l.na_lixeira ? () => onFocar(l) : undefined}
              onFollowup={canAct && !l.na_lixeira ? () => onFollowup(l) : undefined}
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

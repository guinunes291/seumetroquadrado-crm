import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { usePointerDnd } from "@/features/pipeline/use-pointer-dnd";
import { formatVgvCompact } from "@/features/pipeline/stage-metrics";
import { ResumoDoFunil } from "@/features/pipeline/resumo-do-funil";
import {
  LEAD_STATUS_LABEL,
  MOTIVO_SAIDA_NAO_OFERECIDA,
  PROXIMA_ACAO,
  motivoTransicaoBloqueada,
  resolveStageAction,
  saidaOferecida,
  transicaoLeadPermitida,
  type LeadStatus,
} from "@/lib/leads";
import { useUserRoles } from "@/hooks/use-auth";
import { useEmAtendimentoContador } from "@/features/em-atendimento/use-em-atendimento";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import type { StageModalState, PerdidoState } from "@/components/lead-stage/lead-stage-modals";
import { useDebounce } from "@/hooks/use-debounce";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Lead } from "@/features/pipeline/queries";
import { ALL_COLUMNS, agruparPorColuna } from "@/features/pipeline/kanban-board-utils";
import { useColunasRecolhidas } from "@/features/pipeline/use-colunas-recolhidas";
import { useKanbanDados } from "@/features/pipeline/use-kanban-dados";
import { useKanbanMetricas } from "@/features/pipeline/use-kanban-metricas";
import { KanbanLeadCard } from "@/features/pipeline/kanban-lead-card";
import { KanbanColuna, KanbanColunaRecolhida } from "@/features/pipeline/kanban-coluna";
import { KanbanAbasMobile, KanbanBuscaEVgv } from "@/features/pipeline/kanban-topo";
import { KanbanEstados } from "@/features/pipeline/kanban-estados";
import { KanbanDialogos } from "@/features/pipeline/kanban-dialogos";

// Desde a quebra em módulos (2026-10): dados em features/pipeline/queries.ts e
// use-kanban-dados.ts, números do snapshot em use-kanban-metricas.ts, cartão em
// kanban-lead-card.tsx, coluna em kanban-coluna.tsx, topo em kanban-topo.tsx e
// estados de erro/carregando/vazio em kanban-estados.tsx; diálogos em
// kanban-dialogos.tsx.

type KanbanBoardProps = {
  /** Semeia a busca interna no mount (o input continua editável). */
  initialSearch?: string;
  /** uuid do corretor para filtrar o quadro; "all"/"unassigned" são ignorados. */
  corretorId?: string;
  /** Subconjunto de colunas (ex.: fase do funil); ausente = quadro completo. */
  stages?: LeadStatus[];
  /**
   * Busca controlada por quem monta o quadro: o /pipeline põe o campo na linha
   * das abas (padrão Lançamento). Quando vem, o quadro não desenha o próprio
   * campo — sem ela (pílula Kanban de /leads), o campo continua aqui dentro.
   */
  busca?: string;
  /**
   * Os quatro números do topo (VGV no funil · follow-ups vencidos · sem
   * próxima ação · parados 7+ dias), somados do snapshot que o quadro já
   * carrega. Opt-in: é o topo do /pipeline; a pílula de /leads não muda.
   */
  resumo?: boolean;
};

/**
 * Quadro Kanban dos leads. Extraído da antiga rota `/kanban` para ser usado como
 * uma das visões (toggle Lista/Kanban) dentro de `/leads` — consolidação Fase 1.
 * A rota `/kanban` permanece como redirect de compatibilidade.
 */
export function KanbanBoard({
  initialSearch,
  corretorId,
  stages,
  busca,
  resumo = false,
}: KanbanBoardProps = {}) {
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;
  const [search, setSearch] = useState(initialSearch ?? "");
  const debouncedSearch = useDebounce((busca ?? search).trim(), 300);
  // Filtrar ALL_COLUMNS (e não mapear o prop) preserva a ordem canônica do
  // funil independente da ordem em que `stages` chegar.
  const columns = useMemo(
    () => (stages ? ALL_COLUMNS.filter((c) => stages.includes(c.id)) : ALL_COLUMNS),
    [stages],
  );
  const [mobileStage, setMobileStage] = useState<LeadStatus>(columns[0].id);
  // O mobileStage salvo pode apontar para coluna fora da fase (fase trocada
  // com o componente montado, ou default antigo) — deriva no render em vez de
  // forçar setState.
  const mobileStageAtual = columns.some((c) => c.id === mobileStage) ? mobileStage : columns[0].id;
  const [announcement, setAnnouncement] = useState("");
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const abrirWhatsApp = useWhatsAppLead();
  const [peekLead, setPeekLead] = useState<Lead | null>(null);
  const { colapsadas, toggleColapso } = useColunasRecolhidas(setAnnouncement);

  // Filtro de corretor: pipeline_stage_page_v2 E os snapshots v2/v3 aceitam
  // `_corretor_id` (migrations 20260711124000_scale_read_models_v2.sql e
  // 20260715100000_pipeline_snapshot_v3.sql), então cards e contadores das
  // colunas filtram JUNTOS — sem divergência entre badge e coluna.
  const corretorFiltro =
    corretorId && corretorId !== "all" && corretorId !== "unassigned" ? corretorId : undefined;

  const {
    extraPages,
    setExtraPages,
    loadingMore,
    corretoresMap,
    snapshotQuery,
    initialPages,
    leads,
    leadsLoading,
    leadsError,
    refetchLeads,
    loadMore,
    slaMap,
    transferTimeouts,
  } = useKanbanDados(columns, debouncedSearch, corretorFiltro);

  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);
  // "Registrar contato" a partir do Kanban: soltar na coluna Em atendimento,
  // o botão inteligente e "Cliente respondeu…" no menu (regra dos 65, Fatia 3a.2).
  const [contatoLead, setContatoLead] = useState<Lead | null>(null);

  // Regra dos 65: a coluna Em atendimento do corretor mostra "N/65". Para
  // contas sem o papel (gestão olhando a casa) o banco devolve corretor=false
  // e a coluna fica como sempre.
  const contador65 = useEmAtendimentoContador();
  const teto65 = contador65.data?.corretor ? contador65.data.teto : null;
  // O numerador é a ocupação do banco (a mesma da trava), não a contagem da
  // coluna: com busca ativa a coluna mostra só os que casam com o texto, e
  // "1/65" para quem está lotado seria mentira (revisão).
  const ocupacao65 = contador65.data?.corretor ? contador65.data.em_atendimento : null;

  const updateStatus = useLeadStatusMutation({
    invalidateKeys: [["pipeline-stage-v2"], ["pipeline-snapshot-v2"]],
    onSuccess: (vars) => {
      setExtraPages({});
      const nome = leads.find((lead) => lead.id === vars.id)?.nome ?? "Lead";
      setAnnouncement(`${nome} movido para ${LEAD_STATUS_LABEL[vars.status]}.`);
    },
  });

  // Roteia a etapa escolhida (no menu ou ao arrastar): direta, modal ou perdido.
  // O drag permite soltar em qualquer coluna; aqui validamos contra a máquina
  // de estados do banco e explicamos o bloqueio — antes, a RPC rejeitava e o
  // card "voltava" com um erro genérico. "Venda" fica fora do gate (o modal
  // registra a venda para aprovação; a etapa muda no fluxo de aprovação).
  const routeStage = (lead: Lead, target: LeadStatus) => {
    if (lead.status === target) return;
    // Regra dos 65, Fatia 3a.2: Em atendimento é consequência do contato —
    // soltar na coluna abre "Registrar contato" (cliente respondeu + passo).
    if (target === "em_atendimento" && !gestao) {
      setContatoLead(lead);
      return;
    }
    if (target !== "contrato_fechado" && !transicaoLeadPermitida(lead.status, target, gestao)) {
      toast.error(motivoTransicaoBloqueada(lead.status, target, gestao));
      return;
    }
    // De Em atendimento só se sai por desfecho (regra dos 65, Fatia 2).
    if (!saidaOferecida(lead.status, target)) {
      toast.error(MOTIVO_SAIDA_NAO_OFERECIDA);
      return;
    }
    const action = resolveStageAction(target, lead.status);
    if (action.kind === "direct") updateStatus.mutate({ id: lead.id, status: target });
    else if (action.kind === "modal") setModalState({ modal: action.modal, lead });
    else setPerdidoLead(lead);
  };

  // Drag por Pointer Events: mouse, TOQUE (long-press) e caneta — sem lib.
  // O menu "Mudar etapa" continua sendo o caminho acessível por teclado.
  const { dragging, getCardProps, registerColumn } = usePointerDnd({
    scrollContainerRef: boardScrollRef,
    canDrop: (cardId, toColumnId) => {
      const lead = leads.find((l) => l.id === cardId);
      return !!lead && lead.status !== toColumnId;
    },
    onDrop: (cardId, toColumnId) => {
      const lead = leads.find((l) => l.id === cardId);
      if (lead) routeStage(lead, toColumnId as LeadStatus);
    },
  });

  const byColumn = useMemo(() => agruparPorColuna(leads, columns), [leads, columns]);

  const { snapshotByStage, pipelineTotal, stageMetrics, vgvTotalLabel, sinaisDoFunil } =
    useKanbanMetricas(snapshotQuery, columns);

  // Próxima ação a partir do peek — mesma rota dos cards (PROXIMA_ACAO +
  // routeStage). Fecha o peek ANTES: modal/fluxo de perda e drawer abertos ao
  // mesmo tempo disputariam foco e overlay.
  const proximaAcaoDoPeek = () => {
    if (!peekLead) return;
    const acao = PROXIMA_ACAO[peekLead.status as LeadStatus];
    if (!acao) return;
    const lead = peekLead;
    setPeekLead(null);
    if ("target" in acao) routeStage(lead, acao.target);
    else setContatoLead(lead);
  };

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {/* Instrução para leitor de tela (padrão Lançamento: nada de parágrafo
          de manual na tela). O quadro segue apontando para ela. */}
      <p id="kanban-instructions" className="sr-only">
        Arraste os cards entre as colunas. Pelo teclado ou toque, use o menu “Mudar etapa do lead”
        em cada card.
      </p>
      {busca === undefined && (
        <KanbanBuscaEVgv
          resumo={resumo}
          vgvTotalLabel={vgvTotalLabel}
          search={search}
          setSearch={setSearch}
        />
      )}

      {resumo && !leadsError && (
        <ResumoDoFunil
          vgvLabel={vgvTotalLabel}
          sinais={sinaisDoFunil}
          rotuloDaEtapa={(etapa) => LEAD_STATUS_LABEL[etapa as LeadStatus] ?? etapa}
          loading={snapshotQuery.isLoading}
        />
      )}

      <KanbanAbasMobile
        columns={columns}
        mobileStageAtual={mobileStageAtual}
        setMobileStage={setMobileStage}
        setAnnouncement={setAnnouncement}
        teto65={teto65}
        ocupacao65={ocupacao65}
        snapshotByStage={snapshotByStage}
      />

      <KanbanEstados
        leadsError={leadsError}
        leadsLoading={leadsLoading}
        pipelineTotal={pipelineTotal}
        refetchLeads={refetchLeads}
      />

      {!leadsLoading && !leadsError && pipelineTotal > 0 && (
        <div
          ref={boardScrollRef}
          className="overflow-x-auto pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          role="region"
          aria-label="Funil de leads"
          aria-describedby="kanban-instructions"
          tabIndex={0}
        >
          <div className="flex gap-3 min-w-max">
            {columns.map((col) => {
              const items = byColumn.get(col.id) ?? [];
              const metrics = stageMetrics.get(col.id);
              const vgvLabel = formatVgvCompact(metrics?.vgv ?? null);
              const quantidade = Number(snapshotByStage.get(col.id)?.quantidade ?? items.length);
              // Colapso é recurso de desktop: no mobile a ResponsiveTabs já
              // mostra uma etapa por vez — uma barra de 40px ali seria só ruído.
              const colapsada = colapsadas.has(col.id) && !isMobile;
              if (colapsada) {
                return (
                  <KanbanColunaRecolhida
                    key={col.id}
                    col={col}
                    quantidade={quantidade}
                    registerColumn={registerColumn}
                    dragging={dragging}
                    toggleColapso={toggleColapso}
                  />
                );
              }
              return (
                <KanbanColuna
                  key={col.id}
                  col={col}
                  quantidade={quantidade}
                  registerColumn={registerColumn}
                  dragging={dragging}
                  toggleColapso={toggleColapso}
                  metrics={metrics}
                  vgvLabel={vgvLabel}
                  mobileStageAtual={mobileStageAtual}
                  teto65={teto65}
                  ocupacao65={ocupacao65}
                  snapshotByStage={snapshotByStage}
                  extraPages={extraPages}
                  initialPages={initialPages}
                  loadingMore={loadingMore}
                  loadMore={loadMore}
                >
                  {items.map((lead) => (
                    <KanbanLeadCard
                      key={lead.id}
                      lead={lead}
                      col={col}
                      gestao={gestao}
                      corretoresMap={corretoresMap}
                      slaMap={slaMap}
                      transferTimeouts={transferTimeouts}
                      dragging={dragging}
                      getCardProps={getCardProps}
                      updateStatus={updateStatus}
                      routeStage={routeStage}
                      setModalState={setModalState}
                      setPerdidoLead={setPerdidoLead}
                      setContatoLead={setContatoLead}
                      setPeekLead={setPeekLead}
                    />
                  ))}
                </KanbanColuna>
              );
            })}
          </div>
        </div>
      )}
      <KanbanDialogos
        contatoLead={contatoLead}
        setContatoLead={setContatoLead}
        modalState={modalState}
        setModalState={setModalState}
        perdidoLead={perdidoLead}
        setPerdidoLead={setPerdidoLead}
        setExtraPages={setExtraPages}
        refetchLeads={refetchLeads}
        peekLead={peekLead}
        setPeekLead={setPeekLead}
        corretoresMap={corretoresMap}
        abrirWhatsApp={abrirWhatsApp}
        proximaAcaoDoPeek={proximaAcaoDoPeek}
      />
    </div>
  );
}

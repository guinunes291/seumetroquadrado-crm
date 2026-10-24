// Falsos do quadro Kanban (src/components/leads-kanban-board.tsx) para o teste
// de caracterização: estado do "banco" e o que cada fluxo disparou, os módulos
// substituídos (um por vi.mock no teste) e o cenário-padrão dos cartões.

import type { ReactNode } from "react";
import { vi } from "vitest";
import { render, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const banco = {
  snapshot: [] as Record<string, unknown>[] | null,
  paginas: {} as Record<string, { items: unknown[]; has_more: boolean; next_cursor: unknown }>,
  extra: [] as unknown[],
  chamadas: [] as string[],
};
export const papel = { gestao: false };
export const efeitos = {
  log: [] as string[],
  menu: {} as Record<string, Record<string, (...a: unknown[]) => void>>,
  peek: null as null | {
    lead: { id: string } | null;
    corretorNome?: string;
    onProximaAcao: () => void;
  },
};

export const falsos = {
  // @/integrations/supabase/client
  supabase: {
    supabase: {
      rpc: async (nome: string, args: Record<string, unknown> = {}) => {
        banco.chamadas.push(`rpc(${nome},${JSON.stringify(args)})`);
        if (nome === "pipeline_stage_page_v2") {
          if (args._cursor)
            return {
              data: { items: banco.extra, has_more: false, next_cursor: null },
              error: null,
            };
          const p = banco.paginas[String(args._status)];
          return { data: p ?? { items: [], has_more: false, next_cursor: null }, error: null };
        }
        if (nome === "pipeline_snapshot_v3") {
          return banco.snapshot
            ? { data: banco.snapshot, error: null }
            : { data: null, error: { message: "falhou" } };
        }
        if (nome === "leads_sla_pendentes") return { data: [], error: null };
        return { data: null, error: { message: `rpc inesperada: ${nome}` } };
      },
      from: (t: string) => {
        const passos: string[] = [];
        const b = {
          select: (s: string) => (passos.push(`select(${s})`), b),
          eq: (c: string, v: unknown) => (passos.push(`eq(${c},${String(v)})`), b),
          order: async (c: string) => {
            banco.chamadas.push(`from(${t}).${passos.join(".")}.order(${c})`);
            return { data: [{ id: C1, nome: "Ana Corretora" }], error: null };
          },
        };
        return b;
      },
    },
  },
  // @/hooks/use-auth
  auth: {
    useUserRoles: () => ({ isAdmin: false, isGestor: papel.gestao, isSuperintendente: false }),
  },
  // @/features/em-atendimento/use-em-atendimento
  emAtendimento: {
    useEmAtendimentoContador: () => ({
      data: { corretor: !papel.gestao, teto: 65, em_atendimento: 37 },
    }),
  },
  // @/hooks/use-lead-status
  leadStatus: {
    useLeadStatusMutation: () => ({
      mutate: (v: { id: string; status: string }) =>
        efeitos.log.push(`mutate ${v.id} → ${v.status}`),
      isPending: false,
    }),
  },
  // @/hooks/use-realtime-invalidate
  realtime: { useRealtimeInvalidate: () => {} },
  // @/hooks/use-whatsapp-lead
  whatsapp: { useWhatsAppLead: () => vi.fn() },
  // @/hooks/use-mobile
  mobile: { useIsMobile: () => false },
  // @/components/lead-stage-menu
  stageMenu: {
    LeadStageMenu: (p: { lead: { id: string } } & Record<string, (...a: unknown[]) => void>) => {
      efeitos.menu[p.lead.id] = p;
      return null;
    },
  },
  // @/components/lead-stage/lead-stage-modals
  stageModals: {
    LeadStageModals: (p: {
      modalState: { modal: string; lead: { id: string } } | null;
      perdidoLead: { id: string } | null;
    }) => {
      if (p.modalState) efeitos.log.push(`modal ${p.modalState.modal} ${p.modalState.lead.id}`);
      if (p.perdidoLead) efeitos.log.push(`perdido ${p.perdidoLead.id}`);
      return null;
    },
  },
  // @/components/registrar-contato-dialog
  contatoDialog: {
    RegistrarContatoDialog: (p: {
      lead: { id: string; status: string };
      defaultResultado: string;
    }) => {
      efeitos.log.push(`contato ${p.lead.id} ${p.lead.status} ${p.defaultResultado}`);
      return null;
    },
  },
  // @/components/sla-badge
  slaBadge: { SlaBadge: () => null },
  // @/components/transfer-sla-badge
  transferSla: {
    TransferSlaBadge: () => null,
    useTransferTimeouts: () => ({}),
  },
  // @/features/leads/lead-peek-drawer
  peekDrawer: {
    LeadPeekDrawer: (p: NonNullable<typeof efeitos.peek>) => {
      efeitos.peek = p;
      return null;
    },
  },
};

export const C1 = "00000000-0000-4000-8000-0000000000c1";
export const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
export function lead(n: number, over: Record<string, unknown>) {
  return {
    id: id(n),
    nome: `Lead ${n}`,
    email: null,
    telefone: `(11) 9000-000${n}`,
    status: "em_atendimento",
    corretor_id: null,
    projeto_id: null,
    projeto_nome: null,
    observacoes: null,
    temperatura: "morno",
    origem: "meta",
    data_distribuicao: null,
    tentativas_redistribuicao: 0,
    via_webhook: false,
    created_at: "2026-10-01T10:00:00Z",
    ultima_interacao: null,
    ...over,
  };
}
export const linha = (etapa: string, quantidade: number) => ({
  etapa,
  quantidade,
  followups_vencidos: 0,
  sem_proxima_acao: 0,
  parados_ha_7_dias: 0,
  vgv: 1_000_000,
});

export function montar(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
export const coluna = (etapa: string) =>
  document.getElementById(`kanban-col-${etapa}`)!.closest("section")!;
export const cartoes = (etapa: string) =>
  within(coluna(etapa))
    .queryAllByRole("group")
    .map((c) => c.textContent);

/** Cenário-padrão: 3 etapas no snapshot, 5 leads e "Carregar mais" em Agendado. */
export function prepararCenario() {
  localStorage.clear();
  papel.gestao = false;
  efeitos.log = [];
  efeitos.menu = {};
  efeitos.peek = null;
  banco.chamadas = [];
  banco.snapshot = [
    linha("aguardando_atendimento", 1),
    linha("em_atendimento", 3),
    linha("agendado", 21),
  ];
  banco.paginas = {
    aguardando_atendimento: {
      items: [lead(5, { status: "aguardando_atendimento" })],
      has_more: false,
      next_cursor: null,
    },
    em_atendimento: {
      items: [
        lead(3, { created_at: "2026-10-19T10:00:00Z" }),
        lead(1, {
          ultima_interacao: "2026-10-17T10:00:00Z",
          corretor_id: C1,
          projeto_nome: "Longitude",
          email: "um@x.com",
        }),
        lead(2, { ultima_interacao: "2026-10-15T10:00:00Z" }),
      ],
      has_more: false,
      next_cursor: null,
    },
    agendado: {
      items: [lead(4, { status: "agendado", ultima_interacao: "2026-10-19T10:00:00Z" })],
      has_more: true,
      next_cursor: { created_at: "2026-10-01T10:00:00Z", id: id(4) },
    },
  };
  banco.extra = [lead(6, { status: "agendado" })];
}

// Falsos da página Projetos em Foco (src/features/projetos/projetos-foco-page.tsx)
// para o teste de caracterização: dados da prateleira por papel, o lead em
// contexto e o registro de tudo o que a tela dispara (eventos, WhatsApp,
// toasts, props entregues às peças filhas).

import { useState, type ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProjetoRow } from "@/components/projeto-card";
import type { FocoRow, ProjetoPrateleiraRow } from "@/lib/prateleira";

export const AGORA_ISO = "2026-09-10T12:00:00Z";

export const estado = {
  roles: ["corretor"] as string[],
  projetos: [] as ProjetoPrateleiraRow[],
  focos: [] as FocoRow[],
  projetosErro: false,
  lead: null as null | Record<string, unknown>,
  log: [] as string[],
  cards: {} as Record<string, Record<string, (...a: unknown[]) => void> & { item: { id: string } }>,
  enviarDialog: null as null | string,
  fase: null as null | string,
};

function linha(over: Partial<ProjetoPrateleiraRow> & { id: string; nome: string }) {
  const base: ProjetoRow = {
    id: over.id,
    nome: over.nome,
    slug: over.id,
    construtora: null,
    cidade: "São Paulo",
    regiao: null,
    bairro: null,
    endereco: null,
    logradouro: null,
    numero: null,
    observacoes: null,
    ativo: true,
    metragem_min: null,
    metragem_max: null,
    dorms_min: 2,
    dorms_max: 2,
    suites: null,
    tipologia: null,
    tipo_extra: null,
    vagas_min: null,
    vagas_max: null,
    vagas_observacao: null,
    preco_a_partir: 250_000,
    sob_consulta: false,
    status_entrega: null,
    mes_entrega: null,
    ano_entrega: null,
    fonte: null,
    zona_smq: null,
  };
  return { ...base, ...over } as ProjetoPrateleiraRow;
}

/** Duas da parceira (Leste/Sul), uma de outra construtora, uma incompleta e uma em campanha. */
export function prepararCenario() {
  estado.roles = ["corretor"];
  estado.projetosErro = false;
  estado.lead = null;
  estado.log = [];
  estado.cards = {};
  estado.enviarDialog = null;
  estado.fase = null;
  estado.projetos = [
    linha({
      id: "p1",
      nome: "Alfa Leste",
      construtora: "Mundo Apto",
      zona_smq: "Leste",
      book_url: "https://b/alfa",
      bairro: "Tatuapé",
    }),
    linha({
      id: "p2",
      nome: "Beta Sul",
      construtora: "Mundo Apto",
      zona_smq: "Sul",
      tabela_precos_url: "https://t/beta",
      preco_a_partir: 420_000,
      dorms_min: 3,
      dorms_max: 3,
    }),
    linha({
      id: "p3",
      nome: "Gama Oeste",
      construtora: "Outra SA",
      zona_smq: "Oeste",
      book_url: "https://b/gama",
    }),
    linha({ id: "p4", nome: "Delta Incompleto", construtora: "Outra SA" }),
    linha({
      id: "p5",
      nome: "Épsilon Foco",
      construtora: "Outra SA",
      zona_smq: "Norte",
      book_url: "https://b/eps",
      sob_consulta: true,
    }),
  ];
  estado.focos = [
    {
      id: "f1",
      projeto_id: "p5",
      motivo: "Feirão",
      inicio: "2026-09-01T00:00:00Z",
      fim: "2026-09-30T00:00:00Z",
      ativo: true,
      arte_url: null,
    },
  ];
}

const consulta = <T,>(data: T, isError = false) => ({
  data: isError ? undefined : data,
  isLoading: false,
  isError,
  error: isError ? new Error("falhou") : null,
  refetch: () => estado.log.push("refetch projetos"),
});

export const falsos = {
  auth: {
    useUserRoles: () => ({
      isAdmin: estado.roles.includes("admin"),
      isGestor: estado.roles.includes("gestor"),
      roles: estado.roles,
    }),
    useAuth: () => ({ user: { id: "u1" } }),
  },
  mobile: { useIsMobile: () => false },
  preferencia: { usePreference: <T,>(_k: string, inicial: T) => useState<T>(inicial) },
  whatsapp: {
    useWhatsAppLead: () => (lead: { id: string }, opts: { titulo: string; mensagem: string }) =>
      estado.log.push(`whatsapp ${lead.id} "${opts.titulo}" ${JSON.stringify(opts.mensagem)}`),
  },
  eventos: {
    useRegistrarEventoProjeto: () => (e: Record<string, unknown>) =>
      estado.log.push(`evento ${JSON.stringify(e)}`),
  },
  dados: {
    useProjetosPrateleira: () => consulta(estado.projetos, estado.projetosErro),
    useFocosPrateleira: () => consulta(estado.focos),
    useDemandaPrateleira: () => consulta(new Map()),
  },
  parceiras: {
    useConstrutorasParceiras: () => ({
      data: {
        parceiras: [{ id: "mundo", nome: "Mundo Apto", ordem: 10, ativo: true, logo_url: null }],
        origem: "banco",
      },
      isLoading: false,
    }),
  },
  jornada: {
    usePublicarFaseDoLead: (s: string | null) => {
      estado.fase = s;
    },
  },
  produtoCard: {
    ProdutoCard: (p: { item: { id: string; nome: string }; renda: number | null }) => {
      estado.cards[p.item.id] = p as never;
      return <div data-testid="card">{p.item.nome}</div>;
    },
  },
  banner: {
    BannerCampanhas: (p: { itens: { nome: string }[] }) => (
      <div data-testid="banner">{p.itens.map((i) => i.nome).join(",")}</div>
    ),
  },
  renda: {
    RendaCliente: (p: {
      renda: number | null;
      contagem?: number;
      nomeLead?: string;
      onChange: (r: number | null) => void;
      onSoQueCabe: (v: boolean) => void;
    }) => (
      <div data-testid="renda">
        renda={String(p.renda)} contagem={String(p.contagem)} lead={String(p.nomeLead)}
        <button type="button" onClick={() => p.onChange(300_000)}>
          renda 300k
        </button>
        <button type="button" onClick={() => p.onSoQueCabe(true)}>
          só que cabe
        </button>
      </div>
    ),
  },
  gerirParceiras: { ConstrutorasParceirasDialog: () => null },
  enviar: {
    EnviarVitrineDialog: (p: { projeto: { nome: string } | null }) => {
      estado.enviarDialog = p.projeto?.nome ?? null;
      return null;
    },
  },
  sacola: {
    VitrineShortlist: (p: { projects: { nome: string }[]; leadName?: string }) => (
      <div data-testid="sacola">
        {p.projects.map((x) => x.nome).join(",")}|{String(p.leadName)}
      </div>
    ),
  },
  sonner: {
    toast: {
      success: (m: string) => estado.log.push(`toast.success ${m}`),
      error: (m: string) => estado.log.push(`toast.error ${m}`),
    },
  },
  router: {
    Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  },
};

export function montar(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

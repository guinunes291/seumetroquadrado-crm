// Assinaturas & Comissões na identidade Lançamento (2026-10): o título do
// módulo acima das abas, o cabeçalho de cada aba como título de seção, e a
// aprovação de venda como no vídeo — a venda numa linha e os marcos de
// efetivação, com o quarto quadro sendo o ESTADO (não um marco marcável).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CabecalhosDeSecao, PageHeader } from "@/components/page-header";
import { ModuloAtualContext } from "@/features/nav/modulo-atual";

const tabelas = vi.hoisted(() => ({
  vendas: [] as Record<string, unknown>[],
  leads: [] as Record<string, unknown>[],
  profiles: [] as Record<string, unknown>[],
}));
vi.mock("@/integrations/supabase/client", () => {
  const consulta = (linhas: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "in"]) q[m] = () => q;
    q.then = (ok: (r: unknown) => unknown) =>
      Promise.resolve({ data: linhas, error: null }).then(ok);
    return q;
  };
  return {
    supabase: {
      from: (t: keyof typeof tabelas) => consulta(tabelas[t] ?? []),
      rpc: async () => ({ data: null, error: null }),
    },
  };
});

import { PendingSalesApproval } from "@/components/pending-sales-approval";

afterEach(() => cleanup());

const comModulo = (ui: ReactNode) => (
  <ModuloAtualContext.Provider value={{ numero: 8, titulo: "Assinaturas & Comissões" }}>
    {ui}
  </ModuloAtualContext.Provider>
);

describe("PageHeader em modo seção", () => {
  it("dentro do hub, o cabeçalho da aba vira h2, sem eyebrow, com as mesmas ações", () => {
    render(
      comModulo(
        <CabecalhosDeSecao>
          <PageHeader
            title="Comissões"
            description="Geradas após a aprovação."
            actions={<button>Exportar</button>}
          />
        </CabecalhosDeSecao>,
      ),
    );
    expect(screen.getByRole("heading", { level: 2, name: "Comissões" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText(/Módulo 08/)).toBeNull();
    expect(screen.getByRole("button", { name: "Exportar" })).toBeTruthy();
  });

  it("fora do hub, continua título de página com o eyebrow do módulo", () => {
    render(comModulo(<PageHeader title="Assinaturas & Comissões" />));
    expect(screen.getByRole("heading", { level: 1, name: "Assinaturas & Comissões" })).toBeTruthy();
    expect(screen.getByText("Módulo 08")).toBeTruthy();
  });
});

const VENDA = {
  id: "00000000-0000-4000-8000-000000001303",
  lead_id: "lead-1",
  corretor_id: "corretor-1",
  projeto_nome: "Residencial Aurora",
  valor_venda: 239900,
  data_assinatura: "2026-10-07",
  created_at: "2026-10-07T12:00:00Z",
  contrato_assinado: true,
  ato_pago: true,
  apto_repasse: false,
  percentual_comissao: 4,
  percentual_gerente: 1,
  percentual_superintendente: 0.5,
  pct_share_corretor: 50,
};

function renderAprovacao() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PendingSalesApproval />
    </QueryClientProvider>,
  );
}

describe("Aprovações de venda", () => {
  it("a venda numa linha e os três marcos marcáveis + o estado", async () => {
    tabelas.vendas = [VENDA];
    tabelas.leads = [{ id: "lead-1", nome: "Mariana Costa" }];
    tabelas.profiles = [{ id: "corretor-1", nome: "Bianca Torres" }];
    renderAprovacao();

    const bloco = await screen.findByRole("region", { name: "Aprovações de venda" });
    expect(await within(bloco).findByText("Mariana Costa")).toBeTruthy();
    expect(within(bloco).getByText("MC")).toBeTruthy();
    expect(within(bloco).getByText(/1 pendente ·/)).toBeTruthy();
    // Só os três marcos se marcam; o quarto quadro é o estado.
    expect(within(bloco).getAllByRole("checkbox")).toHaveLength(3);
    expect(within(bloco).getByText("Em efetivação")).toBeTruthy();
    // Sem o "apto para repasse", aprovar fica travado.
    expect(
      (within(bloco).getByRole("button", { name: /Aprovar/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("com os três marcos, a venda fica pronta e aprovar libera", async () => {
    tabelas.vendas = [{ ...VENDA, apto_repasse: true }];
    renderAprovacao();
    const bloco = await screen.findByRole("region", { name: "Aprovações de venda" });
    expect(await within(bloco).findByText("Pronta para aprovar")).toBeTruthy();
    expect(
      (within(bloco).getByRole("button", { name: /Aprovar/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe("telas", () => {
  const ler = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("o hub mostra o título do módulo e põe as abas em modo seção", () => {
    const hub = ler("src/routes/_authenticated/financeiro/index.tsx");
    expect(hub).toContain('title="Assinaturas & Comissões"');
    expect(hub).toContain("<CabecalhosDeSecao>");
  });

  it("como no vídeo: a aprovação, logo os números do período, depois o distrato", () => {
    const page = ler("src/features/comissoes/comissoes-page.tsx");
    const aprovacao = page.indexOf("<PendingSalesApproval />");
    const numeros = page.indexOf("<StatGrid>");
    const distrato = page.indexOf("<VendasGestaoCard");
    expect(aprovacao).toBeGreaterThan(-1);
    expect(aprovacao).toBeLessThan(numeros);
    expect(numeros).toBeLessThan(distrato);
  });
});

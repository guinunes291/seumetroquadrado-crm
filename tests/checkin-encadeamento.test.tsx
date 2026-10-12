// Ordem da abertura do corretor: onboarding → CHECK-IN → estudo do funil
// (quinta) → metas do dia. Aqui se trava que o estudo e as metas esperam o
// check-in obrigatório do dia (decisão do dono, 12/10/2026) — e que, sem saber
// ainda (leitura carregando), nenhum dos dois abre por cima dele.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const estado = vi.hoisted(() => ({
  checkinPendente: true as boolean | null,
  estudoPendente: false as boolean | null,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: "/fila" } }),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
  useUserRoles: () => ({ isCorretor: true, loading: false }),
}));
vi.mock("@/features/presenca/use-checkin-obrigatorio", () => ({
  useCheckinObrigatorioPendente: () => estado.checkinPendente,
}));
vi.mock("@/features/onboarding/use-onboarding", () => ({
  useOnboardingStatus: () => ({ data: { concluido_em: "2026-10-01T12:00:00Z" } }),
}));
vi.mock("@/features/meu-funil/use-estudo-pendente", () => ({
  useEstudoFunilPendente: () => estado.estudoPendente,
  useDia: () => "2026-10-15",
  liberarPorFalha: vi.fn(),
  EVENTO_ESTUDO_FUNIL: "meu-funil:estudo",
}));
// Metas do dia: nenhuma resposta hoje → o popup é devido (se nada o segurar).
vi.mock("@/features/metas-dia/use-metas-dia", () => ({
  useMetaDeHoje: () => ({ data: null, isPending: false, isError: false }),
  useUltimaMeta: () => ({ data: null, isPending: false }),
  useMetaGestor: () => ({ data: null }),
  useRealizadoHoje: () => ({ data: undefined }),
  useRealizadoDoDia: () => ({ data: undefined, isError: false }),
  useTaxasConversao: () => ({ data: null }),
  useInvalidarMetasDiaAoMudarDados: () => {},
  registrarAlertaCheckpoint: vi.fn(),
}));
vi.mock("@/features/metas-dia/metas-dia-dialog", () => ({
  MetasDiaDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="metas-dia-dialog" /> : null,
}));
vi.mock("@/features/metas-dia/metas-dia-card", () => ({ MetasDiaCard: () => null }));
vi.mock("@/features/metas-dia/aviso-roleta-sdr", () => ({ AvisoRoletaSdrHost: () => null }));
vi.mock("@/features/metas-dia/roleta-sdr-placar", () => ({ PlacarRoletaSdrCorretor: () => null }));
vi.mock("@/features/meu-funil/meu-funil-view", () => ({ MeuFunilView: () => null }));
vi.mock("@/features/meu-funil/use-meu-funil", () => ({
  useRegistrarEstudo: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/error-tracking-browser", () => ({ captureClientError: vi.fn() }));

import { MetasDiaGlobal } from "@/features/metas-dia/metas-dia-global";
import { MeuFunilGlobal } from "@/features/meu-funil/meu-funil-global";

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  estado.checkinPendente = true;
  estado.estudoPendente = false;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe("metas do dia esperam o check-in", () => {
  it("sem check-in hoje (ou ainda lendo): o popup das metas não abre", () => {
    for (const pendente of [true, null]) {
      estado.checkinPendente = pendente;
      const r = montar(<MetasDiaGlobal />);
      expect(screen.queryByTestId("metas-dia-dialog")).toBeNull();
      r.unmount();
    }
  });

  it("com o check-in feito (ou a leitura com erro, que vira false): o popup abre", () => {
    estado.checkinPendente = false;
    montar(<MetasDiaGlobal />);
    expect(screen.getByTestId("metas-dia-dialog")).toBeInTheDocument();
  });
});

describe("estudo do funil (quinta) espera o check-in", () => {
  it("estudo pendente, mas sem check-in: não abre; com check-in: abre", () => {
    estado.estudoPendente = true;
    estado.checkinPendente = true;
    const r = montar(<MeuFunilGlobal />);
    expect(screen.queryByTestId("meu-funil-estudo-dialog")).toBeNull();
    r.unmount();

    estado.checkinPendente = false;
    montar(<MeuFunilGlobal />);
    expect(screen.getByTestId("meu-funil-estudo-dialog")).toBeInTheDocument();
  });
});

// A gestão não se libera nas roletas (decisão do dono, 13/10/2026): o
// interruptor de presença da Central (marcar_presenca_admin) fura a regra da
// localização DE PROPÓSITO, para os outros; para si, o gestor que também é
// corretor faz o check-in como todo corretor. A guarda mora no hook, que as
// duas telas usam (a aba Corretores e o menu da linha na aba da roleta):
// LIGAR o próprio id não chega ao banco; DESLIGAR o próprio (encerrar o dia)
// e ligar outra pessoa seguem valendo.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const estado = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: null, error: null })),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: estado.toast }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "eu" }, session: null, loading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: estado.rpc } }));
vi.mock("@/integrations/supabase/pendentes", () => ({ supabasePendente: { rpc: estado.rpc } }));

import { useMarcarPresencaAdmin } from "@/features/distribuicao/queries";

afterEach(() => {
  cleanup();
  estado.rpc.mockClear();
  for (const f of Object.values(estado.toast)) f.mockClear();
});

function montar() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(() => useMarcarPresencaAdmin(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}

const chamadas = () =>
  estado.rpc.mock.calls.filter((c: unknown[]) => c[0] === "marcar_presenca_admin");

describe("useMarcarPresencaAdmin: a gestão não se liga nas roletas", () => {
  it("ligar o próprio id: nenhuma chamada ao banco, e o porquê no toast", async () => {
    const { result } = montar();
    act(() => result.current.mutate({ corretorId: "eu", presente: true }));
    await waitFor(() =>
      expect(estado.toast.error).toHaveBeenCalledWith(
        "Falha ao marcar presença: a gestão não libera a si mesma: faça o seu check-in pelo Check-in da barra lateral, com a localização do celular",
      ),
    );
    expect(chamadas()).toHaveLength(0);
  });

  it("desligar o próprio id (encerrar o dia) vale", async () => {
    const { result } = montar();
    act(() => result.current.mutate({ corretorId: "eu", presente: false }));
    await waitFor(() => expect(chamadas()).toHaveLength(1));
    expect(chamadas()[0][1]).toEqual({ _corretor_id: "eu", _presente: false });
  });

  it("ligar outra pessoa vale (o interruptor continua sendo da gestão)", async () => {
    const { result } = montar();
    act(() => result.current.mutate({ corretorId: "rafa", presente: true }));
    await waitFor(() => expect(chamadas()).toHaveLength(1));
    expect(chamadas()[0][1]).toEqual({ _corretor_id: "rafa", _presente: true });
    await waitFor(() =>
      expect(estado.toast.success).toHaveBeenCalledWith(
        "Na roleta hoje — registrado como liberado pela gestão.",
      ),
    );
  });
});

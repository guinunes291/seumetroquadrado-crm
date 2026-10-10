// SDR — zona de interesse obrigatória no registro (decisão do dono,
// 05/10/2026). A regra mora no banco (tests/db/sdr-zona.test.ts: SMQZ2 sem
// zona, roleta só na zona); aqui se trava o que a tela faz antes de bater na
// RPC: o campo é obrigatório na entrega, a sugestão do banco entra como valor
// inicial, e a zona escolhida vai no pedido. O agendamento do SDR passou a ser
// a passagem do discador (10/10/2026): a zona dela está em
// tests/pre-venda-lancamento.test.tsx.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZONAS_SDR, ZONA_SDR_ERRCODE, erroZonaObrigatoria, zonaInteresseValida } from "@/lib/sdr";

const estado = vi.hoisted(() => ({
  agendar: vi.fn(),
  entregar: vi.fn(),
  zonaDoLead: vi.fn(),
  invalidar: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: estado.toast }));
vi.mock("@/features/sdr/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/sdr/client")>();
  const { useQuery } = await import("@tanstack/react-query");
  return {
    ...mod,
    agendarVisitaSdr: (...a: unknown[]) => estado.agendar(...a),
    entregarLeadSdr: (...a: unknown[]) => estado.entregar(...a),
    zonaDoLead: (...a: unknown[]) => estado.zonaDoLead(...a),
    // O hook real fecha sobre a função interna; aqui ele lê o stub.
    useZonaDoLead: (leadId: string, enabled = true) =>
      useQuery({
        queryKey: ["sdr:zona-do-lead", leadId],
        enabled,
        queryFn: () => estado.zonaDoLead(leadId) as Promise<string | null>,
      }),
    useInvalidarSdr: () => estado.invalidar,
  };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import { EntregarLeadSdrDialog } from "@/features/sdr/entregar-lead-sdr-dialog";

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const lead = { id: "11111111-1111-4111-8111-111111111111", nome: "Carla Cliente" };
const resultado = { ok: true, corretor_id: "c1", corretor_nome: "Ana", regra: "roleta_sdr" };

afterEach(() => {
  cleanup();
  estado.agendar.mockReset();
  estado.entregar.mockReset();
  estado.zonaDoLead.mockReset();
  estado.invalidar.mockReset();
  estado.toast.success.mockReset();
  estado.toast.error.mockReset();
});

describe("regras puras", () => {
  it("as seis zonas, o código do banco e o reconhecimento do erro", () => {
    expect([...ZONAS_SDR]).toEqual(["Norte", "Sul", "Leste", "Oeste", "Centro", "Grande SP"]);
    expect(zonaInteresseValida("Leste")).toBe(true);
    expect(zonaInteresseValida("Zona Leste")).toBe(false); // a tela só manda o canônico
    expect(zonaInteresseValida(null)).toBe(false);
    expect(ZONA_SDR_ERRCODE).toBe("SMQZ2");
    expect(erroZonaObrigatoria({ code: "SMQZ2", message: "x" })).toBe(true);
    expect(erroZonaObrigatoria({ code: "22023" })).toBe(false);
    expect(erroZonaObrigatoria(new Error("rede"))).toBe(false);
  });
});

describe("EntregarLeadSdrDialog", () => {
  it("sem zona o botão trava; a zona escolhida vai na RPC", async () => {
    estado.zonaDoLead.mockResolvedValue(null);
    estado.entregar.mockResolvedValue(resultado);
    montar(<EntregarLeadSdrDialog lead={lead} open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("Motivo da entrega"), {
      target: { value: "Documentos recebidos, visita em 3 semanas" },
    });
    const botao = screen.getByText("Entregar ao corretor") as HTMLButtonElement;
    await waitFor(() => expect(estado.zonaDoLead).toHaveBeenCalledWith(lead.id));
    // A ficha não indica zona: a dica vira "obrigatória" e o botão segue travado.
    await waitFor(() =>
      expect(screen.getByTestId("zona-interesse-dica").textContent).toMatch(/Obrigatória/),
    );
    expect(botao.disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "Grande SP" }));
    expect(botao.disabled).toBe(false);
    fireEvent.click(botao);
    await waitFor(() => expect(estado.entregar).toHaveBeenCalled());
    expect(estado.entregar).toHaveBeenCalledWith(
      lead.id,
      "Documentos recebidos, visita em 3 semanas",
      "Grande SP",
    );
    await waitFor(() => expect(estado.toast.success).toHaveBeenCalled());
    expect(estado.toast.success.mock.calls[0][1]).toMatchObject({
      description: expect.stringContaining("zona Grande SP"),
    });
  });

  it("a zona que a ficha já indica entra como sugestão; o SDR pode trocar", async () => {
    estado.zonaDoLead.mockResolvedValue("Sul");
    estado.entregar.mockResolvedValue(resultado);
    montar(<EntregarLeadSdrDialog lead={lead} open onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Sul" }).getAttribute("aria-checked")).toBe("true"),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Norte" }));
    expect(screen.getByRole("radio", { name: "Norte" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText("Motivo da entrega"), {
      target: { value: "Cliente pronto" },
    });
    fireEvent.click(screen.getByText("Entregar ao corretor"));
    await waitFor(() =>
      expect(estado.entregar).toHaveBeenCalledWith(lead.id, "Cliente pronto", "Norte"),
    );
  });
});

describe("fiação", () => {
  it("as duas RPCs levam _zona e passam pela fronteira rpc; o banco exige antes da roleta", async () => {
    const { readFileSync } = await import("node:fs");
    const client = readFileSync("src/features/sdr/client.ts", "utf8");
    expect(client).toContain('rpc("agendar_visita_sdr", {');
    expect(client).toContain('rpc("entregar_lead_sdr", {');
    expect(client).toContain("_zona: input.zona,");
    expect(client).toContain("_zona: zona,");
    const sql = readFileSync("supabase/migrations/20261010120900_sdr_zona_obrigatoria.sql", "utf8");
    expect(sql).toContain("PERFORM public._sdr_exigir_zona(_lead_id, _zona);");
    expect(sql).toContain("PERFORM public._sdr_exigir_zona(NEW.lead_id, NULL);");
    expect(sql).toContain("USING ERRCODE = 'SMQZ2'");
  });
});

// "Meu link de agendamento" na Agenda: o corretor cria o link com o endereço e
// a faixa de horários, copia ou manda no WhatsApp, e pode trocar o link.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-nome-do-corretor", () => ({
  useNomeDoCorretor: () => ({ data: "Ana Paula Corretora" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { LinkAgendamentoDialog } from "@/features/agenda/link-agendamento-dialog";

const resumo = (over: Record<string, unknown> = {}) => ({
  id: "22222222-2222-4222-8222-222222222222",
  slug: "Ab3_-xYz09QWerty",
  endereco: "Av. Paulista, 1000",
  hora_inicio: "09:00",
  hora_fim: "18:00",
  dias_semana: [1, 2, 3, 4, 5, 6],
  duracao_minutos: 60,
  created_at: "2026-10-14T12:00:00Z",
  total_agendamentos: 3,
  ultimo_agendamento_em: null,
  ...over,
});

function abrir() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LinkAgendamentoDialog>
        <button type="button">Meu link</button>
      </LinkAgendamentoDialog>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Meu link" }));
}

beforeEach(() => rpc.mockReset());
afterEach(() => cleanup());

describe("LinkAgendamentoDialog", () => {
  it("sem link: cria com o endereço digitado e a faixa padrão", async () => {
    rpc.mockImplementation(async (nome: string) =>
      nome === "meu_agendamento_link"
        ? { data: null, error: null }
        : { data: resumo({ endereco: "Stand Aurora", total_agendamentos: 0 }), error: null },
    );
    abrir();
    const criar = await screen.findByRole("button", { name: "Criar meu link" });
    fireEvent.change(screen.getByLabelText("Endereço da visita"), {
      target: { value: "Stand Aurora" },
    });
    fireEvent.click(criar);

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("salvar_meu_agendamento_link", {
        _endereco: "Stand Aurora",
        _hora_inicio: "09:00",
        _hora_fim: "18:00",
        _dias_semana: [1, 2, 3, 4, 5, 6],
        _duracao_minutos: 60,
      }),
    );
    const url = await screen.findByLabelText("Endereço do seu link");
    expect((url as HTMLInputElement).value).toBe(
      `${window.location.origin}/agendar/Ab3_-xYz09QWerty`,
    );
    expect(screen.getByText("Nenhum agendamento pelo link ainda.")).toBeTruthy();
  });

  it("com link: WhatsApp leva o convite pronto e os dias marcados vêm do banco", async () => {
    rpc.mockResolvedValue({ data: resumo({ dias_semana: [6] }), error: null });
    abrir();
    const whats = await screen.findByRole("link", { name: /WhatsApp/ });
    const texto = decodeURIComponent(whats.getAttribute("href")!.split("text=")[1]);
    expect(texto).toContain("Aqui é Ana, da Seu Metro Quadrado.");
    expect(texto).toContain("/agendar/Ab3_-xYz09QWerty");
    expect(screen.getByRole("button", { name: "Sáb" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Seg" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("3 agendamentos pelo link.")).toBeTruthy();
  });

  it("sem nenhum dia marcado não chama o banco e explica", async () => {
    rpc.mockResolvedValue({ data: resumo({ dias_semana: [1] }), error: null });
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Seg" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Escolha pelo menos um dia.")).toBeTruthy();
    expect(rpc).not.toHaveBeenCalledWith("salvar_meu_agendamento_link", expect.anything());
  });
});

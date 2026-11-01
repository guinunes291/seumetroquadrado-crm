// Topo da ficha do lead (referência de 2026-10): iniciais no anel do score,
// ações redondas com rótulo visível e "copiar" nos dados que o corretor cola
// em outro lugar (WhatsApp, simulador do banco).
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { AcaoRedonda, AnelDoLead } from "@/features/leads/dossie/identidade-lead";
import { DadosTab } from "@/features/leads/dossie/dados-tab";
import type { DossieLead } from "@/features/leads/dossie/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => vi.clearAllMocks());

describe("AnelDoLead", () => {
  it("mostra as iniciais e o score, com o motivo na leitura acessível", () => {
    render(
      <AnelDoLead
        nome="Maria Souza"
        score={{ score: 86, tier: "alta", motivo: "quente e parada há 3 dias" }}
      />,
    );
    expect(screen.getByText("MS")).toBeInTheDocument();
    expect(screen.getByText("86")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Score de prioridade 86 — quente e parada há 3 dias" }),
    ).toBeInTheDocument();
  });
});

describe("AcaoRedonda", () => {
  it("o rótulo visível é o nome do botão (nada de ícone sozinho)", () => {
    const onClick = vi.fn();
    render(<AcaoRedonda icone={<svg />} rotulo="Registrar contato" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar contato" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("DadosTab — copiar", () => {
  const lead = {
    nome: "Maria Souza",
    telefone: "(11) 98888-7777",
    email: null,
    cpf: "123.456.789-00",
    projeto_nome: null,
  } as unknown as DossieLead;

  it("copia telefone e CPF; e-mail vazio não ganha botão", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DadosTab lead={lead} />);

    expect(screen.queryByRole("button", { name: "Copiar e-mail" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copiar telefone" }));
    fireEvent.click(screen.getByRole("button", { name: "Copiar CPF" }));

    expect(writeText).toHaveBeenNthCalledWith(1, "(11) 98888-7777");
    expect(writeText).toHaveBeenNthCalledWith(2, "123.456.789-00");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Telefone copiado"));
  });

  it("sem permissão de área de transferência, avisa em vez de calar", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("negado")) },
    });
    render(<DadosTab lead={lead} />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar telefone" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});

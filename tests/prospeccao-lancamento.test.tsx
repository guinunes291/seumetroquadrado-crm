// Prospecção na identidade Lançamento (2026-10): o card do próximo lead da
// base escolhida, como no vídeo de lançamento — os campos do primeiro
// contato, as três ações e os atalhos W/L/R/F, que se calam com o Modo Foco
// aberto (lá dentro ele tem os próprios; duas escutas agiriam em dobro).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LeadDetail } from "@/features/leads/use-lead-detail";

const LEAD: LeadDetail = {
  id: "00000000-0000-4000-8000-000000000101",
  nome: "Juliana Melo",
  telefone: "11999990000",
  email: null,
  origem: "indicacao",
  status: "aguardando_atendimento",
  temperatura: "quente",
  projeto_id: null,
  projeto_nome: "Residencial Aurora",
  corretor_id: "00000000-0000-4000-8000-000000000001",
  created_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  ultima_interacao: null,
  renda_informada: "4.700 a 8.000",
  entrada_disponivel: "R$ 12 mil",
  usa_fgts: true,
  observacoes: null,
};

const acoes = vi.hoisted(() => ({ ligar: vi.fn(), whatsapp: vi.fn() }));
vi.mock("@/features/leads/use-lead-detail", () => ({
  useLeadDetail: () => ({ lead: { data: LEAD, isError: false, error: null, refetch: vi.fn() } }),
}));
vi.mock("@/hooks/use-ligar-lead", () => ({
  useLigarLead: () => ({ ligar: acoes.ligar, discando: false }),
}));
vi.mock("@/hooks/use-whatsapp-lead", () => ({ useWhatsAppLead: () => acoes.whatsapp }));
vi.mock("@/components/registrar-contato-dialog", () => ({
  RegistrarContatoDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="registrar-aberto" /> : null,
}));

import { ProximoLeadCard, ultimoContato } from "@/features/prospeccao/proximo-lead-card";

afterEach(() => {
  cleanup();
  acoes.ligar.mockClear();
  acoes.whatsapp.mockClear();
});

function renderCard(focoAberto = false) {
  const onAbrirFoco = vi.fn();
  render(
    <ProximoLeadCard
      leadId={LEAD.id}
      posicao={1}
      total={12}
      focoAberto={focoAberto}
      onAbrirFoco={onAbrirFoco}
      onTrabalhado={vi.fn()}
    />,
  );
  return { onAbrirFoco };
}

describe("<ProximoLeadCard />", () => {
  it("mostra quem é, a posição na fila e os seis campos do primeiro contato", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Juliana Melo" })).toBeInTheDocument();
    expect(screen.getByText("1 de 12")).toBeInTheDocument();
    expect(screen.getByText("Aguardando atendimento")).toBeInTheDocument();
    for (const valor of ["Residencial Aurora", "4.700 a 8.000", "Sim", "R$ 12 mil"])
      expect(screen.getByText(valor)).toBeInTheDocument();
    expect(screen.getByText(/^lead novo · /)).toBeInTheDocument();
  });

  it("W abre o WhatsApp, L liga, R registra e F abre o Modo Foco", () => {
    const { onAbrirFoco } = renderCard();
    fireEvent.keyDown(document, { key: "w" });
    expect(acoes.whatsapp).toHaveBeenCalledWith(expect.objectContaining({ id: LEAD.id }));
    fireEvent.keyDown(document, { key: "L" });
    expect(acoes.ligar).toHaveBeenCalledWith(expect.objectContaining({ id: LEAD.id }));
    fireEvent.keyDown(document, { key: "f" });
    expect(onAbrirFoco).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "r" });
    expect(screen.getByTestId("registrar-aberto")).toBeInTheDocument();
  });

  it("com o Modo Foco aberto os atalhos daqui se calam", () => {
    const { onAbrirFoco } = renderCard(true);
    fireEvent.keyDown(document, { key: "w" });
    fireEvent.keyDown(document, { key: "l" });
    fireEvent.keyDown(document, { key: "f" });
    expect(acoes.whatsapp).not.toHaveBeenCalled();
    expect(acoes.ligar).not.toHaveBeenCalled();
    expect(onAbrirFoco).not.toHaveBeenCalled();
  });

  it("atalho com modificador (⌘K, Ctrl+L) não dispara ação do card", () => {
    renderCard();
    fireEvent.keyDown(document, { key: "l", ctrlKey: true });
    fireEvent.keyDown(document, { key: "w", metaKey: true });
    expect(acoes.ligar).not.toHaveBeenCalled();
    expect(acoes.whatsapp).not.toHaveBeenCalled();
  });

  it("os botões fazem o mesmo que as teclas", () => {
    const { onAbrirFoco } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /^Ligar/ }));
    fireEvent.click(screen.getByRole("button", { name: /^WhatsApp/ }));
    fireEvent.click(screen.getByRole("button", { name: /Trabalhar a fila/ }));
    expect(acoes.ligar).toHaveBeenCalledTimes(1);
    expect(acoes.whatsapp).toHaveBeenCalledTimes(1);
    expect(onAbrirFoco).toHaveBeenCalledTimes(1);
  });
});

describe("ultimoContato", () => {
  it("sem interação, diz que é lead novo e há quanto tempo chegou", () => {
    expect(ultimoContato({ ultima_interacao: null, created_at: LEAD.created_at })).toMatch(
      /^lead novo · /,
    );
  });
  it("com interação, mostra só o tempo desde o último contato", () => {
    const t = new Date(Date.now() - 3 * 86_400_000).toISOString();
    expect(ultimoContato({ ultima_interacao: t, created_at: LEAD.created_at })).not.toMatch(
      /lead novo/,
    );
  });
});

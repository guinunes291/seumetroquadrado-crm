// "Meus links de agendamento" na Agenda: um link por local. O corretor escolhe
// o stand (no Mapa de Lojas compacto) ou digita o endereço, cria o link, copia
// ou manda no WhatsApp, e pode trocar ou desativar cada um.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-nome-do-corretor", () => ({
  useNomeDoCorretor: () => ({ data: "Ana Paula Corretora" }),
}));
vi.mock("sonner", () => ({ toast }));
// O seletor real carrega Leaflet e a planilha de stands (testado no navegador);
// aqui ele vira dois botões que entregam um local, como o pino ou a lista.
vi.mock("@/features/agenda/seletor-local-visita", () => ({
  default: ({
    onChange,
  }: {
    onChange: (l: { localId: string | null; localNome: string; endereco: string }) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onChange({
            localId: "cury-rua-tuiuti-2000",
            localNome: "Cury · Stand Tatuapé",
            endereco: "Rua Tuiuti, 2000, Tatuapé, São Paulo, SP",
          })
        }
      >
        Escolher stand
      </button>
      <button
        type="button"
        onClick={() => onChange({ localId: null, localNome: "", endereco: "Rua do Cliente, 45" })}
      >
        Digitar endereço
      </button>
    </div>
  ),
}));

import { LinkAgendamentoDialog } from "@/features/agenda/link-agendamento-dialog";

const resumo = (over: Record<string, unknown> = {}) => ({
  id: "22222222-2222-4222-8222-222222222222",
  slug: "Ab3_-xYz09QWerty",
  endereco: "Rua Tuiuti, 2000, Tatuapé, São Paulo, SP",
  local_id: "cury-rua-tuiuti-2000",
  local_nome: "Cury · Stand Tatuapé",
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

beforeEach(() => {
  rpc.mockReset();
  Object.values(toast).forEach((f) => f.mockReset());
});
afterEach(() => cleanup());

describe("LinkAgendamentoDialog", () => {
  it("sem links: abre no formulário e cria o link do stand escolhido", async () => {
    rpc.mockImplementation(async (nome: string) =>
      nome === "meus_agendamento_links"
        ? { data: [], error: null }
        : { data: { ...resumo({ total_agendamentos: 0 }), ja_existia: false }, error: null },
    );
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Escolher stand" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar link para Cury · Stand Tatuapé" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("criar_agendamento_link", {
        _endereco: "Rua Tuiuti, 2000, Tatuapé, São Paulo, SP",
        _local_id: "cury-rua-tuiuti-2000",
        _local_nome: "Cury · Stand Tatuapé",
        _hora_inicio: "09:00",
        _hora_fim: "18:00",
        _dias_semana: [1, 2, 3, 4, 5, 6],
        _duracao_minutos: 60,
      }),
    );
    const cartao = await screen.findByRole("listitem", { name: "Cury · Stand Tatuapé" });
    expect((within(cartao).getByLabelText(/Endereço do link/) as HTMLInputElement).value).toBe(
      `${window.location.origin}/agendar/Ab3_-xYz09QWerty`,
    );
    expect(within(cartao).getByText("Seg a Sáb · 09:00–18:00 · 1 h")).toBeTruthy();
  });

  it("endereço digitado vai sem stand (local_id vazio)", async () => {
    rpc.mockImplementation(async (nome: string) =>
      nome === "meus_agendamento_links"
        ? { data: [], error: null }
        : {
            data: {
              ...resumo({ endereco: "Rua do Cliente, 45", local_id: null, local_nome: "" }),
              ja_existia: false,
            },
            error: null,
          },
    );
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Digitar endereço" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar link" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "criar_agendamento_link",
        expect.objectContaining({
          _endereco: "Rua do Cliente, 45",
          _local_id: "",
          _local_nome: "",
        }),
      ),
    );
    expect(await screen.findByRole("listitem", { name: "Rua do Cliente, 45" })).toBeTruthy();
  });

  it("mesmo endereço: avisa e mostra o link que já existe", async () => {
    rpc.mockImplementation(async (nome: string) =>
      nome === "meus_agendamento_links"
        ? { data: [resumo()], error: null }
        : { data: { ...resumo(), ja_existia: true }, error: null },
    );
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /Novo link para outro local/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Escolher stand" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar link para Cury · Stand Tatuapé" }));
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        "Você já tem um link para este endereço — é este aqui.",
      ),
    );
    // Um cartão só: nada duplicado.
    expect(await screen.findAllByRole("listitem", { name: "Cury · Stand Tatuapé" })).toHaveLength(
      1,
    );
  });

  it("com links: o WhatsApp leva o convite com o local", async () => {
    rpc.mockResolvedValue({
      data: [
        resumo(),
        resumo({
          id: "33333333-3333-4333-8333-333333333333",
          slug: "Zz9_-xYz09QWerty",
          local_id: null,
          local_nome: "",
          endereco: "Rua B, 2",
        }),
      ],
      error: null,
    });
    abrir();
    const cartao = await screen.findByRole("listitem", { name: "Cury · Stand Tatuapé" });
    const whats = within(cartao).getByRole("link", { name: /WhatsApp/ });
    const texto = decodeURIComponent(whats.getAttribute("href")!.split("text=")[1]);
    expect(texto).toContain("Aqui é Ana, da Seu Metro Quadrado.");
    expect(texto).toContain("visita no Cury · Stand Tatuapé");
    expect(texto).toContain("/agendar/Ab3_-xYz09QWerty");
    expect(within(cartao).getByText("3 agendamentos pelo link.")).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "Rua B, 2" })).toBeTruthy();
  });

  it("desativar pede confirmação e tira só aquele link", async () => {
    rpc.mockImplementation(async (nome: string) =>
      nome === "meus_agendamento_links"
        ? {
            data: [
              resumo(),
              resumo({
                id: "33333333-3333-4333-8333-333333333333",
                slug: "Zz9_-xYz09QWerty",
                local_id: null,
                local_nome: "",
                endereco: "Rua B, 2",
              }),
            ],
            error: null,
          }
        : { data: true, error: null },
    );
    abrir();
    const cartao = await screen.findByRole("listitem", { name: "Cury · Stand Tatuapé" });
    fireEvent.click(within(cartao).getByRole("button", { name: /Desativar/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Desativar" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("desativar_agendamento_link", {
        _link_id: "22222222-2222-4222-8222-222222222222",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("listitem", { name: "Cury · Stand Tatuapé" })).toBeNull(),
    );
    expect(screen.getByRole("listitem", { name: "Rua B, 2" })).toBeTruthy();
  });

  it("sem nenhum dia marcado não chama o banco e explica", async () => {
    rpc.mockResolvedValue({ data: [resumo({ dias_semana: [1] })], error: null });
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /Editar o link de/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Seg" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Escolha pelo menos um dia.")).toBeTruthy();
    expect(rpc).not.toHaveBeenCalledWith("atualizar_agendamento_link", expect.anything());
  });
});

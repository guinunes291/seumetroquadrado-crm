// Telas do link de documentação: o diálogo do link fixo do corretor, o cartão
// da pasta na aba Documentação e a pasta pública do cliente (envio com o
// primeiro arquivo no item que falta e os seguintes como arquivos a mais).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const rpc = vi.hoisted(() => vi.fn());
const abrirWa = vi.hoisted(() => vi.fn());
const enviarArquivoDaPasta = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-nome-do-corretor", () => ({
  useNomeDoCorretor: () => ({ data: "Ana Paula Corretora" }),
}));
vi.mock("@/hooks/use-whatsapp-lead", () => ({ useWhatsAppLead: () => abrirWa }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/features/documentacao-publica/api", async (orig) => ({
  ...(await orig<typeof import("@/features/documentacao-publica/api")>()),
  enviarArquivoDaPasta,
}));
// Sem canvas no jsdom: o arquivo vai como foi escolhido.
vi.mock("@/features/documentacao-publica/preparar-arquivo", () => ({
  prepararArquivo: async (f: File) => ({ blob: f, nome: f.name }),
}));

import { LinkDocumentosDialog } from "@/features/documentacao/link-documentos-dialog";
import { PastaClienteCard } from "@/features/documentacao/pasta-cliente-card";
import { PastaView } from "@/features/documentacao-publica/pasta-view";

const TOKEN = "Tk3_-xYz09QWertyAb3_-xYz09QWerty";
const LINK = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "Ab3_-xYz09QWerty",
  created_at: "2026-10-15T12:00:00Z",
  total_cadastros: 2,
  ultimo_cadastro_em: null,
};
const PASTA = {
  id: "33333333-3333-4333-8333-333333333333",
  token: TOKEN,
  expira_em: "2026-11-14T15:00:00Z",
  expirada: false,
  created_at: "2026-10-15T12:00:00Z",
  perfil: "clt",
  pelo_link_fixo: false,
  ultimo_envio_em: null,
  arquivos_recebidos: 0,
};

function comQuery(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  rpc.mockReset();
  abrirWa.mockReset();
  enviarArquivoDaPasta.mockReset();
  Object.values(toast).forEach((f) => f.mockReset());
});
afterEach(() => cleanup());

describe("Link de documentos (link fixo do corretor)", () => {
  it("sem link: cria; com link: WhatsApp com o convite e o endereço público", async () => {
    rpc.mockImplementation(async (nome: string) =>
      nome === "meu_documentacao_link" ? { data: null, error: null } : { data: LINK, error: null },
    );
    comQuery(
      <LinkDocumentosDialog>
        <button type="button">Link de documentos</button>
      </LinkDocumentosDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Link de documentos" }));
    fireEvent.click(await screen.findByRole("button", { name: /Criar meu link/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("criar_meu_documentacao_link"));

    const url = `${window.location.origin}/documentos/${LINK.slug}`;
    expect(
      ((await screen.findByLabelText("Endereço do link de documentos")) as HTMLInputElement).value,
    ).toBe(url);
    const wa = screen.getByRole("link", { name: /WhatsApp/ });
    const texto = decodeURIComponent(wa.getAttribute("href")!.split("text=")[1]);
    expect(texto).toContain("Aqui é Ana, da Seu Metro Quadrado.");
    expect(texto).toContain(url);
    expect(screen.getByText("2 clientes pelo link.")).toBeTruthy();
  });

  it("gerar novo pede confirmação e troca o link", async () => {
    rpc.mockImplementation(async (nome: string) => ({
      data: nome === "trocar_meu_documentacao_link" ? { ...LINK, slug: "Zz9_-xYz09QWerty" } : LINK,
      error: null,
    }));
    comQuery(
      <LinkDocumentosDialog>
        <button type="button">Link de documentos</button>
      </LinkDocumentosDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Link de documentos" }));
    fireEvent.click(await screen.findByRole("button", { name: /Gerar novo/ }));
    expect(rpc).not.toHaveBeenCalledWith("trocar_meu_documentacao_link");
    fireEvent.click(await screen.findByRole("button", { name: "Gerar novo" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("trocar_meu_documentacao_link"));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Endereço do link de documentos") as HTMLInputElement).value,
      ).toContain("/documentos/Zz9_-xYz09QWerty"),
    );
  });
});

describe("Link da pasta na aba Documentação", () => {
  it("gera o link e manda no WhatsApp do lead (renovando o prazo)", async () => {
    rpc.mockImplementation(async (nome: string) =>
      nome === "consultar_pasta_do_lead"
        ? { data: null, error: null }
        : { data: PASTA, error: null },
    );
    comQuery(
      <PastaClienteCard
        leadId="lead-1"
        lead={{ nome: "Marina Souza", telefone: "(11) 98765-0000" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Gerar link da pasta/ }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("link_pasta_do_lead", { _lead_id: "lead-1" }),
    );
    const url = `${window.location.origin}/pasta/${TOKEN}`;
    expect(
      ((await screen.findByLabelText("Endereço do link da pasta")) as HTMLInputElement).value,
    ).toBe(url);
    expect(screen.getByText(/Nenhum arquivo pelo link ainda/)).toBeTruthy();

    rpc.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Mandar no WhatsApp/ }));
    expect(abrirWa).toHaveBeenCalledWith(
      { id: "lead-1", nome: "Marina Souza", telefone: "(11) 98765-0000" },
      expect.objectContaining({
        mensagem: expect.stringContaining(`Olá, Marina! Aqui é Ana`),
        titulo: "Link da pasta de documentos enviado via WhatsApp",
      }),
    );
    expect(abrirWa.mock.calls[0][1].mensagem).toContain(url);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("link_pasta_do_lead", { _lead_id: "lead-1" }),
    );
  });
});

describe("A pasta do cliente", () => {
  const pasta = {
    corretor_nome: "Ana Paula Corretora",
    corretor_whatsapp: "5511912345678",
    expira_em: "2026-11-14T15:00:00Z",
    itens: [
      {
        id: "a1111111-1111-4111-8111-111111111111",
        tipo: "documento_identidade",
        status: "recebido" as const,
        tem_arquivo: true,
        atualizado_em: "2026-10-15T12:00:00Z",
      },
      {
        id: "b2222222-2222-4222-8222-222222222222",
        tipo: "holerites",
        status: "pendente" as const,
        tem_arquivo: false,
        atualizado_em: "2026-10-15T12:00:00Z",
      },
    ],
  };

  it("mostra o andamento e manda o 1º arquivo no item e os outros a mais", async () => {
    enviarArquivoDaPasta.mockResolvedValue({ documentacao_id: "x", versao: 1 });
    const onAtualizar = vi.fn();
    render(<PastaView token={TOKEN} pasta={pasta} onAtualizar={onAtualizar} />);

    expect(screen.getByText("1 de 2 documentos")).toBeTruthy();
    const rg = screen.getByRole("listitem", { name: "RG ou CNH" });
    expect(within(rg).getByText("Enviado")).toBeTruthy();
    const hol = screen.getByRole("listitem", { name: "3 últimos holerites / contracheques" });
    expect(within(hol).getByText("Falta enviar")).toBeTruthy();

    const input = within(hol).getByLabelText(/Arquivo de/) as HTMLInputElement;
    const arquivos = [
      new File(["%PDF-1"], "agosto.pdf", { type: "application/pdf" }),
      new File(["%PDF-1"], "setembro.pdf", { type: "application/pdf" }),
    ];
    fireEvent.change(input, { target: { files: arquivos } });

    await waitFor(() => expect(onAtualizar).toHaveBeenCalled());
    expect(enviarArquivoDaPasta.mock.calls.map((c) => c[1])).toEqual([
      { documentacaoId: "b2222222-2222-4222-8222-222222222222" },
      { tipo: "holerites" },
    ]);
    expect(await within(hol).findByText("2 arquivos enviados.")).toBeTruthy();
    // "Outro documento" fica sempre à mão.
    expect(screen.getByRole("button", { name: /Enviar outro documento/ })).toBeTruthy();
  });

  it("erro do servidor aparece no item e para a fila", async () => {
    const { DocumentacaoHttpError } = await import("@/features/documentacao-publica/api");
    enviarArquivoDaPasta.mockRejectedValue(new DocumentacaoHttpError(415, "arquivo_invalido"));
    const onAtualizar = vi.fn();
    render(<PastaView token={TOKEN} pasta={pasta} onAtualizar={onAtualizar} />);
    const hol = screen.getByRole("listitem", { name: "3 últimos holerites / contracheques" });
    fireEvent.change(within(hol).getByLabelText(/Arquivo de/), {
      target: {
        files: [new File(["x"], "a.zip", { type: "application/zip" }), new File(["x"], "b.pdf")],
      },
    });
    expect(await within(hol).findByRole("alert")).toHaveTextContent(
      "Envie foto (JPG, PNG ou WebP) ou PDF de até 15 MB.",
    );
    expect(enviarArquivoDaPasta).toHaveBeenCalledTimes(1);
    expect(onAtualizar).not.toHaveBeenCalled();
  });
});

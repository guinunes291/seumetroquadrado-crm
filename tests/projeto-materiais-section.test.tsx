import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProjetoMateriaisSection } from "@/features/projetos/projeto-materiais-section";
import { materiaisDoProjeto, type MaterialRow } from "@/lib/projeto-materiais";

const planta: MaterialRow = {
  id: "p1",
  tipo: "planta",
  titulo: "Planta 2 dorms",
  url: "https://drive.google.com/planta-2d",
  descricao: "final 1 e 2",
  ordem: 10,
  ativo: true,
};

const materiais = materiaisDoProjeto({ book_url: "https://drive.google.com/book" }, [planta]);

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => cleanup());

describe("ProjetoMateriaisSection", () => {
  it("agrupa por tipo, abre em nova aba e devolve o gesto ao pai", () => {
    const onAbrir = vi.fn();
    render(
      <ProjetoMateriaisSection
        nomeProjeto="Residencial Aurora"
        materiais={materiais}
        podeGerir={false}
        onAbrir={onAbrir}
      />,
    );

    expect(screen.getByText("Book")).toBeInTheDocument();
    expect(screen.getByText("Planta")).toBeInTheDocument();
    expect(screen.getByText("Book do empreendimento")).toBeInTheDocument();
    expect(screen.getByText(/Google Drive · final 1 e 2/)).toBeInTheDocument();

    const abrir = screen.getByRole("link", { name: "Abrir Planta 2 dorms" });
    expect(abrir).toHaveAttribute("href", planta.url);
    expect(abrir).toHaveAttribute("target", "_blank");
    fireEvent.click(abrir);
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", tipo: "planta" }));
  });

  it("copia o link de um material e o pacote inteiro para o WhatsApp", async () => {
    render(
      <ProjetoMateriaisSection
        nomeProjeto="Residencial Aurora"
        materiais={materiais}
        podeGerir={false}
        onAbrir={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copiar link de Planta 2 dorms" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(planta.url));

    fireEvent.click(screen.getByRole("button", { name: /Copiar todos os links/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    const pacote = writeText.mock.calls[1][0] as string;
    expect(pacote).toContain("Residencial Aurora");
    expect(pacote).toContain("https://drive.google.com/book");
    expect(pacote).toContain(planta.url);
  });

  it("vazio: gestão ganha o botão de adicionar; corretor, a orientação", () => {
    const onGerir = vi.fn();
    const { unmount } = render(
      <ProjetoMateriaisSection
        nomeProjeto="Residencial Aurora"
        materiais={[]}
        podeGerir
        onAbrir={() => {}}
        onGerir={onGerir}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Adicionar materiais" }));
    expect(onGerir).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <ProjetoMateriaisSection
        nomeProjeto="Residencial Aurora"
        materiais={[]}
        podeGerir={false}
        onAbrir={() => {}}
      />,
    );
    expect(screen.getByText(/Peça à gestão/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar materiais" })).toBeNull();
  });

  it("sem a migration aplicada, a gestão vê que a gestão está indisponível em vez de um botão morto", () => {
    render(
      <ProjetoMateriaisSection
        nomeProjeto="Residencial Aurora"
        materiais={materiais}
        podeGerir={false}
        gestaoIndisponivel
        onAbrir={() => {}}
      />,
    );
    expect(screen.getByText("Gestão indisponível")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gerir/ })).toBeNull();
  });
});

// Documentação & Projetos na identidade Lançamento (2026-10): a barra de renda
// como no vídeo de lançamento — "Renda familiar", os chips, "Só o que cabe" e
// a contagem numa linha — sem perder o campo livre nem o aviso de estimativa.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RendaCliente } from "@/features/projetos/renda-cliente";

afterEach(() => cleanup());

function Barra({
  inicial = null,
  contagem,
  onSoQueCabe = () => {},
}: {
  inicial?: number | null;
  contagem?: number;
  onSoQueCabe?: (v: boolean) => void;
}) {
  const [renda, setRenda] = useState<number | null>(inicial);
  const [soQueCabe, setSoQueCabe] = useState(false);
  return (
    <RendaCliente
      renda={renda}
      onChange={setRenda}
      soQueCabe={soQueCabe}
      onSoQueCabe={(v) => {
        setSoQueCabe(v);
        onSoQueCabe(v);
      }}
      contagem={contagem}
    />
  );
}

describe("RendaCliente", () => {
  it("o chip escolhido fica marcado e o aviso mostra a faixa", () => {
    render(<Barra />);
    const chip = screen.getByRole("button", { name: /5\.000/ });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Não é aprovação: a análise formal é da Caixa/)).toBeTruthy();
    // Com um chip escolhido, o campo livre não repete o valor.
    expect((screen.getByLabelText("Renda familiar") as HTMLInputElement).value).toBe("");
  });

  it("'Só o que cabe' só funciona com renda escolhida", () => {
    const onSoQueCabe = vi.fn();
    render(<Barra onSoQueCabe={onSoQueCabe} />);
    const filtro = screen.getByRole("button", { name: /Só o que cabe/ });
    expect((filtro as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /4\.000/ }));
    expect((filtro as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(filtro);
    expect(onSoQueCabe).toHaveBeenCalledWith(true);
    expect(filtro.getAttribute("aria-pressed")).toBe("true");
  });

  it("o campo livre aceita a renda que não está nos chips, e limpa", () => {
    render(<Barra />);
    const campo = screen.getByLabelText("Renda familiar") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "4.500" } });
    // O campo normaliza para o número lido (comportamento de antes).
    expect(campo.value).toBe("4500");
    expect(screen.getByText(/estimativa PRICE/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar renda" }));
    expect(campo.value).toBe("");
    expect(screen.getByText(/Escolha a renda para ver em cada empreendimento/)).toBeTruthy();
  });

  it("mostra a contagem da prateleira, no singular e no plural", () => {
    const { rerender } = render(<Barra contagem={158} />);
    expect(screen.getByText("158 empreendimentos")).toBeTruthy();
    rerender(<Barra contagem={1} />);
    expect(screen.getByText("1 empreendimento")).toBeTruthy();
  });
});

describe("tela de Documentação & Projetos", () => {
  it("o título é o do módulo, com a frase do vídeo", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/features/projetos/projetos-foco-page.tsx"),
      "utf8",
    );
    expect(page).toContain('title="Documentação & Projetos"');
    expect(page).toContain("Books, tabelas e catálogo. E só o que cabe na renda do cliente.");
  });
});

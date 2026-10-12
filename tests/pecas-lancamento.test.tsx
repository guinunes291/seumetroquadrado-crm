// As peças comuns do padrão Lançamento (Fase 1 do plano das demais páginas):
// placar, cartão principal, painel, "vendo de outro", selo ao vivo, filtros e
// o menu "…" da linha. Construídas uma vez em components/ui; cada tela só
// aplica. O que estes testes travam é o contrato de cada peça — o desenho da
// Fila Única que as originou continua coberto por fila-cockpit.test.tsx e
// central-comando-lancamento.test.tsx, sem edição.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { AnelNdeM, Numero, Placar } from "@/components/ui/placar";
import { CartaoPrincipal } from "@/components/ui/cartao-principal";
import { Painel } from "@/components/ui/painel";
import { SeloAoVivo } from "@/components/ui/selo-ao-vivo";
import { FiltrosMenu } from "@/components/ui/filtros-menu";
import { AcoesLinha } from "@/components/ui/acoes-linha";
import { VendoDeOutro } from "@/components/vendo-de-outro";

afterEach(() => cleanup());

describe("AnelNdeM", () => {
  it("diz ao leitor de tela o que conta e enche no teto quando estoura", () => {
    render(<AnelNdeM valor={70} teto={65} rotulo="em atendimento" />);
    expect(screen.getByRole("img", { name: "70 de 65 em atendimento" })).toBeTruthy();
  });

  it("mantém o rótulo da Fila por padrão", () => {
    render(<AnelNdeM valor={37} teto={65} />);
    expect(screen.getByRole("img", { name: "37 de 65 leads no dia" })).toBeTruthy();
  });
});

describe("Numero", () => {
  it("só acende a cor acima de zero", () => {
    const { rerender } = render(<Numero valor={3} rotulo="vencidos" cor="text-destructive" />);
    expect(screen.getByText("3").className).toContain("text-destructive");
    rerender(<Numero valor={0} rotulo="vencidos" cor="text-destructive" />);
    expect(screen.getByText("0").className).not.toContain("text-destructive");
    expect(screen.getByText("0").className).toContain("text-foreground");
  });
});

describe("Placar", () => {
  it("anel, números com dono e notas num cartão só", () => {
    render(
      <Placar
        titulo="Minha base"
        anel={{ valor: 37, teto: 65, rotulo: "em atendimento" }}
        numeros={[
          { valor: 28, rotulo: "vagas livres", cor: "text-foreground" },
          { valor: 44, rotulo: "na base", cor: "text-foreground" },
          { valor: 5, rotulo: "precisam de passo", cor: "text-destructive" },
        ]}
        notas={<span>Lotado: entra um, sai um.</span>}
        data-testid="placar"
      />,
    );
    const placar = screen.getByTestId("placar");
    expect(within(placar).getByRole("img", { name: "37 de 65 em atendimento" })).toBeTruthy();
    expect(within(placar).getByText("vagas livres").previousSibling?.textContent).toBe("28");
    expect(within(placar).getByText("precisam de passo").previousSibling?.textContent).toBe("5");
    expect(within(placar).getByText("Lotado: entra um, sai um.")).toBeTruthy();
    expect(placar.getAttribute("aria-label")).toBe("Minha base");
  });
});

describe("CartaoPrincipal", () => {
  it("título, destaque, números, notas, uma ação e o rodapé, nessa ordem", () => {
    render(
      <CartaoPrincipal
        titulo="Caixa do mês"
        subtitulo="outubro de 2026"
        destaque={<span>R$ 48.300</span>}
        numeros={<div>números</div>}
        notas={<div>notas</div>}
        acao={<button type="button">Pagar 6 aptas</button>}
        rodape={<div>rodapé</div>}
      />,
    );
    const cartao = screen.getByRole("region", { name: "Caixa do mês" });
    const texto = cartao.textContent ?? "";
    const ordem = [
      "Caixa do mês",
      "outubro de 2026",
      "R$ 48.300",
      "números",
      "notas",
      "Pagar",
      "rodapé",
    ];
    const posicoes = ordem.map((t) => texto.indexOf(t));
    expect(posicoes.every((p) => p > -1)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
  });
});

describe("Painel", () => {
  it("título com o recorte ao lado e a ação no pé", () => {
    render(
      <Painel titulo="Exceções presas" sub="3" acao={<a href="/x">Ver todas</a>}>
        <p>Daniela Freitas · Sul</p>
      </Painel>,
    );
    const painel = screen.getByRole("region", { name: "Exceções presas" });
    expect(within(painel).getByText("3")).toBeTruthy();
    expect(within(painel).getByRole("link", { name: "Ver todas" })).toBeTruthy();
  });
});

describe("SeloAoVivo", () => {
  it("diz 'ao vivo' e explica no tooltip o que se atualiza", () => {
    render(<SeloAoVivo title="Atualiza a cada 60 s." />);
    expect(screen.getByText("ao vivo").getAttribute("title")).toBe("Atualiza a cada 60 s.");
  });
});

describe("VendoDeOutro", () => {
  it("diz de quem é a tela e leva de volta à própria", () => {
    render(
      <VendoDeOutro oQue="a base" nome="Marina Costa" voltarPara="/reserva" data-testid="v" />,
    );
    expect(screen.getByTestId("v").textContent).toContain("Vendo a base de Marina Costa");
    expect(screen.getByRole("link", { name: "voltar para a minha" }).getAttribute("href")).toBe(
      "/reserva",
    );
  });
});

describe("FiltrosMenu", () => {
  it("resume o estado em texto, conta os ativos e limpa", async () => {
    const limpar = vi.fn();
    render(
      <FiltrosMenu ativos={2} resumo="Outubro de 2026 · pendentes" onLimpar={limpar}>
        <label>
          Status <select aria-label="Status" />
        </label>
      </FiltrosMenu>,
    );
    expect(screen.getByText("Outubro de 2026 · pendentes")).toBeTruthy();
    const botao = screen.getByRole("button", { name: "Filtros (2 ativos)" });
    fireEvent.click(botao);
    await waitFor(() => expect(screen.getByLabelText("Status")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(limpar).toHaveBeenCalled();
  });

  it("sem filtro ativo, o botão não mostra número nem 'Limpar'", async () => {
    render(
      <FiltrosMenu ativos={0} onLimpar={vi.fn()}>
        <p>controles</p>
      </FiltrosMenu>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    await waitFor(() => expect(screen.getByText("controles")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
  });
});

describe("AcoesLinha", () => {
  it("esconde a ação oculta e some quando não sobra nenhuma", () => {
    const { container } = render(
      <AcoesLinha acoes={[{ rotulo: "Reverter", onSelect: vi.fn(), oculta: true }]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("a ação destrutiva pede confirmação antes de rodar", async () => {
    const cancelar = vi.fn();
    const editar = vi.fn();
    render(
      <AcoesLinha
        rotulo="Ações da comissão"
        acoes={[
          { rotulo: "Editar", onSelect: editar },
          {
            rotulo: "Cancelar comissão",
            onSelect: cancelar,
            destrutiva: { titulo: "Cancelar esta comissão?", confirmar: "Cancelar comissão" },
          },
        ]}
      />,
    );
    const gatilho = screen.getByRole("button", { name: "Ações da comissão" });
    fireEvent.pointerDown(gatilho, { button: 0, pointerType: "mouse" });
    const item = await screen.findByRole("menuitem", { name: "Cancelar comissão" });
    fireEvent.click(item);
    expect(cancelar).not.toHaveBeenCalled();
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Cancelar esta comissão?")).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar comissão" }));
    expect(cancelar).toHaveBeenCalledTimes(1);
    expect(editar).not.toHaveBeenCalled();
  });
});

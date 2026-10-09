import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedNumber } from "@/components/ui/animated-number";

// Simula prefers-reduced-motion: reduce — o contrato de acessibilidade do
// ticker é mostrar o valor final DIRETO, sem contagem.
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AnimatedNumber", () => {
  it("sob reduced-motion mostra o valor final direto, sem animar", () => {
    render(<AnimatedNumber value={1234} />);
    expect(screen.getByText("1.234")).toBeInTheDocument();
  });

  it("aplica formatação customizada (ex.: moeda)", () => {
    render(
      <AnimatedNumber
        value={1500}
        format={(n) =>
          n.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
            maximumFractionDigits: 0,
          })
        }
      />,
    );
    expect(screen.getByText(/R\$\s?1\.500/)).toBeInTheDocument();
  });

  it("usa tabular-nums (largura fixa por dígito — zero layout shift)", () => {
    const { container } = render(<AnimatedNumber value={42} />);
    expect(container.firstElementChild?.className).toContain("tabular-nums");
  });
});

// Com movimento liberado: a contagem tem que CHEGAR ao valor — inclusive sob o
// StrictMode do dev, que roda o efeito duas vezes (o número ficava em 0).
describe("AnimatedNumber com movimento", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const strict of [false, true]) {
    it(`conta até o valor final${strict ? " sob StrictMode" : ""}`, async () => {
      const ui = <AnimatedNumber value={37} durationMs={100} />;
      render(strict ? <StrictMode>{ui}</StrictMode> : ui);
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByText("37")).toBeInTheDocument();
    });
  }

  it("interrompida por um novo alvo, segue até o novo valor", async () => {
    const { rerender } = render(<AnimatedNumber value={10} durationMs={100} />);
    await act(async () => {
      vi.advanceTimersByTime(40);
    });
    rerender(<AnimatedNumber value={20} durationMs={100} />);
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("20")).toBeInTheDocument();
  });
});

// Identidade Lançamento (2026-10): o CRM com a cara do vídeo de lançamento.
// Trava o que a moldura promete em toda tela — o número fixo de cada módulo
// e o eyebrow "Módulo 0X" do PageHeader — sem depender do roteador.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/page-header";
import { ModuloAtualContext } from "@/features/nav/modulo-atual";
import { numeroDoModulo, SISTEMAS_NAV } from "@/features/nav/sistemas";

describe("numeroDoModulo", () => {
  it("numera de 01 a 10 na ordem do registro, com Configurações fora", () => {
    const numerados = SISTEMAS_NAV.filter((s) => s.id !== "configuracoes").map((s) => [
      s.id,
      numeroDoModulo(s.id),
    ]);
    expect(numerados).toEqual([
      ["central-comando", 1],
      ["prospeccao", 2],
      ["carteira", 3],
      ["visita", 4],
      ["follow-up", 5],
      ["sdr", 6],
      ["docs-projetos", 7],
      ["financeiro", 8],
      ["bi", 9],
      ["academia", 10],
    ]);
  });

  it("Configurações não é módulo de trabalho: sem número", () => {
    expect(numeroDoModulo("configuracoes")).toBeNull();
  });
});

describe("eyebrow do PageHeader", () => {
  const comModulo = (ui: React.ReactNode) =>
    render(
      <ModuloAtualContext.Provider value={{ numero: 3, titulo: "Gestão de Carteira" }}>
        {ui}
      </ModuloAtualContext.Provider>,
    );

  it("no título do próprio módulo, só o número", () => {
    comModulo(<PageHeader title="Gestão de Carteira" />);
    expect(screen.getByText("Módulo 03")).toBeInTheDocument();
  });

  it("numa seção, o número e o nome do módulo", () => {
    comModulo(<PageHeader title="Kanban" />);
    expect(screen.getByText("Módulo 03 · Gestão de Carteira")).toBeInTheDocument();
  });

  it("`contexto` troca o nome do módulo (ex.: a data na Fila Única)", () => {
    comModulo(<PageHeader title="Fila Única" contexto="sexta-feira, 9 de outubro" />);
    expect(screen.getByText("Módulo 03 · sexta-feira, 9 de outubro")).toBeInTheDocument();
  });

  it("`eyebrow={false}` desliga; fora do shell não há eyebrow", () => {
    const { container } = comModulo(<PageHeader title="Kanban" eyebrow={false} />);
    expect(container.textContent).not.toContain("Módulo");
    const fora = render(<PageHeader title="Kanban" />);
    expect(fora.container.textContent).not.toContain("Módulo");
  });
});

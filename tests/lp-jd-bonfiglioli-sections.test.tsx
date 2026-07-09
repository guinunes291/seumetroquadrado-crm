import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LpHero } from "@/components/lp-jd-bonfiglioli/lp-hero";
import { LpPlantas } from "@/components/lp-jd-bonfiglioli/lp-plantas";
import { LpForm } from "@/components/lp-jd-bonfiglioli/lp-form";

describe("<LpHero />", () => {
  it("renderiza headline, âncora de preço e os dois CTAs", () => {
    render(<LpHero />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Metrô Vila Sônia");
    // Preço âncora aparece no subtítulo e no card de tabela.
    expect(screen.getAllByText(/R\$\s237\.900/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: /ver se minha renda aprova/i })).toBeInTheDocument();
    // Sem número de WhatsApp configurado, o CTA degrada para o formulário.
    expect(screen.getByRole("button", { name: /falar com um especialista/i })).toBeInTheDocument();
  });
});

describe("<LpPlantas />", () => {
  it("mostra as 7 plantas com preços e o destaque da 41 m²", () => {
    render(<LpPlantas onEscolher={() => {}} />);
    expect(screen.getAllByRole("button", { name: /simular esta planta/i })).toHaveLength(7);
    expect(screen.getByText(/R\$\s237\.900/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s339\.900/)).toBeInTheDocument();
    expect(screen.getAllByText(/planta inédita e exclusiva/i).length).toBeGreaterThanOrEqual(2);
  });

  it("CTA da planta chama onEscolher com o id correto", () => {
    const onEscolher = vi.fn();
    render(<LpPlantas onEscolher={onEscolher} />);
    fireEvent.click(screen.getAllByRole("button", { name: /simular esta planta/i })[0]);
    expect(onEscolher).toHaveBeenCalledWith("32-his1");
  });
});

describe("<LpForm />", () => {
  const props = { selectedPlanta: null, simulacao: null, marketing: null, aluguel: null };

  it("valida o passo 1 antes de avançar", () => {
    render(<LpForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(screen.getByText(/digite seu nome completo/i)).toBeInTheDocument();
    expect(screen.getByText(/whatsapp válido com ddd/i)).toBeInTheDocument();
    // Continua no passo 1.
    expect(screen.getByText(/passo 1 de 2/i)).toBeInTheDocument();
  });

  it("avança ao passo 2 com nome e WhatsApp válidos", () => {
    render(<LpForm {...props} />);
    fireEvent.change(screen.getByLabelText(/seu nome/i), { target: { value: "Maria Silva" } });
    fireEvent.change(screen.getByLabelText(/whatsapp/i), { target: { value: "11987654321" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(screen.getByText(/passo 2 de 2/i)).toBeInTheDocument();
    expect(screen.getByText(/melhor horário para contato/i)).toBeInTheDocument();
  });
});

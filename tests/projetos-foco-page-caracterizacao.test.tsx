// @vitest-environment jsdom
// Caracterização de src/features/projetos/projetos-foco-page.tsx escrita ANTES
// da quebra do arquivo em módulos: o que o corretor e a gestão enxergam
// (corredores, banner, contagens), os filtros (zona, entrega, favoritos,
// incompletos, limpar), as ações do card (enviar com e sem lead, sacola,
// material, resumo, ficha, reportar erro) e os estados de erro e vazio. Os
// valores esperados foram capturados do código original e revisados à mão.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AGORA_ISO, estado, montar, prepararCenario } from "./helpers/prateleira-falsos";

const g = vi.hoisted(() => ({
  gravador: null as null | ReturnType<typeof import("./helpers/supabase-gravador").criarGravador>,
}));
const falsosDe = vi.hoisted(
  () => async (k: string) => (await import("./helpers/prateleira-falsos")).falsos[k as "auth"],
);

vi.mock("@/integrations/supabase/client", async () => {
  const { criarGravador } = await import("./helpers/supabase-gravador");
  g.gravador = criarGravador({
    leads: [
      {
        id: "L1",
        nome: "Carla",
        telefone: "11999990000",
        status: "agendado",
        renda_informada: "R$ 6 mil",
      },
    ],
  });
  return { supabase: g.gravador.cliente };
});
vi.mock("@/integrations/supabase/pendentes", async () => {
  await import("@/integrations/supabase/client");
  return { supabasePendente: g.gravador!.pendente };
});
vi.mock("@/hooks/use-auth", () => falsosDe("auth"));
vi.mock("@/hooks/use-mobile", () => falsosDe("mobile"));
vi.mock("@/hooks/use-preference", () => falsosDe("preferencia"));
vi.mock("@/hooks/use-whatsapp-lead", () => falsosDe("whatsapp"));
vi.mock("@/features/projetos/use-projeto-eventos", () => falsosDe("eventos"));
vi.mock("@/features/projetos/use-prateleira-dados", async (original) => ({
  ...(await original<object>()),
  ...(await falsosDe("dados")),
}));
vi.mock("@/features/projetos/use-construtoras-parceiras", () => falsosDe("parceiras"));
vi.mock("@/features/nav/contexto-jornada", () => falsosDe("jornada"));
vi.mock("@/features/projetos/produto-card", () => falsosDe("produtoCard"));
vi.mock("@/features/projetos/banner-campanhas", () => falsosDe("banner"));
vi.mock("@/features/projetos/renda-cliente", () => falsosDe("renda"));
vi.mock("@/features/projetos/construtoras-parceiras-dialog", () => falsosDe("gerirParceiras"));
vi.mock("@/components/vitrine/enviar-vitrine-dialog", () => falsosDe("enviar"));
vi.mock("@/components/vitrine/vitrine-shortlist-dialog", () => falsosDe("sacola"));
vi.mock("sonner", () => falsosDe("sonner"));
vi.mock("@tanstack/react-router", () => falsosDe("router"));

import { ProjetosFocoPage } from "@/features/projetos/projetos-foco-page";

const cards = () => screen.queryAllByTestId("card").map((c) => c.textContent);
const secoes = () =>
  [...document.querySelectorAll("section[aria-label]")].map(
    (s) =>
      `${s.getAttribute("aria-label")}: ${within(s as HTMLElement)
        .queryAllByTestId("card")
        .map((c) => c.textContent)
        .join(", ")}`,
  );
const chips = () =>
  within(screen.getByRole("group", { name: "Filtrar por zona" }))
    .getAllByRole("button")
    .map((b) => `${b.textContent}${b.getAttribute("aria-pressed") === "true" ? " *" : ""}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(AGORA_ISO));
  prepararCenario();
  g.gravador?.limpar();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("projetos-foco-page — caracterização", () => {
  it("corretor: só campanha e parceira; banner, corredores e contagem", () => {
    montar(<ProjetosFocoPage />);
    expect(screen.getByTestId("banner").textContent).toMatchInlineSnapshot(`"Épsilon Foco"`);
    expect(secoes()).toMatchInlineSnapshot(`
      [
        "Em foco agora: Épsilon Foco",
        "Construtoras parceiras: ",
        "Outras construtoras: Épsilon Foco",
      ]
    `);
    expect(screen.getByTestId("renda").textContent).toMatchInlineSnapshot(
      `"renda=null contagem=3 lead=undefinedrenda 300ksó que cabe"`,
    );
    expect(chips()).toMatchInlineSnapshot(`
      [
        "Todas3 *",
        "Zona Norte1",
        "Zona Sul1",
        "Zona Leste1",
      ]
    `);
    expect(screen.queryByRole("link", { name: /Catálogo completo/ })).toBeNull();
    expect(screen.queryByRole("switch", { name: /Mostrar incompletos/ })).toBeNull();
  });

  it("gestão: prateleira inteira, ações de gestão e incompletos ocultos contados", () => {
    estado.roles = ["gestor"];
    montar(<ProjetosFocoPage />);
    expect(screen.getAllByRole("link").map((l) => `${l.textContent} → ${l.getAttribute("href")}`))
      .toMatchInlineSnapshot(`
      [
        "Materiais → /projetos-materiais",
        "Catálogo completo → /projetos",
        "Links Úteis → /links-uteis",
        "Completar no Materiais → /projetos-materiais",
      ]
    `);
    expect(screen.getByRole("button", { name: /Parceiras/ })).toBeTruthy();
    expect(secoes()).toMatchInlineSnapshot(`
      [
        "Em foco agora: Épsilon Foco",
        "Construtoras parceiras: ",
        "Outras construtoras: Épsilon Foco, Gama Oeste",
      ]
    `);
    expect(screen.getByText(/fora da prateleira/).textContent).toMatchInlineSnapshot(
      `" (1 fora da prateleira)"`,
    );
    fireEvent.click(screen.getByRole("switch", { name: /Mostrar incompletos/ }));
    expect(cards()).toMatchInlineSnapshot(`
      [
        "Épsilon Foco",
        "Épsilon Foco",
        "Gama Oeste",
        "Delta Incompleto",
      ]
    `);
  });

  it("corredor da parceira abre, e o filtro de zona vira resultado plano com contagem", () => {
    montar(<ProjetosFocoPage />);
    const corredor = screen.getByRole("button", { name: /Mundo Apto/ });
    expect(corredor.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(corredor);
    expect(secoes()).toMatchInlineSnapshot(`
      [
        "Em foco agora: Épsilon Foco",
        "Construtoras parceiras: Alfa Leste, Beta Sul",
        "Outras construtoras: Épsilon Foco",
      ]
    `);
    fireEvent.click(screen.getByRole("button", { name: /Zona Sul/ }));
    expect(chips()).toMatchInlineSnapshot(`
      [
        "Todas3",
        "Zona Norte1",
        "Zona Sul1 *",
        "Zona Leste1",
      ]
    `);
    expect(secoes()).toMatchInlineSnapshot(`
      [
        "Resultados: Beta Sul",
      ]
    `);
    expect(screen.queryByTestId("banner")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Limpar/ }));
    expect(chips()[0]).toMatch(/\*$/);
  });

  it("entrega, favoritos e renda que não cabe chegam ao vazio certo", () => {
    estado.roles = ["admin"];
    montar(<ProjetosFocoPage />);
    act(() => estado.cards.p3.onFavoritar(estado.cards.p3.item));
    fireEvent.click(screen.getByRole("switch", { name: /Meus favoritos/ }));
    expect(cards()).toMatchInlineSnapshot(`
      [
        "Gama Oeste",
      ]
    `);
    expect(screen.getByText(/Meus favoritos/).textContent).toMatchInlineSnapshot(
      `"Meus favoritos (1)"`,
    );
    fireEvent.click(screen.getByRole("switch", { name: /Meus favoritos/ }));
    fireEvent.click(screen.getByRole("button", { name: "renda 300k" }));
    fireEvent.click(screen.getByRole("button", { name: "só que cabe" }));
    fireEvent.click(screen.getByRole("radio", { name: "Pronto" }));
    expect(
      screen.getByText(/Nada cabe nessa renda|Nenhum empreendimento encontrado/).textContent,
    ).toMatchInlineSnapshot(`"Nada cabe nessa renda com os filtros atuais"`);
    expect(screen.getByText(/Ajuste a busca/).textContent).toMatchInlineSnapshot(
      `"Ajuste a busca ou os filtros. Há 1 projetos fora da prateleira por cadastro incompleto."`,
    );
  });

  it("ações do card sem lead: enviar abre o diálogo, sacola, material, resumo, ficha, reportar", async () => {
    const escrever = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: escrever } });
    montar(<ProjetosFocoPage />);
    const c = estado.cards.p5;
    act(() => c.onEnviar(c.item));
    expect(estado.enviarDialog).toBe("Épsilon Foco");
    act(() => c.onComparar(c.item));
    act(() => estado.cards.p5.onComparar(estado.cards.p5.item));
    act(() => c.onAbrirMaterial(c.item, "book"));
    act(() => c.onAbrirMaterial(c.item, "tabela"));
    act(() => c.onAbrirFicha(c.item));
    act(() => c.onCopiarResumo(c.item));
    await waitFor(() => expect(estado.log.some((l) => l.startsWith("toast.success"))).toBe(true));
    expect(escrever.mock.calls[0][0]).toMatchInlineSnapshot(`
      "🏠 *Épsilon Foco*

      📍 São Paulo · Zona Norte

      🛏️ 2 dorms

      📘 Book: https://b/eps

      Quer que eu te mande o book e simule as condições para o seu perfil?"
    `);
    act(() => c.onReportarErro(c.item));
    expect(screen.getByRole("dialog").textContent).toMatchInlineSnapshot(
      `"Reportar erro no cadastroO que está errado em "Épsilon Foco" (Outra SA)? Preço, metragem, zona, link quebrado…CancelarEnviar para a gestãoClose"`,
    );
    const enviarReporte = screen.getByRole("button", { name: "Enviar para a gestão" });
    expect(enviarReporte.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Descrição do erro"), {
      target: { value: "  preço errado  " },
    });
    fireEvent.click(enviarReporte);
    expect(estado.log).toMatchInlineSnapshot(`
      [
        "evento {"tipo":"sacola_add","projetoId":"p5"}",
        "evento {"tipo":"book_abrir","projetoId":"p5"}",
        "evento {"tipo":"tabela_abrir","projetoId":"p5"}",
        "evento {"tipo":"ficha_abrir","projetoId":"p5"}",
        "toast.success Resumo copiado — cole no WhatsApp do cliente.",
        "evento {"tipo":"resumo_copiar","projetoId":"p5"}",
        "evento {"tipo":"reportar_erro","projetoId":"p5","detalhe":"preço errado"}",
        "toast.success Obrigado — a gestão recebe o reporte junto com o cadastro do projeto.",
      ]
    `);
  });

  it("com lead: lê o lead, aplica a renda dele, publica a fase e envia direto no WhatsApp", async () => {
    montar(<ProjetosFocoPage leadId="L1" />);
    await screen.findByText(/Montando a seleção para/);
    expect(g.gravador!.chamadas).toMatchInlineSnapshot(`
      [
        "supabase.from(leads).select("id, nome, telefone, status, renda_informada").eq("id","L1").maybeSingle()",
      ]
    `);
    expect(screen.getByTestId("renda").textContent).toMatchInlineSnapshot(
      `"renda=6000 contagem=3 lead=Carlarenda 300ksó que cabe"`,
    );
    const c = estado.cards.p5;
    act(() => c.onEnviar(c.item));
    act(() => c.onComparar(c.item));
    expect(estado.enviarDialog).toBeNull();
    expect(estado.fase).toBe("agendado");
    expect(screen.getByTestId("sacola").textContent).toBe("Épsilon Foco|Carla");
    expect(estado.log).toMatchInlineSnapshot(`
      [
        "whatsapp L1 "Empreendimento enviado via WhatsApp: Épsilon Foco" "Oi, Carla! Separei um empreendimento que combina com o que você procura: Épsilon Foco (Zona Norte · a partir de Sob consulta). Quer que eu te mande o book e a tabela completa?\\n\\nBook do empreendimento: https://b/eps"",
        "evento {"tipo":"enviar_lead","projetoId":"p5","leadId":"L1"}",
        "evento {"tipo":"sacola_add","projetoId":"p5","leadId":"L1"}",
      ]
    `);
  });

  it("erro ao carregar os projetos e catálogo vazio", () => {
    estado.projetosErro = true;
    const { unmount } = montar(<ProjetosFocoPage />);
    expect(screen.getByText("Não foi possível carregar os projetos.")).toBeTruthy();
    unmount();
    estado.projetosErro = false;
    estado.projetos = [];
    montar(<ProjetosFocoPage />);
    expect(screen.getByText("Nenhum empreendimento ativo no catálogo")).toBeTruthy();
  });
});

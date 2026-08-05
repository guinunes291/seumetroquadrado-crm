import { describe, it, expect } from "vitest";
import { montarResumoProjeto } from "@/features/projetos/projetos-foco-page";
import type { ProjetoRow } from "@/components/projeto-card";

// Fábrica de projeto com defaults nulos; sobrescreve só o que o teste precisa.
function mk(over: Partial<ProjetoRow>): ProjetoRow {
  return {
    id: "x",
    nome: "Residencial Aurora",
    slug: "residencial-aurora",
    construtora: null,
    cidade: null,
    regiao: null,
    bairro: null,
    endereco: null,
    logradouro: null,
    numero: null,
    observacoes: null,
    ativo: true,
    metragem_min: null,
    metragem_max: null,
    dorms_min: null,
    dorms_max: null,
    suites: null,
    tipologia: null,
    tipo_extra: null,
    vagas_min: null,
    vagas_max: null,
    vagas_observacao: null,
    preco_a_partir: null,
    sob_consulta: false,
    status_entrega: null,
    mes_entrega: null,
    ano_entrega: null,
    fonte: null,
    zona_smq: null,
    ...over,
  };
}

describe("montarResumoProjeto", () => {
  it("leva os links de book e tabela para a mensagem do cliente", () => {
    const texto = montarResumoProjeto(
      mk({
        book_url: "https://drive.exemplo/book.pdf",
        tabela_precos_url: "https://drive.exemplo/tabela.pdf",
      }),
    );
    expect(texto).toContain("https://drive.exemplo/book.pdf");
    expect(texto).toContain("https://drive.exemplo/tabela.pdf");
  });

  it("omite a linha de material quando o projeto não tem book nem tabela", () => {
    const texto = montarResumoProjeto(mk({}));
    expect(texto).not.toContain("Book:");
    expect(texto).not.toContain("Tabela:");
  });

  it("resume localização, ficha e entrega quando os dados existem", () => {
    const texto = montarResumoProjeto(
      mk({
        bairro: "Tatuapé",
        cidade: "São Paulo",
        dorms_min: 2,
        dorms_max: 2,
        metragem_min: 42,
        metragem_max: 58,
        status_entrega: "Em obras",
        mes_entrega: 6,
        ano_entrega: 2027,
      }),
    );
    expect(texto).toContain("Tatuapé, São Paulo");
    expect(texto).toContain("2 dorms");
    expect(texto).toContain("42 – 58 m²");
    expect(texto).toContain("Em obras · 06/2027");
  });

  it("não anuncia preço de projeto sob consulta", () => {
    const texto = montarResumoProjeto(mk({ sob_consulta: true, preco_a_partir: 350000 }));
    expect(texto).not.toContain("A partir de");
  });

  it("mantém a pergunta de fechamento como último parágrafo", () => {
    const texto = montarResumoProjeto(
      mk({ bairro: "Santana", book_url: "https://drive.exemplo/book.pdf" }),
    );
    const paragrafos = texto.split("\n\n");
    expect(paragrafos[paragrafos.length - 1]).toContain("book");
    expect(paragrafos[paragrafos.length - 1]).toMatch(/\?$/);
  });
});

// Kit de PDF da marca (lib/pdf-marca) e os PDFs que passaram a usá-lo
// (2026-10-11): todo PDF exportável do CRM no mesmo visual.
import { describe, expect, it } from "vitest";
import {
  capaMarca,
  estilosMarca,
  faixaMarca,
  logoMarca,
  MARCA,
  RODAPE_CLIENTE,
  RODAPE_INTERNO,
} from "@/lib/pdf-marca";
import { DRE_LINHAS, montarHtmlDre, type DreGrade } from "@/lib/dre";
import { montarHtmlCertificado } from "@/features/academia/certificado-pdf";
import { montarHtmlRelatorio } from "@/features/dashboard/relatorios-pdf";

describe("kit da marca", () => {
  it("cores e fontes da identidade SMQ", () => {
    expect(MARCA.navy).toBe("#0F1E3A");
    expect(MARCA.gold).toBe("#B89968");
    expect(MARCA.creme).toBe("#F5F1EA");
    const css = estilosMarca({ origem: "https://crm.exemplo" });
    expect(css).toContain(
      'url("https://crm.exemplo/fonts/aurum/montserrat-latin-wght-normal.woff2")',
    );
    expect(css).toContain('url("https://crm.exemplo/fonts/aurum/inter-latin-wght-normal.woff2")');
    expect(css).toContain("size: A4 portrait");
    expect(css).toContain(`background: ${MARCA.creme}`);
  });

  it("rodapé com página X de Y e texto conforme o público", () => {
    expect(estilosMarca({ origem: "" })).toContain(`content: "${RODAPE_CLIENTE}"`);
    expect(estilosMarca({ origem: "", rodape: RODAPE_INTERNO })).toContain("documento interno");
    expect(estilosMarca({ origem: "" })).toContain('counter(page) " de " counter(pages)');
    expect(estilosMarca({ origem: "", rodape: 'a "b"' })).toContain('content: "a \\"b\\""');
  });

  it("paisagem para o documento inteiro ou para um trecho", () => {
    expect(estilosMarca({ origem: "", paisagem: true })).toContain("size: A4 landscape");
    expect(estilosMarca({ origem: "" })).toContain("@page paisagem");
  });

  it("capa, faixa e logo", () => {
    const capa = capaMarca({
      sobre: "RELATÓRIO",
      tituloHtml: "Vendas",
      destaqueHtml: "setembro",
      subtituloHtml: "gerado hoje",
    });
    expect(capa).toContain('class="m-capa"');
    expect(capa).toContain("<h1>Vendas <span>setembro</span></h1>");
    expect(capa).toContain('aria-label="Seu Metro Quadrado"');
    expect(faixaMarca({ rotuloHtml: "DRE" })).toContain("<em>DRE</em>");
    expect(logoMarca(30)).toContain(`stroke="${MARCA.gold}"`);
  });
});

describe("PDFs no padrão da marca", () => {
  const semTravessaoNaCasca = (html: string) =>
    html.slice(0, html.indexOf("<body>")).includes("—") === false;

  it("relatórios: capa da marca e rodapé interno", () => {
    const html = montarHtmlRelatorio({
      titulo: "Relatório de Vendas",
      periodo: "set/2026",
      blocos: [],
      origem: "",
    });
    expect(html).toContain('class="m-capa"');
    expect(html).toContain("RELATÓRIO DE GESTÃO");
    expect(html).toContain(RODAPE_INTERNO);
  });

  it("DRE: paisagem, faixa da marca, subtotais e negativos destacados, escapado", () => {
    const grade = Object.fromEntries(
      DRE_LINHAS.map((d, k) => [d.key, Array.from({ length: 13 }, () => (k === 2 ? -100 : 100))]),
    ) as DreGrade;
    const html = montarHtmlDre({
      titulo: "DRE <2026>",
      subtitulo: "competência",
      grade,
      origem: "",
    });
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain('class="m-faixa"');
    expect(html).toContain('<tr class="sub">');
    expect(html).toContain('class="n neg"');
    expect(html).toContain("DRE &lt;2026&gt;");
    expect(semTravessaoNaCasca(html)).toBe(true);
  });

  it("certificado: folha paisagem com logo, nome, nível e código, escapado", () => {
    const html = montarHtmlCertificado(
      {
        nome: "Ana <Carol>",
        nivel: "Ouro",
        dataExtenso: "11 de outubro de 2026",
        emitidoEm: "11/10/2026",
        codigo: "ABC12345",
      },
      { origem: "" },
    );
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain("Certificado de nível");
    expect(html).toContain("Ana &lt;Carol&gt;");
    expect(html).toContain("ABC12345");
    expect(html).toContain('aria-label="Seu Metro Quadrado"');
  });
});

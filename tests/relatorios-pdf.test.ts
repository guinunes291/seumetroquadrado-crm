// Exportar PDF dos Relatórios: o documento é HTML montado à mão a partir de
// dados do banco (nome de cliente, observação de análise, motivo de
// distrato) — o escape é a diferença entre um PDF e uma injeção de HTML.

import { describe, expect, it } from "vitest";
import {
  escPdf,
  kpisPdf,
  montarHtmlRelatorio,
  periodoLabelPdf,
  tabelaPdf,
} from "@/features/dashboard/relatorios-pdf";

describe("escPdf", () => {
  it("escapa HTML — nome de cliente malicioso vira texto, nunca markup", () => {
    expect(escPdf(`<img src=x onerror=alert(1)> & "aspas"`)).toBe(
      "&lt;img src=x onerror=alert(1)&gt; &amp; &quot;aspas&quot;",
    );
    expect(escPdf(null)).toBe("");
    expect(escPdf(42)).toBe("42");
  });
});

describe("tabelaPdf", () => {
  it("monta cabeçalho e linhas com célula nula virando travessão", () => {
    const html = tabelaPdf(
      ["Cliente", "Valor"],
      [
        ["Ana", "R$ 100"],
        [null, undefined],
      ],
      { direita: [1] },
    );
    expect(html).toContain(">Cliente</th>");
    expect(html).toContain('text-align:right">Valor</th>');
    expect(html).toContain(">Ana</td>");
    expect((html.match(/>—<\/td>/g) ?? []).length).toBe(2);
  });

  it("escapa o conteúdo das células (dado do banco não vira HTML)", () => {
    const html = tabelaPdf(["Obs"], [["<script>alert(1)</script>"]]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("sem linhas devolve o aviso de vazio, não uma tabela oca", () => {
    expect(tabelaPdf(["A"], [])).toContain("Sem dados neste período.");
  });
});

describe("kpisPdf", () => {
  it("renderiza label, valor e hint opcional, tudo escapado", () => {
    const html = kpisPdf([
      { label: "VGV", valor: "R$ 1,2 mi", hint: "vs. <anterior>" },
      { label: "Vendas", valor: "8" },
    ]);
    expect(html).toContain("VGV");
    expect(html).toContain("R$ 1,2 mi");
    expect(html).toContain("vs. &lt;anterior&gt;");
    expect((html.match(/class="kpi"/g) ?? []).length).toBe(2);
  });
});

describe("periodoLabelPdf", () => {
  it("formata o intervalo em dd/mm/aaaa e trata período aberto", () => {
    expect(
      periodoLabelPdf({ di: "2026-08-01T03:00:00.000Z", df: "2026-08-31T03:00:00.000Z" }),
    ).toMatch(/^\d{2}\/\d{2}\/2026 – \d{2}\/\d{2}\/2026$/);
    expect(periodoLabelPdf({ di: null, df: null })).toBe("Todo o período");
  });
});

describe("montarHtmlRelatorio", () => {
  it("documento completo: título no <title> (nome do arquivo), seções e aviso de telefone", () => {
    const html = montarHtmlRelatorio({
      titulo: "Relatório de Vendas",
      periodo: "01/08/2026 – 31/08/2026",
      blocos: [{ titulo: "Resultado", sub: "do período", html: "<p>ok</p>" }],
    });
    expect(html).toContain("<title>Relatório de Vendas — 01/08/2026 – 31/08/2026</title>");
    expect(html).toContain("<h2>Resultado</h2>");
    expect(html).toContain("<p>ok</p>");
    // Regra da página: telefone fora do documento de apresentação.
    expect(html).toContain("Telefones de clientes ficam fora deste documento");
    expect(html).toContain("Documento interno e confidencial");
  });

  it("título e período passam pelo escape", () => {
    const html = montarHtmlRelatorio({
      titulo: `<b>x</b>`,
      periodo: `"p"`,
      blocos: [],
    });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
  });
});

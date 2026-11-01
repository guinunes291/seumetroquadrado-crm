// @vitest-environment node
// Leitura do texto do PDF no Safari (bug de 01/11/2026): o getTextContent do
// pdf.js faz `for await` sobre ReadableStream e o Safari não tem iteração
// assíncrona de stream — a venda por contrato quebrava com "undefined is not a
// function (near '...i of e...')". Aqui o Safari é simulado desligando
// ReadableStream.prototype[Symbol.asyncIterator] e o pdf.js de verdade (build
// legacy, o mesmo da tela) lê um PDF mínimo gerado no próprio teste.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lerTextoDaPagina } from "@/features/vendas/texto-pdf";

/** PDF de uma página com duas linhas de texto (xref calculado na hora). */
function pdfMinimo(linhas: string[]): Uint8Array {
  const conteudo = [
    "BT /F1 12 Tf 72 720 Td",
    ...linhas.map((l, i) => `${i > 0 ? "0 -16 Td " : ""}(${l}) Tj`),
    "ET",
  ].join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

const iteradorOriginal = Object.getOwnPropertyDescriptor(
  ReadableStream.prototype,
  Symbol.asyncIterator,
);

beforeAll(() => {
  // "Safari": stream sem for-await.
  delete (ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator];
});

afterAll(() => {
  if (iteradorOriginal) {
    Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, iteradorOriginal);
  }
});

async function abrirPagina() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: pdfMinimo(["QUADRO RESUMO", "CPF/MF: 529.982.247-25"]),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;
  return doc.getPage(1);
}

describe("texto do PDF no Safari", () => {
  it("o getTextContent do pdf.js quebra sem iteração de stream (o bug)", async () => {
    const page = await abrirPagina();
    await expect(page.getTextContent()).rejects.toThrow(/async iterable|not a function/);
  });

  it("lerTextoDaPagina lê o texto com getReader, linha por linha", async () => {
    const page = await abrirPagina();
    const texto = await lerTextoDaPagina(page);
    expect(texto).toContain("QUADRO RESUMO");
    expect(texto).toContain("529.982.247-25");
    expect(texto.indexOf("QUADRO RESUMO")).toBeLessThan(texto.indexOf("529.982.247-25"));
  });
});

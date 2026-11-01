// Texto de uma página do pdf.js SEM `for await` sobre ReadableStream.
//
// `page.getTextContent()` do pdf.js faz `for await (const value of stream)`.
// O Safari (iPhone, iPad e Mac) não implementa iteração assíncrona de
// ReadableStream, e a leitura do contrato quebrava com "undefined is not a
// function (near '...i of e...')" — nem o build legacy do pdf.js cobre isso.
// Aqui o stream é lido com getReader(), que todo navegador suporta.

type ItemTexto = { str?: string; hasEOL?: boolean };
type PedacoTexto = { items: ItemTexto[] };

export type PaginaComTexto = {
  streamTextContent: () => ReadableStream<PedacoTexto>;
};

/** Texto da página com as quebras de linha do PDF ("NOME: X\nCPF: Y"). */
export async function lerTextoDaPagina(page: PaginaComTexto): Promise<string> {
  const reader = page.streamTextContent().getReader();
  let texto = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const it of value.items) {
        // Itens de marcação (sem `str`) não têm texto.
        if (typeof it.str === "string") texto += it.str + (it.hasEOL ? "\n" : " ");
      }
    }
  } finally {
    reader.releaseLock();
  }
  return texto;
}

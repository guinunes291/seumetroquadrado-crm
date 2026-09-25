// Extração de plantas do book — roda no NAVEGADOR (pdf.js).
//
// O deploy é Cloudflare: o servidor não tem canvas para rasterizar PDF. Então
// /api/book-pdf só repassa os bytes do Drive e aqui o pdf.js lê o texto de cada
// página (para a heurística de `@/lib/plantas`) e desenha as miniaturas. Este
// módulo só é importado em lazy pelo dialog de Plantas: o pdf.js (~1 MB) nunca
// entra no chunk das outras telas.

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { freshAccessToken } from "@/lib/supabase-access-token";
import { legendaDaPlanta, pontuarPaginaPlanta, LIMIAR_PLANTA } from "@/lib/plantas";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PaginaBook = {
  pagina: number;
  score: number;
  provavel: boolean;
  legendaSugerida: string | null;
  /** dataURL JPEG pequeno, só para a grade de curadoria. */
  miniatura: string;
};

export type BookAberto = {
  totalPaginas: number;
  paginas: PaginaBook[];
  /** Renderiza a página em alta para o upload (JPEG). */
  renderizarAlta: (pagina: number) => Promise<Blob>;
  fechar: () => void;
};

const MENSAGENS: Record<string, string> = {
  book_private:
    "O book está privado no Drive. Compartilhe como “Qualquer pessoa com o link” e tente de novo.",
  book_not_drive: "O link do book não é um arquivo do Google Drive.",
  book_not_pdf: "O link do book não aponta para um PDF.",
  book_too_large: "O book passa de 150 MB — envie uma versão reduzida.",
  book_unavailable: "O Drive não entregou o arquivo agora. Tente de novo em instantes.",
  forbidden: "Só a gestão pode extrair plantas.",
  not_found: "Projeto não encontrado.",
  unauthorized: "Sua sessão expirou. Entre novamente.",
};

/** Baixa o book via proxy, com progresso em bytes (quando o Drive informa o tamanho). */
export async function baixarBook(
  projetoId: string,
  onProgresso?: (recebido: number, total: number | null) => void,
): Promise<ArrayBuffer> {
  const token = await freshAccessToken();
  const resp = await fetch(`/api/book-pdf?projeto_id=${encodeURIComponent(projetoId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok || !resp.body) {
    const payload = (await resp.json().catch(() => null)) as { error?: string } | null;
    throw new Error(MENSAGENS[payload?.error ?? ""] ?? "Não foi possível baixar o book.");
  }
  const total = Number(resp.headers.get("content-length") ?? "0") || null;
  const reader = resp.body.getReader();
  const partes: Uint8Array[] = [];
  let recebido = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    partes.push(value);
    recebido += value.byteLength;
    onProgresso?.(recebido, total);
  }
  const buf = new Uint8Array(recebido);
  let off = 0;
  for (const p of partes) {
    buf.set(p, off);
    off += p.byteLength;
  }
  return buf.buffer;
}

async function paginaParaCanvas(
  doc: PDFDocumentProxy,
  numero: number,
  larguraPx: number,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(numero);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: larguraPx / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");
  // Fundo branco: página transparente vira preto no JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

function canvasParaBlob(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem da página."))),
      "image/jpeg",
      qualidade,
    ),
  );
}

/**
 * Abre o book, lê o texto e desenha a miniatura de cada página. `onPagina`
 * reporta o andamento ("página 23/64") — book grande leva alguns segundos.
 */
export async function abrirBook(
  dados: ArrayBuffer,
  onPagina?: (atual: number, total: number) => void,
): Promise<BookAberto> {
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(dados) });
  const doc = await tarefa.promise;
  const paginas: PaginaBook[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onPagina?.(n, doc.numPages);
    const page = await doc.getPage(n);
    const conteudo = await page.getTextContent();
    const texto = conteudo.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    const score = pontuarPaginaPlanta(texto);
    const canvas = await paginaParaCanvas(doc, n, 320);
    paginas.push({
      pagina: n,
      score,
      provavel: score >= LIMIAR_PLANTA,
      legendaSugerida: legendaDaPlanta(texto),
      miniatura: canvas.toDataURL("image/jpeg", 0.7),
    });
  }
  return {
    totalPaginas: doc.numPages,
    paginas,
    renderizarAlta: async (pagina) =>
      canvasParaBlob(await paginaParaCanvas(doc, pagina, 1600), 0.82),
    fechar: () => void tarefa.destroy(),
  };
}

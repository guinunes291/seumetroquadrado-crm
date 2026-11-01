// Venda por contrato — leitura do ARQUIVO no navegador (pdf.js).
//
// O deploy é Cloudflare: o servidor não tem canvas e o pdf.js é pesado no
// worker (mesma razão de features/projetos/plantas/extrair-plantas.ts). Então
// aqui o navegador:
//   • PDF com texto (o caso dos contratos DocuSign/D4Sign): lê o texto de cada
//     página e escolhe as que importam (selecionarPaginasContrato);
//   • PDF escaneado (sem texto) ou foto: desenha as primeiras páginas em JPEG
//     e manda como imagem.
// Este módulo só é importado em lazy pelo diálogo: o pdf.js (~1 MB) nunca
// entra no chunk das outras telas.
//
// Build LEGACY do pdf.js (página e worker): o build padrão da v6 usa
// Promise.try e Map.prototype.getOrInsertComputed sem polyfill e quebra no
// Safari; o legacy traz os polyfills. O texto é lido por lerTextoDaPagina
// (getReader), porque o getTextContent do pdf.js usa `for await` sobre
// ReadableStream, que o Safari não tem em nenhum dos dois builds.

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { lerTextoDaPagina } from "./texto-pdf";
import {
  MIN_CARACTERES_TEXTO,
  montarTextoContrato,
  selecionarPaginasContrato,
  type PaginaTexto,
} from "./contrato-venda-paginas";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const PAGINAS_COMO_IMAGEM = 4;
const LARGURA_IMAGEM_PX = 1400;
const QUALIDADE_JPEG = 0.78;

export type ImagemContrato = { mediaType: "image/jpeg"; base64: string };

export type ContratoPreparado = {
  totalPaginas: number;
  /** Texto das páginas escolhidas (vazio quando foi como imagem). */
  texto: string;
  imagens: ImagemContrato[];
  paginasEnviadas: number[];
};

function canvasParaBase64(canvas: HTMLCanvasElement): string {
  const url = canvas.toDataURL("image/jpeg", QUALIDADE_JPEG);
  return url.slice(url.indexOf(",") + 1);
}

function novoCanvas(
  largura: number,
  altura: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(largura);
  canvas.height = Math.round(altura);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");
  // Fundo branco: página transparente vira preto no JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function paginaComoImagem(doc: PDFDocumentProxy, numero: number): Promise<ImagemContrato> {
  const page = await doc.getPage(numero);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: LARGURA_IMAGEM_PX / base.width });
  const { canvas, ctx } = novoCanvas(viewport.width, viewport.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return { mediaType: "image/jpeg", base64: canvasParaBase64(canvas) };
}

async function prepararPdf(
  arquivo: File,
  onProgresso?: (atual: number, total: number) => void,
): Promise<ContratoPreparado> {
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) });
  try {
    const doc = await tarefa.promise;
    const paginas: PaginaTexto[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      onProgresso?.(n, doc.numPages);
      const page = await doc.getPage(n);
      const texto = await lerTextoDaPagina(page);
      paginas.push({ pagina: n, texto });
      page.cleanup();
    }
    const totalTexto = paginas.reduce((s, p) => s + p.texto.trim().length, 0);
    if (totalTexto >= MIN_CARACTERES_TEXTO) {
      const escolhidas = selecionarPaginasContrato(paginas);
      return {
        totalPaginas: doc.numPages,
        texto: montarTextoContrato(escolhidas),
        imagens: [],
        paginasEnviadas: escolhidas.map((p) => p.pagina),
      };
    }
    // Escaneado: as primeiras páginas costumam ter o quadro-resumo.
    const qtd = Math.min(PAGINAS_COMO_IMAGEM, doc.numPages);
    const imagens: ImagemContrato[] = [];
    for (let n = 1; n <= qtd; n++) imagens.push(await paginaComoImagem(doc, n));
    return {
      totalPaginas: doc.numPages,
      texto: "",
      imagens,
      paginasEnviadas: imagens.map((_, i) => i + 1),
    };
  } finally {
    void tarefa.destroy();
  }
}

async function prepararImagem(arquivo: File): Promise<ContratoPreparado> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, LARGURA_IMAGEM_PX / bitmap.width);
  const { canvas, ctx } = novoCanvas(bitmap.width * escala, bitmap.height * escala);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return {
    totalPaginas: 1,
    texto: "",
    imagens: [{ mediaType: "image/jpeg", base64: canvasParaBase64(canvas) }],
    paginasEnviadas: [1],
  };
}

/** Prepara o que vai para a IA a partir do arquivo escolhido pelo usuário. */
export async function prepararContrato(
  arquivo: File,
  onProgresso?: (atual: number, total: number) => void,
): Promise<ContratoPreparado> {
  if (arquivo.type === "application/pdf") return prepararPdf(arquivo, onProgresso);
  if (arquivo.type.startsWith("image/")) return prepararImagem(arquivo);
  throw new Error("Envie o contrato em PDF ou imagem (JPG, PNG ou WebP).");
}

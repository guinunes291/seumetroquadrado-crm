// Antes de enviar, no navegador do cliente: foto grande vira JPEG de até
// 2400 px no lado maior (o documento continua legível e o envio pelo 4G cai
// de ~5 MB para ~700 KB) e foto em formato que o servidor não aceita (HEIC do
// iPhone aberto pelo app Arquivos, por exemplo) é convertida. PDF vai como
// está. O servidor confere de novo pela assinatura do arquivo.

const ACEITOS = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export const LADO_MAX_PX = 2400;
export const REDUZIR_ACIMA_BYTES = 2.5 * 1024 * 1024;

export type Preparo = "enviar" | "reduzir" | "converter" | "recusar";

/** O que fazer com o arquivo escolhido (pura, testável). */
export function preparoDoArquivo(tipo: string, nome: string, tamanho: number): Preparo {
  if (tipo === "application/pdf") return "enviar";
  const imagem = tipo.startsWith("image/") || /\.(heic|heif)$/i.test(nome);
  if (!imagem) return "recusar";
  if (!ACEITOS.has(tipo)) return "converter";
  return tamanho > REDUZIR_ACIMA_BYTES ? "reduzir" : "enviar";
}

export function trocarExtensao(nome: string, extensao: string): string {
  const base = nome.replace(/\.[^./\\]+$/, "") || "foto";
  return `${base}.${extensao}`;
}

async function paraJpeg(arquivo: File): Promise<Blob> {
  // createImageBitmap respeita a orientação EXIF (foto "deitada" sai em pé).
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const largura = Math.max(1, Math.round(bitmap.width * escala));
  const altura = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  // PNG com transparência: fundo branco, como o papel.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("falha ao gerar JPEG"))),
      "image/jpeg",
      0.85,
    ),
  );
}

/** Devolve o que enviar (o arquivo original ou o JPEG), ou erro "arquivo_invalido". */
export async function prepararArquivo(arquivo: File): Promise<{ blob: Blob; nome: string }> {
  const preparo = preparoDoArquivo(arquivo.type, arquivo.name, arquivo.size);
  if (preparo === "recusar") throw new Error("arquivo_invalido");
  if (preparo === "enviar") return { blob: arquivo, nome: arquivo.name };
  try {
    const jpeg = await paraJpeg(arquivo);
    // Reduzir que não reduz (PNG pequeno em pixels, já comprimido): manda o original.
    if (preparo === "reduzir" && jpeg.size >= arquivo.size) {
      return { blob: arquivo, nome: arquivo.name };
    }
    return { blob: jpeg, nome: trocarExtensao(arquivo.name, "jpg") };
  } catch {
    if (preparo === "converter") throw new Error("arquivo_invalido");
    return { blob: arquivo, nome: arquivo.name };
  }
}

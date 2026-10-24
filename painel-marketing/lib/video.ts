// Pedidos de vídeo da Fase 4 (Higgsfield, modelo Seedance 2.5), descritos em
// português antes de qualquer chamada. Funções puras (sem banco e sem rede)
// para poder testar isoladas.
import { temPreco, verificarTexto } from "./compliance.ts";

export type Formato = "9:16" | "3:4" | "1:1" | "16:9";
export type Resolucao = "720p" | "1080p";

export const FORMATOS: { valor: Formato; rotulo: string }[] = [
  { valor: "9:16", rotulo: "Vertical 9:16 (Reels, Stories)" },
  { valor: "3:4", rotulo: "Feed 3:4" },
  { valor: "1:1", rotulo: "Quadrado 1:1" },
  { valor: "16:9", rotulo: "Horizontal 16:9" },
];

export type VideoGerar = {
  tipo: "video_gerar";
  empreendimentoId: number | null;
  empreendimentoNome: string | null;
  ideia: string; // o que o Guilherme escreveu
  prompt: string; // o que vai para o Higgsfield
  imagemUrl: string | null; // foto ou render de partida (opcional)
  formato: Formato; // ignorado quando há imagem: o vídeo segue o enquadramento dela
  duracao: number; // segundos
  resolucao: Resolucao;
  audio: boolean;
  custoUsd: number; // estimativa do próprio Higgsfield na hora do pedido
};

export type VideoEditar = {
  tipo: "video_editar";
  empreendimentoId: number | null;
  empreendimentoNome: string | null;
  videoUrl: string;
  ideia: string; // a instrução de edição, em português
  prompt: string;
  resolucao: Resolucao;
  audio: boolean;
  custoUsd: number;
};

export type PedidoVideo = VideoGerar | VideoEditar;

// Teto por vídeo. Acima disso o Painel recusa; muda-se aqui, com PR.
export const VIDEO_CUSTO_MAXIMO_USD = 10;
export const VIDEO_DURACAO_MAXIMA = 15;
// Só para leitura rápida na tela. A cobrança é em dólar no saldo do Higgsfield.
export const DOLAR_APROXIMADO = 5.5;

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function custoTexto(valorUsd: number): string {
  return `${usd.format(valorUsd)} (cerca de ${brl.format(valorUsd * DOLAR_APROXIMADO)})`;
}

export function endpointDoVideo(p: PedidoVideo): string {
  if (p.tipo === "video_editar") return "bytedance/seedance-2.5/video-edit";
  return p.imagemUrl
    ? "bytedance/seedance-2.5/image-to-video"
    : "bytedance/seedance-2.5/text-to-video";
}

export function corpoDoVideo(p: PedidoVideo): Record<string, unknown> {
  if (p.tipo === "video_editar")
    return {
      prompt: p.prompt,
      video_url: p.videoUrl,
      resolution: p.resolucao,
      generate_audio: p.audio,
    };
  if (p.imagemUrl)
    return {
      prompt: p.prompt,
      image_url: p.imagemUrl,
      duration: p.duracao,
      resolution: p.resolucao,
      generate_audio: p.audio,
    };
  return {
    prompt: p.prompt,
    duration: p.duracao,
    resolution: p.resolucao,
    aspect_ratio: p.formato,
    generate_audio: p.audio,
    output_format: "mp4",
  };
}

function urlPublica(u: string): boolean {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}

// Só confere o que vem do Guilherme e do Roteirista. O custo é conferido à parte
// (problemasDoCusto), porque depende da estimativa do Higgsfield.
export function problemasDoVideo(p: PedidoVideo): string[] {
  const erros: string[] = [];
  if (!p.ideia.trim())
    erros.push(
      p.tipo === "video_editar" ? "Diga o que mudar no vídeo." : "Descreva o vídeo que você quer.",
    );
  if (!p.prompt.trim()) erros.push("O prompt para o Higgsfield ficou vazio.");
  if (p.tipo === "video_gerar") {
    if (!(p.duracao >= 4 && p.duracao <= VIDEO_DURACAO_MAXIMA))
      erros.push(`A duração vai de 4 a ${VIDEO_DURACAO_MAXIMA} segundos.`);
    if (p.imagemUrl !== null && !urlPublica(p.imagemUrl))
      erros.push("A imagem de partida não foi enviada direito. Envie de novo.");
  } else if (!urlPublica(p.videoUrl)) {
    erros.push("Envie o vídeo que você quer editar.");
  }
  const texto = `${p.ideia}\n${p.prompt}`;
  for (const x of verificarTexto(texto)) erros.push(`${x.regra}: “${x.trecho}”.`);
  if (temPreco(texto))
    erros.push(
      "Tire o valor do pedido. Vídeo gerado não pode mostrar preço, entrada ou parcela, porque o Painel ainda não confere com a tabela oficial.",
    );
  return erros;
}

export function problemasDoCusto(custoUsd: number): string[] {
  if (!(custoUsd > 0)) return ["O Higgsfield não devolveu o custo deste vídeo. Tente de novo."];
  if (custoUsd > VIDEO_CUSTO_MAXIMO_USD)
    return [
      `Este vídeo custaria ${custoTexto(custoUsd)}, acima do teto do Painel (${usd.format(VIDEO_CUSTO_MAXIMO_USD)} por vídeo). Diminua a duração ou a resolução.`,
    ];
  return [];
}

// Na aprovação o custo é estimado de novo. Se subiu mais de 10%, o Painel para
// e pede um pedido novo, para nunca cobrar mais do que o aprovado.
export function custoSubiu(aprovado: number, agora: number): boolean {
  return agora > aprovado * 1.1;
}

export function tituloDoVideo(p: PedidoVideo): string {
  const onde = p.empreendimentoNome ? `: ${p.empreendimentoNome}` : "";
  return p.tipo === "video_editar" ? `Editar vídeo${onde}` : `Gerar vídeo${onde}`;
}

export function passosDoVideo(p: PedidoVideo): string[] {
  const s: string[] = [];
  if (p.tipo === "video_gerar") {
    const forma = p.imagemUrl
      ? "a partir da imagem enviada (o vídeo segue o enquadramento dela)"
      : `no formato ${FORMATOS.find((f) => f.valor === p.formato)?.rotulo ?? p.formato}`;
    s.push(
      `Gerar no Higgsfield (Seedance 2.5) um vídeo de ${p.duracao} segundos em ${p.resolucao}, ${forma}${p.audio ? ", com som ambiente" : ", sem som"}.`,
    );
  } else {
    s.push(
      `Editar no Higgsfield (Seedance 2.5) o vídeo enviado, em ${p.resolucao}${p.audio ? ", com som" : ", sem som"}. A duração segue a do vídeo original (até 30 segundos).`,
    );
  }
  s.push(`Custo estimado pelo Higgsfield: ${custoTexto(p.custoUsd)}, cobrado do saldo da API.`);
  s.push(
    "Na hora de aprovar, o Painel pede a estimativa de novo e para se o custo tiver subido mais de 10%.",
  );
  s.push(
    "Quando ficar pronto, o vídeo é copiado para a Biblioteca de vídeos do Painel. Nada é publicado em lugar nenhum.",
  );
  s.push(
    "Se falhar ou for barrado pela moderação, o Higgsfield não cobra. Enquanto estiver na fila, dá para cancelar com reembolso.",
  );
  return s;
}

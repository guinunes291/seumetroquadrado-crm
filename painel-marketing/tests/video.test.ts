import { test } from "node:test";
import assert from "node:assert/strict";
import {
  corpoDoVideo,
  custoSubiu,
  endpointDoVideo,
  problemasDoCusto,
  problemasDoVideo,
  VIDEO_CUSTO_MAXIMO_USD,
  type VideoEditar,
  type VideoGerar,
} from "../lib/video.ts";

const gerar: VideoGerar = {
  tipo: "video_gerar",
  empreendimentoId: 1,
  empreendimentoNome: "Raiz Home Clube",
  ideia: "Câmera subindo pela fachada no fim de tarde",
  prompt: "Slow drone shot rising along a modern residential building facade at golden hour",
  imagemUrl: null,
  formato: "9:16",
  duracao: 5,
  resolucao: "720p",
  audio: true,
  custoUsd: 1.2,
};

const editar: VideoEditar = {
  tipo: "video_editar",
  empreendimentoId: null,
  empreendimentoNome: null,
  videoUrl: "https://exemplo.public.blob.vercel-storage.com/entradas/a.mp4",
  ideia: "Céu azul com sol",
  prompt: "Replace the sky with a clear blue sky and warm sunlight",
  resolucao: "720p",
  audio: false,
  custoUsd: 2,
};

test("texto para vídeo usa o endpoint e o formato pedidos", () => {
  assert.equal(endpointDoVideo(gerar), "bytedance/seedance-2.5/text-to-video");
  const c = corpoDoVideo(gerar);
  assert.equal(c.aspect_ratio, "9:16");
  assert.equal(c.duration, 5);
  assert.equal("image_url" in c, false);
});

test("com imagem vira imagem para vídeo e não manda formato", () => {
  const p = { ...gerar, imagemUrl: "https://x.public.blob.vercel-storage.com/entradas/r.png" };
  assert.equal(endpointDoVideo(p), "bytedance/seedance-2.5/image-to-video");
  const c = corpoDoVideo(p);
  assert.equal(c.image_url, p.imagemUrl);
  assert.equal("aspect_ratio" in c, false);
});

test("edição não manda duração", () => {
  assert.equal(endpointDoVideo(editar), "bytedance/seedance-2.5/video-edit");
  const c = corpoDoVideo(editar);
  assert.equal(c.video_url, editar.videoUrl);
  assert.equal("duration" in c, false);
});

test("pedido limpo passa", () => {
  assert.deepEqual(problemasDoVideo(gerar), []);
  assert.deepEqual(problemasDoVideo(editar), []);
});

test("barra preço, promessa de crédito e travessão", () => {
  assert.ok(problemasDoVideo({ ...gerar, ideia: "Mostrar parcelas de 500 reais" }).length > 0);
  assert.ok(problemasDoVideo({ ...gerar, ideia: "Entrada a partir de R$ 5 mil" }).length > 0);
  assert.ok(problemasDoVideo({ ...gerar, ideia: "Crédito aprovado na hora" }).length > 0);
  assert.ok(problemasDoVideo({ ...gerar, prompt: "Facade — golden hour" }).length > 0);
});

test("duração fora do limite e edição sem vídeo são recusadas", () => {
  assert.ok(problemasDoVideo({ ...gerar, duracao: 3 }).length > 0);
  assert.ok(problemasDoVideo({ ...gerar, duracao: 40 }).length > 0);
  assert.ok(problemasDoVideo({ ...editar, videoUrl: "" }).length > 0);
});

test("teto e variação de custo", () => {
  assert.deepEqual(problemasDoCusto(1.5), []);
  assert.equal(problemasDoCusto(0).length, 1);
  assert.equal(problemasDoCusto(VIDEO_CUSTO_MAXIMO_USD + 0.01).length, 1);
  assert.equal(custoSubiu(1, 1.1), false);
  assert.equal(custoSubiu(1, 1.11), true);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { ehVencedor, textosDoCriativo, tipoDoCriativo } from "../lib/biblioteca.ts";

test("reconhece o formato do criativo", () => {
  assert.equal(tipoDoCriativo({ video_id: "1" }), "video");
  assert.equal(tipoDoCriativo({ object_story_spec: { video_data: { message: "x" } } }), "video");
  assert.equal(
    tipoDoCriativo({ object_story_spec: { link_data: { child_attachments: [{}, {}] } } }),
    "carrossel",
  );
  assert.equal(tipoDoCriativo({ image_url: "https://x" }), "imagem");
  assert.equal(tipoDoCriativo({}), "outro");
  assert.equal(tipoDoCriativo(undefined), "outro");
});

test("acha o texto onde ele estiver", () => {
  assert.deepEqual(textosDoCriativo({ body: " Oi ", title: "T" }), { titulo: "T", texto: "Oi" });
  assert.deepEqual(
    textosDoCriativo({ object_story_spec: { video_data: { message: "Vídeo", title: "VT" } } }),
    { titulo: "VT", texto: "Vídeo" },
  );
  assert.deepEqual(
    textosDoCriativo({ asset_feed_spec: { bodies: [{ text: "A" }], titles: [{ text: "B" }] } }),
    { titulo: "B", texto: "A" },
  );
  assert.deepEqual(textosDoCriativo({}), { titulo: null, texto: null });
});

test("vencedor pede volume e custo dentro do teto", () => {
  assert.equal(ehVencedor(30, 20), true);
  assert.equal(ehVencedor(29, 5), false);
  assert.equal(ehVencedor(100, 20.01), false);
  assert.equal(ehVencedor(100, null), false);
  // Teto próprio do empreendimento vale no lugar do geral.
  assert.equal(ehVencedor(100, 30, 35), true);
  assert.equal(ehVencedor(100, 15, 10), false);
  assert.equal(ehVencedor(100, 20, null), true);
});

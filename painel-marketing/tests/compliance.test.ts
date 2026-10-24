import { test } from "node:test";
import assert from "node:assert/strict";
import { temPreco, verificarTexto } from "../lib/compliance.ts";

test("acusa travessão", () => {
  const p = verificarTexto("Apartamento na Saúde — 2 dormitórios");
  assert.equal(p[0]?.regra, "Não usar travessão");
});

test("acusa promessa de crédito", () => {
  assert.equal(verificarTexto("Seu crédito aprovado na hora!").length > 0, true);
  assert.equal(verificarTexto("Financiamento garantido pelo MCMV").length > 0, true);
  assert.equal(verificarTexto("Aprovação garantida").length > 0, true);
});

test("acusa valor de aprovação", () => {
  const p = verificarTexto("Cliente aprovado com R$ 250.000");
  assert.ok(p.some((x) => x.regra === "Não informar valor de aprovação"));
});

test("texto limpo passa", () => {
  assert.deepEqual(
    verificarTexto("Simule seu financiamento pelo Minha Casa Minha Vida com a nossa equipe."),
    [],
  );
});

test("detecta preço", () => {
  assert.equal(temPreco("Entrada a partir de R$ 1.500"), true);
  assert.equal(temPreco("Agende sua visita"), false);
});

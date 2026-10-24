import { test } from "node:test";
import assert from "node:assert/strict";
import { custoPor, dataCurta, semTravessao } from "../lib/formato.ts";
import { conferirSenha, gerarHashSenha, hashToken, problemaNaSenha } from "../lib/senha.ts";

test("custo sem unidade não vira R$ 0,00", () => {
  assert.equal(custoPor(500, 0), "nenhum ainda");
  assert.equal(custoPor(0, 0), "sem dado");
  assert.match(custoPor(1000, 4), /250,00/);
});

test("data curta em pt-BR", () => {
  assert.equal(dataCurta("2026-09-24"), "24/09/2026");
});

test("nome de campanha da Meta sai sem travessão", () => {
  const t = semTravessao("Cury PLAYBALL - Sem 2% — Cópia — Cópia");
  assert.ok(!t.includes("—"));
  assert.equal(t, "Cury PLAYBALL - Sem 2%, Cópia, Cópia");
});

test("senha confere só com a senha certa", async () => {
  const h = await gerarHashSenha("frase longa de teste 123");
  assert.equal(await conferirSenha("frase longa de teste 123", h), true);
  assert.equal(await conferirSenha("frase longa de teste 124", h), false);
  assert.equal(await conferirSenha("x", "lixo"), false);
});

test("regras de senha e token", () => {
  assert.ok(problemaNaSenha("curta"));
  assert.equal(problemaNaSenha("uma frase bem comprida"), null);
  assert.equal(hashToken("abc").length, 64);
});

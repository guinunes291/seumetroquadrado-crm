#!/usr/bin/env node
// Validador do lote da Academia SMQ: confere o JSON canônico e os seeds que o
// converter-lote.mjs gerou. Sai com código 1 se alguma regra falhar.
//
// Uso:
//   node scripts/academia/validar-lote.mjs [--entrada <json>] [--nomes <arquivo>]
//
//   --nomes  arquivo com um nome por linha (corretores, gerentes, clientes) que
//            não pode aparecer no conteúdo. Fica FORA do git: é dado pessoal.
//
// Regras (seções 4 e 13 do super prompt):
//   contagem de módulos, aulas, questões e flashcards; 4 alternativas por
//   questão; alternativa correta espalhada pelas quatro posições; nenhum
//   travessão (U+2014) nem traço médio (U+2013); nenhum CPF, telefone ou
//   e-mail; nenhum nome da lista; nenhum percentual ou valor de comissão;
//   todo texto do JSON presente, intacto, no SQL gerado.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  LOTES,
  RAIZ,
  aplicarAjustes,
  carregarLote,
  lit,
  moduloParaLinhas,
  moduloParaSql,
} from "./converter-lote.mjs";

const ESPERADO = {
  1: { modulos: 5, aulas: 23, questoes: 100, flashcards: 65 },
  2: { modulos: 6, aulas: 33, questoes: 120, flashcards: 83 },
  3: { modulos: 6, aulas: 30, questoes: 120, flashcards: 81 },
};
const DIRETOR = "Guilherme Nunes";

const argv = process.argv.slice(2);
const arg = (nome) => {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
};

const erros = [];
const falha = (msg) => erros.push(msg);

const bruto = carregarLote(arg("--entrada"));
const cfg = LOTES[bruto.lote];
const esperado = ESPERADO[bruto.lote];
const { lote, aplicadas } = aplicarAjustes(bruto);

// Todas as folhas de texto, com o caminho, para as varreduras.
function folhas(x, caminho, out) {
  if (typeof x === "string") out.push([caminho, x]);
  else if (Array.isArray(x)) x.forEach((v, i) => folhas(v, `${caminho}[${i}]`, out));
  else if (x && typeof x === "object")
    for (const [k, v] of Object.entries(x)) folhas(v, `${caminho}.${k}`, out);
  return out;
}
const textos = lote.modulos.flatMap((m) => folhas(m, m.codigo, []));

// 1. Contagens --------------------------------------------------------------
const cont = { modulos: lote.modulos.length, aulas: 0, questoes: 0, flashcards: 0 };
const posicoes = [0, 0, 0, 0];
console.log("Módulo  aulas  questões  flashcards  correta 0/1/2/3");
for (const m of lote.modulos) {
  const qs = m.quiz.questoes;
  const pm = [0, 0, 0, 0];
  for (const q of qs) {
    if (q.alternativas.length !== 4) falha(`${q.id}: ${q.alternativas.length} alternativas`);
    if (!Number.isInteger(q.correta) || q.correta < 0 || q.correta > 3) {
      falha(`${q.id}: correta fora de 0 a 3 (${q.correta})`);
    } else {
      pm[q.correta]++;
      posicoes[q.correta]++;
    }
  }
  if (pm.some((n) => n === 0))
    falha(`${m.codigo}: alguma posição nunca é a correta (${pm.join("/")})`);
  cont.aulas += m.aulas.length;
  cont.questoes += qs.length;
  cont.flashcards += m.flashcards.length;
  console.log(
    `${m.codigo.padEnd(6)}  ${String(m.aulas.length).padStart(5)}  ${String(qs.length).padStart(8)}  ${String(m.flashcards.length).padStart(10)}  ${pm.join("/")}`,
  );
}
console.log(
  `TOTAL   ${String(cont.aulas).padStart(5)}  ${String(cont.questoes).padStart(8)}  ${String(cont.flashcards).padStart(10)}  ${posicoes.join("/")}  (${cont.modulos} módulos)`,
);
if (esperado) {
  for (const k of Object.keys(esperado)) {
    if (cont[k] !== esperado[k]) falha(`${k}: ${cont[k]}, esperado ${esperado[k]}`);
  }
}
const maxPos = Math.max(...posicoes) / cont.questoes;
if (maxPos > 0.4) falha(`uma posição concentra ${Math.round(maxPos * 100)}% das corretas`);

// 2. Códigos únicos ---------------------------------------------------------
const codigos = [
  ...lote.modulos.flatMap((m) => m.aulas.map((a) => a.codigo)),
  ...lote.modulos.flatMap((m) => m.quiz.questoes.map((q) => q.id)),
];
const repetidos = codigos.filter((c, i) => codigos.indexOf(c) !== i);
if (repetidos.length) falha(`códigos repetidos: ${repetidos.join(", ")}`);

// 3. SQL gerado: existe, é o que o conversor produz hoje, e sem travessão ---
const arquivoFonte = path.relative(
  RAIZ,
  path.resolve(RAIZ, arg("--entrada") ?? "docs/academia/lote-1/academia-smq-lote-1.json"),
);
const sqls = [];
for (const m of lote.modulos) {
  const alvo = cfg.modulos[m.codigo];
  const arq = path.join(RAIZ, "supabase/migrations", `${alvo.migration}.sql`);
  if (!existsSync(arq)) {
    falha(`${m.codigo}: falta ${path.relative(RAIZ, arq)} (rode o converter-lote.mjs)`);
    continue;
  }
  const sql = readFileSync(arq, "utf8");
  if (sql !== moduloParaSql(moduloParaLinhas(m, lote), { lote, arquivoFonte })) {
    falha(`${m.codigo}: ${path.relative(RAIZ, arq)} difere do que o conversor gera hoje`);
  }
  sqls.push([m.codigo, sql]);

  const d = path.join(
    RAIZ,
    "drizzle/migrations",
    `${String(alvo.idx).padStart(4, "0")}_${alvo.migration.replace(/^\d+_/, "")}.sql`,
  );
  if (!existsSync(d) || readFileSync(d, "utf8") !== sql)
    falha(`${m.codigo}: espelho no drizzle ausente ou diferente`);
}
const todosSql = [...sqls];
if (cfg.estrutura) {
  const estrutura = path.join(RAIZ, "supabase/migrations", `${cfg.estrutura.migration}.sql`);
  todosSql.push(["estrutura", readFileSync(estrutura, "utf8")]);
}

for (const [onde, txt] of [...todosSql, ...textos.map(([c, t]) => [c, t])]) {
  for (const [ch, nome] of [
    ["—", "travessão"],
    ["–", "traço médio"],
  ]) {
    if (txt.includes(ch)) falha(`${onde}: contém ${nome}`);
  }
}

// 4. Fidelidade: cada texto do JSON (já com os ajustes) está no SQL ----------
const sqlDe = new Map(sqls);
let conferidos = 0;
for (const [caminho, t] of textos) {
  const sql = sqlDe.get(caminho.slice(0, 3));
  if (!sql || !t) continue;
  const cru = lit(t).slice(1, -1);
  const emJson = lit(JSON.stringify(t).slice(1, -1)).slice(1, -1);
  if (!sql.includes(cru) && !sql.includes(emJson)) falha(`texto ausente no SQL: ${caminho}`);
  conferidos++;
}

// 5. Dados pessoais e comissão ----------------------------------------------
const PADROES = [
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/, "CPF"],
  [/\(?\b\d{2}\)?\s?9\d{4}-?\d{4}\b/, "telefone"],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, "e-mail"],
  [
    /comiss[aã]o[^.]{0,40}\d+([,.]\d+)?\s?%|\d+([,.]\d+)?\s?%[^.]{0,40}comiss/i,
    "percentual de comissão",
  ],
  [/comiss[aã]o[^.]{0,40}R\$\s?\d|R\$\s?[\d.,]+[^.]{0,40}(de|da) comiss/i, "valor de comissão"],
  [/percentual (da|de) construtora/i, "percentual de construtora"],
];
for (const [caminho, t] of textos) {
  for (const [re, nome] of PADROES)
    if (re.test(t)) falha(`${caminho}: parece ${nome}: "${t.match(re)[0]}"`);
}

const arqNomes = arg("--nomes");
let nomes = [];
if (arqNomes) {
  nomes = readFileSync(arqNomes, "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#") && !DIRETOR.includes(s));
  const semAcento = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  for (const [caminho, t] of textos) {
    const tt = semAcento(t);
    for (const n of nomes) {
      const re = new RegExp(`\\b${semAcento(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (re.test(tt)) falha(`${caminho}: nome da lista "${n}"`);
    }
  }
}

// Relatório ------------------------------------------------------------------
console.log(`\nAjustes de texto aplicados pelo conversor (${aplicadas.length}):`);
for (const a of aplicadas) {
  if (a.caminho) console.log(`  ${a.modulo}.${a.caminho.join(".")}: "${a.de}" → "${a.para}"`);
  else
    console.log(
      `  ${a.modulo}.pendencias: remove "${a.remover}"${a.incluir ? ` e inclui "${a.incluir}"` : ""}`,
    );
}
console.log(`\nTextos conferidos no SQL: ${conferidos}`);
console.log(`Travessão e traço médio: varridos no JSON e em ${todosSql.length} arquivos SQL`);
console.log(
  arqNomes
    ? `Nomes: ${nomes.length} nomes da lista varridos`
    : "Nomes: SEM LISTA (passe --nomes <arquivo> para varrer nomes de corretores)",
);

if (erros.length) {
  console.error(`\n${erros.length} problema(s):`);
  for (const e of erros) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nOK: nenhum problema.");

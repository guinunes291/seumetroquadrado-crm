/**
 * A zona de um empreendimento é UMA regra, em dois lugares:
 *   - `zonaDoProjeto` (src/lib/zonas.ts): vitrine, materiais, comparativo;
 *   - `_zona_do_projeto` (migration 20261007120000): o lote de prospecção.
 *
 * Se as duas divergirem, o corretor vê "Grande SP" na vitrine e recebe o
 * cliente num lote de outra zona (ou em nenhum). Este teste roda a mesma
 * lista de empreendimentos nas duas e exige a mesma resposta.
 *
 * A única diferença aceita é de propósito: as cinco zonas da capital no banco
 * saem de `zona_normalizar` (a função da distribuição), que também entende
 * ZN/ZS/ZL/ZO — a vitrine não. Os casos abaixo não usam essas siglas.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zonaDoProjeto, type ProjetoComZona } from "../../src/lib/zonas";
import { comoSuperuser, novoClient } from "./helpers";

const c = novoClient();

beforeAll(async () => {
  await c.connect();
  await comoSuperuser(c);
});

afterAll(async () => {
  await c.end();
});

const CASOS: ProjetoComZona[] = [
  // Os dois empreendimentos medidos em produção (29/09/2026).
  { zona_smq: "Grande SP", regiao: "Grande SP" },
  { zona_smq: "Grande SP", regiao: "Norte" },
  // Grande SP por cada um dos campos.
  { cidade: "Guarulhos" },
  { cidade: "Osasco", zona_smq: "Zona Oeste" },
  { regiao: "Grande São Paulo" },
  { regiao: "Região Metropolitana" },
  { bairro: "Ponte Grande (Guarulhos)" },
  { bairro: "Alphaville" },
  { cidade: "Barueri", bairro: "Alphaville" },
  // ABC é Zona Sul (decisão de 28/09/2026), por qualquer campo.
  { zona_smq: "ABC" },
  { zona_smq: "Grande SP", cidade: "Santo André" },
  { cidade: "São Bernardo do Campo" },
  { regiao: "ABC Paulista" },
  { bairro: "Rudge Ramos" },
  // Vila Mauá: bairro da capital quando a cidade é São Paulo.
  { cidade: "São Paulo", bairro: "Vila Mauá" },
  { bairro: "Vila Mauá" },
  // Capital.
  { zona_smq: "Zona Leste", cidade: "São Paulo" },
  { zona_smq: "Zona Sul" },
  { zona_smq: "Centro-Sul" },
  { zona_smq: "Norte (SP)" },
  { zona_smq: "xyz", regiao: "Zona Oeste" },
  { regiao: "Leste" },
  { cidade: "SP", zona_smq: "Zona Norte" },
  // Ninguém diz onde é.
  {},
  { bairro: "Mooca" },
  { cidade: "Campinas" },
  { zona_smq: "", regiao: "" },
];

describe("zona do empreendimento: vitrine (TS) e lote (SQL) respondem igual", () => {
  it.each(CASOS.map((p) => [JSON.stringify(p), p] as const))("%s", async (_nome, p) => {
    const r = await c.query(`SELECT public._zona_do_projeto($1, $2, $3, $4) AS z`, [
      p.zona_smq ?? null,
      p.regiao ?? null,
      p.cidade ?? null,
      p.bairro ?? null,
    ]);
    expect(r.rows[0].z).toBe(zonaDoProjeto(p));
  });
});

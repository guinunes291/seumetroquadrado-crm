/**
 * GUARDA das formas mantidas À MÃO em src/integrations/supabase/types.ts.
 *
 * types.ts é GERADO. O gerador do Supabase não sabe que certos parâmetros de
 * RPC aceitam NULL, nem que `_canal` é uma união fechada — então toda vez que
 * alguém regenera o arquivo, essas formas somem e o código que passa `null`
 * para de compilar.
 *
 * Já aconteceu três vezes (PR #177 introduziu as formas, #183 as repôs,
 * o commit 4040159 "Work in progress" as apagou de novo). Sem esta guarda a
 * regressão aparece como um TS2322 em src/lib/samiq-memoria.server.ts — um
 * erro de tipo em OUTRO arquivo, que não diz o que fazer. Com ela, o CI diz
 * exatamente qual forma sumiu e onde repor.
 *
 * A regra, que está comentada em samiq-memoria.server.ts: se um regenerador
 * apagar as formas, repõe-se AQUI (em types.ts) — nunca trocando `null` por
 * `undefined` no código de chamada. `_conversa_id` e `_lead_id` não têm
 * DEFAULT na migration S1/S4: omitir a chave faz o PostgREST não achar a
 * função (PGRST202) e o turno sumir em silêncio.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TYPES = readFileSync("src/integrations/supabase/types.ts", "utf8");

/** Corpo do bloco `Args` de uma função dentro de types.ts. */
function argsDe(fn: string): string {
  const m = TYPES.match(
    new RegExp(`      ${fn}: \\{\\n        Args: \\{\\n([\\s\\S]*?)\\n        \\}`),
  );
  if (!m) throw new Error(`não achei o bloco Args de ${fn} em types.ts`);
  return m[1];
}

const ESPERADO: Record<string, string[]> = {
  samiq_gravar_turno: [
    '_canal?: "painel" | "whatsapp"',
    "_conversa_id: string | null",
    "_execution_id?: string | null",
    "_lead_id: string | null",
  ],
  samiq_registrar_propostas: ["_conversa_id: string | null", "_execution_id: string | null"],
};

describe("types.ts — formas mantidas à mão sobrevivem à regeneração", () => {
  for (const [fn, formas] of Object.entries(ESPERADO)) {
    for (const forma of formas) {
      it(`${fn}: ${forma}`, () => {
        expect(
          argsDe(fn),
          `A forma "${forma}" sumiu de ${fn} em src/integrations/supabase/types.ts — ` +
            `sinal de que o arquivo foi regenerado. Reponha a forma NO types.ts. ` +
            `Não troque null por undefined em src/lib/samiq-memoria.server.ts: ` +
            `esses parâmetros não têm DEFAULT na RPC, e omiti-los faz o PostgREST ` +
            `devolver PGRST202 — o turno some em silêncio.`,
        ).toContain(forma);
      });
    }
  }
});

/**
 * GUARDA das formas NULAS dos argumentos de RPC da SamiQ.
 *
 * Antes elas eram mantidas à mão dentro de src/integrations/supabase/types.ts,
 * que é GERADO — e sumiam a cada regeneração (PR #177 introduziu, #183 repôs,
 * o commit 4040159 apagou de novo). Desde que a plataforma passou a bloquear
 * edição manual de types.ts, elas moram em src/lib/samiq-rpc-args.ts, um
 * arquivo nosso que nenhuma regeneração toca.
 *
 * A regra permanece: `_conversa_id`, `_lead_id` e `_execution_id` não têm
 * DEFAULT nas migrations S1/S2/S4. Trocar `null` por `undefined` (omitir a
 * chave) faz o PostgREST devolver PGRST202 e o turno some em silêncio.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ARGS = readFileSync("src/lib/samiq-rpc-args.ts", "utf8");
const CHAMADA = readFileSync("src/lib/samiq-memoria.server.ts", "utf8");

const ESPERADO: Record<string, string[]> = {
  SamiQGravarTurnoArgs: [
    "_canal?: SamiQCanalRpc",
    "_conversa_id: string | null",
    "_execution_id?: string | null",
    "_lead_id: string | null",
  ],
  SamiQRegistrarPropostasArgs: ["_conversa_id: string | null", "_execution_id: string | null"],
};

/** Corpo da interface declarada em samiq-rpc-args.ts. */
function corpoDe(tipo: string): string {
  const m = ARGS.match(new RegExp(`export interface ${tipo} \\{\\n([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`não achei a interface ${tipo} em src/lib/samiq-rpc-args.ts`);
  return m[1];
}

describe("formas nulas das RPCs da SamiQ", () => {
  for (const [tipo, formas] of Object.entries(ESPERADO)) {
    for (const forma of formas) {
      it(`${tipo}: ${forma}`, () => {
        expect(
          corpoDe(tipo),
          `A forma "${forma}" sumiu de ${tipo} em src/lib/samiq-rpc-args.ts. ` +
            `Reponha ali. Não troque null por undefined em samiq-memoria.server.ts: ` +
            `esses parâmetros não têm DEFAULT na RPC, e omiti-los faz o PostgREST ` +
            `devolver PGRST202 — o turno some em silêncio.`,
        ).toContain(forma);
      });
    }
  }

  it("a chamada envia null, nunca undefined", () => {
    expect(CHAMADA).not.toMatch(/_conversa_id: [^\n]*undefined/);
    expect(CHAMADA).not.toMatch(/_lead_id: [^\n]*undefined/);
    expect(CHAMADA).not.toMatch(/_execution_id: [^\n]*\?\? undefined/);
  });
});

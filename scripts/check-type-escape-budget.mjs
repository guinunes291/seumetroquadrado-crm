import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const ROOTS = ["src"];
// routeTree.gen.ts é GERADO pelo plugin do TanStack Router e ganha `as any`
// a cada rota nova — contá-lo faz qualquer PR com rota estourar o teto sem
// nenhum escape escrito à mão (foi o que quebrou o budget nos últimos runs).
// Fora da conta, o ratchet volta a medir só o que dá para consertar.
const IGNORED_FILES = new Set(["src/routeTree.gen.ts"]);
// Ratchet (só código escrito à mão, sem o gen): 220 com o gen contando →
// 144 reais hoje. Ao aplicar as migrations no ambiente e regenerar os types
// do Supabase, dá para baixar de novo: os `as never`/`as any` das RPCs fora
// dos types (leads_filtered_v2, nav_pendencias, pipeline_snapshot_v3,
// gestao_metricas, dashboard_*) deixam de ser necessários.
// 2026-09-12 — teto de 145 para 147.
// Os +2 sao os dois `as unknown as` de src/lib/samiq-rpc-args.ts, criado pela
// Fatia 2b. Vale a pena: a plataforma passou a BLOQUEAR edicao manual de
// types.ts, entao as formas nulas dos argumentos de RPC da SamiQ (que o
// gerador nao sabe declarar) nao podiam mais viver la. Passaram a morar num
// arquivo nosso, que regeneracao nenhuma apaga.
//
// Isso encerra um pingue-pongue que ja custou tres consertos: #177 introduziu
// as formas em types.ts, #183 as repos, o commit 4040159 as apagou, #185 as
// repos de novo. Dois escapes num boundary unico e documentado sao mais
// baratos que uma regressao por semana.
//
// Os outros escapes contados aqui continuam sendo divida a pagar: ao
// regenerar os types com as views de Higiene do Funil, apague
// src/integrations/supabase/higiene-pendente.ts, troque supabaseHigiene por
// supabase e baixe este teto.
// 2026-09-12 (2) — de 147 para 145: o total real caiu com o PR #187 e ratchet
// folgado nao segura nada. Os escapes restantes continuam sendo divida: ao
// regenerar os types com as views de Higiene do Funil, apague
// src/integrations/supabase/higiene-pendente.ts, troque supabaseHigiene por
// supabase e baixe de novo.
const MAX_ESCAPES = 145;
const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx"]);

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else if (TYPESCRIPT_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

let escapes = 0;
for (const root of ROOTS) {
  for (const file of await filesUnder(root)) {
    if (IGNORED_FILES.has(file)) continue;
    const source = await readFile(file, "utf8");
    escapes += source.match(/\bas\s+(?:any|never)\b|\bunknown\s+as\b/g)?.length ?? 0;
  }
}

if (escapes > MAX_ESCAPES) {
  console.error(
    `Type escape budget exceeded: ${escapes} found, maximum ${MAX_ESCAPES}. ` +
      "Regenerate Supabase types or add an explicit boundary type instead.",
  );
  process.exit(1);
}

console.log(`Type escape budget: ${escapes}/${MAX_ESCAPES}`);

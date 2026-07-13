import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const ROOTS = ["src"];
// Ratchet do redesign v2: 242 → 220 (o real caiu para 212 tipando copa/
// gestão/leads com os tipos gerados). Ao aplicar as migrations no ambiente e
// regenerar os types do Supabase, dá para baixar de novo (~200): os `as never`
// das RPCs novas (leads_filtered_v2, nav_pendencias, pipeline_snapshot_v3,
// gestao_metricas) deixam de ser necessários.
const MAX_ESCAPES = 220;
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

import type { Lead } from "./types";

/** Percorre as páginas autorizadas existentes antes de recortar por projeto. */
export async function listarLeadsDoProjeto(
  projetoId: string,
  carregarPagina: (page: number) => Promise<Lead[]>,
): Promise<Lead[]> {
  const encontrados: Lead[] = [];
  const vistos = new Set<string>();
  for (let page = 1; ; page++) {
    const rows = await carregarPagina(page);
    for (const row of rows) {
      if (row.projeto_id === projetoId && !vistos.has(row.id)) {
        vistos.add(row.id);
        encontrados.push(row);
      }
    }
    const total = Number(rows[0]?.total_count);
    if (rows.length < 200 || (Number.isFinite(total) && page * 200 >= total)) break;
  }
  return encontrados;
}

export function contagensDoProjeto(rows: Lead[]) {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return { total: rows.length, counts };
}
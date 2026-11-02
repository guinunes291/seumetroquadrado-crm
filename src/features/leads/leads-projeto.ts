import type { Lead } from "./types";

/** Percorre as páginas autorizadas existentes antes de recortar por projeto. */
export async function listarLeadsDoProjeto(
  projetoId: string,
  carregarPagina: (page: number) => Promise<Lead[]>,
  projetoNome?: string,
): Promise<Lead[]> {
  const normalizar = (nome: string) => nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().split(/\s+/).sort().join(" ");
  const encontrados: Lead[] = [];
  const vistos = new Set<string>();
  for (let page = 1; ; page++) {
    const rows = await carregarPagina(page);
    for (const row of rows) {
      const corresponde = row.projeto_id === projetoId || (!row.projeto_id && !!projetoNome && !!row.projeto_nome && normalizar(row.projeto_nome) === normalizar(projetoNome));
      if (corresponde && !vistos.has(row.id)) {
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
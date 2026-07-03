/**
 * Pagina além do teto de 1000 linhas do PostgREST. `fetchPage` deve aplicar
 * uma ordenação estável (ex.: `.order("created_at").order("id")`) para que as
 * janelas de `.range(from, to)` não pulem nem repitam linhas.
 */
export async function fetchAllPaged<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const rows = await fetchPage(from, from + pageSize - 1);
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

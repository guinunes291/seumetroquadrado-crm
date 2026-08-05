// Zona do empreendimento — o corte geográfico que o corretor usa para separar
// o estoque ("o cliente quer Zona Leste").
//
// O dado mora em DOIS lugares por acidente de histórico: a ficha do projeto tem
// o campo "Zona SMQ" (`zona_smq`), mas a importação por planilha mapeia a coluna
// "Região / Zona" para `regiao` (ver import-projetos-dialog). Ler só um dos dois
// deixaria a maior parte do catálogo sem zona. Aqui `zona_smq` manda; `regiao`
// entra como fallback.
//
// A normalização (acento, "Zona Sul", "Centro-Sul") é a mesma do mapa da
// Vitrine — uma regra só para as duas telas não discordarem sobre onde fica um
// projeto.

import { normalizeZona, type MapZona } from "@/lib/vitrine/map-projection";

export type Zona = MapZona;

/** Ordem de leitura dos chips: os quatro pontos cardeais, Centro por último. */
export const ZONAS_ORDEM: readonly Zona[] = ["Norte", "Sul", "Leste", "Oeste", "Centro"] as const;

/** Rótulo do balde de quem não tem zona reconhecível — nunca some da tela. */
export const SEM_ZONA = "Sem zona";

export type ZonaFiltro = Zona | typeof SEM_ZONA;

export type ProjetoComZona = {
  zona_smq?: string | null;
  regiao?: string | null;
};

/** Zona do projeto, ou null quando nem `zona_smq` nem `regiao` dizem onde é. */
export function zonaDoProjeto(p: ProjetoComZona): Zona | null {
  return normalizeZona(p.zona_smq) ?? normalizeZona(p.regiao);
}

/** Zona para agrupar/filtrar: cai em "Sem zona" em vez de sumir. */
export function zonaOuSemZona(p: ProjetoComZona): ZonaFiltro {
  return zonaDoProjeto(p) ?? SEM_ZONA;
}

/**
 * Contagem por zona na ordem dos chips, incluindo "Sem zona" no fim quando
 * houver. Zona sem nenhum projeto não vira chip — filtro que só entrega vazio
 * é ruído.
 */
export function contarPorZona<T extends ProjetoComZona>(
  projetos: T[],
): Array<{ zona: ZonaFiltro; total: number }> {
  const contagem = new Map<ZonaFiltro, number>();
  for (const p of projetos) {
    const z = zonaOuSemZona(p);
    contagem.set(z, (contagem.get(z) ?? 0) + 1);
  }
  const ordenadas: Array<{ zona: ZonaFiltro; total: number }> = [];
  for (const z of ZONAS_ORDEM) {
    const total = contagem.get(z);
    if (total) ordenadas.push({ zona: z, total });
  }
  const semZona = contagem.get(SEM_ZONA);
  if (semZona) ordenadas.push({ zona: SEM_ZONA, total: semZona });
  return ordenadas;
}

// Zona do empreendimento — o corte geográfico que o corretor usa para separar
// o estoque ("o cliente quer Zona Leste").
//
// O dado mora em DOIS lugares por acidente de histórico: a ficha do projeto tem
// o campo "Zona SMQ" (`zona_smq`), mas a importação por planilha mapeia a coluna
// "Região / Zona" para `regiao` (ver import-projetos-dialog). Ler só um dos dois
// deixaria a maior parte do catálogo sem zona. Aqui `zona_smq` manda; `regiao`
// entra como fallback.
//
// A normalização das cinco zonas da capital (acento, "Zona Sul", "Centro-Sul") é
// a mesma do mapa da Vitrine — uma regra só para as duas telas não discordarem
// sobre onde fica um projeto.
//
// GRANDE SP (decisão 4 de 2026-09-02, docs/revisao-projetos-foco.md): o estoque
// de Guarulhos, Osasco e ABC é zona de primeira classe na prateleira — antes
// caía em "Sem zona". É reconhecida por `zona_smq`/`regiao` ("Grande SP", "ABC")
// ou pela cidade/bairro ("Ponte Grande (Guarulhos)"). As telas de LEAD e a
// distribuição seguem com as cinco zonas de `ZONAS_ORDEM` (o motor e a tabela
// zonas_bairros só conhecem essas), por isso há dois tipos: `Zona` (lead) e
// `ZonaProjeto` (prateleira).

import { normalizeZona, type MapZona } from "@/lib/vitrine/map-projection";

export type Zona = MapZona;

/** Ordem de leitura dos chips: os quatro pontos cardeais, Centro por último. */
export const ZONAS_ORDEM: readonly Zona[] = ["Norte", "Sul", "Leste", "Oeste", "Centro"] as const;

/** Municípios da região metropolitana fora da capital. */
export const GRANDE_SP = "Grande SP";

export type ZonaProjeto = Zona | typeof GRANDE_SP;

/** Zonas de PROJETO na ordem dos chips da prateleira: capital primeiro, Grande SP depois. */
export const ZONAS_PROJETO_ORDEM: readonly ZonaProjeto[] = [...ZONAS_ORDEM, GRANDE_SP] as const;

/** Rótulo do balde de quem não tem zona reconhecível — nunca some da tela. */
export const SEM_ZONA = "Sem zona";

export type ZonaFiltro = ZonaProjeto | typeof SEM_ZONA;

export type ProjetoComZona = {
  zona_smq?: string | null;
  regiao?: string | null;
  cidade?: string | null;
  bairro?: string | null;
};

// Municípios da Grande SP em que a operação tem estoque ou pode vir a ter. A
// comparação é por palavra inteira (sem acento), então "Poá" não casa "Poá..."
// dentro de outro nome e "Mauá" não pega "Vila Mauá" por acaso de prefixo.
const MUNICIPIOS_GRANDE_SP: readonly string[] = [
  "guarulhos",
  "osasco",
  "barueri",
  "carapicuiba",
  "santo andre",
  "sao bernardo",
  "sao bernardo do campo",
  "sao caetano",
  "sao caetano do sul",
  "diadema",
  "maua",
  "ribeirao pires",
  "rio grande da serra",
  "taboao da serra",
  "embu das artes",
  "embu",
  "cotia",
  "itapevi",
  "jandira",
  "santana de parnaiba",
  "cajamar",
  "franco da rocha",
  "caieiras",
  "mairipora",
  "itaquaquecetuba",
  "suzano",
  "mogi das cruzes",
  "ferraz de vasconcelos",
  "poa",
  "aruja",
  "guararema",
  "itapecerica da serra",
  "vargem grande paulista",
  "alphaville",
] as const;

const chave = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const contemPalavra = (texto: string, alvo: string): boolean =>
  new RegExp(`(^| )${alvo}( |$)`).test(texto);

/** O texto (zona, região, cidade ou bairro) aponta para fora da capital? */
export function ehGrandeSP(texto: string | null | undefined): boolean {
  const k = chave(texto);
  if (!k) return false;
  if (k.includes("grande sp") || k.includes("grande sao paulo")) return true;
  if (k.includes("regiao metropolitana")) return true;
  if (contemPalavra(k, "abc") || k.includes("abc paulista")) return true;
  return MUNICIPIOS_GRANDE_SP.some((m) => contemPalavra(k, m));
}

const ehCapital = (cidade: string | null | undefined): boolean => {
  const k = chave(cidade);
  return k === "sao paulo" || k === "sp" || k === "sao paulo sp";
};

/**
 * Zona do projeto, ou null quando nenhum campo diz onde é.
 * Ordem: cidade fora da capital → Grande SP; zona_smq; regiao; bairro com a
 * cidade colada ("Ponte Grande (Guarulhos)") → Grande SP.
 */
export function zonaDoProjeto(p: ProjetoComZona): ZonaProjeto | null {
  if (p.cidade && !ehCapital(p.cidade) && ehGrandeSP(p.cidade)) return GRANDE_SP;
  if (ehGrandeSP(p.zona_smq)) return GRANDE_SP;
  const capital = normalizeZona(p.zona_smq) ?? normalizeZona(p.regiao);
  if (capital) return capital;
  if (ehGrandeSP(p.regiao)) return GRANDE_SP;
  if (!p.cidade && ehGrandeSP(p.bairro)) return GRANDE_SP;
  return null;
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
  for (const z of ZONAS_PROJETO_ORDEM) {
    const total = contagem.get(z);
    if (total) ordenadas.push({ zona: z, total });
  }
  const semZona = contagem.get(SEM_ZONA);
  if (semZona) ordenadas.push({ zona: SEM_ZONA, total: semZona });
  return ordenadas;
}

/** Rótulo de exibição: "Zona Sul", "Centro", "Grande SP". */
export function rotuloZona(zona: ZonaFiltro): string {
  if (zona === GRANDE_SP || zona === SEM_ZONA || zona === "Centro") return zona;
  return `Zona ${zona}`;
}

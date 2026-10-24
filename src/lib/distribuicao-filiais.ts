// Distribuição — o mapa das filiais (zonas_roletas + roletas + filiais),
// puro e testável: agrupamento, região do corretor, alternância entre
// filiais, frases e seções de campanhas.
// Recortado de distribuicao.ts sem mudança de comportamento.

import { ZONAS_REGIAO } from "@/lib/zonas";

// ---------------------------------------------------------------------------
// O mapa das filiais (zonas_roletas + roletas + filiais), puro e testável. A
// verdade mora no banco; aqui é a mesma leitura para a aba Corretores (editor
// por filial), a aba Filas (ordem das filiais) e as descrições.
// ---------------------------------------------------------------------------

/** Uma linha de zonas_roletas já com o nome da roleta e a filial dela. */
export interface ZonaRoletaLinha {
  zona: string;
  roleta_slug: string;
  roleta_nome: string;
  roleta_ativa: boolean;
  filial_slug: string | null;
  filial_nome: string | null;
  filial_ordem: number | null;
}

/** Uma filial com a roleta dela e as zonas que atende. */
export interface FilialRoleta {
  /** Slug da FILIAL (filiais.slug), não da roleta. */
  slug: string;
  nome: string;
  ordem: number;
  roletaSlug: string;
  roletaNome: string;
  /** Na ordem dos chips (ZONAS_REGIAO), não na alfabética do banco. */
  zonas: string[];
}

/** Zonas na ordem dos chips; o que não é zona conhecida vai para o fim. */
export function ordenarZonas(zonas: readonly string[]): string[] {
  const pos = (z: string) => {
    const i = ZONAS_REGIAO.indexOf(z as (typeof ZONAS_REGIAO)[number]);
    return i === -1 ? 99 : i;
  };
  return [...new Set(zonas)].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b, "pt-BR"));
}

/** As filiais com roleta ATIVA, na ordem de filiais.ordem (empate pelo nome). */
export function agruparFiliais(linhas: readonly ZonaRoletaLinha[]): FilialRoleta[] {
  const porRoleta = new Map<string, FilialRoleta>();
  for (const l of linhas) {
    if (!l.filial_slug || !l.roleta_ativa) continue;
    const f = porRoleta.get(l.roleta_slug) ?? {
      slug: l.filial_slug,
      nome: l.filial_nome ?? l.filial_slug,
      ordem: l.filial_ordem ?? 99,
      roletaSlug: l.roleta_slug,
      roletaNome: l.roleta_nome,
      zonas: [],
    };
    f.zonas.push(l.zona);
    porRoleta.set(l.roleta_slug, f);
  }
  return [...porRoleta.values()]
    .map((f) => ({ ...f, zonas: ordenarZonas(f.zonas) }))
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** A filial está inteira na região do corretor: todas as zonas dela ⊆ região.
 *  (A região é o espelho das roletas de filial em que ele está, então é
 *  tudo ou nada por filial.) */
export function filiaisDaRegiao(filiais: readonly FilialRoleta[], zonas: readonly string[]) {
  const regiao = new Set(zonas);
  return filiais.filter((f) => f.zonas.length > 0 && f.zonas.every((z) => regiao.has(z)));
}

/** Zonas da região que nenhuma filial inteira cobre — não deve acontecer
 *  (a RPC recusa região que não é por filial); a tela mostra a zona solta. */
export function zonasSoltas(filiais: readonly FilialRoleta[], zonas: readonly string[]): string[] {
  const cobertas = new Set(filiaisDaRegiao(filiais, zonas).flatMap((f) => f.zonas));
  return ordenarZonas(zonas.filter((z) => !cobertas.has(z)));
}

/** A união das zonas das filiais marcadas — o que atualizar_corretor_distribuicao
 *  espera (mandar só parte das zonas de uma filial dá "a região é por filial"). */
export function uniaoDasZonas(
  filiais: readonly FilialRoleta[],
  marcadas: ReadonlySet<string>,
): string[] {
  return ordenarZonas(filiais.filter((f) => marcadas.has(f.slug)).flatMap((f) => f.zonas));
}

/** "Belém — Leste, Grande SP" (separador configurável: "·" nos badges). */
export function rotuloFilial(f: FilialRoleta, separador = " — "): string {
  return `${f.nome}${separador}${f.zonas.join(", ")}`;
}

/** Nomes que levam artigo feminino na frase ("na Belém", "a Liberdade");
 *  o resto é masculino ("no Sul", "o Centro"). Lista explícita de propósito:
 *  a tela não adivinha gênero de nome de loja. */
const NOMES_FEMININOS = new Set(["Grande SP", "Barra Funda", "Liberdade", "Belém"]);
export function femininoNaFrase(nome: string): boolean {
  return NOMES_FEMININOS.has(nome);
}

/** "Liberdade e Belém", "Norte, Sul e Oeste". */
export function listarNomes(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** As outras filiais que atendem a mesma zona ("A Leste alterna com a Belém"). */
export function filiaisQueAlternam(f: FilialRoleta, todas: readonly FilialRoleta[]) {
  return f.zonas
    .map((zona) => ({
      zona,
      com: todas.filter((o) => o.slug !== f.slug && o.zonas.includes(zona)).map((o) => o.nome),
    }))
    .filter((x) => x.com.length > 0);
}

/** "A Leste alterna entre Liberdade e Belém." — uma frase por zona que mais de
 *  uma filial atende (o rodízio entre as roletas da mesma zona). */
export function frasesAlternancia(filiais: readonly FilialRoleta[]): string[] {
  const porZona = new Map<string, string[]>();
  for (const f of filiais) {
    for (const z of f.zonas) porZona.set(z, [...(porZona.get(z) ?? []), f.nome]);
  }
  return ordenarZonas([...porZona.keys()]).flatMap((z) => {
    const nomes = porZona.get(z) ?? [];
    return nomes.length > 1 ? [`A ${z} alterna entre ${listarNomes(nomes)}.`] : [];
  });
}

/** As campanhas em seções por filial dona (ordem das filiais); as sem filial
 *  — ou com filial desconhecida — no fim ("Campanhas · sem filial"). */
export function secoesDeCampanhas<T extends { filial_id: string | null }>(
  campanhas: readonly T[],
  filiais: readonly { id: string; nome: string; ordem: number }[],
): Array<{ chave: string; titulo: string; filas: T[] }> {
  const secoes: Array<{ chave: string; titulo: string; filas: T[] }> = [];
  for (const f of [...filiais].sort((a, b) => a.ordem - b.ordem)) {
    const filas = campanhas.filter((c) => c.filial_id === f.id);
    if (filas.length > 0) secoes.push({ chave: f.id, titulo: `Campanhas · ${f.nome}`, filas });
  }
  const ids = new Set(filiais.map((f) => f.id));
  const soltas = campanhas.filter((c) => !c.filial_id || !ids.has(c.filial_id));
  if (soltas.length > 0) {
    secoes.push({ chave: "sem-filial", titulo: "Campanhas · sem filial", filas: soltas });
  }
  return secoes;
}

/** A descrição da roleta de filial na Central: as zonas e quem alterna. */
export function descricaoRoletaFilial(f: FilialRoleta, todas: readonly FilialRoleta[]): string {
  const zonas =
    f.zonas.length === 1 ? `da zona ${f.zonas[0]}` : `das zonas ${listarNomes(f.zonas)}`;
  const base = `Time fixo da ${f.nome}: recebe os leads ${zonas}.`;
  const alterna = filiaisQueAlternam(f, todas).map(
    (x) =>
      `A ${x.zona} alterna com ${listarNomes(
        x.com.map((n) => `${femininoNaFrase(n) ? "a" : "o"} ${n}`),
      )}.`,
  );
  return [base, ...alterna].join(" ");
}

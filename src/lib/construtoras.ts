// Construtoras parceiras — as que a operação prioriza na bancada do corretor.
//
// A lista vive na tabela `construtoras_parceiras` (a gestão edita pela tela).
// PARCEIRAS_PADRAO existe como rede de segurança: se a migração ainda não
// rodou no ambiente, a bancada abre com as parceiras de agosto/2026 em vez de
// quebrar ou achatar tudo em "outras".
//
// O casamento com `projetos.construtora` é por nome NORMALIZADO e por
// continência: a coluna é texto livre vindo de planilha, então "Cury",
// "Cury Construtora" e "CURY CONSTRUTORA S.A." têm de cair na mesma parceira.

/** Nomes e ordem de leitura definidos pela operação (espelham o seed da migração). */
export const PARCEIRAS_PADRAO: readonly string[] = [
  "Mundo Apto",
  "Longitude",
  "Vibra",
  "Cury",
  "Direcional",
  "Riva",
] as const;

export type Parceira = {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
};

/** Sem acento, sem pontuação, minúsculo — a chave de comparação de nomes. */
export function chaveConstrutora(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Sufixos societários e genéricos que aparecem coladas ao nome na planilha e
// não distinguem uma construtora de outra.
const RUIDO =
  /\b(construtora|incorporadora|incorporacoes|empreendimentos|urbanismo|s a|sa|ltda|me|eireli|group|grupo)\b/g;

/** Núcleo do nome: o que sobra depois de tirar o ruído societário. */
function nucleo(nome: string | null | undefined): string {
  return chaveConstrutora(nome).replace(RUIDO, " ").replace(/\s+/g, " ").trim();
}

/**
 * A construtora do projeto é esta parceira? Compara o núcleo dos dois nomes por
 * igualdade ou continência de PALAVRA INTEIRA — "riva" casa "Riva Incorporadora"
 * mas não "Rivalda", e o nome curto da parceira nunca casa por prefixo solto.
 */
export function mesmaConstrutora(
  construtoraDoProjeto: string | null | undefined,
  nomeDaParceira: string,
): boolean {
  const a = nucleo(construtoraDoProjeto);
  const b = nucleo(nomeDaParceira);
  if (!a || !b) return false;
  if (a === b) return true;
  const contemPalavra = (texto: string, alvo: string) =>
    new RegExp(`(^| )${alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(texto);
  return contemPalavra(a, b) || contemPalavra(b, a);
}

/** A parceira que casa com a construtora do projeto, respeitando a ordem da gestão. */
export function parceiraDoProjeto<T extends { nome: string }>(
  construtoraDoProjeto: string | null | undefined,
  parceiras: readonly T[],
): T | null {
  return parceiras.find((p) => mesmaConstrutora(construtoraDoProjeto, p.nome)) ?? null;
}

/** Ordem de leitura: `ordem` da gestão primeiro, nome como desempate estável. */
export function ordenarParceiras<T extends { nome: string; ordem: number }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

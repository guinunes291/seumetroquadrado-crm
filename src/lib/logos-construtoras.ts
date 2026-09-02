// Logos locais das construtoras — a prateleira nasce vestida (decisão 13 de
// 2026-09-02, docs/revisao-projetos-foco.md §10).
//
// Fonte: sites oficiais das marcas e as tabelas de venda no Drive, coletadas em
// 2026-09-02 (scripts/logos/). Cada entrada diz onde está o arquivo em public/
// e em que fundo a logo é legível: várias marcas só publicam a versão branca
// (Tenda, Emccamp, Kazzas, Vitta) — jogadas num fundo claro elas somem, e as
// escuras (Cyrela, Conx, Lavvi) somem no gradiente navy. A placa (features/
// projetos/placa-logo) lê `fundo` e escolhe o fundo certo.
//
// Precedência na prateleira: logo_url cadastrada pela gestão na parceira >
// logo local por nome > iniciais. O casamento por nome é o mesmo das parceiras
// (mesmaConstrutora: núcleo sem sufixo societário, palavra inteira), então
// "CURY CONSTRUTORA S.A." e "Cury" caem na mesma logo.

import { mesmaConstrutora } from "@/lib/construtoras";

export type FundoLogo = "claro" | "escuro";

export type LogoConstrutora = {
  /** Identificador estável; também é o nome do arquivo em public/logos/construtoras. */
  slug: string;
  arquivo: string;
  fundo: FundoLogo;
  /** Nomes que casam com a coluna `construtora` (ou com o nome do empreendimento). */
  nomes: readonly string[];
};

export const PASTA_LOGOS = "/logos/construtoras";

/**
 * Ordem importa quando um nome cita duas marcas: "Vivaz (Cyrela)" tem de cair
 * na Vivaz, então ela vem antes da Cyrela. Marcas cujo nome é palavra comum em
 * nomes de empreendimento (ex.: "Marques" ≈ "Marquês") ficam de fora para o
 * fallback pelo nome do projeto não vestir a logo errada.
 */
export const LOGOS_CONSTRUTORAS: readonly LogoConstrutora[] = [
  { slug: "vivaz", arquivo: "vivaz.svg", fundo: "claro", nomes: ["Vivaz", "Vivaz Residencial"] },
  { slug: "cyrela", arquivo: "cyrela.svg", fundo: "claro", nomes: ["Cyrela"] },
  { slug: "cury", arquivo: "cury.png", fundo: "escuro", nomes: ["Cury"] },
  { slug: "trisul", arquivo: "trisul.svg", fundo: "claro", nomes: ["Trisul"] },
  { slug: "conx", arquivo: "conx.svg", fundo: "claro", nomes: ["Conx", "NeoConx"] },
  {
    slug: "plano-e-plano",
    arquivo: "plano-e-plano.svg",
    fundo: "escuro",
    nomes: ["Plano&Plano", "Plano e Plano", "Plano"],
  },
  { slug: "mbigucci", arquivo: "mbigucci.png", fundo: "claro", nomes: ["MBigucci", "Bigucci"] },
  { slug: "vibra", arquivo: "vibra.png", fundo: "claro", nomes: ["Vibra", "Vibra Residencial"] },
  {
    slug: "one-innovation",
    arquivo: "one-innovation.png",
    fundo: "escuro",
    nomes: ["ONE Innovation", "One"],
  },
  {
    slug: "mundo-apto",
    arquivo: "mundo-apto.svg",
    fundo: "claro",
    nomes: ["Mundo Apto", "MundoApto"],
  },
  { slug: "lavvi", arquivo: "lavvi.svg", fundo: "claro", nomes: ["Lavvi"] },
  { slug: "tenda", arquivo: "tenda.png", fundo: "escuro", nomes: ["Tenda"] },
  { slug: "patriani", arquivo: "patriani.svg", fundo: "claro", nomes: ["Patriani"] },
  {
    slug: "vitta",
    arquivo: "vitta.png",
    fundo: "escuro",
    nomes: ["Vitta", "Vitta Bild", "Vitta Residencial"],
  },
  { slug: "bild", arquivo: "bild.svg", fundo: "claro", nomes: ["Bild"] },
  { slug: "vinx", arquivo: "vinx.svg", fundo: "claro", nomes: ["Vinx"] },
  { slug: "emccamp", arquivo: "emccamp.svg", fundo: "escuro", nomes: ["Emccamp"] },
  { slug: "maskan", arquivo: "maskan.png", fundo: "claro", nomes: ["Maskan"] },
  { slug: "migras", arquivo: "migras.png", fundo: "claro", nomes: ["Migras"] },
  { slug: "magik-jc", arquivo: "magik-jc.svg", fundo: "claro", nomes: ["Magik JC", "Magik"] },
  { slug: "longitude", arquivo: "longitude.svg", fundo: "claro", nomes: ["Longitude"] },
  { slug: "direcional", arquivo: "direcional.png", fundo: "claro", nomes: ["Direcional"] },
  { slug: "kazzas", arquivo: "kazzas.png", fundo: "escuro", nomes: ["Kazzas"] },
];

export function urlLogo(logo: LogoConstrutora): string {
  return `${PASTA_LOGOS}/${logo.arquivo}`;
}

/** A logo local que casa com o nome da construtora, ou null. */
export function logoDaConstrutora(nome: string | null | undefined): LogoConstrutora | null {
  if (!nome?.trim()) return null;
  return LOGOS_CONSTRUTORAS.find((l) => l.nomes.some((n) => mesmaConstrutora(nome, n))) ?? null;
}

/**
 * Mesma regra de parceiraDoProjetoOuNome (decisão 5): com a construtora
 * preenchida ela manda, mesmo que o nome cite outra marca; vazia, tenta pelo
 * nome do empreendimento ("Mundo APTO Voluntários da Pátria" sem construtora).
 */
export function logoDoProjeto(projeto: {
  construtora: string | null | undefined;
  nome: string | null | undefined;
}): LogoConstrutora | null {
  if (projeto.construtora?.trim()) return logoDaConstrutora(projeto.construtora);
  return logoDaConstrutora(projeto.nome);
}

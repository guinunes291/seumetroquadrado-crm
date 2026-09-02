// Completude do cadastro de um empreendimento — decisão 6 de 2026-09-02
// (docs/revisao-projetos-foco.md).
//
// Uma prateleira só funciona se o produto tiver o mínimo para ser vendido. O
// score diz à gestão o que falta (e ordena o trabalho no Materiais); o mínimo
// decide se o projeto aparece na prateleira do corretor. Campanha em foco é
// escolha explícita da gestão e passa sempre — quem chamou não mostra o vazio.

import type { ZonaProjeto } from "@/lib/zonas";

export const CAMPOS_COMPLETUDE = [
  "preco",
  "book",
  "tabela",
  "capa",
  "zona",
  "metragem",
  "dorms",
  "entrega",
  "renda",
  "diferenciais",
] as const;

export type CampoCompletude = (typeof CAMPOS_COMPLETUDE)[number];

/** Pesos somam 100. Preço e material pesam mais: sem eles o card não vende. */
export const PESO_COMPLETUDE: Record<CampoCompletude, number> = {
  preco: 20,
  book: 15,
  tabela: 15,
  capa: 15,
  zona: 10,
  metragem: 8,
  dorms: 7,
  entrega: 5,
  renda: 3,
  diferenciais: 2,
};

export const ROTULO_COMPLETUDE: Record<CampoCompletude, string> = {
  preco: "Preço a partir de",
  book: "Book",
  tabela: "Tabela de preços",
  capa: "Imagem de capa",
  zona: "Zona",
  metragem: "Metragem",
  dorms: "Dormitórios",
  entrega: "Entrega",
  renda: "Renda mínima",
  diferenciais: "Diferenciais",
};

export type ProjetoCompletudeInput = {
  preco_a_partir?: number | null;
  sob_consulta?: boolean | null;
  book_url?: string | null;
  tabela_precos_url?: string | null;
  capa_url?: string | null;
  metragem_min?: number | null;
  metragem_max?: number | null;
  dorms_min?: number | null;
  dorms_max?: number | null;
  status_entrega?: string | null;
  ano_entrega?: number | null;
  renda_minima?: number | null;
  diferenciais?: string[] | null;
};

export type Completude = {
  /** 0–100. */
  score: number;
  /** Campos vazios, na ordem de peso (o mais importante primeiro). */
  faltando: CampoCompletude[];
  /** Mínimo da prateleira: zona conhecida E (book OU tabela). */
  prontoParaPrateleira: boolean;
};

const temTexto = (s: string | null | undefined): boolean => !!s && s.trim().length > 0;
const temNumero = (n: number | null | undefined): boolean => n != null && Number.isFinite(n);

/**
 * Avalia o cadastro. `zona` chega resolvida (zona_smq/regiao/cidade) para a
 * regra de Grande SP viver num lugar só (lib/zonas).
 */
export function completudeProjeto(p: ProjetoCompletudeInput, zona: ZonaProjeto | null): Completude {
  const presente: Record<CampoCompletude, boolean> = {
    // "Sob consulta" marcado é decisão comercial explícita, não falta de dado.
    preco: temNumero(p.preco_a_partir) || p.sob_consulta === true,
    book: temTexto(p.book_url),
    tabela: temTexto(p.tabela_precos_url),
    capa: temTexto(p.capa_url),
    zona: zona != null,
    metragem: temNumero(p.metragem_min) || temNumero(p.metragem_max),
    dorms: temNumero(p.dorms_min) || temNumero(p.dorms_max),
    entrega: temTexto(p.status_entrega) || temNumero(p.ano_entrega),
    renda: temNumero(p.renda_minima),
    diferenciais: (p.diferenciais?.length ?? 0) > 0,
  };

  let score = 0;
  const faltando: CampoCompletude[] = [];
  for (const campo of CAMPOS_COMPLETUDE) {
    if (presente[campo]) score += PESO_COMPLETUDE[campo];
    else faltando.push(campo);
  }

  return {
    score,
    faltando,
    prontoParaPrateleira: presente.zona && (presente.book || presente.tabela),
  };
}

/** Rótulo curto do que falta, para tooltip e lista do Materiais. */
export function descreveFaltando(faltando: CampoCompletude[], max = 3): string {
  if (faltando.length === 0) return "Cadastro completo";
  const nomes = faltando.slice(0, max).map((c) => ROTULO_COMPLETUDE[c]);
  const resto = faltando.length - nomes.length;
  return `Falta: ${nomes.join(", ")}${resto > 0 ? ` e mais ${resto}` : ""}`;
}

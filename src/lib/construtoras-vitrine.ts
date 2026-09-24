// Construtoras que aparecem na página de produtos e na vitrine dos corretores.
// O catálogo da gestão (/projetos) continua mostrando tudo.
const CONSTRUTORAS_VITRINE = [
  "vibra",
  "trisul",
  "plano e plano",
  "mundo apto",
  "holos",
  "engelux",
  "conx",
  "cavazani",
  "cury",
  "longitude",
  "direcional",
  "riva",
  "econ",
];

function norm(s: string | null | undefined): string {
  return ` ${(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

function casa(texto: string | null | undefined): boolean {
  const t = norm(texto);
  return CONSTRUTORAS_VITRINE.some(
    (c) => t.includes(` ${c} `) || (c === "conx" && t.includes("conx")),
  );
}

/** Com construtora preenchida ela decide; sem ela, tenta pelo nome do empreendimento. */
export function naVitrine(p: { construtora?: string | null; nome?: string | null }): boolean {
  if (p.construtora && p.construtora.trim()) return casa(p.construtora);
  return casa(p.nome);
}

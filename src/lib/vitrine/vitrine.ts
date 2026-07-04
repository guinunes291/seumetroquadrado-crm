// Regras de domínio da Vitrine de Empreendimentos: derivação de "situação",
// rótulo de entrega, filtragem e ordenação. Tudo puro e testável — a rota só
// orquestra estado e renderização.

import type { ProjetoRow } from "@/components/projeto-card";

export type Situacao = "Pronto" | "Em obras" | "Lançamento" | "A confirmar";

export const SITUACOES: Situacao[] = ["Pronto", "Em obras", "Lançamento", "A confirmar"];

/**
 * Situação comercial do empreendimento a partir do texto livre de entrega e do
 * ano previsto. Prioriza sinais explícitos ("pronto", "lançamento") e trata
 * "tem data futura" como obra em andamento.
 */
export function deriveSituacao(p: ProjetoRow): Situacao {
  const txt = `${p.status_entrega ?? ""} ${p.entrega_status ?? ""}`.toLowerCase();
  if (/pronto|entregue|habite-?se/.test(txt)) return "Pronto";
  if (/lan[çc]/.test(txt)) return "Lançamento";
  if (/obra|constru/.test(txt) || p.ano_entrega != null || p.mes_entrega != null) return "Em obras";
  return "A confirmar";
}

/** Rótulo curto de entrega para o badge do card ("Entrega 06/2028", "Pronto"…). */
export function entregaBadge(p: ProjetoRow): string {
  const sit = deriveSituacao(p);
  if (sit === "Em obras" && p.ano_entrega) {
    const mm = p.mes_entrega ? `${String(p.mes_entrega).padStart(2, "0")}/` : "";
    return `Entrega ${mm}${p.ano_entrega}`;
  }
  return sit;
}

export type DormFiltro = "Todos" | "1 dorm" | "2+ dorms";
export const DORM_FILTROS: DormFiltro[] = ["Todos", "1 dorm", "2+ dorms"];

export type VitrineSort = "preco-asc" | "preco-desc" | "az";

export type VitrineFilters = {
  q: string;
  /** Valor bruto de `zona_smq` (ou "Todas"). Os chips vêm dos dados reais. */
  zona: string;
  situacao: Situacao | "Todas";
  dorm: DormFiltro;
  budget: number | null;
  sort: VitrineSort;
};

export const emptyVitrineFilters: VitrineFilters = {
  q: "",
  zona: "Todas",
  situacao: "Todas",
  dorm: "Todos",
  budget: null,
  sort: "preco-asc",
};

function matchDorm(p: ProjetoRow, filtro: DormFiltro): boolean {
  if (filtro === "Todos") return true;
  // Sem dado de dorms não deve sumir da vitrine — o corretor confirma na ficha.
  if (p.dorms_min == null && p.dorms_max == null) return true;
  const min = p.dorms_min ?? p.dorms_max!;
  const max = p.dorms_max ?? p.dorms_min!;
  if (filtro === "1 dorm") return min <= 1;
  return max >= 2; // "2+ dorms"
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Aplica os filtros da toolbar e ordena conforme a seleção. */
export function applyVitrineFilters(projetos: ProjetoRow[], f: VitrineFilters): ProjetoRow[] {
  const q = norm(f.q.trim());
  const out = projetos.filter((p) => {
    if (f.zona !== "Todas" && (p.zona_smq?.trim() ?? "") !== f.zona) return false;
    if (f.situacao !== "Todas" && deriveSituacao(p) !== f.situacao) return false;
    if (!matchDorm(p, f.dorm)) return false;
    if (f.budget != null && (p.preco_a_partir == null || p.preco_a_partir > f.budget)) return false;
    if (q) {
      const hay = norm(
        [p.nome, p.construtora, p.bairro, p.regiao, p.cidade].filter(Boolean).join(" "),
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const SEM_PRECO = Number.POSITIVE_INFINITY;
  if (f.sort === "az") {
    out.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  } else {
    const dir = f.sort === "preco-desc" ? -1 : 1;
    out.sort((a, b) => ((a.preco_a_partir ?? SEM_PRECO) - (b.preco_a_partir ?? SEM_PRECO)) * dir);
  }
  return out;
}

/**
 * Zonas presentes no catálogo (valores brutos de `zona_smq`) para montar os
 * chips. As zonas cardeais conhecidas vêm primeiro, na ordem geográfica; as
 * demais em ordem alfabética.
 */
export function zonasDisponiveis(projetos: ProjetoRow[]): string[] {
  const set = new Set<string>();
  for (const p of projetos) {
    const z = p.zona_smq?.trim();
    if (z) set.add(z);
  }
  const ORDEM = ["Norte", "Sul", "Leste", "Oeste", "Centro"];
  return Array.from(set).sort((a, b) => {
    const ia = ORDEM.indexOf(a);
    const ib = ORDEM.indexOf(b);
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
    return a.localeCompare(b, "pt");
  });
}

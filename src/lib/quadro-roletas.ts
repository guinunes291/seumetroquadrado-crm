// Quadro "Quem está em qual roleta" (decisão do dono, 13/10/2026: "precisamos
// deixar as roletas mais simples de entender quem está em qual roleta") —
// lógica pura, sem React, para a tela e os testes lerem a mesma régua.
//
// Uma linha por corretor; quatro colunas, uma por família de roleta:
//   Filial      — a região (as filiais inteiras do corretor, espelho das
//                 roletas de filial; a mesma leitura da antiga aba Corretores);
//   Campanhas   — as campanhas ATIVAS em que ele participa;
//   SDR         — participa dos Agendados do SDR;
//   Marquinhos  — automática (top em vendas): a posição no ranking, ou a
//                 participação quando a regra está desligada.
// "Participa" é a mesma régua de rodízio do motor: participação ativa numa
// roleta ativa. Pausa não tira da coluna — aparece como "pausado".

import {
  filiaisDaRegiao,
  type FamiliaRoleta,
  type FilialRoleta,
  familiaDaRoleta,
} from "./distribuicao";

/** Uma linha de roleta_participantes com a roleta embutida (to-one). */
export interface ParticipacaoQuadro {
  corretor_id: string;
  ativo: boolean;
  pausado_ate: string | null;
  roleta:
    | { slug: string; nome: string; tipo: string; ativo: boolean; filial_id?: string | null }
    | Array<{ slug: string; nome: string; tipo: string; ativo: boolean; filial_id?: string | null }>
    | null;
}

/** Uma linha de marquinhos_ranking_v1().corretores. */
export interface MarquinhosLinha {
  corretor_id: string;
  nome: string;
  vendas: number;
  valor: number;
  ultima_venda: string | null;
  bloqueado: boolean;
  posicao: number | null;
  resultado: "dentro" | "fora" | "sem_venda" | "bloqueado_admin";
}

export interface MarquinhosRanking {
  regra_ativa: boolean;
  top_n: number;
  janela_dias: number;
  apurado_em: string | null;
  corretores: MarquinhosLinha[];
}

export interface CorretorQuadro {
  id: string;
  nome: string;
  ativo: boolean;
  presente: boolean;
  telefone: string | null;
  zonas: string[];
}

export interface PosicaoNaRoleta {
  slug: string;
  nome: string;
  pausado: boolean;
}

export interface LinhaQuadro {
  corretor: CorretorQuadro;
  filiais: FilialRoleta[];
  campanhas: PosicaoNaRoleta[];
  sdr: PosicaoNaRoleta | null;
  marquinhos: {
    participa: PosicaoNaRoleta | null;
    ranking: MarquinhosLinha | null;
  };
  /** Em nenhuma das quatro (o corretor não recebe lead de roleta nenhuma). */
  semRoleta: boolean;
}

function roletaDe(p: ParticipacaoQuadro) {
  return Array.isArray(p.roleta) ? (p.roleta[0] ?? null) : p.roleta;
}

/** Monta o quadro. `agora` entra de fora (teste determinístico). */
export function montarQuadro(
  corretores: readonly CorretorQuadro[],
  participacoes: readonly ParticipacaoQuadro[],
  filiais: readonly FilialRoleta[],
  ranking: MarquinhosRanking | null,
  agora: number = Date.now(),
): LinhaQuadro[] {
  const porCorretor = new Map<string, Map<FamiliaRoleta, PosicaoNaRoleta[]>>();
  for (const p of participacoes) {
    const r = roletaDe(p);
    if (!r || !r.ativo || !p.ativo) continue;
    const familia = familiaDaRoleta(r);
    if (!familia) continue;
    const pausado = !!p.pausado_ate && new Date(p.pausado_ate).getTime() > agora;
    const doCorretor =
      porCorretor.get(p.corretor_id) ?? new Map<FamiliaRoleta, PosicaoNaRoleta[]>();
    doCorretor.set(familia, [
      ...(doCorretor.get(familia) ?? []),
      { slug: r.slug, nome: r.nome, pausado },
    ]);
    porCorretor.set(p.corretor_id, doCorretor);
  }
  const rank = new Map((ranking?.corretores ?? []).map((m) => [m.corretor_id, m]));

  return corretores.map((c) => {
    const f = porCorretor.get(c.id);
    const campanhas = [...(f?.get("campanha") ?? [])].sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
    const sdr = f?.get("sdr")?.[0] ?? null;
    const marquinhos = f?.get("marquinhos")?.[0] ?? null;
    const minhasFiliais = filiaisDaRegiao(filiais, c.zonas);
    return {
      corretor: c,
      filiais: minhasFiliais,
      campanhas,
      sdr,
      marquinhos: { participa: marquinhos, ranking: rank.get(c.id) ?? null },
      semRoleta: minhasFiliais.length === 0 && campanhas.length === 0 && !sdr && !marquinhos,
    };
  });
}

export interface FiltroQuadro {
  /** Slug da FILIAL (filiais.slug); "todas"; ou "sem" = sem filial nenhuma. */
  filial: string;
  /** Slug da campanha; "todas"; ou "sem" = em nenhuma campanha. */
  campanha: string;
  soSemRoleta: boolean;
  busca: string;
}

export const FILTRO_QUADRO_PADRAO: FiltroQuadro = {
  filial: "todas",
  campanha: "todas",
  soSemRoleta: false,
  busca: "",
};

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function filtrarQuadro(linhas: readonly LinhaQuadro[], filtro: FiltroQuadro): LinhaQuadro[] {
  const busca = normalizar(filtro.busca);
  return linhas.filter((l) => {
    if (filtro.soSemRoleta && !l.semRoleta) return false;
    if (filtro.filial === "sem" && l.filiais.length > 0) return false;
    if (
      filtro.filial !== "todas" &&
      filtro.filial !== "sem" &&
      !l.filiais.some((f) => f.slug === filtro.filial)
    ) {
      return false;
    }
    if (filtro.campanha === "sem" && l.campanhas.length > 0) return false;
    if (
      filtro.campanha !== "todas" &&
      filtro.campanha !== "sem" &&
      !l.campanhas.some((c) => c.slug === filtro.campanha)
    ) {
      return false;
    }
    if (busca && !normalizar(l.corretor.nome).includes(busca)) return false;
    return true;
  });
}

/** Totais do topo do quadro: pessoas por filial, por campanha, no SDR, na
 *  Marquinhos e sem roleta. */
export function totaisDoQuadro(linhas: readonly LinhaQuadro[]) {
  const porFilial = new Map<string, number>();
  const porCampanha = new Map<string, number>();
  let sdr = 0;
  let marquinhos = 0;
  let semRoleta = 0;
  for (const l of linhas) {
    for (const f of l.filiais) porFilial.set(f.slug, (porFilial.get(f.slug) ?? 0) + 1);
    for (const c of l.campanhas) porCampanha.set(c.slug, (porCampanha.get(c.slug) ?? 0) + 1);
    if (l.sdr) sdr += 1;
    if (l.marquinhos.participa) marquinhos += 1;
    if (l.semRoleta) semRoleta += 1;
  }
  return { porFilial, porCampanha, sdr, marquinhos, semRoleta };
}

/** O texto da célula da Marquinhos. Com a regra ligada, a posição no ranking
 *  diz o porquê ("2º em vendas", "fora — 9º"); desligada, só a participação. */
export function rotuloMarquinhos(
  linha: LinhaQuadro["marquinhos"],
  ranking: Pick<MarquinhosRanking, "regra_ativa" | "top_n" | "janela_dias"> | null,
): { texto: string; dentro: boolean } {
  const pausa = linha.participa?.pausado ? " · pausado" : "";
  if (!ranking?.regra_ativa) {
    return linha.participa
      ? { texto: `Na roleta${pausa}`, dentro: true }
      : { texto: "—", dentro: false };
  }
  const r = linha.ranking;
  if (!r) return { texto: "—", dentro: false };
  switch (r.resultado) {
    case "dentro":
      return { texto: `${r.posicao}º em vendas${pausa}`, dentro: true };
    case "fora":
      return { texto: `Fora — ${r.posicao}º (top ${ranking.top_n})`, dentro: false };
    case "bloqueado_admin":
      return { texto: "Bloqueado pela gestão", dentro: false };
    default:
      return { texto: `Sem venda em ${ranking.janela_dias} dias`, dentro: false };
  }
}

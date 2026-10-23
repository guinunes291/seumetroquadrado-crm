// Qual sistema e seção acendem para a rota atual, inclusive nas telas
// transversais de lead.
// Recortado de sistemas.ts (que reexporta tudo) sem mudança de conteúdo.

import { CARTEIRA_STAGES, type FaseFunil } from "@/lib/leads";
import type { Secao, Sistema } from "@/features/nav/sistemas-tipos";
import { SISTEMAS } from "@/features/nav/sistemas-registro";

// ---------------------------------------------------------------------------
// Resolução do sistema ativo a partir da rota (pathname + search)
// ---------------------------------------------------------------------------

export type Loc = { pathname: string; search: Record<string, unknown> };

/** Fronteira de segmento: /leads casa /leads/abc mas NÃO /leads-landing. */
function pathCasa(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + "/");
}

/** Match estrito: toda chave de search da seção precisa estar presente e
 *  igual na URL. Seção sem search casa qualquer search. */
function searchCasa(secao: Secao, search: Record<string, unknown>): boolean {
  if (!secao.search) return true;
  return Object.entries(secao.search).every(([k, v]) => String(search[k]) === v);
}

type Candidata = { sistema: Sistema; secao: Secao; chaves: number; temTab: boolean };

function candidatas(loc: Loc, lista: Sistema[]): Candidata[] {
  const out: Candidata[] = [];
  for (const sistema of lista) {
    for (const secao of sistema.secoes) {
      if (!pathCasa(loc.pathname, secao.to)) continue;
      if (!searchCasa(secao, loc.search)) continue;
      const chaves = secao.search ? Object.keys(secao.search).length : 0;
      out.push({ sistema, secao, chaves, temTab: !!secao.search && "tab" in secao.search });
    }
  }
  return out;
}

/** Ranking: mais chaves de search casadas > chave de VISÃO (`tab`) > declaração.
 *  O desempate por `tab` ficou sem par no registro atual (a seção Fechamento,
 *  que empatava com o Funil no /pipeline, morreu no corte de 2026-08-30) —
 *  fica como guarda para a próxima dupla página×visão que surgir. */
function melhorCandidata(cands: Candidata[]): Candidata | null {
  if (cands.length === 0) return null;
  return cands.reduce((melhor, c) => {
    if (c.chaves !== melhor.chaves) return c.chaves > melhor.chaves ? c : melhor;
    if (c.temTab !== melhor.temTab) return c.temTab ? c : melhor;
    return melhor; // empate total: primeira declarada vence
  });
}

export function sistemaAtivo(loc: Loc, lista: Sistema[] = SISTEMAS): Sistema | null {
  const melhor = melhorCandidata(candidatas(loc, lista));
  if (melhor) return melhor.sistema;

  // Sem seção casando: domínio extra por prefixo mais longo.
  let dono: Sistema | null = null;
  let maior = -1;
  for (const sistema of lista) {
    for (const prefixo of sistema.dominioExtra ?? []) {
      if (pathCasa(loc.pathname, prefixo) && prefixo.length > maior) {
        dono = sistema;
        maior = prefixo.length;
      }
    }
  }
  return dono;
}

/** Seção acesa na sidebar do sistema ativo (null = nenhuma; ex.: /pipeline
 *  cru dentro da Carteira — o quadro completo não é nenhuma das duas fases). */
export function secaoAtiva(sistema: Sistema, loc: Loc): Secao | null {
  return melhorCandidata(candidatas(loc, [sistema]))?.secao ?? null;
}

// ---------------------------------------------------------------------------
// Telas TRANSVERSAIS: resolução contextual pela fase da jornada do lead
// ---------------------------------------------------------------------------
// A ficha do lead (30 links de todos os sistemas desembocam nela), a Vitrine e
// a ficha de projeto abertas COM um lead são passos de uma jornada — não
// pertencem a hub fixo. Resolver pelo prefixo do path prendia lead avançado na
// sidebar de Prospecção (o "custo consciente do v1", medido pela auditoria de
// 2026-08-27 como a maior fonte de troca falsa de hub). A resolução é por
// DADO DETERMINÍSTICO (etapa do lead; leadId na URL), nunca por referrer —
// bookmark e refresh resolvem igual.

/** Fase da jornada pela etapa do lead. Terminais (pos_venda/perdido) contam
 *  como carteira — o fim da jornada é trabalho de carteira. null = sem dado
 *  (carregando): o caller cai na resolução padrão por path. */
export function faseDoStatus(status: string | null | undefined): FaseFunil | null {
  if (!status) return null;
  if (
    (CARTEIRA_STAGES as string[]).includes(status) ||
    status === "pos_venda" ||
    status === "perdido"
  ) {
    return "carteira";
  }
  return "prospeccao";
}

/** Tela transversal de lead: a ficha (/leads/$id) sempre; Vitrine e ficha de
 *  projeto SÓ quando abertas com ?leadId — sem lead, são consulta de catálogo
 *  e pertencem a Docs & Projetos como sempre. */
export function telaTransversalDeLead(loc: Loc): boolean {
  if (loc.pathname.startsWith("/leads/")) return true;
  const comLead = typeof loc.search.leadId === "string" && loc.search.leadId.length > 0;
  // /match entrou no corte de 2026-08-30: aberto da ficha (?leadId) é parte
  // da jornada DAQUELE lead — match de orçamento é uso típico de qualificação
  // — e a sidebar não pode saltar para a Carteira (dominioExtra) e voltar.
  return (
    comLead &&
    (pathCasa(loc.pathname, "/vitrine") ||
      pathCasa(loc.pathname, "/projetos") ||
      pathCasa(loc.pathname, "/match"))
  );
}

/** sistemaAtivo com o contexto da jornada: numa tela transversal com a fase
 *  do lead conhecida, a sidebar acompanha a jornada (prospecção/carteira);
 *  fora disso — ou enquanto a fase carrega — vale a resolução padrão. */
export function sistemaAtivoContextual(
  loc: Loc,
  faseLead: FaseFunil | null,
  lista: Sistema[] = SISTEMAS,
): Sistema | null {
  if (faseLead && telaTransversalDeLead(loc)) {
    return lista.find((s) => s.id === faseLead) ?? sistemaAtivo(loc, lista);
  }
  return sistemaAtivo(loc, lista);
}

// Encaixe de um empreendimento no perfil do cliente — regras puras (testadas em
// tests/comparativo-encaixe.test.ts).
//
// O texto sai no PDF que o CLIENTE recebe, então fala com ele ("você procura")
// e nunca promete aprovação. Regra de ouro: um critério só entra quando o dado
// existe dos DOIS lados. Projeto sem vaga cadastrada não vira "não tem vaga";
// cliente que não disse quantos quartos quer não gera ponto de quartos.
//
// O financeiro não tem motor próprio: é o mesmo `calcularPoderDeCompra` +
// `classificar` da Vitrine (regra 80/20 do CRM), para o PDF não dizer uma coisa
// e o dossiê outra sobre o mesmo cliente.

import type { ProjetoRow } from "@/components/projeto-card";
import { formatBRL } from "@/lib/projetos";
import { parseValorBR } from "@/lib/simulador";
import { deriveSituacao } from "@/lib/vitrine/vitrine";
import { calcularPoderDeCompra, classificar } from "@/lib/vitrine/poder-de-compra";
import { GRANDE_SP, normalizeZona, zonaDoProjeto, type ZonaProjeto } from "@/lib/zonas";

// ---------------------------------------------------------------------------
// Prioridades (vocabulário fixo — é o que o card do lead oferece)
// ---------------------------------------------------------------------------

export type Prioridade =
  | "lazer_completo"
  | "perto_metro"
  | "pet"
  | "seguranca"
  | "pronto_para_morar"
  | "home_office"
  | "varanda"
  | "area_verde"
  | "escola_perto";

type DefPrioridade = {
  chave: Prioridade;
  rotulo: string;
  /** Termos procurados nos diferenciais do projeto (sem acento, minúsculo). */
  termos: string[];
};

export const PRIORIDADES: readonly DefPrioridade[] = [
  {
    chave: "lazer_completo",
    rotulo: "Lazer completo",
    termos: [
      "piscina",
      "academia",
      "fitness",
      "salao de festas",
      "churrasqueira",
      "playground",
      "brinquedoteca",
      "quadra",
      "espaco gourmet",
    ],
  },
  {
    chave: "perto_metro",
    rotulo: "Perto do metrô/trem",
    termos: ["metro", "estacao", "trem", "cptm", "monotrilho", "corredor de onibus", "terminal"],
  },
  { chave: "pet", rotulo: "Aceita pet", termos: ["pet"] },
  {
    chave: "seguranca",
    rotulo: "Segurança",
    termos: ["portaria", "seguranca", "clausura", "cftv", "monitoramento", "controle de acesso"],
  },
  // Não casa por diferencial: vem da situação de entrega (regra própria abaixo).
  { chave: "pronto_para_morar", rotulo: "Pronto para morar", termos: [] },
  { chave: "home_office", rotulo: "Home office", termos: ["coworking", "home office", "cowork"] },
  { chave: "varanda", rotulo: "Varanda", termos: ["varanda", "terraco", "sacada"] },
  {
    chave: "area_verde",
    rotulo: "Área verde",
    termos: ["area verde", "jardim", "praca", "parque", "bosque", "horta"],
  },
  { chave: "escola_perto", rotulo: "Escola perto", termos: ["escola", "colegio", "creche"] },
] as const;

const PRIORIDADE_POR_CHAVE = new Map(PRIORIDADES.map((p) => [p.chave, p]));

export function rotuloPrioridade(chave: string): string | null {
  return PRIORIDADE_POR_CHAVE.get(chave as Prioridade)?.rotulo ?? null;
}

export function ehPrioridade(v: string): v is Prioridade {
  return PRIORIDADE_POR_CHAVE.has(v as Prioridade);
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

export type PerfilComparativo = {
  /** Renda bruta familiar. null = não informada. */
  renda: number | null;
  fgts: number;
  entrada: number;
  temDependente: boolean;
  carteira3anos: boolean;
  zona: string | null;
  bairro: string | null;
  /** 1..4 (4 = "4 ou mais"). */
  dormsDesejados: number | null;
  precisaVaga: boolean | null;
  prioridades: Prioridade[];
};

/** As colunas do lead que o perfil lê (todas opcionais: rollout aditivo). */
export type LeadPerfilRow = {
  renda_informada?: string | null;
  renda_estimada?: number | null;
  entrada_disponivel?: string | null;
  fgts_valor?: number | null;
  zona?: string | null;
  bairro?: string | null;
  dorms_desejados?: number | null;
  precisa_vaga?: boolean | null;
  prioridades?: string[] | null;
};

const positivoOuNull = (v: number | null | undefined): number | null =>
  v != null && Number.isFinite(v) && v > 0 ? v : null;

export function perfilDoLead(lead: LeadPerfilRow): PerfilComparativo {
  const dorms = lead.dorms_desejados;
  return {
    renda:
      positivoOuNull(parseValorBR(lead.renda_informada)) ?? positivoOuNull(lead.renda_estimada),
    fgts: positivoOuNull(lead.fgts_valor) ?? 0,
    entrada: positivoOuNull(parseValorBR(lead.entrada_disponivel)) ?? 0,
    temDependente: false,
    carteira3anos: false,
    zona: lead.zona?.trim() || null,
    bairro: lead.bairro?.trim() || null,
    dormsDesejados: dorms != null && dorms >= 1 && dorms <= 4 ? dorms : null,
    precisaVaga: lead.precisa_vaga ?? null,
    prioridades: (lead.prioridades ?? []).filter(ehPrioridade),
  };
}

/** Tem ALGUM dado que permita dizer algo sobre encaixe? */
export function perfilTemDados(p: PerfilComparativo | null): p is PerfilComparativo {
  if (!p) return false;
  return (
    p.renda != null ||
    p.zona != null ||
    p.bairro != null ||
    p.dormsDesejados != null ||
    p.precisaVaga === true ||
    p.prioridades.length > 0
  );
}

const rotuloZona = (z: ZonaProjeto): string => (z === GRANDE_SP ? "Grande SP" : `Zona ${z}`);

const dormsTexto = (n: number): string =>
  n >= 4 ? "4 ou mais dormitórios" : `${n} ${n === 1 ? "dormitório" : "dormitórios"}`;

/**
 * Resumo do que o cliente busca, para a capa do PDF:
 * ["2 dormitórios", "Zona Leste", "Renda familiar de R$ 4.500", "Vaga de garagem", "Prioriza: Aceita pet, Varanda"].
 */
export function resumoDoPerfil(p: PerfilComparativo | null): string[] {
  if (!perfilTemDados(p)) return [];
  const out: string[] = [];
  if (p.dormsDesejados != null) out.push(dormsTexto(p.dormsDesejados));
  if (p.bairro) out.push(p.bairro);
  const zona = normalizeZona(p.zona);
  if (zona) out.push(`Zona ${zona}`);
  else if (p.zona) out.push(p.zona);
  if (p.renda != null) out.push(`Renda familiar de ${formatBRL(p.renda)}`);
  const recursos = p.fgts + p.entrada;
  if (recursos > 0) out.push(`${formatBRL(recursos)} entre FGTS e entrada`);
  if (p.precisaVaga) out.push("Vaga de garagem");
  const prios = p.prioridades.map((c) => rotuloPrioridade(c)).filter(Boolean);
  if (prios.length) out.push(`Prioriza: ${prios.join(", ")}`);
  return out;
}

// ---------------------------------------------------------------------------
// Encaixe
// ---------------------------------------------------------------------------

export type NivelEncaixe = "otimo" | "bom" | "parcial" | "sem_dados";

export const ROTULO_NIVEL: Record<NivelEncaixe, string> = {
  otimo: "Ótimo encaixe",
  bom: "Bom encaixe",
  parcial: "Encaixe parcial",
  sem_dados: "A avaliar juntos",
};

export type Encaixe = {
  nivel: NivelEncaixe;
  /** O que combina — tom positivo, para o cliente. */
  pontos: string[];
  /** Pontos de atenção — honestos, sem alarme. */
  atencao: string[];
  /** Quantos critérios puderam ser avaliados (dado dos dois lados). */
  avaliados: number;
  atendidos: number;
};

export type ProjetoEncaixe = Pick<
  ProjetoRow,
  | "preco_a_partir"
  | "sob_consulta"
  | "zona_smq"
  | "regiao"
  | "cidade"
  | "bairro"
  | "dorms_min"
  | "dorms_max"
  | "vagas_min"
  | "vagas_max"
  | "status_entrega"
  | "mes_entrega"
  | "ano_entrega"
> &
  Partial<Pick<ProjetoRow, "renda_minima" | "diferenciais" | "entrega_status">>;

const chave = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function avaliarEncaixe(
  perfil: PerfilComparativo | null,
  projeto: ProjetoEncaixe,
): Encaixe | null {
  if (!perfilTemDados(perfil)) return null;

  const pontos: string[] = [];
  const atencao: string[] = [];
  let avaliados = 0;
  let atendidos = 0;
  let foraDoOrcamento = false;

  const marcar = (ok: boolean, texto: string) => {
    avaliados += 1;
    if (ok) {
      atendidos += 1;
      pontos.push(texto);
    } else {
      atencao.push(texto);
    }
  };

  // 1. Financeiro ----------------------------------------------------------
  if (perfil.renda != null) {
    const poder = calcularPoderDeCompra({
      renda: perfil.renda,
      temDependente: perfil.temDependente,
      carteira3anos: perfil.carteira3anos,
      fgts: perfil.fgts,
      entrada: perfil.entrada,
      reforcoAnual: 0,
    });
    const preco = projeto.sob_consulta ? null : projeto.preco_a_partir;
    const enq = classificar(preco, poder);
    const comRecursos = perfil.fgts + perfil.entrada > 0 ? " com seu FGTS e entrada" : "";
    if (enq === "fecha") {
      marcar(true, `Cabe no seu orçamento${comRecursos}, pelo valor de entrada da tabela`);
    } else if (enq === "otimista") {
      marcar(
        false,
        "Fica no limite do orçamento: depende de uma condição de parcelamento maior com a construtora",
      );
    } else if (enq === "nao-fecha" && poder?.orcamento.enquadra) {
      foraDoOrcamento = true;
      marcar(
        false,
        "Acima do orçamento estimado hoje — dá para estudar entrada maior ou composição de renda",
      );
    } else if (enq === "sem-preco" && projeto.renda_minima != null) {
      const ok = perfil.renda >= projeto.renda_minima;
      if (!ok) foraDoOrcamento = true;
      marcar(
        ok,
        ok
          ? "Sua renda atende a renda sugerida pela construtora"
          : `Renda sugerida pela construtora: ${formatBRL(projeto.renda_minima)}`,
      );
    }
    // Renda abaixo da tabela do programa: o corretor trata isso na conversa, não
    // num PDF que o cliente vai reler sozinho.
  }

  // 2. Região --------------------------------------------------------------
  const zonaCliente =
    normalizeZona(perfil.zona) ?? (chave(perfil.zona) === "grande sp" ? GRANDE_SP : null);
  const zonaProj = zonaDoProjeto(projeto);
  if (perfil.bairro && projeto.bairro && chave(perfil.bairro) === chave(projeto.bairro)) {
    marcar(true, `Fica em ${projeto.bairro}, o bairro que você procura`);
  } else if (zonaCliente && zonaProj) {
    marcar(
      zonaCliente === zonaProj,
      zonaCliente === zonaProj
        ? `Fica na ${rotuloZona(zonaProj)}, a região que você procura`
        : `Fica na ${rotuloZona(zonaProj)} (você procura ${rotuloZona(zonaCliente)})`,
    );
  }

  // 3. Quartos -------------------------------------------------------------
  const d = perfil.dormsDesejados;
  const dMin = projeto.dorms_min ?? projeto.dorms_max;
  const dMax = projeto.dorms_max ?? projeto.dorms_min;
  if (d != null && dMin != null && dMax != null) {
    const atende = d >= 4 ? dMax >= 4 : dMin <= d && dMax >= d;
    if (atende) marcar(true, `Tem opção de ${dormsTexto(d)}`);
    else if (dMax < d)
      marcar(false, `Unidades de até ${dormsTexto(dMax)} — menos quartos do que você procura`);
    else marcar(false, `Unidades a partir de ${dormsTexto(dMin)}`);
  }

  // 4. Vaga ----------------------------------------------------------------
  if (perfil.precisaVaga) {
    const vMin = projeto.vagas_min;
    const vMax = projeto.vagas_max ?? vMin;
    if (vMin != null && vMin >= 1) marcar(true, "Vaga de garagem inclusa");
    else if (vMax != null && vMax >= 1)
      marcar(true, "Tem unidades com vaga de garagem (confirmar na escolha da unidade)");
    else if (vMax === 0) marcar(false, "Não tem vaga de garagem");
  }

  // 5. Pronto para morar ---------------------------------------------------
  if (perfil.prioridades.includes("pronto_para_morar")) {
    const situacao = deriveSituacao(projeto as ProjetoRow);
    if (situacao === "Pronto") marcar(true, "Pronto para morar");
    else if (projeto.ano_entrega) {
      const mm = projeto.mes_entrega ? `${String(projeto.mes_entrega).padStart(2, "0")}/` : "";
      marcar(false, `Ainda em obra: entrega prevista para ${mm}${projeto.ano_entrega}`);
    }
  }

  // 6. Prioridades × diferenciais -----------------------------------------
  // Só pontua o que ACHA: diferencial não cadastrado não é prova de ausência.
  const difs = (projeto.diferenciais ?? []).filter((x) => typeof x === "string" && x.trim());
  const achados: string[] = [];
  for (const prio of perfil.prioridades) {
    const def = PRIORIDADE_POR_CHAVE.get(prio);
    if (!def || def.termos.length === 0) continue;
    const hit = difs.find((dif) => def.termos.some((t) => chave(dif).includes(t)));
    if (hit) {
      avaliados += 1;
      atendidos += 1;
      if (!achados.includes(hit.trim())) achados.push(hit.trim());
    }
  }
  if (achados.length) pontos.push(`Tem o que você valoriza: ${achados.join(", ")}`);

  // Nível ------------------------------------------------------------------
  let nivel: NivelEncaixe;
  if (avaliados === 0) nivel = "sem_dados";
  else {
    const taxa = atendidos / avaliados;
    nivel = taxa >= 0.85 ? "otimo" : taxa >= 0.5 ? "bom" : "parcial";
    // Fora do orçamento não é "ótimo" nem "bom", por mais que o resto combine.
    if (foraDoOrcamento) nivel = "parcial";
  }

  return { nivel, pontos, atencao, avaliados, atendidos };
}

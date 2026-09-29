// Regras puras da gestão da Academia. Nada aqui toca React nem Supabase: as
// telas só desenham o que estas funções decidem, e os testes cobrem a decisão.

import type {
  AcademiaTipoEncontro,
  AcademiaCorretorResumoRow,
  AcademiaEfeitoRow,
  AcademiaFaseStatusRow,
  AcademiaGateSombraRow,
} from "@/integrations/supabase/academia-pendente";
import { diasAte, formatarHhMm } from "../formato";

// ---------------------------------------------------------------------------
// Tempo de espera (práticas pendentes)
// ---------------------------------------------------------------------------

/** Espera em hh:mm até 24 horas; depois disso, em dias ("3 dias"). */
export function tempoDeEspera(desdeIso: string, agora: Date = new Date()): string {
  const minutos = Math.max(
    0,
    Math.floor((agora.getTime() - new Date(desdeIso).getTime()) / 60_000),
  );
  if (minutos < 24 * 60) return formatarHhMm(minutos);
  const dias = Math.floor(minutos / (24 * 60));
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Percentual de módulos obrigatórios concluídos por fase, por corretor. */
export function percentualPorFase(
  faseStatus: AcademiaFaseStatusRow[],
): Map<string, Map<number, number | null>> {
  const porCorretor = new Map<string, Map<number, number | null>>();
  for (const f of faseStatus) {
    const mapa = porCorretor.get(f.corretor_id) ?? new Map<number, number | null>();
    mapa.set(f.fase, f.obrigatorios > 0 ? Math.round((f.concluidos / f.obrigatorios) * 100) : null);
    porCorretor.set(f.corretor_id, mapa);
  }
  return porCorretor;
}

/** "Habilitado por trilha" e "por decisão" são coisas diferentes na tela. */
export type OrigemSelo = "trilha" | "decisao" | "nao";

export function origemDoSelo(
  r: Pick<AcademiaCorretorResumoRow, "habilitado" | "habilitado_override">,
): OrigemSelo {
  if (r.habilitado_override !== null) return r.habilitado_override ? "decisao" : "nao";
  return r.habilitado ? "trilha" : "nao";
}

/**
 * Sem atividade na trilha há `dias` ou mais. Quem nunca abriu nada conta a
 * partir do início da trilha: inscrito ontem ainda não está "parado".
 */
export function semAtividade(
  r: Pick<AcademiaCorretorResumoRow, "ultima_atividade" | "inicio_trilha">,
  hoje: string,
  dias = 7,
): boolean {
  const referencia = r.ultima_atividade ? r.ultima_atividade.slice(0, 10) : r.inicio_trilha;
  if (!referencia) return false;
  return diasAte(referencia.slice(0, 10), hoje) <= -dias;
}

// ---------------------------------------------------------------------------
// Rubrica da prática
// ---------------------------------------------------------------------------

export type ItemRubrica = { criterio: string; peso: number };

/** Lê `pratica_rubrica` ([{criterio, peso}]); peso ausente vale 1. */
export function itensDaRubrica(valor: unknown): ItemRubrica[] {
  if (!Array.isArray(valor)) return [];
  const itens: ItemRubrica[] = [];
  for (const x of valor) {
    if (!x || typeof x !== "object" || !("criterio" in x)) continue;
    const bruto = x as { criterio: unknown; peso?: unknown };
    const peso = typeof bruto.peso === "number" && bruto.peso > 0 ? bruto.peso : 1;
    itens.push({ criterio: String(bruto.criterio), peso });
  }
  return itens;
}

/** O que vai para `rubrica_resultado`: cada critério com o peso e se atendeu. */
export function resultadoDaRubrica(
  itens: ItemRubrica[],
  atendidos: ReadonlySet<number>,
): Array<ItemRubrica & { atendeu: boolean }> {
  return itens.map((it, i) => ({ ...it, atendeu: atendidos.has(i) }));
}

/** Pontos atendidos sobre o total, para o avaliador ver antes de decidir. */
export function pontuacaoDaRubrica(itens: ItemRubrica[], atendidos: ReadonlySet<number>) {
  const total = itens.reduce((s, it) => s + it.peso, 0);
  const feitos = itens.reduce((s, it, i) => s + (atendidos.has(i) ? it.peso : 0), 0);
  return { feitos, total };
}

// ---------------------------------------------------------------------------
// Indicadores e recomendações
// ---------------------------------------------------------------------------

export const ROTULO_INDICADOR: Record<string, string> = {
  tempo_primeiro_contato: "Tempo até o primeiro contato",
  taxa_agendamento: "Taxa de agendamento",
  taxa_comparecimento: "Taxa de comparecimento",
  taxa_visita_para_avanco: "Visita que vira análise ou pasta",
  pct_carteira_parada: "Carteira parada",
  pct_sem_proximo_passo: "Leads sem próximo passo",
  taxa_pasta_devolvida: "Pasta devolvida",
  taxa_perda_por_qualificacao: "Perda por perfil ou renda",
};

export function rotuloIndicador(indicador: string): string {
  return ROTULO_INDICADOR[indicador] ?? indicador;
}

/** Tempo em hh:mm (minutos úteis); taxas e percentuais com uma casa. */
export function formatarIndicador(indicador: string, valor: number | null): string {
  if (valor === null || Number.isNaN(valor)) return "sem dado";
  if (indicador === "tempo_primeiro_contato") return formatarHhMm(valor);
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export type LeituraEfeito = {
  estado: "aguardando" | "melhorou" | "piorou" | "igual";
  /** Com amostra abaixo de 5, a tela diz "indício, não prova". */
  indicio: boolean;
};

export function leituraDoEfeito(
  e: Pick<
    AcademiaEfeitoRow,
    "valor_antes" | "valor_depois" | "direcao" | "amostra_antes" | "amostra_depois"
  >,
): LeituraEfeito {
  const n = Math.min(e.amostra_antes ?? 0, e.amostra_depois ?? 0);
  if (e.valor_depois === null || e.valor_antes === null) {
    return { estado: "aguardando", indicio: true };
  }
  const delta = e.valor_depois - e.valor_antes;
  const estado: LeituraEfeito["estado"] =
    Math.abs(delta) < 0.05
      ? "igual"
      : (e.direcao === "maior_e_pior" ? delta < 0 : delta > 0)
        ? "melhorou"
        : "piorou";
  return { estado, indicio: n < 5 };
}

// ---------------------------------------------------------------------------
// Gate em sombra
// ---------------------------------------------------------------------------

export type ResumoGate = {
  totalLeads: number;
  leadsNaoHabilitados: number;
  leadsForaDaAcademia: number;
  pctNaoHabilitados: number | null;
};

export function resumoDoGate(linhas: AcademiaGateSombraRow[]): ResumoGate {
  let total = 0;
  let nao = 0;
  let fora = 0;
  for (const l of linhas) {
    total += l.leads_30d;
    if (l.situacao === "nao_habilitado") nao += l.leads_30d;
    if (l.situacao === "fora_da_academia") fora += l.leads_30d;
  }
  return {
    totalLeads: total,
    leadsNaoHabilitados: nao,
    leadsForaDaAcademia: fora,
    pctNaoHabilitados: total > 0 ? Math.round((nao / total) * 1000) / 10 : null,
  };
}

// ---------------------------------------------------------------------------
// Encontros
// ---------------------------------------------------------------------------

export const ROTULO_TIPO_ENCONTRO: Record<AcademiaTipoEncontro, string> = {
  roleplay_diario: "Roleplay diário",
  maratona_objecoes: "Maratona de objeções",
  credito_quinzenal: "Crédito quinzenal",
  revisao_mensal: "Revisão mensal",
  integracao: "Integração",
  construtora: "Construtora",
  outro: "Outro",
};

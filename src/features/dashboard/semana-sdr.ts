// Semana de pagamento do SDR: SÁBADO → SEXTA.
//
// Por quê um calendário próprio: o pagamento do time de SDR é fechado todo
// SÁBADO DE MANHÃ, sobre o que aconteceu de sábado passado até a sexta que
// acabou de terminar. A semana "normal" do CRM (segunda a domingo, em
// `lib/periodo.ts` e no filtro de período de Relatórios) não serve para isso:
// leria o sábado de pagamento dentro da semana que já foi paga e deixaria a
// sexta — o último dia útil da apuração — na semana seguinte.
//
// Tudo aqui é PURO e recebe `now` injetável (testes em tests/semana-sdr.test.ts).
// Os limites saem no fuso do aparelho, exatamente como `rangeFromPreset` do
// filtro de período faz; `agoraSaoPaulo()` entra só para decidir QUAL semana
// abre por padrão, para uma tela aberta fora do Brasil não virar o dia antes.

import { agoraSaoPaulo, dateKey, endOfDay, startOfDay } from "@/lib/periodo";

/** Sábado (getDay() === 6) é o primeiro dia da semana do SDR e o dia do pagamento. */
export const DIA_SABADO = 6;

export type SemanaSdr = {
  /** Sábado 00:00:00.000 (fuso do aparelho). */
  inicio: Date;
  /** Sexta 23:59:59.999 (fuso do aparelho). */
  fim: Date;
  /** YYYY-MM-DD do sábado — identidade estável da semana (select, query key). */
  chave: string;
  /** "20/09 a 26/09" — rótulo curto do seletor. */
  label: string;
  /** "sáb 20/09 → sex 26/09" — rótulo explícito (cabeçalho, PDF). */
  rotulo: string;
};

const dm = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Sábado 00:00 da semana de pagamento que contém `d`. */
export function inicioSemanaSdr(d: Date): Date {
  const x = startOfDay(d);
  // dom=0 … sáb=6 → quantos dias desde o sábado: sáb 0, dom 1, …, sex 6.
  const desdeSabado = (x.getDay() + 1) % 7;
  x.setDate(x.getDate() - desdeSabado);
  return x;
}

/**
 * Semana de pagamento deslocada de `offset` semanas (0 = a que contém `now`,
 * -1 = a anterior).
 */
export function semanaSdr(offset = 0, now: Date = agoraSaoPaulo()): SemanaSdr {
  const inicio = inicioSemanaSdr(now);
  inicio.setDate(inicio.getDate() + offset * 7);
  const sexta = new Date(inicio);
  sexta.setDate(sexta.getDate() + 6);
  const fim = endOfDay(sexta);
  return {
    inicio,
    fim,
    chave: dateKey(inicio),
    label: `${dm(inicio)} a ${dm(fim)}`,
    rotulo: `sáb ${dm(inicio)} → sex ${dm(fim)}`,
  };
}

/**
 * Semana que abre por padrão. No SÁBADO o gestor está fechando o pagamento:
 * o que interessa é a semana que ACABOU DE FECHAR (sábado passado → ontem,
 * sexta), não a que começou hoje de manhã e ainda está vazia. Nos outros dias
 * abre a semana em curso, que é o acompanhamento do time.
 */
export function offsetPadraoSdr(now: Date = agoraSaoPaulo()): number {
  return now.getDay() === DIA_SABADO ? -1 : 0;
}

/** As `qtd` últimas semanas de pagamento, da mais recente para a mais antiga. */
export function semanasRecentesSdr(qtd = 8, now: Date = agoraSaoPaulo()): SemanaSdr[] {
  return Array.from({ length: qtd }, (_, i) => semanaSdr(-i, now));
}

/** Semana já fechada (a sexta passou) — é a que entra na folha do sábado. */
export function semanaFechada(s: SemanaSdr, now: Date = agoraSaoPaulo()): boolean {
  return s.fim.getTime() < now.getTime();
}

/** Intervalo ISO para as consultas, no formato que as queries do CRM usam. */
export function rangeSemanaSdr(s: SemanaSdr): { di: string; df: string } {
  return { di: s.inicio.toISOString(), df: s.fim.toISOString() };
}

// ---------------------------------------------------------------------------
// Atribuição: de quem é o número
// ---------------------------------------------------------------------------

/**
 * A quem o registro pertence na apuração do SDR.
 *
 * Regra: o dono de PRÉ-VENDA do lead (`leads.sdr_id`) — é ele quem trabalhou
 * o cliente até a entrega, e é o vínculo que sobrevive a tudo o que acontece
 * depois (entrega ao corretor, remarcação da visita por outra pessoa,
 * devolução). Quando o lead não tem SDR, vale quem CRIOU o registro, desde que
 * seja um SDR — cobre o caso da carteira antiga, em que o SDR marca a visita
 * num lead que nunca entrou na base de pré-venda.
 *
 * Não usamos `criado_por_id` como regra principal de propósito: remarcar uma
 * visita cria uma linha NOVA no nome de quem remarcou (`remarcarPayload`), e o
 * SDR perderia a visita realizada — justo a que ele recebe para produzir.
 */
export function sdrDoRegistro(
  leadSdrId: string | null | undefined,
  criadoPorId: string | null | undefined,
  sdrIds: ReadonlySet<string>,
): string | null {
  if (leadSdrId && sdrIds.has(leadSdrId)) return leadSdrId;
  if (leadSdrId) return leadSdrId; // SDR que perdeu o papel continua dono do histórico
  if (criadoPorId && sdrIds.has(criadoPorId)) return criadoPorId;
  return null;
}

// ---------------------------------------------------------------------------
// Resumo por SDR (o quadro da folha)
// ---------------------------------------------------------------------------

export type RegistroSdr = { sdr_id: string | null };
export type VisitaSdr = RegistroSdr & { status: string };
export type VendaSdr = RegistroSdr & { valor: number };

export type LinhaSemanaSdr = {
  sdr_id: string;
  nome: string;
  /** Visitas marcadas (criadas) na semana. */
  agendamentos: number;
  /** Visitas com dia dentro da semana e presença validada. */
  visitas_realizadas: number;
  /** Visitas com dia dentro da semana em que o cliente não apareceu. */
  no_show: number;
  /** Pastas que entraram em análise de crédito na semana. */
  pastas: number;
  /** Vendas assinadas na semana. */
  vendas: number;
  vgv: number;
  /** Vendas cujo valor a imobiliária RECEBEU na semana — de qualquer mês de
   *  assinatura. É o que libera o pagamento da venda ao SDR. */
  vendas_recebidas: number;
  vgv_recebido: number;
};

export const LINHA_ZERADA: Omit<LinhaSemanaSdr, "sdr_id" | "nome"> = {
  agendamentos: 0,
  visitas_realizadas: 0,
  no_show: 0,
  pastas: 0,
  vendas: 0,
  vgv: 0,
  vendas_recebidas: 0,
  vgv_recebido: 0,
};

/**
 * Uma linha por SDR — inclusive quem não produziu nada na semana (zero é
 * informação na folha de pagamento) e quem aparece nos dados sem estar mais
 * na lista de SDRs ativos (ex.: saiu do time no meio da semana).
 */
export function resumoSemanaSdr(entrada: {
  sdrs: ReadonlyArray<{ id: string; nome: string }>;
  agendamentos: ReadonlyArray<RegistroSdr>;
  visitas: ReadonlyArray<VisitaSdr>;
  pastas: ReadonlyArray<RegistroSdr>;
  /** Vendas assinadas na semana. */
  vendas: ReadonlyArray<VendaSdr>;
  /** Vendas recebidas na semana (gatilho do pagamento). */
  vendasRecebidas?: ReadonlyArray<VendaSdr>;
  /** id → nome, para quem apareceu nos dados sem estar na lista de SDRs. */
  nomes?: Map<string, string>;
}): LinhaSemanaSdr[] {
  const linhas = new Map<string, LinhaSemanaSdr>();
  const garantir = (id: string): LinhaSemanaSdr => {
    const atual = linhas.get(id);
    if (atual) return atual;
    const nova: LinhaSemanaSdr = {
      sdr_id: id,
      nome: entrada.nomes?.get(id) ?? "SDR sem nome",
      ...LINHA_ZERADA,
    };
    linhas.set(id, nova);
    return nova;
  };

  for (const s of entrada.sdrs) {
    linhas.set(s.id, { sdr_id: s.id, nome: s.nome, ...LINHA_ZERADA });
  }
  for (const a of entrada.agendamentos) {
    if (a.sdr_id) garantir(a.sdr_id).agendamentos += 1;
  }
  for (const v of entrada.visitas) {
    if (!v.sdr_id) continue;
    const linha = garantir(v.sdr_id);
    if (v.status === "realizado") linha.visitas_realizadas += 1;
    else if (v.status === "nao_compareceu") linha.no_show += 1;
  }
  for (const p of entrada.pastas) {
    if (p.sdr_id) garantir(p.sdr_id).pastas += 1;
  }
  for (const v of entrada.vendas) {
    if (!v.sdr_id) continue;
    const linha = garantir(v.sdr_id);
    linha.vendas += 1;
    linha.vgv += Number.isFinite(v.valor) ? v.valor : 0;
  }
  for (const v of entrada.vendasRecebidas ?? []) {
    if (!v.sdr_id) continue;
    const linha = garantir(v.sdr_id);
    linha.vendas_recebidas += 1;
    linha.vgv_recebido += Number.isFinite(v.valor) ? v.valor : 0;
  }

  // Ordem da folha: quem entregou mais visita realizada primeiro (é o que o
  // SDR recebe por unidade); empate desce para pasta, venda e nome.
  return Array.from(linhas.values()).sort(
    (a, b) =>
      b.visitas_realizadas - a.visitas_realizadas ||
      b.pastas - a.pastas ||
      b.vendas - a.vendas ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Soma da equipe — a linha "Total" da tabela e os KPIs do topo. */
export function totalSemanaSdr(linhas: ReadonlyArray<LinhaSemanaSdr>) {
  return linhas.reduce(
    (acc, l) => ({
      agendamentos: acc.agendamentos + l.agendamentos,
      visitas_realizadas: acc.visitas_realizadas + l.visitas_realizadas,
      no_show: acc.no_show + l.no_show,
      pastas: acc.pastas + l.pastas,
      vendas: acc.vendas + l.vendas,
      vgv: acc.vgv + l.vgv,
      vendas_recebidas: acc.vendas_recebidas + l.vendas_recebidas,
      vgv_recebido: acc.vgv_recebido + l.vgv_recebido,
    }),
    { ...LINHA_ZERADA },
  );
}

/** Comparecimento da semana em % (null sem visita com desfecho). */
export function comparecimentoSemana(realizadas: number, noShow: number): number | null {
  const total = realizadas + noShow;
  if (total <= 0) return null;
  return Math.round((1000 * realizadas) / total) / 10;
}

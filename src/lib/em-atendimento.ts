// Regra dos 65 em "Em atendimento", Fatia 2 — a parte pura das telas.
// Desenho: docs/ops/em-atendimento-teto-65.md. A regra mora no banco
// (migration 20261010120500): a trava "entra um, sai um" em transicionar_lead,
// a troca, a escolha dos 65, o retorno com data e o contador. Aqui só se
// valida o que ele devolve (fail-closed) e se decide o que a tela mostra.

import { z } from "zod";

export const contadorEmAtendimentoSchema = z.object({
  corretor_id: z.string().uuid(),
  corretor: z.boolean(),
  modo: z.string(),
  em_atendimento: z.number().int(),
  teto: z.number().int(),
  trava_roleta: z.number().int(),
  lotado: z.boolean(),
  escolhidos: z.number().int(),
  minha_base: z.number().int(),
  teto_base: z.number().int(),
  retorno_max_dias: z.number().int(),
  dias_sem_toque: z.number().int(),
});

export type ContadorEmAtendimento = z.infer<typeof contadorEmAtendimentoSchema>;

export function parseContador(input: unknown): ContadorEmAtendimento | null {
  if (input == null) return null;
  return contadorEmAtendimentoSchema.parse(input);
}

export const linhaMeus65Schema = z.object({
  lead_id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string().nullable(),
  status: z.string(),
  origem: z.string().nullable(),
  temperatura: z.string().nullable(),
  projeto_nome: z.string().nullable(),
  grupo: z.string(),
  camada: z.string(),
  movimento: z.string().nullable(),
  dias_sem_toque: z.number().int(),
  proximo_followup: z.string().nullable(),
  escreveu_em: z.string().nullable(),
  escolhido: z.boolean(),
  posicao: z.number().int().nullable(),
  acao: z.string(),
  destino: z.string().nullable(),
  motivo: z.string().nullable(),
});

export type LinhaMeus65 = z.infer<typeof linhaMeus65Schema>;

export function parseMeus65(input: unknown): LinhaMeus65[] {
  return z.array(linhaMeus65Schema).parse(input ?? []);
}

// ---------------------------------------------------------------------------
// A trava: o banco recusa com o código EA065 e os números no DETAIL
// ---------------------------------------------------------------------------

export const CODIGO_LOTADO = "EA065";

export type Lotado = { emAtendimento: number; teto: number; leadId: string | null };

type ErroDoBanco = { code?: string; details?: string; detail?: string; message?: string };

/** `null` quando o erro não é a trava dos 65. */
export function erroLotado(err: unknown): Lotado | null {
  if (!err || typeof err !== "object") return null;
  const e = err as ErroDoBanco;
  if (e.code !== CODIGO_LOTADO) return null;
  const bruto = e.details ?? e.detail ?? "";
  try {
    const d = JSON.parse(bruto) as { em_atendimento?: unknown; teto?: unknown; lead_id?: unknown };
    return {
      emAtendimento: typeof d.em_atendimento === "number" ? d.em_atendimento : 0,
      teto: typeof d.teto === "number" ? d.teto : 0,
      leadId: typeof d.lead_id === "string" ? d.lead_id : null,
    };
  } catch {
    return { emAtendimento: 0, teto: 0, leadId: null };
  }
}

// ---------------------------------------------------------------------------
// O que a tela decide
// ---------------------------------------------------------------------------

export type TomContador = "ok" | "alerta" | "lotado";

/** Verde até a trava da roleta (60), âmbar dali ao teto, vermelho lotado. */
export function tomContador(
  c: Pick<ContadorEmAtendimento, "em_atendimento" | "teto" | "trava_roleta">,
): TomContador {
  if (c.em_atendimento >= c.teto) return "lotado";
  if (c.em_atendimento >= c.trava_roleta) return "alerta";
  return "ok";
}

/** Os N mais parados de Em atendimento — a sugestão da janela de troca
 *  (decisão 6: "o sistema sugere os 5 mais parados e o corretor escolhe"). */
export function maisParados(linhas: LinhaMeus65[], n = 5): LinhaMeus65[] {
  return linhas
    .filter((l) => l.camada === "em_atendimento")
    .sort(
      (a, b) =>
        b.dias_sem_toque - a.dias_sem_toque ||
        (b.posicao ?? Number.MAX_SAFE_INTEGER) - (a.posicao ?? Number.MAX_SAFE_INTEGER) ||
        a.nome.localeCompare(b.nome),
    )
    .slice(0, n);
}

export type DesfechoRetorno = "pediu_retorno" | "esfriou";

export const DESFECHO_RETORNO_LABEL: Record<DesfechoRetorno, string> = {
  pediu_retorno: "Pediu retorno",
  esfriou: "Esfriou",
};

/** Dias de prazo sugeridos para cada desfecho. */
export const DIAS_SUGERIDOS: Record<DesfechoRetorno, number> = { pediu_retorno: 2, esfriou: 7 };

export type DestinoRetorno = "aguardando_retorno" | "retorno_futuro" | "proprio_fica";

/** O que o banco vai fazer com a data escolhida (regra 9): até o máximo,
 *  Aguardando retorno; além, perda "retorno futuro" — menos o lead próprio,
 *  que fica com o corretor. */
export function destinoDoRetorno(
  data: Date,
  agora: Date,
  maxDias: number,
  proprio: boolean | null,
): DestinoRetorno {
  const dias = (data.getTime() - agora.getTime()) / 86_400_000;
  if (dias <= maxDias) return "aguardando_retorno";
  return proprio ? "proprio_fica" : "retorno_futuro";
}

/** Até quando o escolhido precisa de um toque para não descer (regra 2.3):
 *  último contato + dias sem toque. */
export function prazoParaManter(movimento: string | null, diasSemToque: number): Date | null {
  if (!movimento) return null;
  const m = new Date(movimento);
  if (Number.isNaN(m.getTime())) return null;
  return new Date(m.getTime() + diasSemToque * 86_400_000);
}

/** yyyy-mm-dd no fuso local, para <input type="date">. */
export function paraInputData(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A data do input (yyyy-mm-dd) às 9h do fuso local — hora de expediente. */
export function deInputData(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dataCurta(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "—";
  return x.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export const ACAO_LABEL: Record<string, string> = {
  fica: "nos 65",
  excedente: "acima do teto",
  perde_vaga: "perde a vaga",
  porta_cadencia: "em cadência",
};

// ---------------------------------------------------------------------------
// Fatia 3a.2 — Em atendimento é consequência (registrar_contato_lead)
// ---------------------------------------------------------------------------

/** Status em que o lead ainda não está em atendimento (a "Minha base" + a chegada). */
export const ANTES_DE_EM_ATENDIMENTO = new Set([
  "novo",
  "aguardando_corretor",
  "aguardando_atendimento",
  "aguardando_retorno",
  "qualificacao_corretor",
  "qualificado",
]);

export function antesDeEmAtendimento(status: string | null | undefined): boolean {
  return !!status && ANTES_DE_EM_ATENDIMENTO.has(status);
}

export type ResultadoContatoLead =
  "atendeu" | "nao_atendeu" | "interessado" | "sem_interesse" | "pediu_retorno";

/** Resultados em que o CLIENTE respondeu: é o que põe o lead em atendimento. */
export const RESPOSTAS_DO_CLIENTE: ReadonlySet<string> = new Set([
  "atendeu",
  "interessado",
  "pediu_retorno",
]);

export function clienteRespondeu(resultado: string): boolean {
  return RESPOSTAS_DO_CLIENTE.has(resultado);
}

const contatoRegistradoSchema = z
  .object({
    ok: z.literal(true),
    interacao_id: z.string().nullable(),
    tarefa_id: z.string().nullable(),
    respondeu: z.boolean(),
    entrou: z.boolean(),
    via: z.enum(["cadencia", "resposta"]).nullable(),
    status: z.string(),
    lotado: z
      .object({ em_atendimento: z.number().int().optional(), teto: z.number().int().optional() })
      .passthrough()
      .nullable(),
  })
  .passthrough();

export type ContatoRegistrado = z.infer<typeof contatoRegistradoSchema>;

/** Fail-closed: o retorno de registrar_contato_lead fora do contrato derruba. */
export function parseContatoRegistrado(data: unknown): ContatoRegistrado {
  return contatoRegistradoSchema.parse(data);
}

// ---------------------------------------------------------------------------
// Fatia 5: o aviso da virada ao corretor
// ---------------------------------------------------------------------------
// A regra "agendada" (modo ligado, virada no futuro) não muda nada ainda — e
// é exatamente a semana em que o corretor precisa saber o que vem (§2.5 e
// §4 do desenho: contato fora do CRM passa a custar a vaga; tem de ser
// comunicado antes). Depois da virada o aviso fica mais alguns dias.

/** O recorte da config que o aviso lê (em_atendimento_config()). */
export type ConfigDaRegra = {
  modo: string;
  virada_em?: string | null;
  ligado_em?: string | null;
};

export const DIAS_DE_AVISO_APOS_VIRADA = 7;

export type AvisoVirada =
  { estado: "agendada"; viradaEm: Date } | { estado: "ligada"; desde: Date };

/** null = nada a avisar (sombra, ou ligada há mais de 7 dias). */
export function avisoDaVirada(
  cfg: ConfigDaRegra | null | undefined,
  agora: Date = new Date(),
): AvisoVirada | null {
  if (!cfg || cfg.modo !== "ligado") return null;
  const virada = cfg.virada_em ? new Date(cfg.virada_em) : null;
  if (virada && !Number.isNaN(virada.getTime()) && virada.getTime() > agora.getTime()) {
    return { estado: "agendada", viradaEm: virada };
  }
  const desde = virada ?? (cfg.ligado_em ? new Date(cfg.ligado_em) : null);
  if (!desde || Number.isNaN(desde.getTime())) return null;
  if (agora.getTime() - desde.getTime() > DIAS_DE_AVISO_APOS_VIRADA * 86_400_000) return null;
  return { estado: "ligada", desde };
}

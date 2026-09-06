// Regras PURAS do card de propostas (Onda S2): conversão de datas entre o
// ISO com fuso que o servidor entende e o `datetime-local` do input (sempre
// no horário de São Paulo, onde o corretor está), e a aplicação das edições
// do corretor sobre o payload proposto. Sem React: testável.

import {
  PropostaPayloadSchema,
  SAMIQ_DESFAZER_JANELA_HORAS,
  type PropostaPayload,
  type PropostaSamiQ,
} from "@/lib/samiq-propostas";

const FUSO = "America/Sao_Paulo";
const OFFSET_SP = "-03:00";

/** ISO → "AAAA-MM-DDTHH:mm" no fuso de SP (valor do input datetime-local). */
export function isoParaInputLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** "AAAA-MM-DDTHH:mm" (horário de SP) → ISO com offset -03:00; "" → null. */
export function inputLocalParaIso(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const iso = `${v}:00${OFFSET_SP}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** Campos que o corretor pode ajustar no card, por tipo. */
export type EdicaoProposta = Partial<{
  resumo: string;
  followupEm: string | null;
  resultado: string;
  canal: string;
  nota: string;
  titulo: string;
  vencimentoEm: string;
  prioridade: string;
  inicioEm: string;
  local: string;
  moverParaAgendado: boolean;
  motivo: string;
  proximaAcao: string;
  proximoFollowupEm: string | null;
}>;

/**
 * Aplica a edição sobre o payload original e valida pelo mesmo contrato do
 * servidor. Tipo e cliente nunca mudam aqui (o servidor também recusa).
 * Devolve `{ payload }` ou `{ erro }` para o card mostrar.
 */
export function aplicarEdicao(
  original: PropostaPayload,
  edicao: EdicaoProposta,
): { payload: PropostaPayload } | { erro: string } {
  const bruto: Record<string, unknown> = { ...original };
  const set = (k: string, v: unknown) => {
    if (v === undefined) return;
    if (typeof v === "string" && v.trim() === "" && k !== "resumo" && k !== "nota") {
      delete bruto[k];
      return;
    }
    bruto[k] = typeof v === "string" ? v.trim() : v;
  };
  switch (original.tipo) {
    case "registrar_contato":
      set("resumo", edicao.resumo);
      if (edicao.followupEm !== undefined) bruto.followupEm = edicao.followupEm;
      set("resultado", edicao.resultado);
      set("canal", edicao.canal);
      break;
    case "anotar":
      set("nota", edicao.nota);
      break;
    case "criar_tarefa":
      set("titulo", edicao.titulo);
      set("vencimentoEm", edicao.vencimentoEm);
      set("prioridade", edicao.prioridade);
      break;
    case "agendar_visita":
      set("inicioEm", edicao.inicioEm);
      set("local", edicao.local);
      if (edicao.moverParaAgendado !== undefined)
        bruto.moverParaAgendado = edicao.moverParaAgendado;
      break;
    case "mudar_etapa":
      set("motivo", edicao.motivo);
      set("proximaAcao", edicao.proximaAcao);
      if (edicao.proximoFollowupEm !== undefined) {
        if (edicao.proximoFollowupEm) bruto.proximoFollowupEm = edicao.proximoFollowupEm;
        else delete bruto.proximoFollowupEm;
      }
      break;
    case "atualizar_qualificacao":
      break;
  }
  const parsed = PropostaPayloadSchema.safeParse(bruto);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { erro: issue ? `${issue.path.join(".") || "proposta"}: ${issue.message}` : "inválida" };
  }
  return { payload: parsed.data };
}

/** Ainda dá para desfazer? (janela de 24 h contada da confirmação) */
export function podeDesfazerAgora(
  proposta: Pick<PropostaSamiQ, "status" | "tipo" | "desfazerAte">,
  agora: Date = new Date(),
): boolean {
  if (proposta.status !== "aceita" && proposta.status !== "editada") return false;
  if (proposta.tipo === "mudar_etapa") return false;
  if (!proposta.desfazerAte) return false;
  const ate = new Date(proposta.desfazerAte).getTime();
  return !Number.isNaN(ate) && ate > agora.getTime();
}

/** Texto do prazo: "desfazer até 14:05" ou "até amanhã 09:30". */
export function rotuloPrazoDesfazer(desfazerAte: string | null | undefined): string | null {
  if (!desfazerAte) return null;
  const d = new Date(desfazerAte);
  if (Number.isNaN(d.getTime())) return null;
  return `desfazer até ${new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(",", "")}`;
}

export { SAMIQ_DESFAZER_JANELA_HORAS };

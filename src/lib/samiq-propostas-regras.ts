// Sami — as regras na hora de propor e gravar: título do pacote, marca "via Sami",
// etapa que o funil não aplicou, mesma tarefa em 2 h, datas em SP e o lead de
// cada ação.
// Recortado de samiq-propostas.ts (que reexporta tudo) sem mudança de comportamento.

import { type PropostaPayload } from "./samiq-propostas-contratos-v8";
import { rotuloEtapa } from "./samiq-propostas-descricao";

/** Texto curto do pacote: "Registrar 3 itens para Maria?" */
export function tituloDoPacote(propostas: ReadonlyArray<{ leadNome: string | null }>): string {
  const n = propostas.length;
  const nomes = [...new Set(propostas.map((p) => p.leadNome).filter(Boolean))];
  const alvo = nomes.length === 1 ? ` para ${nomes[0]}` : "";
  return n === 1 ? `Registrar 1 item${alvo}?` : `Registrar ${n} itens${alvo}?`;
}

/** Marca gravada em interacoes.metadata / resultado — é o que a timeline lê. */
export const SAMIQ_ORIGEM = "samiq" as const;

export function metadataViaSami(args: { executionId?: string | null; propostaId: string }) {
  return {
    origem: SAMIQ_ORIGEM,
    proposta_id: args.propostaId,
    ...(args.executionId ? { execution_id: args.executionId } : {}),
  };
}

/** Interação registrada pela Sami? (metadata.origem, ou metadata.via quando a
 *  interação veio de uma RPC oficial que grava a própria origem). */
export function foiViaSami(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const m = metadata as { origem?: unknown; via?: unknown };
  return m.origem === SAMIQ_ORIGEM || m.via === SAMIQ_ORIGEM;
}

// ---------------------------------------------------------------------------
// Etapa que o funil não aplicou (23/10/2026). Os triggers de leads devolvem
// "Em atendimento" a "Aguardando atendimento" quando o lead não tem corretor
// dono (Bolsão). A RPC não dá erro, então a Sami precisa avisar com clareza.

export function mensagemEtapaNaoAplicada(
  pedida: string,
  ficou: string,
  corretorId: string | null,
): string {
  const base = `O funil não mudou a etapa: o cliente continua em ${rotuloEtapa(ficou)} (pedido: ${rotuloEtapa(pedida)}).`;
  if (!corretorId && pedida === "em_atendimento") {
    return `${base} Ele está sem corretor responsável; atribua um corretor antes de colocá-lo em atendimento.`;
  }
  return base;
}

/** Bloqueio na hora de PROPOR: evita card que o funil vai desfazer. */
export function etapaBloqueadaSemDono(
  novoStatus: string,
  corretorId: string | null,
): string | null {
  if (novoStatus === "em_atendimento" && !corretorId) {
    return "cliente sem corretor responsável: Em atendimento exige um corretor dono (atribuir o lead primeiro); registre o contato e a tarefa sem mudar a etapa";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tarefa no mesmo horário (23/10/2026). Um relato vira até 3 ações que
// geram tarefa (mudar_etapa, registrar_contato com follow-up e criar_tarefa).
// Regra: uma tarefa aberta do lead até 2 h antes ou depois do novo vencimento
// é a MESMA tarefa e é reaproveitada.

export const SAMIQ_JANELA_MESMA_TAREFA_MS = 2 * 60 * 60 * 1000;

export type TarefaAbertaResumo = { id: string; data_vencimento: string | null };

/** A tarefa aberta mais próxima do vencimento, dentro da janela; ou null. */
export function tarefaNoMesmoHorario<T extends TarefaAbertaResumo>(
  abertas: T[],
  vencimentoIso: string,
  janelaMs: number = SAMIQ_JANELA_MESMA_TAREFA_MS,
): T | null {
  const alvo = Date.parse(vencimentoIso);
  if (Number.isNaN(alvo)) return null;
  let melhor: T | null = null;
  let menor = Infinity;
  for (const t of abertas) {
    if (!t.data_vencimento) continue;
    const d = Math.abs(Date.parse(t.data_vencimento) - alvo);
    if (!Number.isNaN(d) && d <= janelaMs && d < menor) {
      melhor = t;
      menor = d;
    }
  }
  return melhor;
}

// ---------------------------------------------------------------------------
// Normalização na hora de propor (v8): datas sem fuso viram horário de SP.
// Feita no servidor antes de validar/gravar, para o payload persistido já
// ficar certo (e o card/WhatsApp mostrar a hora que o corretor disse).

const CAMPOS_DATA_HORA = [
  "followupEm",
  "vencimentoEm",
  "inicioEm",
  "proximoFollowupEm",
  "retornoEm",
  "novoVencimentoEm",
  "novoInicioEm",
  "reagendarPara",
  "realizadaEm",
] as const;

export function normalizarDatasDoPayload<T extends Record<string, unknown>>(
  payload: T,
  normalizar: (iso: string) => string,
): T {
  const out: Record<string, unknown> = { ...payload };
  for (const campo of CAMPOS_DATA_HORA) {
    const v = out[campo];
    if (typeof v === "string" && v.trim()) out[campo] = normalizar(v);
  }
  return out as T;
}

/** Datas que precisam estar no futuro na hora de propor (com 5 min de tolerância). */
export function datasQueDevemSerFuturas(
  payload: PropostaPayload,
): Array<{ campo: string; iso: string }> {
  const out: Array<{ campo: string; iso: string }> = [];
  const add = (campo: string, iso: string | null | undefined) => {
    if (iso) out.push({ campo, iso });
  };
  switch (payload.tipo) {
    case "registrar_contato":
      add("followupEm", payload.followupEm);
      break;
    case "criar_tarefa":
      add("vencimentoEm", payload.vencimentoEm);
      break;
    case "agendar_visita":
      add("inicioEm", payload.inicioEm);
      break;
    case "mudar_etapa":
      add("proximoFollowupEm", payload.proximoFollowupEm);
      break;
    case "registrar_retorno":
      add("retornoEm", payload.retornoEm);
      break;
    case "trocar_vaga":
      add("retornoEm", payload.retornoEm);
      add("proximoFollowupEm", payload.proximoFollowupEm);
      break;
    case "reagendar_tarefa":
      add("novoVencimentoEm", payload.novoVencimentoEm);
      break;
    case "remarcar_visita":
      add("novoInicioEm", payload.novoInicioEm);
      break;
    case "registrar_visita":
      add("proximoFollowupEm", payload.proximoFollowupEm);
      add("reagendarPara", payload.reagendarPara);
      break;
    default:
      break;
  }
  return out;
}

/** O cliente (lead) de cada ação — para a checagem de carteira e o nome no texto. */
export function leadIdDaProposta(payload: PropostaPayload): string | null {
  if (payload.tipo === "trocar_vaga") return payload.entraLeadId;
  if ("leadId" in payload && typeof payload.leadId === "string") return payload.leadId;
  return null;
}

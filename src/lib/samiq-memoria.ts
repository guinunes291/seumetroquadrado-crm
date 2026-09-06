// Regras PURAS da memória da Sami (Onda S1, decisão D11) — sem Supabase, sem
// React: quando retomar a última conversa e como as linhas persistidas viram
// mensagens do painel. A leitura/escrita vive em samiq-conversas.ts (browser)
// e samiq-memoria.server.ts (servidor).

import { isSamiQToolName } from "@/lib/samiq-tools";
import {
  PropostaPayloadSchema,
  SAMIQ_PROPOSTA_TIPOS,
  type PropostaSamiQ,
} from "@/lib/samiq-propostas";

export type MensagemPersistida = {
  role: "user" | "assistant";
  content: string;
  ferramentas: string[];
  executionId: string | null;
  avaliacao: 1 | -1 | null;
  criadoEm: string;
  /** Propostas (S2) ligadas à execução desta resposta — pendentes ou recém-registradas. */
  propostas: PropostaSamiQ[];
};

export type PropostaPersistidaRow = {
  id: string;
  tipo: string;
  payload: unknown;
  status: string;
  execution_id: string | null;
  lead_nome: string | null;
  desfazer_ate: string | null;
  erro: string | null;
};

const STATUS_PROPOSTA = [
  "pendente",
  "aceita",
  "editada",
  "rejeitada",
  "desfeita",
  "falhou",
] as const;

/**
 * Quais propostas voltam ao painel ao retomar a conversa: as pendentes (o
 * corretor ainda decide), as que falharam (pode tentar de novo) e as
 * registradas que ainda podem ser desfeitas. Rejeitadas, desfeitas e
 * registros antigos ficam só no banco.
 */
export function mapearPropostasPersistidas(
  rows: PropostaPersistidaRow[],
  agora: Date = new Date(),
): PropostaSamiQ[] {
  const out: PropostaSamiQ[] = [];
  for (const r of rows) {
    if (!(SAMIQ_PROPOSTA_TIPOS as readonly string[]).includes(r.tipo)) continue;
    if (!(STATUS_PROPOSTA as readonly string[]).includes(r.status)) continue;
    const parsed = PropostaPayloadSchema.safeParse(r.payload);
    if (!parsed.success || parsed.data.tipo !== r.tipo) continue;
    const status = r.status as PropostaSamiQ["status"];
    const registrada = status === "aceita" || status === "editada";
    if (registrada) {
      const ate = r.desfazer_ate ? new Date(r.desfazer_ate).getTime() : NaN;
      if (Number.isNaN(ate) || ate <= agora.getTime()) continue;
    } else if (status !== "pendente" && status !== "falhou") {
      continue;
    }
    out.push({
      id: r.id,
      tipo: parsed.data.tipo,
      payload: parsed.data,
      leadNome: r.lead_nome,
      status,
      desfazerAte: r.desfazer_ate,
      erro: r.erro,
    });
  }
  return out;
}

/** Conversa parada há mais que isto começa do zero (o histórico fica no banco). */
export const SAMIQ_JANELA_RETOMAR_MS = 12 * 60 * 60 * 1000;
export const SAMIQ_MAX_MENSAGENS_CARREGADAS = 60;

/**
 * Retoma a última conversa só se ela é recente: o corretor que abre a Sami
 * de manhã não quer ver a pergunta de anteontem no topo, mas quem fecha o
 * painel no meio de um raciocínio quer continuar de onde parou.
 */
export function deveRetomarConversa(
  atualizadoEm: string | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!atualizadoEm) return false;
  const em = new Date(atualizadoEm).getTime();
  if (Number.isNaN(em)) return false;
  return agora.getTime() - em <= SAMIQ_JANELA_RETOMAR_MS;
}

export function mapearMensagensPersistidas(
  rows: Array<{
    papel: string;
    conteudo: string;
    ferramentas: string[] | null;
    execution_id: string | null;
    criado_em: string;
  }>,
  avaliacoes: Array<{ execution_id: string; nota: number }>,
  propostas: PropostaSamiQ[] = [],
  propostaExecucao: ReadonlyMap<string, string> = new Map(),
): MensagemPersistida[] {
  const notaPor = new Map(avaliacoes.map((a) => [a.execution_id, a.nota]));
  const propostasPor = new Map<string, PropostaSamiQ[]>();
  for (const p of propostas) {
    const exec = propostaExecucao.get(p.id);
    if (!exec) continue;
    propostasPor.set(exec, [...(propostasPor.get(exec) ?? []), p]);
  }
  return rows
    .filter((r) => r.papel === "user" || r.papel === "assistant")
    .slice(-SAMIQ_MAX_MENSAGENS_CARREGADAS)
    .map((r) => {
      const nota = r.execution_id ? notaPor.get(r.execution_id) : undefined;
      return {
        role: r.papel === "user" ? "user" : "assistant",
        content: r.conteudo,
        ferramentas: (r.ferramentas ?? []).filter(isSamiQToolName),
        executionId: r.execution_id,
        avaliacao: nota === 1 ? 1 : nota === -1 ? -1 : null,
        criadoEm: r.criado_em,
        propostas: r.execution_id ? (propostasPor.get(r.execution_id) ?? []) : [],
      };
    });
}

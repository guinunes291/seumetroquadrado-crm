// Regras PURAS da memória da Sami (Onda S1, decisão D11) — sem Supabase, sem
// React: quando retomar a última conversa e como as linhas persistidas viram
// mensagens do painel. A leitura/escrita vive em samiq-conversas.ts (browser)
// e samiq-memoria.server.ts (servidor).

import { isSamiQToolName } from "@/lib/samiq-tools";

export type MensagemPersistida = {
  role: "user" | "assistant";
  content: string;
  ferramentas: string[];
  executionId: string | null;
  avaliacao: 1 | -1 | null;
  criadoEm: string;
};

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
): MensagemPersistida[] {
  const notaPor = new Map(avaliacoes.map((a) => [a.execution_id, a.nota]));
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
      };
    });
}

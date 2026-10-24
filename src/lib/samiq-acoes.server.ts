// Execução IMEDIATA das ações "direto" (v8, autonomia por risco no WhatsApp).
//
// Não é um caminho novo de escrita: a ação é registrada em samiq_propostas
// (mesma trilha de auditoria) e executada por confirmarPropostas, exatamente
// como se o corretor tivesse respondido CONFIRMAR — mesma reivindicação,
// mesmo executor com a sessão dele, mesma decisão no banco e o mesmo
// desfazer de 24 h. A diferença é só QUANDO: dentro do turno, para o modelo
// ver o resultado real (entrou em atendimento? lotou? falhou por quê?) e
// responder com a verdade.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PropostaSamiQ } from "@/lib/samiq-propostas";
import type { ExecutorImediato, PropostaColetada } from "@/lib/samiq-propostas.server";
import { registrarPropostasSamiQ } from "./samiq-memoria.server";
import { confirmarPropostas } from "./samiq-confirmar.server";
import type { ContextoExecucao } from "./samiq-executar.server";

type Db = SupabaseClient<Database>;

/** Ação gravada no turno, na ordem em que o modelo pediu (é a numeração do DESFAZER). */
export type AcaoExecutada = PropostaSamiQ & { ordem: number };

export function criarExecucaoImediata(args: {
  supabase: Db;
  userId: string;
  executionId: string | null;
  contexto?: ContextoExecucao;
}): { executar: ExecutorImediato; executadas: AcaoExecutada[] } {
  const executadas: AcaoExecutada[] = [];
  let contador = 0;

  const executar: ExecutorImediato = async (coletada: PropostaColetada) => {
    const ordem = ++contador;
    const [proposta] = await registrarPropostasSamiQ({
      userId: args.userId,
      executionId: args.executionId,
      conversaId: null,
      coletadas: [coletada],
    });
    if (!proposta) {
      return {
        ok: false,
        erro: "Não consegui registrar a ação agora (memória indisponível). Tente de novo.",
      };
    }
    const [r] = await confirmarPropostas({
      supabase: args.supabase,
      userId: args.userId,
      itens: [{ id: proposta.id }],
      contexto: args.contexto,
    });
    const ok = r?.ok === true;
    executadas.push({
      ...proposta,
      ordem,
      status: ok ? (r.status === "editada" ? "editada" : "aceita") : "falhou",
      desfazerAte: r?.desfazerAte ?? null,
      erro: r?.erro ?? null,
      efeito: r?.efeito ?? null,
    });
    if (!ok) return { ok: false, erro: r?.erro ?? "Falha ao gravar." };
    return { ok: true, id: proposta.id, efeito: r.efeito ?? null, desfazivel: !!r.desfazerAte };
  };

  return { executar, executadas };
}

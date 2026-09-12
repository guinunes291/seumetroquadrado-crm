// Desfecho de um toque — a escrita. Uma resposta grava, nesta ordem e com os
// mesmos caminhos das telas donas: (1) a interação na timeline (como o
// RegistrarContatoDialog), (2) a objeção em leads.objecoes quando o corretor
// a escreveu, (3) o próximo passo como tarefa (garantirFollowUpAberto —
// leads.proximo_followup é espelho por trigger, nunca escrito aqui) e (4) a
// etapa pela RPC transicionar_lead quando a resposta a muda.
//
// Não há RPC que faça os quatro numa transação; a ordem é escolhida para que
// uma falha no meio deixe rastro honesto (a interação existe, o passo não)
// e o toast de erro ofereça tentar de novo. "Desfazer" (5 s, padrão da casa)
// apaga a interação e a tarefa com soft-delete — o mesmo que
// samiq_desfazer_proposta faz — e restaura as objeções; transição de etapa
// fica fora do undo por regra de negócio (máquina de estados).

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUndoableMutation } from "@/hooks/use-undoable-mutation";
import { garantirFollowUpAberto } from "@/lib/follow-up";
import { transicionarLead } from "@/lib/lead-transitions";
import {
  descreverProximo,
  tituloDaInteracao,
  vencimentoDe,
  type OpcaoDesfecho,
} from "@/features/fila-unica/desfecho";
import type { FilaUnicaItem } from "@/features/fila-unica/derive";
import { FILA_UNICA_FUNIL_KEY } from "@/features/fila-unica/use-fila-funil";
import {
  FILA_UNICA_EXTRAS_KEY,
  FILA_UNICA_SEM_ACAO_KEY,
} from "@/features/fila-unica/use-fila-unica";

export type DesfechoVars = {
  item: FilaUnicaItem;
  opcao: OpcaoDesfecho;
  /** A objeção ou a nota que o corretor escreveu. */
  texto?: string;
  agora?: Date;
};

export type DesfechoRegistrado = {
  leadId: string;
  interacaoId: string | null;
  tarefaId: string | null;
  objecoesAntes: string[] | null;
  etapaMudou: boolean;
  /** "cobrar o correspondente · qua, 17 set" — para o card e o toast. */
  proximoTexto: string | null;
};

const MAX_OBJECOES = 30;

/** Mesma união de samiq-executar: sem repetir (caso-insensível), até 30. */
export function unirObjecoes(atuais: string[], novas: string[]): string[] {
  const vistas = new Set(atuais.map((o) => o.trim().toLowerCase()));
  const saida = [...atuais];
  for (const n of novas) {
    const t = n.trim();
    if (!t || vistas.has(t.toLowerCase())) continue;
    vistas.add(t.toLowerCase());
    saida.push(t);
  }
  return saida.slice(0, MAX_OBJECOES);
}

export async function executarDesfecho(
  vars: DesfechoVars,
  autorId: string,
): Promise<DesfechoRegistrado> {
  const { item, opcao } = vars;
  const agora = vars.agora ?? new Date();
  const lead = item.lead;
  const texto = vars.texto?.trim() ?? "";
  const registro: DesfechoRegistrado = {
    leadId: lead.id,
    interacaoId: null,
    tarefaId: null,
    objecoesAntes: null,
    etapaMudou: false,
    proximoTexto: descreverProximo(opcao, agora),
  };

  // 1) A interação: o resultado no título, o que o corretor escreveu no corpo.
  const conteudo =
    opcao.pedeTexto === "objecao" && texto ? `Objeção: ${texto}` : texto || opcao.rotulo;
  const { data: inter, error: iErr } = await supabase
    .from("interacoes")
    .insert({
      lead_id: lead.id,
      autor_id: autorId,
      tipo: opcao.canal,
      direcao: "saida",
      titulo: tituloDaInteracao(opcao),
      conteudo,
      metadata: { origem: "fila-unica", desfecho: opcao.id },
    })
    .select("id")
    .single();
  if (iErr) throw iErr;
  registro.interacaoId = inter?.id ?? null;

  // 2) A objeção entra na lista do lead (a Sami e o dossiê leem daqui).
  if (opcao.pedeTexto === "objecao" && texto) {
    const { data: atual, error: lErr } = await supabase
      .from("leads")
      .select("objecoes")
      .eq("id", lead.id)
      .single();
    if (lErr) throw lErr;
    const antes = (atual?.objecoes ?? []) as string[];
    const { error: uErr } = await supabase
      .from("leads")
      .update({ objecoes: unirObjecoes(antes, [texto]) })
      .eq("id", lead.id);
    if (uErr) throw uErr;
    registro.objecoesAntes = antes;
  }

  // 3) O próximo passo com data — só a tarefa; o espelho no lead é do trigger.
  let vencimento: string | null = null;
  if (opcao.proximo) {
    vencimento = vencimentoDe(opcao.proximo.quando, agora).toISOString();
    await garantirFollowUpAberto({
      leadId: lead.id,
      tipo: opcao.proximo.tipo,
      titulo: opcao.proximo.titulo,
      prioridade: opcao.proximo.prioridade,
      vencimento,
      corretorId: lead.corretor_id ?? autorId,
      criadoPorId: autorId,
    });
    // garantirFollowUpAberto não devolve o id; o Desfazer precisa dele.
    const { data: tarefa } = await supabase
      .from("tarefas")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("titulo", opcao.proximo.titulo)
      .in("status", ["pendente", "em_andamento"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    registro.tarefaId = tarefa?.id ?? null;
  }

  // 4) A etapa, pela única fronteira suportada. Vai com o próximo passo: a
  //    RPC exige próxima ação ou follow-up nas etapas de atendimento.
  if (opcao.etapa?.kind === "direct") {
    await transicionarLead({
      id: lead.id,
      status: opcao.etapa.status,
      nome: lead.nome,
      proximaAcao: opcao.proximo?.titulo ?? null,
      proximoFollowup: vencimento,
    });
    registro.etapaMudou = true;
  }

  return registro;
}

/** A inversa: soft-delete da interação e da tarefa, objeções de volta. */
export async function desfazerDesfecho(r: DesfechoRegistrado): Promise<void> {
  const agora = new Date().toISOString();
  if (r.interacaoId) {
    const { error } = await supabase
      .from("interacoes")
      .update({ deleted_at: agora })
      .eq("id", r.interacaoId);
    if (error) throw error;
  }
  if (r.tarefaId) {
    const { error } = await supabase
      .from("tarefas")
      .update({ deleted_at: agora, status: "cancelada" })
      .eq("id", r.tarefaId);
    if (error) throw error;
  }
  if (r.objecoesAntes) {
    const { error } = await supabase
      .from("leads")
      .update({ objecoes: r.objecoesAntes })
      .eq("id", r.leadId);
    if (error) throw error;
  }
}

export const DESFECHO_INVALIDA = [
  ["atendimento:inbox"],
  ["followup:fila"],
  [FILA_UNICA_SEM_ACAO_KEY],
  [FILA_UNICA_EXTRAS_KEY],
  [FILA_UNICA_FUNIL_KEY],
  ["leads"],
  ["lead"],
  ["interacoes"],
  ["lead-detail:interacoes"],
  ["tarefas"],
  ["tarefas-lead"],
  ["nav-badges"],
] as const;

export function useDesfecho(
  opts: {
    onRegistrado?: (r: DesfechoRegistrado, vars: DesfechoVars) => void;
  } = {},
) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pendente, setPendente] = useState<string | null>(null);
  const registros = useRef(new Map<string, DesfechoRegistrado>());
  const onRegistrado = useRef(opts.onRegistrado);
  onRegistrado.current = opts.onRegistrado;

  const executar = async (vars: DesfechoVars) => {
    if (!user) throw new Error("Sessão expirada. Entre de novo.");
    setPendente(vars.item.lead.id);
    try {
      const r = await executarDesfecho(vars, user.id);
      registros.current.set(vars.item.lead.id, r);
      onRegistrado.current?.(r, vars);
    } finally {
      setPendente(null);
    }
  };

  const invalidar = () => {
    for (const k of DESFECHO_INVALIDA) void qc.invalidateQueries({ queryKey: [...k] });
  };

  const mensagem = (vars: DesfechoVars) => {
    const prox = descreverProximo(vars.opcao, vars.agora ?? new Date());
    return prox ? `Registrado. Próximo passo: ${prox}` : "Registrado.";
  };

  // Duas instâncias porque o hook decide "tem Desfazer" pela presença da
  // inversa: a resposta que muda a etapa não se desfaz pelo botão.
  const comDesfazer = useUndoableMutation<DesfechoVars>({
    mode: "compensate",
    message: mensagem,
    mutationFn: executar,
    inverseFn: async (vars) => {
      const r = registros.current.get(vars.item.lead.id);
      if (!r) throw new Error("nada a desfazer");
      await desfazerDesfecho(r);
      registros.current.delete(vars.item.lead.id);
      invalidar();
    },
    invalidateKeys: DESFECHO_INVALIDA.map((k) => [...k]),
    errorMessage: "Não foi possível registrar o desfecho",
  });
  const semDesfazer = useUndoableMutation<DesfechoVars>({
    mode: "compensate",
    message: mensagem,
    mutationFn: executar,
    invalidateKeys: DESFECHO_INVALIDA.map((k) => [...k]),
    errorMessage: "Não foi possível registrar o desfecho",
  });

  const registrar = (vars: DesfechoVars) => {
    if (vars.opcao.etapa?.kind === "direct") semDesfazer.mutate(vars);
    else comDesfazer.mutate(vars);
  };

  return { registrar, pendente };
}

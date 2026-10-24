// EXECUÇÃO das ações da Sami (Onda S2 → v8 "CRM no WhatsApp"). É o ÚNICO
// lugar em que a Sami escreve no CRM — e escreve com a SESSÃO DO CORRETOR (o
// `supabase` que o canal abre com o JWT dele), então RLS, triggers e autor
// valem como se ele tivesse feito à mão.
//
// Regra da v8: cada movimento usa a MESMA porta oficial da tela —
// registrar_contato_lead, registrar_retorno_lead, marcar_lead_perdido_v2,
// trocar_vaga_em_atendimento, salvar_modo_visita, presenca_checkin,
// criar_lead_dedup, prospeccao_pedir_lote, transicionar_lead — para a Sami
// nunca ter um efeito diferente do botão (Em atendimento por consequência,
// teto dos 65, cadência, redistribuição na perda, retorno de 30 dias...).
//
// Ordem dentro de cada ação: o passo principal primeiro; os auxiliares
// (marca "via Sami", objeções, tarefa do próximo passo) depois e sem derrubar
// a ação. Assim uma falha no meio não deixa metade gravado com status
// "falhou" (que, reconfirmado, duplicaria o que já entrou).
//
// `resultado` guarda os ids e o snapshot ANTES da escrita: é o que o
// samiq_desfazer_proposta usa no desfazer de 24 h. `efeito` é o resumo
// humano do que aconteceu de fato (vai para o modelo e para o recibo).
//
// Desde a quebra em módulos (2026-10): o que todas as ações usam em
// samiq-executar-base.server.ts, os passos de apoio (follow-up, objeções,
// marca "via Sami", contato oficial) em samiq-executar-apoio.server.ts e cada
// ação numa função por tema (contato, funil, agenda, visita-docs, credito,
// cadastro). Aqui fica só o despacho por tipo.

import type { Json } from "@/integrations/supabase/types";
import { metadataViaSami } from "@/lib/samiq-propostas";
import type { AcaoCtx, ExecutarArgs, ResultadoExecucao } from "./samiq-executar-base.server";
import {
  executarRegistrarContato,
  executarAnotar,
  executarCriarTarefa,
  executarAtualizarQualificacao,
} from "./samiq-executar-contato.server";
import {
  executarAgendarVisita,
  executarMudarEtapa,
  executarRegistrarRetorno,
  executarMarcarPerdido,
  executarTrocarVaga,
} from "./samiq-executar-funil.server";
import {
  executarTarefa,
  executarConfirmarOuCancelarVisita,
  executarRemarcarVisita,
} from "./samiq-executar-agenda.server";
import {
  executarRegistrarVisita,
  executarDocumentosChecklist,
  executarAtualizarDocumento,
  executarAnexarDocumento,
} from "./samiq-executar-visita-docs.server";
import {
  executarEnviarAnaliseCredito,
  executarResultadoCredito,
  executarVenda,
} from "./samiq-executar-credito.server";
import {
  executarCheckin,
  executarCriarLead,
  executarPedirLote,
} from "./samiq-executar-cadastro.server";

export type {
  ContextoExecucao,
  ExecutarArgs,
  ResultadoExecucao,
} from "./samiq-executar-base.server";

export async function executarPropostaSamiQ(args: ExecutarArgs): Promise<ResultadoExecucao> {
  const { supabase, userId, payload } = args;
  const agora = args.agora ?? new Date();
  const metadata = metadataViaSami({ executionId: args.executionId, propostaId: args.propostaId });
  const marca: Record<string, Json> = {
    proposta_id: args.propostaId,
    ...(args.executionId ? { execution_id: args.executionId } : {}),
  };

  const c: AcaoCtx = { supabase, userId, agora, metadata, marca, args };

  switch (payload.tipo) {
    case "registrar_contato":
      return executarRegistrarContato(c, payload);
    case "anotar":
      return executarAnotar(c, payload);
    case "criar_tarefa":
      return executarCriarTarefa(c, payload);
    case "atualizar_qualificacao":
      return executarAtualizarQualificacao(c, payload);
    case "agendar_visita":
      return executarAgendarVisita(c, payload);
    case "mudar_etapa":
      return executarMudarEtapa(c, payload);
    case "registrar_retorno":
      return executarRegistrarRetorno(c, payload);
    case "marcar_perdido":
      return executarMarcarPerdido(c, payload);
    case "trocar_vaga":
      return executarTrocarVaga(c, payload);
    case "concluir_tarefa":
    case "reagendar_tarefa":
    case "cancelar_tarefa":
      return executarTarefa(c, payload);
    case "confirmar_visita":
    case "cancelar_visita":
      return executarConfirmarOuCancelarVisita(c, payload);
    case "remarcar_visita":
      return executarRemarcarVisita(c, payload);
    case "registrar_visita":
      return executarRegistrarVisita(c, payload);
    case "documentos_checklist":
      return executarDocumentosChecklist(c, payload);
    case "atualizar_documento":
      return executarAtualizarDocumento(c, payload);
    case "anexar_documento":
      return executarAnexarDocumento(c, payload);
    case "enviar_analise_credito":
      return executarEnviarAnaliseCredito(c, payload);
    case "registrar_resultado_credito":
      return executarResultadoCredito(c, payload);
    case "registrar_venda":
      return executarVenda(c, payload);
    case "fazer_checkin":
      return executarCheckin(c, payload);
    case "criar_lead":
      return executarCriarLead(c, payload);
    case "pedir_lote":
      return executarPedirLote(c, payload);
  }
}

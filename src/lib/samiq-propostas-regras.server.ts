// Sami — regras do funil que dá para checar sem gravar (sem RPC), por tipo
// de ação: transições permitidas, visita no mesmo horário, troca de vaga,
// visita sem comparecimento, análise de crédito e venda.
// Recortado de samiq-propostas.server.ts sem mudança de comportamento.

import { LEAD_STATUS_LABEL, transicaoLeadPermitida, type LeadStatus } from "@/lib/leads";
import type { CitarClienteSamiQ } from "@/lib/samiq-tools.server";
import type { PropostaPayload } from "@/lib/samiq-propostas";
import { resolverLead, type Db, type LeadResolvido } from "./samiq-propostas-leitura.server";
import { checarAlvoDaProposta } from "./samiq-propostas-alvos.server";

const PROSPECCAO = new Set<string>([
  "novo",
  "aguardando_corretor",
  "aguardando_atendimento",
  "aguardando_retorno",
  "qualificacao_corretor",
  "qualificado",
]);

export function rotulo(s: string): string {
  return LEAD_STATUS_LABEL[s as LeadStatus] ?? s;
}

export type Bloqueio = { erro: string; detalhe: string; [k: string]: unknown };

/** Regras do funil e do dado que dá para checar sem gravar (sem RPC). */
export async function checarRegrasDaProposta(
  supabase: Db,
  citar: CitarClienteSamiQ,
  payload: PropostaPayload,
  lead: LeadResolvido | null,
): Promise<{ payload: PropostaPayload; bloqueio?: Bloqueio; nomeAlvo?: string | null }> {
  const status = lead?.status ?? "";
  switch (payload.tipo) {
    case "agendar_visita": {
      const fim = new Date(Date.parse(payload.inicioEm) + (payload.duracaoMin ?? 60) * 60_000);
      const { data: abertas } = await supabase
        .from("agendamentos")
        .select("id, data_inicio")
        .eq("lead_id", payload.leadId)
        .eq("tipo", "visita")
        .in("status", ["agendado", "confirmado"])
        .is("deleted_at", null)
        .gte("data_inicio", new Date(Date.parse(payload.inicioEm) - 2 * 3600_000).toISOString())
        .lte("data_inicio", fim.toISOString())
        .limit(1);
      if (abertas && abertas.length > 0) {
        return {
          payload,
          bloqueio: {
            erro: "visita_ja_marcada",
            detalhe:
              "Esse cliente já tem visita aberta nesse horário. Use remarcar_visita se mudou a hora.",
            agendamentoId: abertas[0].id,
          },
        };
      }
      if (payload.moverParaAgendado !== false && status !== "agendado") {
        if (!transicaoLeadPermitida(status, "agendado", false)) {
          return {
            payload,
            bloqueio: {
              erro: "etapa_nao_permite",
              detalhe: `O cliente está em ${rotulo(status)} e o funil não vai direto para Agendado. ${
                PROSPECCAO.has(status)
                  ? "Registre primeiro o contato em que ele topou a visita (registrar_contato, resultado interessado ou atendeu): ele entra em Em atendimento e aí a visita pode ser agendada."
                  : "Agende sem mudar a etapa (moverParaAgendado false) ou fale com o gestor."
              }`,
            },
          };
        }
      }
      return { payload };
    }
    case "mudar_etapa": {
      if (status === "em_atendimento") {
        return {
          payload,
          bloqueio: {
            erro: "etapa_nao_permite",
            detalhe:
              "De Em atendimento o cliente sai por desfecho: agendou (agendar_visita), pediu retorno ou esfriou (registrar_retorno), mandou doc (enviar_analise_credito) ou perdido (marcar_perdido).",
          },
        };
      }
      if (!transicaoLeadPermitida(status, payload.novoStatus as LeadStatus, false)) {
        return {
          payload,
          bloqueio: {
            erro: "etapa_nao_permite",
            detalhe: `O funil não vai de ${rotulo(status)} para ${rotulo(payload.novoStatus)}.`,
          },
        };
      }
      return { payload };
    }
    case "registrar_retorno": {
      if (status === "aguardando_retorno") {
        return {
          payload,
          bloqueio: {
            erro: "ja_em_retorno",
            detalhe:
              "O cliente já está em Aguardando retorno. Para mudar a data, reagende a tarefa de retorno (reagendar_tarefa) ou crie outra (criar_tarefa).",
          },
        };
      }
      if (!PROSPECCAO.has(status) && !transicaoLeadPermitida(status, "aguardando_retorno", false)) {
        return {
          payload,
          bloqueio: {
            erro: "etapa_nao_permite",
            detalhe: `O cliente está em ${rotulo(status)}: o funil não leva para Aguardando retorno.`,
          },
        };
      }
      return { payload };
    }
    case "marcar_perdido": {
      if (["perdido", "contrato_fechado", "pos_venda"].includes(status)) {
        return {
          payload,
          bloqueio: {
            erro: "etapa_nao_permite",
            detalhe: `O cliente está em ${rotulo(status)}.`,
          },
        };
      }
      return { payload };
    }
    case "trocar_vaga": {
      const sai = await resolverLead(supabase, payload.saiLeadId);
      if (!sai) {
        return {
          payload,
          bloqueio: { erro: "cliente_nao_encontrado", detalhe: "quem sai não está na carteira" },
        };
      }
      if (sai.status !== "em_atendimento") {
        return {
          payload,
          bloqueio: {
            erro: "troca_invalida",
            detalhe: `${sai.nome ?? "Quem sai"} está em ${rotulo(sai.status)}; quem sai precisa estar em Em atendimento.`,
          },
        };
      }
      if (status === "em_atendimento") {
        return {
          payload,
          bloqueio: { erro: "troca_invalida", detalhe: "quem entra já está em Em atendimento" },
        };
      }
      citar({ id: sai.id, nome: sai.nome, etapa: sai.status });
      return { payload };
    }
    case "registrar_visita": {
      const etapa =
        payload.proximaEtapa ?? (payload.compareceu ? "visita_realizada" : "aguardando_retorno");
      const deAgendado = transicaoLeadPermitida("agendado", etapa as LeadStatus, false);
      const direto = status === etapa || transicaoLeadPermitida(status, etapa as LeadStatus, false);
      const viaAgendado =
        status !== "agendado" && transicaoLeadPermitida(status, "agendado", false) && deAgendado;
      if (!direto && !viaAgendado) {
        return {
          payload,
          bloqueio: {
            erro: "etapa_nao_permite",
            detalhe: `O cliente está em ${rotulo(status)}: o funil não leva para ${rotulo(etapa)} depois da visita.${
              PROSPECCAO.has(status) ? " Registre antes o contato com ele." : ""
            }`,
          },
        };
      }
      if (!payload.compareceu && !payload.reagendarPara && !payload.proximoFollowupEm) {
        return {
          payload,
          bloqueio: {
            erro: "falta_data",
            detalhe:
              "Cliente não compareceu: informe a nova visita (reagendarPara) ou a data do próximo contato (proximoFollowupEm).",
          },
        };
      }
      return { payload };
    }
    case "enviar_analise_credito": {
      if (
        status !== "analise_credito" &&
        !transicaoLeadPermitida(status, "analise_credito", false)
      ) {
        return {
          payload,
          bloqueio: {
            erro: "etapa_nao_permite",
            detalhe: `O cliente está em ${rotulo(status)}: o funil não vai para Análise de crédito.${
              PROSPECCAO.has(status) &&
              status !== "aguardando_retorno" &&
              status !== "qualificacao_corretor"
                ? " Registre antes o contato com ele."
                : ""
            }`,
          },
        };
      }
      return { payload };
    }
    case "registrar_venda": {
      if (!lead?.corretorId) {
        return {
          payload,
          bloqueio: {
            erro: "lead_sem_corretor",
            detalhe: "Venda exige cliente com corretor responsável.",
          },
        };
      }
      return { payload };
    }
    default:
      // Tarefa, visita, anexo, check-in e cadastro: samiq-propostas-alvos.server.ts.
      return checarAlvoDaProposta(supabase, citar, payload);
  }
}

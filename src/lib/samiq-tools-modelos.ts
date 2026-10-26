// Sami — modelagem dos resultados de cliente (o que o modelo vê): busca,
// detalhe, interações, tarefas, agenda, documentos, funil e fila, sempre com
// a minimização padrão (PII fora, strings redigidas e truncadas).
// Recortado de samiq-tools.ts sem mudança de comportamento.

import { ATENDIMENTO_QUEUE_KEYS, type AtendimentoInbox } from "@/features/atendimento/inbox";
import type { QueueKey } from "@/features/atendimento/derive";
import {
  displayNameForSamiQ,
  minimizeSamiQContext,
  redactSamiQFreeText,
} from "@/lib/samiq-governance";

// ---------------------------------------------------------------------------
// Modelagem dos resultados (o que o modelo vê)
// ---------------------------------------------------------------------------

const MAX_STRING = 300;
export const MAX_ARRAY = 40;

/** Passa o objeto pela minimização padrão (chaves de PII fora, strings redigidas e truncadas). */
export function minimizar<T>(value: T, maxArray = MAX_ARRAY): unknown {
  return minimizeSamiQContext(value, { maxArray, maxString: MAX_STRING });
}

export type ClienteResumoRow = {
  id: string;
  nome: string | null;
  status: string | null;
  temperatura: string | null;
  projeto_nome: string | null;
  proximo_followup: string | null;
  ultima_interacao: string | null;
  origem: string | null;
  created_at: string | null;
};

export function modelarClientes(rows: ClienteResumoRow[], limite: number): unknown {
  return minimizar(
    rows.slice(0, limite).map((r) => ({
      id: r.id,
      nome: displayNameForSamiQ(r.nome),
      etapa: r.status,
      temperatura: r.temperatura,
      projeto: r.projeto_nome,
      proximo_followup: r.proximo_followup,
      ultima_interacao: r.ultima_interacao,
      origem: r.origem,
      entrou_em: r.created_at,
    })),
  );
}

export type LeadDetalheRow = {
  id: string;
  nome: string | null;
  origem: string | null;
  status: string | null;
  temperatura: string | null;
  projeto_nome: string | null;
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean | null;
  tem_fgts: boolean | null;
  fgts_valor: number | null;
  tipo_renda: string | null;
  faixa_mcmv: string | null;
  proximo_followup: string | null;
  ultima_interacao: string | null;
  visita_data: string | null;
  visita_hora: string | null;
  visita_empreendimento: string | null;
  proxima_acao: string | null;
  objecoes: string[] | null;
  observacoes: string | null;
  motivo_perdido: string | null;
  bairro: string | null;
  zona: string | null;
  created_at: string | null;
};

export type InteracaoRow = {
  tipo: string | null;
  direcao: string | null;
  titulo: string | null;
  conteudo: string | null;
  ocorreu_em: string | null;
};

export type TarefaRow = {
  id: string;
  titulo: string | null;
  tipo: string | null;
  prioridade: string | null;
  status: string | null;
  data_vencimento: string | null;
  lead_id?: string | null;
  lead?: { id: string; nome: string | null } | null;
};

export type AgendamentoRow = {
  id: string;
  tipo: string | null;
  status: string | null;
  titulo: string | null;
  local: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  lead_id?: string | null;
  lead?: { id: string; nome: string | null; projeto_nome?: string | null } | null;
};

export type DocumentoRow = {
  tipo: string | null;
  status: string | null;
  recebido_em: string | null;
  observacoes?: string | null;
};

export function modelarInteracoes(rows: InteracaoRow[], limite = 12): unknown[] {
  return rows.slice(0, limite).map((i) => ({
    em: i.ocorreu_em,
    tipo: i.tipo,
    direcao: i.direcao,
    titulo: redactSamiQFreeText(i.titulo ?? "", 120) || undefined,
    resumo: redactSamiQFreeText(i.conteudo ?? "", 200) || undefined,
  }));
}

export function modelarTarefas(rows: TarefaRow[], limite = 15): unknown {
  return minimizar(
    rows.slice(0, limite).map((t) => ({
      id: t.id,
      titulo: redactSamiQFreeText(t.titulo ?? "", 120) || undefined,
      tipo: t.tipo,
      prioridade: t.prioridade,
      status: t.status,
      vence_em: t.data_vencimento,
      cliente: t.lead
        ? { id: t.lead.id, nome: displayNameForSamiQ(t.lead.nome) }
        : t.lead_id
          ? { id: t.lead_id }
          : undefined,
    })),
  );
}

export function modelarAgendamentos(rows: AgendamentoRow[], limite = 40): unknown {
  return minimizar(
    rows.slice(0, limite).map((a) => ({
      id: a.id,
      tipo: a.tipo,
      status: a.status,
      titulo: redactSamiQFreeText(a.titulo ?? "", 120) || undefined,
      local: redactSamiQFreeText(a.local ?? "", 120) || undefined,
      inicio: a.data_inicio,
      fim: a.data_fim,
      cliente: a.lead
        ? {
            id: a.lead.id,
            nome: displayNameForSamiQ(a.lead.nome),
            projeto: a.lead.projeto_nome ?? undefined,
          }
        : a.lead_id
          ? { id: a.lead_id }
          : undefined,
    })),
  );
}

export function modelarDocumentos(rows: DocumentoRow[]): unknown {
  return minimizar(
    rows.slice(0, MAX_ARRAY).map((d) => ({
      documento: d.tipo,
      status: d.status,
      recebido_em: d.recebido_em,
      observacao: redactSamiQFreeText(d.observacoes ?? "", 120) || undefined,
    })),
  );
}

export function modelarDetalheCliente(args: {
  lead: LeadDetalheRow;
  interacoes: InteracaoRow[];
  tarefas: TarefaRow[];
  agendamentos: AgendamentoRow[];
  documentos: DocumentoRow[];
}): unknown {
  const { lead } = args;
  return minimizar({
    cliente: {
      id: lead.id,
      nome: displayNameForSamiQ(lead.nome),
      origem: lead.origem,
      etapa: lead.status,
      temperatura: lead.temperatura,
      projeto_interesse: lead.projeto_nome,
      renda_informada: lead.renda_informada,
      entrada_disponivel: lead.entrada_disponivel,
      usa_fgts: lead.usa_fgts,
      tem_fgts: lead.tem_fgts,
      fgts_valor: lead.fgts_valor,
      tipo_renda: lead.tipo_renda,
      faixa_mcmv: lead.faixa_mcmv,
      regiao: [lead.bairro, lead.zona].filter(Boolean).join(" / ") || undefined,
      proximo_followup: lead.proximo_followup,
      ultima_interacao: lead.ultima_interacao,
      visita: lead.visita_data
        ? {
            data: lead.visita_data,
            hora: lead.visita_hora,
            empreendimento: lead.visita_empreendimento,
          }
        : undefined,
      proxima_acao: redactSamiQFreeText(lead.proxima_acao ?? "", 160) || undefined,
      objecoes: (lead.objecoes ?? []).slice(0, 10),
      observacoes: redactSamiQFreeText(lead.observacoes ?? "", 400) || undefined,
      motivo_perdido: lead.motivo_perdido ?? undefined,
      entrou_em: lead.created_at,
    },
    ultimas_interacoes: modelarInteracoes(args.interacoes),
    tarefas_abertas: modelarTarefas(args.tarefas, 10),
    compromissos: modelarAgendamentos(args.agendamentos, 5),
    documentos: modelarDocumentos(args.documentos),
  });
}

export type FunilRow = {
  etapa: string;
  quantidade: number;
  followups_vencidos: number | null;
  parados_ha_7_dias: number | null;
  sem_proxima_acao: number | null;
};

export function modelarFunil(rows: FunilRow[]): unknown {
  return rows.slice(0, 20).map((r) => ({
    etapa: r.etapa,
    clientes: r.quantidade,
    followups_vencidos: r.followups_vencidos ?? 0,
    parados_7d: r.parados_ha_7_dias ?? 0,
    sem_proxima_acao: r.sem_proxima_acao ?? 0,
  }));
}

export function modelarFila(inbox: AtendimentoInbox, fila?: QueueKey, limite = 5): unknown {
  const chaves = fila ? [fila] : [...ATENDIMENTO_QUEUE_KEYS];
  return {
    totais: Object.fromEntries(chaves.map((k) => [k, inbox.counts[k] ?? 0])),
    filas: Object.fromEntries(
      chaves.map((k) => [
        k,
        minimizar(
          (inbox.filas[k] ?? []).slice(0, limite).map((item) => ({
            id: item.lead.id,
            nome: displayNameForSamiQ(item.lead.nome),
            etapa: item.lead.status,
            temperatura: item.lead.temperatura,
            projeto: item.lead.projeto_nome,
            score: item.score,
            motivo: item.motivo,
            docs_pendentes: item.docsPendentes || undefined,
            visita_em: item.visitaEm ?? undefined,
          })),
          limite,
        ),
      ]),
    ),
  };
}

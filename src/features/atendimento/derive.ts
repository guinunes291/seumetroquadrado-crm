// Filas de Atendimento — lógica PURA que responde "quem eu chamo primeiro?".
// Cada lead ativo entra em NO MÁXIMO uma fila (a mais urgente), para a tela
// nunca duplicar gente. Ordem de urgência das filas:
//   1. novos      — chegou para o corretor e aguarda o PRIMEIRO contato (SLA)
//   2. responder  — o cliente falou por último (mensagem recebida sem resposta)
//   3. followups  — follow-up combinado venceu
//   4. esfriando  — quente/morno sem contato há 3+ dias (régua única: sem
//                   interação registrada, conta desde a chegada do lead)
//   5. docs       — documentação pendente/reprovada travando a pasta
// Dentro de cada fila, ordena pelo Score de prioridade (lib/priority.ts).

import { formatRelativeTime } from "@/lib/interacoes";
import { diasDesde, scoreLead, type ScoreTier } from "@/lib/priority";

export type AtendimentoLead = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  status: string;
  temperatura: string | null;
  ultima_interacao: string | null;
  proximo_followup: string | null;
  projeto_nome: string | null;
  created_at: string;
  corretor_id: string | null;
  origem: string;
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean | null;
};

export type UltimaInteracaoRow = {
  lead_id: string;
  direcao: string;
  ocorreu_em: string;
};

export type QueueKey =
  | "novos"
  | "responder"
  | "followups"
  | "esfriando"
  | "confirmar_visita"
  | "docs";

export type QueueItem = {
  lead: AtendimentoLead;
  score: number;
  tier: ScoreTier;
  motivo: string;
  docsPendentes: number;
  /** Só na fila confirmar_visita (v4): alvo do botão [Confirmar]. */
  agendamentoId?: string | null;
  visitaEm?: string | null;
};

export type AtendimentoQueues = Record<QueueKey, QueueItem[]>;

export const QUEUE_LABEL: Record<QueueKey, string> = {
  novos: "Primeiro contato",
  responder: "Responder agora",
  followups: "Follow-ups vencidos",
  esfriando: "Esfriando",
  confirmar_visita: "Confirmar visita",
  // "Pasta travada" — nomenclatura da auditoria ux-ia (05-nova-ia.md).
  docs: "Pasta travada",
};

export const QUEUE_HINT: Record<QueueKey, string> = {
  novos: "lead novo na sua mesa — o SLA do primeiro contato está correndo",
  responder: "o cliente falou por último — cada minuto conta",
  followups: "você combinou de voltar — o prazo passou",
  esfriando: "quentes e mornos sem contato há 3+ dias",
  confirmar_visita: "visita marcada nas próximas 48h ainda sem confirmação",
  docs: "pasta parada por documento pendente ou reprovado",
};

const ETAPAS_ENCERRADAS = ["perdido", "contrato_fechado", "pos_venda"];
/** Lead ainda sem primeiro atendimento — a fila de entrada do corretor. */
const ETAPAS_PRIMEIRO_CONTATO = ["novo", "aguardando_atendimento"];
const LIMITE_POR_FILA = 15;

export function buildAtendimentoQueues(input: {
  leads: AtendimentoLead[];
  /** Interações mais recentes (desc) — usamos a primeira por lead. */
  interacoes: UltimaInteracaoRow[];
  /** lead_id → nº de documentos pendentes/reprovados. */
  docsPendentes: Map<string, number>;
  agora?: Date;
}): AtendimentoQueues {
  const agora = input.agora ?? new Date();
  const agoraMs = agora.getTime();

  // Última interação por lead (a lista chega ordenada por ocorreu_em desc).
  const ultimaPorLead = new Map<string, UltimaInteracaoRow>();
  for (const i of input.interacoes) {
    if (!ultimaPorLead.has(i.lead_id)) ultimaPorLead.set(i.lead_id, i);
  }

  const filas: AtendimentoQueues = {
    novos: [],
    responder: [],
    followups: [],
    esfriando: [],
    confirmar_visita: [],
    docs: [],
  };

  for (const lead of input.leads) {
    if (ETAPAS_ENCERRADAS.includes(lead.status)) continue;

    const r = scoreLead({
      temperatura: lead.temperatura,
      status: lead.status,
      ultimaInteracao: lead.ultima_interacao,
      agora,
    });
    const docs = input.docsPendentes.get(lead.id) ?? 0;
    const base = { lead, score: r.score, tier: r.tier, docsPendentes: docs };

    const ultima = ultimaPorLead.get(lead.id);
    const followupVencido =
      lead.proximo_followup && new Date(lead.proximo_followup).getTime() <= agoraMs;
    // Régua única: sem interação registrada, o relógio conta desde a chegada
    // (espelha a v3 no banco, que ainda considera ultimo_contato importado).
    const dias = diasDesde(lead.ultima_interacao ?? lead.created_at, agora);
    const esfriando =
      (lead.temperatura === "quente" || lead.temperatura === "morno") && dias !== null && dias >= 3;

    if (ETAPAS_PRIMEIRO_CONTATO.includes(lead.status)) {
      filas.novos.push({
        ...base,
        motivo: `chegou ${formatDesde(lead.created_at, agora)} e aguarda o primeiro contato`,
      });
    } else if (ultima && ultima.direcao === "entrada") {
      filas.responder.push({
        ...base,
        motivo: `respondeu ${formatDesde(ultima.ocorreu_em, agora)} e aguarda retorno`,
      });
    } else if (followupVencido) {
      filas.followups.push({
        ...base,
        motivo: `follow-up combinado venceu ${formatDesde(lead.proximo_followup!, agora)}`,
      });
    } else if (esfriando) {
      filas.esfriando.push({
        ...base,
        motivo: `${lead.temperatura} sem contato há ${dias} dia(s)`,
      });
    } else if (docs > 0) {
      filas.docs.push({
        ...base,
        motivo: `${docs} documento(s) pendente(s) travando a pasta`,
      });
    }
  }

  (Object.keys(filas) as QueueKey[]).forEach((k) => {
    filas[k].sort((a, b) => b.score - a.score);
    filas[k] = filas[k].slice(0, LIMITE_POR_FILA);
  });

  return filas;
}

// Grafia única de tempo relativo do app (era uma segunda implementação com
// "há 45min" sem espaço; agora delega ao formatador canônico da timeline).
const formatDesde = (iso: string, agora: Date): string => formatRelativeTime(iso, agora);

// ---------------------------------------------------------------------------
// Scripts sugeridos por fila — o corretor abre o WhatsApp com a mensagem certa
// para o momento, sem pensar do zero. Sempre revisável antes de enviar.
// ---------------------------------------------------------------------------

export function scriptParaFila(fila: QueueKey, nome: string, projetoNome?: string | null): string {
  const primeiro = nome.split(" ")[0] ?? nome;
  const projeto = projetoNome ? ` sobre o ${projetoNome}` : "";
  switch (fila) {
    case "novos":
      return `Oi, ${primeiro}! Recebi seu interesse${projeto} e sou eu que vou te acompanhar a partir de agora. Posso te fazer duas perguntas rápidas para já te indicar o melhor caminho?`;
    case "responder":
      return `Oi, ${primeiro}! Vi sua mensagem aqui — me conta, como posso te ajudar${projeto}?`;
    case "followups":
      return `Oi, ${primeiro}! Combinamos de retomar nossa conversa${projeto} — conseguiu pensar no que falamos? Posso te passar as novidades?`;
    case "esfriando":
      return `Oi, ${primeiro}, tudo bem? Apareceram condições novas${projeto} que têm tudo a ver com o que você procura. Posso te contar rapidinho?`;
    case "confirmar_visita":
      return `Oi, ${primeiro}! Passando para confirmar nossa visita${projeto} — posso contar com você no horário combinado? Qualquer imprevisto, me avisa que a gente reagenda.`;
    case "docs":
      return `Oi, ${primeiro}! Sua pasta${projeto} está quase completa — falta só um documento para avançarmos. Consegue me enviar hoje?`;
  }
}

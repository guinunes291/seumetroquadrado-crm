// Filas de Atendimento — lógica PURA que responde "quem eu chamo primeiro?".
// Cada lead ativo entra em NO MÁXIMO uma fila (a mais urgente), para a tela
// nunca duplicar gente. Ordem de urgência das filas:
//   1. responder  — o cliente falou por último (mensagem recebida sem resposta)
//   2. followups  — follow-up combinado venceu
//   3. esfriando  — quente/morno sem contato há 3+ dias
//   4. docs       — documentação pendente/reprovada travando a pasta
// Dentro de cada fila, ordena pelo Score de prioridade (lib/priority.ts).

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

export type QueueKey = "responder" | "followups" | "esfriando" | "docs";

export type QueueItem = {
  lead: AtendimentoLead;
  score: number;
  tier: ScoreTier;
  motivo: string;
  docsPendentes: number;
};

export type AtendimentoQueues = Record<QueueKey, QueueItem[]>;

export const QUEUE_LABEL: Record<QueueKey, string> = {
  responder: "Responder agora",
  followups: "Follow-ups vencidos",
  esfriando: "Esfriando",
  docs: "Documentação travada",
};

export const QUEUE_HINT: Record<QueueKey, string> = {
  responder: "o cliente falou por último — cada minuto conta",
  followups: "você combinou de voltar — o prazo passou",
  esfriando: "quentes e mornos sem contato há 3+ dias",
  docs: "pasta parada por documento pendente ou reprovado",
};

const ETAPAS_ENCERRADAS = ["perdido", "contrato_fechado", "pos_venda"];
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

  const filas: AtendimentoQueues = { responder: [], followups: [], esfriando: [], docs: [] };

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
    const dias = diasDesde(lead.ultima_interacao, agora);
    const esfriando =
      (lead.temperatura === "quente" || lead.temperatura === "morno") && dias !== null && dias >= 3;

    if (ultima && ultima.direcao === "entrada") {
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

function formatDesde(iso: string, agora: Date): string {
  const min = Math.max(0, Math.floor((agora.getTime() - Date.parse(iso)) / 60_000));
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

// ---------------------------------------------------------------------------
// Scripts sugeridos por fila — o corretor abre o WhatsApp com a mensagem certa
// para o momento, sem pensar do zero. Sempre revisável antes de enviar.
// ---------------------------------------------------------------------------

export function scriptParaFila(fila: QueueKey, nome: string, projetoNome?: string | null): string {
  const primeiro = nome.split(" ")[0] ?? nome;
  const projeto = projetoNome ? ` sobre o ${projetoNome}` : "";
  switch (fila) {
    case "responder":
      return `Oi, ${primeiro}! Vi sua mensagem aqui — me conta, como posso te ajudar${projeto}?`;
    case "followups":
      return `Oi, ${primeiro}! Combinamos de retomar nossa conversa${projeto} — conseguiu pensar no que falamos? Posso te passar as novidades?`;
    case "esfriando":
      return `Oi, ${primeiro}, tudo bem? Apareceram condições novas${projeto} que têm tudo a ver com o que você procura. Posso te contar rapidinho?`;
    case "docs":
      return `Oi, ${primeiro}! Sua pasta${projeto} está quase completa — falta só um documento para avançarmos. Consegue me enviar hoje?`;
  }
}

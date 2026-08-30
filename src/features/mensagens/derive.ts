// Lógica pura da Central de Mensagens (Fase 7b): agrupamento das linhas de
// `mensagens` em conversas e ordenação de thread. "Aguardando resposta" da
// LISTA é derivado (mensagens do cliente depois da última resposta do
// corretor), agora descontando o marcador `conversas_tratadas` (Lote 3) — a
// RLS da 7a segue fechada (usuário só insere saída; a marca vem por RPC).
// A decisão GLOBAL (badge da sidebar, fila Responder do /atendimento) é da
// fonte única no banco (conversa_aguardando_resposta), que considera também
// as interações; este derive é o preview por conversa da Central.

export type Mensagem = {
  id: string;
  lead_id: string;
  corretor_id: string | null;
  direcao: "entrada" | "saida";
  canal: string;
  provider: string | null;
  provider_message_id: string | null;
  status: string;
  conteudo: string | null;
  midia_url: string | null;
  criado_em: string;
};

export type Conversa = {
  leadId: string;
  ultima: Mensagem;
  total: number;
  /** Mensagens de ENTRADA depois da última saída — o "responder" da conversa. */
  aguardandoResposta: number;
};

const ts = (m: Mensagem): number => {
  const t = Date.parse(m.criado_em);
  return Number.isFinite(t) ? t : 0;
};

/** Thread de um lead em ordem cronológica (asc), estável para render. */
export function ordenarThread(rows: Mensagem[]): Mensagem[] {
  return [...rows].sort((a, b) => ts(a) - ts(b) || a.id.localeCompare(b.id));
}

/**
 * Agrupa as mensagens em conversas (1 por lead), mais recentes primeiro.
 * Aceita linhas em qualquer ordem — a query lista as N mais recentes global
 * e o agrupamento reconstrói cada conversa. `tratadas` (lead_id → tratada_em)
 * desconta as entradas já cobertas pela marca "conversa tratada": só entradas
 * DEPOIS da marca voltam a contar (o mesmo corte da fonte única no banco).
 */
export function agruparConversas(rows: Mensagem[], tratadas?: Map<string, string>): Conversa[] {
  const porLead = new Map<string, Mensagem[]>();
  for (const m of rows) {
    const lista = porLead.get(m.lead_id);
    if (lista) lista.push(m);
    else porLead.set(m.lead_id, [m]);
  }
  const conversas: Conversa[] = [];
  for (const [leadId, msgs] of porLead) {
    const thread = ordenarThread(msgs);
    const marcaRaw = tratadas?.get(leadId);
    const marca = marcaRaw ? Date.parse(marcaRaw) : Number.NaN;
    let aguardando = 0;
    for (let i = thread.length - 1; i >= 0; i--) {
      if (thread[i].direcao !== "entrada") break;
      // Thread cronológica: se ESTA entrada é anterior à marca, as de trás
      // também são — dá para parar aqui.
      if (Number.isFinite(marca) && ts(thread[i]) <= marca) break;
      aguardando++;
    }
    conversas.push({
      leadId,
      ultima: thread[thread.length - 1],
      total: thread.length,
      aguardandoResposta: aguardando,
    });
  }
  return conversas.sort((a, b) => ts(b.ultima) - ts(a.ultima));
}

/** Preview de 1 linha para a lista de conversas. */
export function previewConversa(m: Mensagem): string {
  const prefixo = m.direcao === "saida" ? "Você: " : "";
  const corpo = m.conteudo?.trim() || (m.midia_url ? "[mídia]" : "[mensagem]");
  const linha = `${prefixo}${corpo}`;
  return linha.length > 80 ? `${linha.slice(0, 79)}…` : linha;
}

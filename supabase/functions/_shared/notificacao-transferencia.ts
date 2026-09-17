// Textos do aviso de transferência ao corretor (WhatsApp / Z-API).
//
// Este arquivo é TS puro (sem Deno.*): a suíte vitest importa daqui para
// testar a montagem das mensagens — a function notify-lead-transfer é a única
// consumidora em produção.
//
// Regra da casa (2026-09-17): transferência EM LOTE manda UMA mensagem de
// resumo por corretor, nunca uma por lead. Rajada de N mensagens seguidas pelo
// mesmo número é exatamente o padrão que o WhatsApp marca como spam e derruba
// a instância — o custo de um bloqueio é a operação inteira sem aviso, muito
// pior do que o corretor abrir o CRM para ver a lista.

export type LeadResumo = {
  nome: string | null;
  projeto: string | null;
  renda: string | null;
};

/** Quantos leads aparecem nominalmente no resumo antes do "e mais N". */
export const LOTE_MAX_NOMES = 8;

/** Teto de ids aceitos numa notificação em lote (o seletor da listagem já
 *  limita a seleção em 1000; o dobro disso é folga, não caso de uso). */
export const LOTE_MAX_IDS = 2000;

/** Quantos ids por consulta ao ler os leads do lote — `in(...)` viaja na URL,
 *  então lê em fatias em vez de estourar o limite de tamanho. */
export const LOTE_CHUNK_LEITURA = 200;

function linhaLead(lead: LeadResumo): string {
  const nome = lead.nome?.trim() || "(sem nome)";
  const projeto = lead.projeto?.trim();
  return `• ${nome}${projeto ? ` — ${projeto}` : ""}`;
}

/** Mensagem de UM lead transferido (fluxo individual: roleta, realocação,
 *  resolução de exceção). */
export function mensagemTransferenciaIndividual(opts: {
  nomeLead: string;
  projeto: string | null;
  renda: string | null;
  link: string;
}): string {
  return (
    `🔔 *Lead transferido para você!*\n\n` +
    `👤 Nome: ${opts.nomeLead}\n` +
    `🏢 Projeto: ${opts.projeto ?? "—"}\n` +
    `💰 Faixa de renda: ${opts.renda ?? "—"}\n\n` +
    `🔗 Abrir no CRM: ${opts.link}`
  );
}

/** Mensagem ÚNICA de um lote transferido. Com um só lead cai no texto
 *  individual — o resumo só existe para não repetir o envio N vezes. */
export function mensagemTransferenciaLote(
  leads: LeadResumo[],
  opts: { linkLista: string; linkLead?: string },
): string {
  if (leads.length === 1) {
    const [lead] = leads;
    return mensagemTransferenciaIndividual({
      nomeLead: lead.nome?.trim() || "(sem nome)",
      projeto: lead.projeto,
      renda: lead.renda,
      link: opts.linkLead ?? opts.linkLista,
    });
  }
  const mostrados = leads.slice(0, LOTE_MAX_NOMES);
  const restantes = leads.length - mostrados.length;
  return (
    `🔔 *${leads.length} leads transferidos para você!*\n\n` +
    mostrados.map(linhaLead).join("\n") +
    (restantes > 0 ? `\n• … e mais ${restantes}` : "") +
    `\n\n🔗 Ver no CRM: ${opts.linkLista}`
  );
}

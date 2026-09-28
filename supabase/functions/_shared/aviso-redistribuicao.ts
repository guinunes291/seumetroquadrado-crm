// Textos do aviso de redistribuição por SLA (WhatsApp / Z-API).
//
// TS puro (sem Deno.*): a suíte vitest importa daqui. Consumidora em produção:
// a Edge Function notify-redistribuicao.
//
// Os textos são os mesmos do antigo "Digest Redistribuição (anti-rajada)" do
// n8n (substituído em 2026-10-02) — o corretor não percebe a troca de motor,
// só que o empreendimento agora sai da ficha do lead no CRM.

export type AvisoLead = {
  lead_id: string;
  lead_nome: string | null;
  projeto_nome: string | null;
};

/** Quantos leads aparecem nominalmente antes do "... e mais N". */
export const AVISO_MAX_LEADS = 10;

/** Teto de caracteres de uma mensagem (margem sob o limite do WhatsApp). */
export const AVISO_MAX_CHARS = 3900;

/** Uma mensagem por corretor, com todos os leads que ele recebeu na rodada. */
export function mensagemAvisoCorretor(
  leads: AvisoLead[],
  linkLead: (id: string) => string,
): string {
  const n = leads.length;
  const L: string[] = [];
  L.push(n === 1 ? "🔁 1 lead novo pra você" : `🔁 ${n} leads novos pra você`);
  L.push("");
  leads.slice(0, AVISO_MAX_LEADS).forEach((l, i) => {
    const nome = l.lead_nome?.trim() || "sem nome";
    const emp = l.projeto_nome?.trim() ? ` · ${l.projeto_nome.trim()}` : "";
    L.push(`${i + 1}. ${nome}${emp}`);
    L.push(`   ${linkLead(l.lead_id)}`);
  });
  if (n > AVISO_MAX_LEADS) L.push(`... e mais ${n - AVISO_MAX_LEADS} na sua lista do CRM.`);
  L.push("");
  L.push(
    n === 1
      ? "Chegou pra você porque não houve atendimento no prazo. Fale com ele hoje — lead parado volta pra roleta."
      : "Chegaram pra você porque não houve atendimento no prazo. Fale com eles hoje — lead parado volta pra roleta.",
  );
  return L.join("\n").slice(0, AVISO_MAX_CHARS);
}

/** Resumo da rodada para o gestor. */
export function mensagemAvisoGestor(opts: {
  quando: string;
  porCorretor: { nome: string; qtd: number }[];
  saltosIgnorados: number;
}): string {
  const leads = opts.porCorretor.reduce((s, c) => s + c.qtd, 0);
  const corretores = opts.porCorretor.length;
  const G: string[] = [];
  G.push(`📊 Redistribuição automática · ${opts.quando}`);
  G.push(
    `${leads} ${leads === 1 ? "lead redistribuído" : "leads redistribuídos"} · ` +
      `${corretores} ${corretores === 1 ? "corretor avisado" : "corretores avisados"}`,
  );
  G.push("");
  for (const c of opts.porCorretor) G.push(`• ${c.nome}: ${c.qtd}`);
  if (opts.saltosIgnorados > 0) {
    G.push("");
    G.push(
      `(${opts.saltosIgnorados} salto(s) intermediário(s) ignorado(s) — só o dono final foi avisado)`,
    );
  }
  G.push("");
  G.push("Origem: SLA do CRM · aviso agrupado a cada 10 min pelo próprio CRM.");
  return G.join("\n").slice(0, AVISO_MAX_CHARS);
}

/** Agrupa os avisos por corretor, na ordem em que o corretor apareceu. */
export function agruparPorCorretor<T extends { corretor_id: string }>(
  avisos: T[],
): { corretor_id: string; itens: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const a of avisos) {
    const g = grupos.get(a.corretor_id);
    if (g) g.push(a);
    else grupos.set(a.corretor_id, [a]);
  }
  return [...grupos.entries()].map(([corretor_id, itens]) => ({ corretor_id, itens }));
}

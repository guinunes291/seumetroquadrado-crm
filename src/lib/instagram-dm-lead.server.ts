// Envio da conversa qualificada para o CRM, pelo webhook de leads da roleta
// escolhida para a palavra-chave (o mesmo caminho do Meta Lead Ads). Só servidor.
import { adminInstagram } from "@/integrations/supabase/instagram-dm-pendente";
import { atualizarConversa, carregarConfig, msgErro } from "@/lib/instagram-dm-base.server";

export type ResultadoLead = { ok: boolean; status: string; leadId?: string | null; erro?: string };

/**
 * Manda a conversa qualificada para o webhook de leads da roleta da palavra.
 * Idempotente: conversa com lead_id não é reenviada. Chamado ao fim da
 * qualificação e pelo botão "Reenviar ao CRM" do painel.
 */
export async function enviarLeadAoCrm(conversaId: string): Promise<ResultadoLead> {
  const db = adminInstagram();
  const { data: c } = await db
    .from("instagram_dm_conversas")
    .select("*")
    .eq("id", conversaId)
    .maybeSingle();
  if (!c) return { ok: false, status: "nao_encontrada" };
  if (c.lead_id) return { ok: true, status: c.lead_status ?? "criado", leadId: c.lead_id };
  if (!c.whatsapp) return { ok: false, status: "sem_whatsapp" };

  const marcar = async (lead_status: string, erro: string | null, lead_id?: string | null) => {
    await atualizarConversa(c.id, { lead_status, erro, ...(lead_id ? { lead_id } : {}) });
  };

  const { data: palavra } = c.palavra_id
    ? await db.from("instagram_dm_palavras").select("*").eq("id", c.palavra_id).maybeSingle()
    : { data: null };
  if (!palavra?.roleta_id) {
    await marcar("aguardando_roleta", "Escolha a roleta desta palavra no painel e reenvie.");
    return { ok: false, status: "aguardando_roleta" };
  }
  const { data: roleta } = await db
    .from("roletas")
    .select("webhook_token, nome")
    .eq("id", palavra.roleta_id)
    .maybeSingle();
  if (!roleta?.webhook_token) {
    await marcar("aguardando_roleta", "A roleta escolhida não tem token de webhook.");
    return { ok: false, status: "aguardando_roleta" };
  }

  const cfg = await carregarConfig();
  const origem = (cfg?.app_origin || process.env.APP_ORIGIN || "").replace(/\/+$/, "");
  if (!origem) {
    await marcar(
      "erro",
      "Endereço publicado do CRM desconhecido: clique em Conectar ao Instagram.",
    );
    return { ok: false, status: "erro" };
  }

  const arroba = c.username ? `@${c.username}` : null;
  const extras = [
    arroba ? { label: "Instagram", valor: arroba } : null,
    { label: "Palavra-chave", valor: c.palavra },
    { label: "Chegou por", valor: c.origem === "comentario" ? "Comentário no post" : "DM" },
    c.prazo ? { label: "Prazo para se mudar", valor: c.prazo } : null,
  ].filter((x): x is { label: string; valor: string } => x !== null);

  const payload = {
    nome: (c.nome || arroba || "Lead do Instagram").slice(0, 255),
    telefone: c.whatsapp,
    origem: "outro",
    campanha: `Instagram ${cfg?.zernio_username ? `@${cfg.zernio_username}` : ""} · ${c.palavra}`
      .replace(/\s+/g, " ")
      .trim(),
    empreendimento: palavra.assunto || null,
    faixaRenda: c.renda_texto || null,
    regiao: c.regiao || null,
    observacoes: [
      `Lead do Instagram${arroba ? ` (${arroba})` : ""}, qualificado por DM automática da palavra ${c.palavra}.`,
      c.prazo ? `Prazo para se mudar: ${c.prazo}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    utm_source: "instagram",
    utm_medium: c.origem === "comentario" ? "comentario_dm" : "dm",
    utm_campaign: c.palavra.toLowerCase(),
    utm_content: c.post_id,
    camposExtras: extras,
    distribuir: true,
  };

  try {
    const res = await fetch(`${origem}/api/public/webhooks/lead/${roleta.webhook_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const json: unknown = await res.json().catch(() => null);
    const r = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    if (!res.ok) {
      const erro = `CRM respondeu ${res.status}${typeof r.error === "string" ? `: ${r.error}` : ""}`;
      await marcar("erro", erro.slice(0, 300));
      return { ok: false, status: "erro", erro };
    }
    const leadId = typeof r.lead_id === "string" ? r.lead_id : null;
    const status = r.duplicate ? "duplicado" : "criado";
    await marcar(status, null, leadId);
    return { ok: true, status, leadId };
  } catch (e) {
    const erro = `Falha ao chamar o CRM: ${msgErro(e)}`;
    await marcar("erro", erro);
    return { ok: false, status: "erro", erro };
  }
}

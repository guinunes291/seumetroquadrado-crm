// Envio de WhatsApp via Z-API a partir do SERVIDOR do app (rotas TanStack).
// Mesmo contrato e envs da edge function lead-intake (ZAPI_INSTANCE_ID,
// ZAPI_TOKEN, ZAPI_CLIENT_TOKEN) — a instância é a do número operacional SMQ.
// SERVER-ONLY. Nunca importar em código de cliente.

/** Normaliza para o formato do Z-API: só dígitos, com DDI 55. */
export function toZapiPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) d = `55${d}`;
  return d.length >= 12 && d.length <= 15 ? d : null;
}

/**
 * Envia texto via Z-API. Nunca lança: devolve um status legível para log e
 * para o fallback in-app do chamador ("enviada" | "zapi_nao_configurada" |
 * "sem_telefone" | "falhou_<status>" | "erro: <msg>").
 */
export async function enviarWhatsAppZapi(
  telefone: string | null | undefined,
  mensagem: string,
): Promise<string> {
  const instance = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  if (!instance || !token) return "zapi_nao_configurada";
  const phone = toZapiPhone(telefone);
  if (!phone) return "sem_telefone";

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.ZAPI_CLIENT_TOKEN) headers["Client-Token"] = process.env.ZAPI_CLIENT_TOKEN;
    const res = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone, message: mensagem }),
    });
    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      return `falhou_${res.status}: ${corpo.slice(0, 200)}`;
    }
    return "enviada";
  } catch (e) {
    return `erro: ${e instanceof Error ? e.message : String(e)}`;
  }
}

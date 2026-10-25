// Despacho dos avisos do Link de Proposta: o CRM chama o webhook do n8n (Sami 1898)
// só quando existe aviso. modo "auto": o n8n tenta texto livre e, fora da janela
// de 24h, reenvia pelo template aprovado. Falhas tentam de novo na próxima varredura
// (até max_tentativas) e depois caem para push no banco.

export const N8N_PROPOSTA_AVISO_URL = "https://guilhermenunessmq.app.n8n.cloud/webhook/smq-proposta-aviso";
const TIMEOUT_MS = 20_000;

type Resposta = { ok: boolean; canal: string | null; wamid: string | null; erro: string | null };

async function chamarWebhook(body: unknown, chave: string): Promise<Resposta> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(N8N_PROPOSTA_AVISO_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sami-key": chave },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const texto = await res.text();
    let j: Partial<Resposta> = {};
    try {
      j = JSON.parse(texto);
    } catch {
      /* corpo não JSON */
    }
    if (!res.ok) return { ok: false, canal: null, wamid: null, erro: `HTTP ${res.status}: ${(j.erro ?? texto).toString().slice(0, 300)}` };
    return { ok: j.ok === true, canal: j.canal ?? null, wamid: j.wamid ?? null, erro: j.ok ? null : String(j.erro ?? "n8n respondeu ok=false") };
  } catch (e) {
    const abort = e instanceof Error && e.name === "AbortError";
    return { ok: false, canal: null, wamid: null, erro: abort ? "webhook sem resposta em 20s" : `falha de rede: ${e instanceof Error ? e.message : "desconhecida"}` };
  } finally {
    clearTimeout(t);
  }
}

export type ResultadoDespacho = { id: string; status: string; canal: string | null; wamid: string | null; erro: string | null };

export async function despacharAvisosProposta(limite = 20): Promise<ResultadoDespacho[]> {
  const chave = process.env.SAMI_WRITE_KEY;
  if (!chave) {
    console.error("[proposta-avisos] SAMI_WRITE_KEY ausente");
    return [];
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("proposta_avisos_reivindicar_envio", { _limite: limite });
  if (error) {
    console.error("[proposta-avisos] reivindicar falhou", error.message);
    return [];
  }
  const resultados: ResultadoDespacho[] = [];
  await Promise.all(
    (data ?? []).map(async (a) => {
      const r = await chamarWebhook(
        {
          aviso_id: a.id,
          to: a.telefone,
          modo: "auto",
          texto: a.mensagem,
          template: { nome: a.template_nome, assunto: a.assunto.slice(0, 60), mensagem: a.mensagem.slice(0, 880) },
        },
        chave,
      );
      const { data: status, error: e2 } = await supabaseAdmin.rpc("proposta_aviso_registrar_envio", {
        _id: a.id,
        _ok: r.ok,
        _canal: r.canal ?? "",
        _wamid: r.wamid ?? "",
        _erro: r.erro ?? "",
      });
      if (e2) console.error("[proposta-avisos] registrar falhou", e2.message);
      resultados.push({ id: a.id, status: String(status ?? "erro"), canal: r.canal, wamid: r.wamid, erro: r.erro });
    }),
  );
  return resultados;
}

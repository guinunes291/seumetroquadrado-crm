// Aviso de redistribuição por SLA ao novo dono do lead — WhatsApp via Z-API.
// Substitui o "Digest Redistribuição (anti-rajada)" do n8n (2026-10-02).
//
// Chamador ÚNICO: o banco, via pg_net (cron avisos-redistribuicao →
// disparar_avisos_redistribuicao), com um TOKEN de uso único no corpo. Nenhum
// segredo no banco: esta função recebe a service role do ambiente, consome o
// token em reivindicar_avisos_redistribuicao() e só então lê a fila.
//
// Body: { token: uuid }
//
// Regra anti-bloqueio da instância Z-API (a mesma do digest do n8n): UMA
// mensagem por corretor por rodada, 5 s entre envios, e um resumo ao gestor.
//
// Secrets reutilizadas: ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, APP_BASE_URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  agruparPorCorretor,
  mensagemAvisoCorretor,
  mensagemAvisoGestor,
} from "../_shared/aviso-redistribuicao.ts";

type Aviso = {
  id: number;
  lead_id: string;
  lead_nome: string | null;
  projeto_nome: string | null;
  corretor_id: string;
  corretor_nome: string | null;
  corretor_telefone: string | null;
};

const INTERVALO_ENVIO_MS = 5000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sendZapi(telefone: string | null | undefined, message: string): Promise<string> {
  const instance = Deno.env.get("ZAPI_INSTANCE_ID");
  const token = Deno.env.get("ZAPI_TOKEN");
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
  if (!instance || !token) return "zapi_nao_configurada";
  const phone = String(telefone ?? "").replace(/\D/g, "");
  if (!phone) return "sem_telefone";
  try {
    const resp = await fetch(
      `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(clientToken ? { "Client-Token": clientToken } : {}),
        },
        body: JSON.stringify({ phone, message }),
      },
    );
    const respBody = await resp.text();
    if (!resp.ok) return `falhou_${resp.status}: ${respBody.slice(0, 200)}`;
    return "enviada";
  } catch (e) {
    return `erro: ${e instanceof Error ? e.message : String(e)}`;
  }
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!UUID_RE.test(token)) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_config" }, 503);
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rodada, error: rodadaErr } = await supabase.rpc(
    "reivindicar_avisos_redistribuicao",
    { _token: token },
  );
  if (rodadaErr) return json({ error: "reivindicar_falhou" }, 500);
  const r = rodada as {
    ok: boolean;
    avisos?: Aviso[];
    descartados_salto?: number;
    gestor_telefone?: string | null;
  };
  if (!r?.ok) return json({ error: "unauthorized", motivo: "token_invalido" }, 401);

  const avisos = r.avisos ?? [];
  if (avisos.length === 0) return json({ ok: true, envios: 0 });

  const appUrl = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/+$/, "");
  const linkLead = (id: string) => (appUrl ? `${appUrl}/leads/${id}` : `/leads/${id}`);

  const resultados: { corretor_id: string; qtd: number; notificacao: string }[] = [];
  const resumo: { nome: string; qtd: number }[] = [];
  const grupos = agruparPorCorretor(avisos);

  for (let i = 0; i < grupos.length; i++) {
    const { corretor_id, itens } = grupos[i];
    if (i > 0) await pausa(INTERVALO_ENVIO_MS);
    const notificacao = await sendZapi(
      itens[0].corretor_telefone,
      mensagemAvisoCorretor(itens, linkLead),
    );
    await supabase.rpc("concluir_avisos_redistribuicao", {
      _ids: itens.map((a) => a.id),
      _resultado: notificacao,
    });
    resultados.push({ corretor_id, qtd: itens.length, notificacao });
    if (notificacao === "enviada") {
      resumo.push({ nome: itens[0].corretor_nome?.trim() || "(sem nome)", qtd: itens.length });
    }
  }

  let gestor = "sem_gestor";
  if (r.gestor_telefone && resumo.length > 0) {
    await pausa(INTERVALO_ENVIO_MS);
    const quando = new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    gestor = await sendZapi(
      r.gestor_telefone,
      mensagemAvisoGestor({
        quando: quando.replace(",", ""),
        porCorretor: resumo,
        saltosIgnorados: r.descartados_salto ?? 0,
      }),
    );
  }

  return json({ ok: true, envios: resultados.length, resultados, gestor });
});

// Click-to-call via Sonax PABX Virtual: o corretor clica "Ligar" no CRM, o
// PABX toca primeiro no ramal dele e, ao atender, disca para o lead.
// Docs da API: docs/integracoes/sonax-discador.md (fonte: Postman oficial Sonax).
//
// Body: { lead_id: string }
//
// Requer JWT (verify_jwt = true). A leitura do lead e os inserts passam pela
// RLS do usuário — sem service_role: só é possível discar para leads da
// própria carteira (chamadas_insert_saida exige corretor_id = auth.uid()),
// e a interação nasce com autor_id do próprio corretor.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   SONAX_TOKEN          (obrigatório) — token de ativação fornecido pelo Sonax
//   SONAX_CLICK2CALL_URL (opcional) — default https://click2call.sonax.net.br/sonax-click2call.php
//   SUPABASE_URL / SUPABASE_ANON_KEY — injetadas automaticamente

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { comCapturaDeErro } from "../_shared/error-tracking.ts";
import { toSonaxNumero } from "../_shared/sonax.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve((req: Request) => comCapturaDeErro("sonax-discar", () => handleRequest(req)));

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  let body: { lead_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const leadId = body.lead_id;
  if (!leadId) return json({ error: "missing_lead_id" }, 400);

  const sonaxToken = Deno.env.get("SONAX_TOKEN");
  if (!sonaxToken) return json({ error: "sonax_nao_configurado" }, 503);
  const click2callUrl =
    Deno.env.get("SONAX_CLICK2CALL_URL") ?? "https://click2call.sonax.net.br/sonax-click2call.php";

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return json({ error: "server_config" }, 503);

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);
  const uid = userData.user.id;

  const { data: contaAtiva, error: contaError } = await supabase.rpc("conta_atual_ativa");
  if (contaError || !contaAtiva) return json({ error: "account_inactive" }, 403);

  // Lead fora da carteira volta vazio pela RLS — indistinguível de inexistente.
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, nome, telefone, opt_out")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) return json({ error: "lead_not_found" }, 404);
  if (lead.opt_out) return json({ error: "lead_opt_out" }, 409);

  const numero = toSonaxNumero(lead.telefone as string | null);
  if (!numero) return json({ error: "lead_sem_telefone" }, 422);

  const { data: prof } = await supabase
    .from("profiles")
    .select("ramal_sonax")
    .eq("id", uid)
    .maybeSingle();
  const ramal = ((prof?.ramal_sonax as string | null) ?? "").trim();
  if (!ramal) return json({ error: "ramal_nao_configurado" }, 422);

  // Dispara o click2call. Sucesso devolve o protocolo da ligação; parâmetro
  // errado/recusa devolve HTTP 404 (contrato v1 do Sonax).
  const qs = new URLSearchParams({ numero, ramal, token: sonaxToken });
  let respostaSonax = "";
  try {
    const resp = await fetch(`${click2callUrl}?${qs}`, {
      signal: AbortSignal.timeout(15_000),
    });
    respostaSonax = (await resp.text()).slice(0, 500);
    if (!resp.ok) {
      console.error("sonax-discar recusada:", resp.status, respostaSonax);
      return json({ error: "sonax_recusou", detail: respostaSonax || `http_${resp.status}` }, 502);
    }
  } catch (e) {
    console.error("sonax-discar indisponivel:", e);
    return json({ error: "sonax_indisponivel" }, 502);
  }

  // Protocolo = primeira sequência longa de dígitos da resposta QUE NÃO SEJA
  // o número discado — a v1 devolve texto e costuma ecoar o número; capturar
  // o telefone como protocolo colidiria no UNIQUE de provider_call_id na
  // segunda ligação ao mesmo lead, sumindo com a chamada nova. Sem protocolo
  // confiável fica null e o webhook cria a linha pelo id_chamada real.
  const semNumeroDiscado = respostaSonax.replaceAll("55" + numero, " ").replaceAll(numero, " ");
  const protocolo = semNumeroDiscado.match(/\d{6,}/)?.[0] ?? null;

  const { data: chamada, error: chamadaErr } = await supabase
    .from("chamadas")
    .insert({
      lead_id: lead.id,
      corretor_id: uid,
      direcao: "saida",
      origem: "click2call",
      numero,
      ramal,
      provider_call_id: protocolo,
      status: "chamando",
      payload: { resposta_click2call: respostaSonax },
    })
    .select("id")
    .maybeSingle();
  if (chamadaErr) {
    // 23505 = protocolo repetido (duplo clique / retry): a chamada existe, segue.
    if ((chamadaErr as { code?: string }).code !== "23505") {
      console.error("sonax-discar chamada_insert_failed:", chamadaErr);
    }
  }

  // Eco na timeline do dossiê. A ligação já foi disparada no PABX — falha aqui
  // não desfaz a chamada, então reporta em vez de erro.
  const { error: ecoErr } = await supabase.from("interacoes").insert({
    lead_id: lead.id,
    autor_id: uid,
    tipo: "ligacao",
    direcao: "saida",
    titulo: "Ligação via discador (click-to-call)",
    conteudo:
      `Chamada para ${numero} enviada ao ramal ${ramal}.` +
      (protocolo ? ` Protocolo Sonax: ${protocolo}.` : ""),
    metadata: {
      fonte: "sonax_click2call",
      ramal,
      ...(protocolo ? { protocolo } : {}),
      ...(chamada?.id ? { chamada_id: chamada.id } : {}),
    },
  });
  if (ecoErr) console.error("sonax-discar interacao_failed:", ecoErr);

  return json({
    ok: true,
    protocolo,
    chamada_id: chamada?.id ?? null,
    timeline: ecoErr ? "falhou" : "ok",
  });
}

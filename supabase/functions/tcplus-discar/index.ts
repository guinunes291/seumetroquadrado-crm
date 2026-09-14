// Click-to-call via 3C Plus: o corretor clica "Ligar" no CRM e o CRM manda o
// AGENTE dele no 3C Plus discar para o lead (chamada manual). A voz toca no
// webphone/ramal do agente (3C Plus); o CRM entrega o contexto e o registro.
// Docs da API: docs/integracoes/3cplus-discador.md.
//
// Body: { lead_id: string }
//
// Sequência no 3C Plus (token do AGENTE — o do gestor não executa ação de
// agente):
//   1. POST /agent/login { campaign, mode: "manual" }  — best-effort: se o
//      agente já está logado (webphone aberto), o 3C Plus recusa e seguimos.
//   2. POST /agent/manual_call/enter                    — best-effort.
//   3. POST /agent/manual_call/dial { phone }           — a discagem de fato;
//      recusa aqui é erro (tcplus_recusou). Se falhar em ACW (pós-chamada
//      sem qualificar), tenta o caminho /agent/manual_call_acw/dial.
// As ações devolvem 204 (aceitas, assíncronas): a confirmação real chega pelo
// webhook (call-was-connected / call-history-was-created), que casa este
// registro pelo número + corretor e preenche o sid.
//
// Requer JWT (verify_jwt = true). A leitura do lead e os inserts passam pela
// RLS do usuário — só é possível discar para leads da própria carteira
// (chamadas_insert_saida exige corretor_id = auth.uid()). A service_role
// entra para ler o token do agente em telefonia_agentes (coluna sem SELECT
// para authenticated, por desenho) e para UM segundo caso: o lead do BOLSÃO
// que a tcplus-campanha reservou para este corretor (modo um a um). Esse
// lead não é dele — a RLS o esconde, e deve —, mas a reserva em
// bolsao_discagem autoriza a discagem pelo CRM (auditável, sem o telefone
// passar pelo navegador). Se o cliente atender, o webhook o põe na carteira.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   TCPLUS_BASE_URL     (opcional) — default https://app.3c.plus/api/v1
//   TCPLUS_AUTH_MODE    (opcional) — "bearer" (default) | "query"
//   TCPLUS_DIAL_FORMAT  (opcional) — "nacional" (default, 11 dígitos) | "ddi"
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY — injetadas

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { comCapturaDeErro } from "../_shared/error-tracking.ts";
import {
  TCPLUS_BASE_URL_PADRAO,
  mensagemDeErroTcplus,
  tcplusRequest,
  toTcplusDial,
  toTcplusNumero,
  type TcplusAuthMode,
  type TcplusConfig,
  type TcplusDialFormato,
} from "../_shared/tcplus.ts";

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

Deno.serve((req: Request) => comCapturaDeErro("tcplus-discar", () => handleRequest(req)));

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

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "server_config" }, 503);

  const baseUrl = Deno.env.get("TCPLUS_BASE_URL") ?? TCPLUS_BASE_URL_PADRAO;
  const authMode: TcplusAuthMode =
    Deno.env.get("TCPLUS_AUTH_MODE") === "query" ? "query" : "bearer";
  const dialFormato: TcplusDialFormato =
    Deno.env.get("TCPLUS_DIAL_FORMAT") === "ddi" ? "ddi" : "nacional";

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
  const { data: leadCarteira, error: leadErr } = await supabase
    .from("leads")
    .select("id, nome, telefone, opt_out")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) return json({ error: "lead_not_found" }, 404);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Lead do Bolsão reservado para este corretor (tcplus-campanha, modo um a
  // um): lido pela service_role SÓ quando a reserva existe e está viva, e só
  // se o lead continua sem dono (ou já é dele).
  type LeadDiscavel = { id: string; nome: string; telefone: string | null; opt_out: boolean };
  let lead: LeadDiscavel | null = (leadCarteira as LeadDiscavel | null) ?? null;
  let viaBolsao = false;
  if (!lead) {
    const { data: reserva } = await admin
      .from("bolsao_discagem")
      .select("lead_id")
      .eq("lead_id", leadId)
      .eq("corretor_id", uid)
      .gt("expira_em", new Date().toISOString())
      .maybeSingle();
    if (reserva) {
      const { data: l } = await admin
        .from("leads")
        .select("id, nome, telefone, opt_out, corretor_id, deleted_at, na_lixeira")
        .eq("id", leadId)
        .maybeSingle();
      if (
        l &&
        !l.deleted_at &&
        !l.na_lixeira &&
        ((l.corretor_id as string | null) === null || l.corretor_id === uid)
      ) {
        lead = l as LeadDiscavel;
        viaBolsao = true;
      }
    }
  }
  if (!lead) return json({ error: "lead_not_found" }, 404);
  if (lead.opt_out) return json({ error: "lead_opt_out" }, 409);

  const numero = toTcplusNumero(lead.telefone);
  if (!numero) return json({ error: "lead_sem_telefone" }, 422);

  // Token do agente: coluna write-only para o app — só a service_role lê, e
  // SÓ a linha do próprio usuário autenticado.
  const { data: agente } = await admin
    .from("telefonia_agentes")
    .select("api_token, campaign_id, agent_id")
    .eq("user_id", uid)
    .maybeSingle();
  const token = ((agente?.api_token as string | null) ?? "").trim();
  const campaignId = ((agente?.campaign_id as string | null) ?? "").trim();
  if (!token) return json({ error: "token_nao_configurado" }, 422);
  if (!campaignId) return json({ error: "campanha_nao_configurada" }, 422);

  const cfg: TcplusConfig = { baseUrl, token, authMode };
  const auditoria: Record<string, unknown> = {};
  const registrar = (passo: string, r: { ok: boolean; status: number; texto: string }) => {
    auditoria[passo] = { ok: r.ok, status: r.status, resposta: r.texto.slice(0, 300) };
  };

  // 1. Login em modo manual. 401/403 = token inválido (erro do corretor);
  //    outros erros costumam ser "já logado" — seguimos e deixamos a
  //    discagem decidir.
  const login = await tcplusRequest(cfg, "POST", "/agent/login", {
    body: { campaign: Number(campaignId) || campaignId, mode: "manual" },
  });
  registrar("login", login);
  if (login.status === 401 || login.status === 403) {
    return json({ error: "tcplus_token_invalido", detail: mensagemDeErroTcplus(login) }, 422);
  }
  if (login.status === 0) return json({ error: "tcplus_indisponivel" }, 502);

  // 2. Entrar no modo de chamada manual (best-effort: já estar nele é ok).
  const enter = await tcplusRequest(cfg, "POST", "/agent/manual_call/enter");
  registrar("manual_call_enter", enter);

  // 3. Discar. Em ACW (chamada anterior sem qualificar) o 3C Plus recusa o
  //    dial normal; o caminho _acw disca sem sair do pós-atendimento.
  const phone = toTcplusDial(numero, dialFormato);
  let dial = await tcplusRequest(cfg, "POST", "/agent/manual_call/dial", { body: { phone } });
  registrar("dial", dial);
  if (!dial.ok && dial.status >= 400 && dial.status < 500) {
    const dialAcw = await tcplusRequest(cfg, "POST", "/agent/manual_call_acw/dial", {
      body: { phone },
    });
    registrar("dial_acw", dialAcw);
    if (dialAcw.ok) dial = dialAcw;
  }
  if (!dial.ok) {
    console.error("tcplus-discar recusada:", dial.status, dial.texto);
    if (dial.status === 0) return json({ error: "tcplus_indisponivel" }, 502);
    return json({ error: "tcplus_recusou", detail: mensagemDeErroTcplus(dial) }, 502);
  }

  // Registro da chamada (JWT do corretor: RLS exige saída, em nome próprio,
  // lead da carteira; lead do Bolsão reservado passa pela service_role). Sem
  // provider_call_id ainda — o 3C Plus responde 204 sem id; o webhook casa
  // esta linha por número + corretor e grava o sid.
  const escritor = viaBolsao ? admin : supabase;
  const { data: chamada, error: chamadaErr } = await escritor
    .from("chamadas")
    .insert({
      lead_id: lead.id,
      corretor_id: uid,
      direcao: "saida",
      origem: "click2call",
      provider: "3cplus",
      numero,
      // `ramal` é o ramal SIP do agente — o webhook preenche quando o evento
      // traz `agent.extension_number`; o ID do agente não é ramal.
      ramal: null,
      status: "chamando",
      payload: { tcplus: auditoria, phone_discado: phone, bolsao: viaBolsao },
    })
    .select("id")
    .maybeSingle();
  if (chamadaErr) console.error("tcplus-discar chamada_insert_failed:", chamadaErr);

  // Eco na timeline do dossiê. A discagem já foi disparada — falha aqui não
  // desfaz a chamada, então reporta em vez de erro.
  const { error: ecoErr } = await escritor.from("interacoes").insert({
    lead_id: lead.id,
    autor_id: uid,
    tipo: "ligacao",
    direcao: "saida",
    titulo: viaBolsao
      ? "Ligação via discador (Bolsão, click-to-call)"
      : "Ligação via discador (click-to-call)",
    conteudo: `Chamada para ${numero} enviada ao seu agente no 3C Plus.`,
    metadata: {
      fonte: "tcplus_click2call",
      bolsao: viaBolsao,
      ...(chamada?.id ? { chamada_id: chamada.id } : {}),
    },
  });
  if (ecoErr) console.error("tcplus-discar interacao_failed:", ecoErr);

  return json({
    ok: true,
    chamada_id: chamada?.id ?? null,
    bolsao: viaBolsao,
    timeline: ecoErr ? "falhou" : "ok",
  });
}

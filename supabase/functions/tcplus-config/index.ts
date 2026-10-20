// Configuração e diagnóstico da telefonia 3C Plus — o que antes era um
// checklist manual (IDs de agente digitados, uma campanha por corretor,
// adivinhar se o token ia no header ou na query) vira botão e semáforo.
// Docs: docs/integracoes/3cplus-discador.md.
//
// Body: { acao, ... }
//   { acao: "conectar", token }          — QUALQUER membro ativo: valida o
//        token de agente no 3C Plus (GET /me com o próprio token) ANTES de
//        gravar, e preenche o agent_id sozinho. Token recusado não é salvo.
//   { acao: "diagnostico" }              — gestão (admin/gestor/superint.):
//        secrets presentes, token do gestor aceito (e em que modo), campanhas
//        da conta, campanha única configurada, agentes do 3C Plus casados
//        com os corretores por e-mail, autoteste do webhook e a última
//        chamada que o webhook registrou.
//   { acao: "salvar_campanha", campaign_id } — admin: grava a campanha ÚNICA
//        do discador (gestao_config.telefonia_3cplus), conferindo que ela
//        existe na conta.
//   { acao: "vincular_agentes" }         — admin: grava o agent_id de cada
//        corretor cujo e-mail no CRM é o e-mail de um agente no 3C Plus.
//
// O token do gestor (TCPLUS_API_TOKEN) e os tokens dos agentes nunca saem
// desta function. A URL do webhook com o segredo só vai para o ADMIN (é ele
// quem a cola no 3C Plus).
//
// Secrets: TCPLUS_API_TOKEN, TCPLUS_WEBHOOK_SECRET, TCPLUS_BASE_URL /
// TCPLUS_AUTH_MODE (opcionais), SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { comCapturaDeErro } from "../_shared/error-tracking.ts";
import {
  CHAVE_CONFIG_TCPLUS,
  TCPLUS_BASE_URL_PADRAO,
  campanhaEfetiva,
  lerAmbienteTcplus,
  linhasDaResposta,
  mensagemDeErroTcplus,
  tcplusRequest,
  type TcplusConfig,
  type TcplusResposta,
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

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
/** `{data:{...}}` ou o próprio objeto — o 3C Plus envelopa em `data`. */
function dados(body: unknown): Obj {
  if (isObj(body) && isObj(body.data)) return body.data;
  return isObj(body) ? body : {};
}
const texto = (v: unknown): string | null =>
  v === undefined || v === null || v === "" ? null : String(v);

const ACOES = new Set(["conectar", "diagnostico", "salvar_campanha", "vincular_agentes"]);
const GESTAO = new Set(["admin", "gestor", "superintendente"]);

Deno.serve((req: Request) => comCapturaDeErro("tcplus-config", () => handleRequest(req)));

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  let body: { acao?: string; token?: unknown; campaign_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const acao = body.acao ?? "";
  if (!ACOES.has(acao)) return json({ error: "acao_invalida" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "server_config" }, 503);

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);
  const uid = userData.user.id;

  const { data: contaAtiva, error: contaError } = await supabase.rpc("conta_atual_ativa");
  if (contaError || !contaAtiva) return json({ error: "account_inactive" }, 403);

  const { data: rolesData } = await admin.from("user_roles").select("role").eq("user_id", uid);
  const roles = new Set((rolesData ?? []).map((r) => String(r.role)));
  const ehAdmin = roles.has("admin");
  const ehGestao = [...roles].some((r) => GESTAO.has(r));

  const amb = lerAmbienteTcplus((k) => Deno.env.get(k));
  const tokenGestor = (Deno.env.get("TCPLUS_API_TOKEN") ?? "").trim();

  // ---- conectar: o corretor cola o token, o CRM confere no 3C Plus --------
  if (acao === "conectar") {
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (token.length < 20) return json({ error: "token_formato_invalido" }, 400);
    if (tokenGestor && token === tokenGestor) return json({ error: "token_e_do_gestor" }, 400);

    const me = await tcplusRequest({ ...amb, token }, "GET", "/me");
    if (me.status === 401 || me.status === 403) {
      return json({ error: "tcplus_token_invalido", detail: mensagemDeErroTcplus(me) }, 422);
    }
    if (me.status === 0) return json({ error: "tcplus_indisponivel" }, 502);
    if (!me.ok) return json({ error: "tcplus_recusou", detail: mensagemDeErroTcplus(me) }, 502);

    const u = dados(me.body);
    const agentId = texto(u.id);
    const agentEmail = texto(u.email)?.toLowerCase() ?? null;
    const agentNome = texto(u.name);

    const { data: perfil } = await admin
      .from("profiles")
      .select("email")
      .eq("id", uid)
      .maybeSingle();
    const emailCrm = ((perfil?.email as string | undefined) ?? "").toLowerCase();

    const patch: Obj = { api_token: token };
    if (agentId) patch.agent_id = agentId;
    const { data: existe } = await admin
      .from("telefonia_agentes")
      .select("user_id")
      .eq("user_id", uid)
      .maybeSingle();
    const { error } = existe
      ? await admin.from("telefonia_agentes").update(patch).eq("user_id", uid)
      : await admin.from("telefonia_agentes").insert({ user_id: uid, ...patch });
    if (error) return json({ error: "salvar_falhou", detail: error.message }, 500);

    return json({
      ok: true,
      agente: { id: agentId, nome: agentNome, email: agentEmail },
      // E-mail diferente não impede (o agent_id casa os eventos), mas avisa:
      // costuma ser token de outra pessoa colado por engano.
      email_confere: !!agentEmail && agentEmail === emailCrm,
    });
  }

  if (!ehGestao) return json({ error: "forbidden" }, 403);
  if ((acao === "salvar_campanha" || acao === "vincular_agentes") && !ehAdmin) {
    return json({ error: "forbidden" }, 403);
  }

  // ---- Token do gestor: testa o host configurado e o padrão --------------
  // (o modo auto já tenta header e query). Devolve o primeiro que respondeu.
  async function gestorFuncional(): Promise<{
    cfg: TcplusConfig | null;
    tentativas: Array<{ base_url: string; status: number; detalhe: string | null }>;
    me: Obj | null;
  }> {
    const tentativas: Array<{ base_url: string; status: number; detalhe: string | null }> = [];
    if (!tokenGestor) return { cfg: null, tentativas, me: null };
    const hosts = Array.from(new Set([amb.baseUrl, TCPLUS_BASE_URL_PADRAO]));
    for (const baseUrl of hosts) {
      const cfg: TcplusConfig = { baseUrl, token: tokenGestor, authMode: amb.authMode };
      const r: TcplusResposta = await tcplusRequest(cfg, "GET", "/me", { timeoutMs: 10_000 });
      tentativas.push({
        base_url: baseUrl,
        status: r.status,
        detalhe: r.ok ? null : mensagemDeErroTcplus(r),
      });
      if (r.ok) return { cfg, tentativas, me: dados(r.body) };
    }
    return { cfg: null, tentativas, me: null };
  }

  async function listarCampanhas(cfg: TcplusConfig): Promise<Array<{ id: string; nome: string }>> {
    const r = await tcplusRequest(cfg, "GET", "/campaigns", { qs: { per_page: "200" } });
    if (!r.ok) return [];
    return linhasDaResposta(r.body)
      .map((c) => ({ id: texto(c.id) ?? "", nome: texto(c.name) ?? "(sem nome)" }))
      .filter((c) => c.id);
  }

  async function listarAgentes(
    cfg: TcplusConfig,
  ): Promise<Array<{ id: string; nome: string | null; email: string | null }>> {
    const r = await tcplusRequest(cfg, "GET", "/users", {
      qs: { role: "agent", per_page: "200" },
    });
    if (!r.ok) return [];
    return linhasDaResposta(r.body)
      .map((a) => ({
        id: texto(a.id) ?? "",
        nome: texto(a.name),
        email: texto(a.email)?.toLowerCase() ?? null,
      }))
      .filter((a) => a.id);
  }

  // Perfis ativos indexados por e-mail (minúsculo) — o casamento agente ↔
  // corretor é sempre pelo e-mail, a mesma régua do fallback do webhook.
  async function perfisPorEmail(): Promise<Map<string, { id: string; nome: string }>> {
    const { data } = await admin.from("profiles").select("id, nome, email").eq("ativo", true);
    const m = new Map<string, { id: string; nome: string }>();
    for (const p of data ?? []) {
      const e = String(p.email ?? "").toLowerCase();
      if (e) m.set(e, { id: String(p.id), nome: String(p.nome ?? "") });
    }
    return m;
  }

  // ---- salvar_campanha -----------------------------------------------------
  if (acao === "salvar_campanha") {
    const campaignId = texto(body.campaign_id)?.trim() ?? "";
    if (!/^\d+$/.test(campaignId)) return json({ error: "campanha_invalida" }, 400);
    const { cfg } = await gestorFuncional();
    if (!cfg) return json({ error: "tcplus_token_gestor_invalido" }, 502);
    const campanhas = await listarCampanhas(cfg);
    const campanha = campanhas.find((c) => c.id === campaignId);
    if (campanhas.length > 0 && !campanha) return json({ error: "campanha_inexistente" }, 404);
    const { error } = await admin.from("gestao_config").upsert(
      {
        chave: CHAVE_CONFIG_TCPLUS,
        valor: { campaign_id: campaignId, nome: campanha?.nome ?? null },
        descricao:
          "Discador 3C Plus: campanha única do time (todos os corretores discam o Bolsão por ela).",
        atualizado_por: uid,
      },
      { onConflict: "chave" },
    );
    if (error) return json({ error: "salvar_falhou", detail: error.message }, 500);
    return json({ ok: true, campaign_id: campaignId, nome: campanha?.nome ?? null });
  }

  // ---- vincular_agentes ----------------------------------------------------
  if (acao === "vincular_agentes") {
    const { cfg } = await gestorFuncional();
    if (!cfg) return json({ error: "tcplus_token_gestor_invalido" }, 502);
    const [agentes, perfis] = await Promise.all([listarAgentes(cfg), perfisPorEmail()]);
    const { data: linhas } = await admin.from("telefonia_agentes").select("user_id, agent_id");
    const atual = new Map((linhas ?? []).map((l) => [String(l.user_id), texto(l.agent_id)]));
    let vinculados = 0;
    const semCorretor: string[] = [];
    for (const a of agentes) {
      const perfil = a.email ? perfis.get(a.email) : undefined;
      if (!perfil) {
        semCorretor.push(a.nome ?? a.email ?? `#${a.id}`);
        continue;
      }
      if (atual.get(perfil.id) === a.id) continue;
      const { error } = atual.has(perfil.id)
        ? await admin.from("telefonia_agentes").update({ agent_id: a.id }).eq("user_id", perfil.id)
        : await admin.from("telefonia_agentes").insert({ user_id: perfil.id, agent_id: a.id });
      if (!error) vinculados++;
    }
    return json({ ok: true, agentes: agentes.length, vinculados, sem_corretor: semCorretor });
  }

  // ---- diagnostico ---------------------------------------------------------
  const webhookSecret = (Deno.env.get("TCPLUS_WEBHOOK_SECRET") ?? "").trim();
  const { cfg, tentativas, me } = await gestorFuncional();

  const [campanhas, agentes, perfis, cfgTcplus, linhasAgentes, ultimaChamada] = await Promise.all([
    cfg ? listarCampanhas(cfg) : Promise.resolve([]),
    cfg ? listarAgentes(cfg) : Promise.resolve([]),
    perfisPorEmail(),
    admin.from("gestao_config").select("valor").eq("chave", CHAVE_CONFIG_TCPLUS).maybeSingle(),
    admin.from("telefonia_agentes").select("user_id, agent_id, campaign_id, token_atualizado_em"),
    // Só o webhook grava o sid: a chamada mais recente com sid é o último
    // evento do 3C Plus que chegou ao CRM.
    admin
      .from("chamadas")
      .select("criado_em, atualizado_em")
      .eq("provider", "3cplus")
      .not("provider_call_id", "is", null)
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const campanhaUnica = campanhaEfetiva(null, cfgTcplus.data?.valor);
  const porUsuario = new Map((linhasAgentes.data ?? []).map((l) => [String(l.user_id), l]));
  const nomePorId = new Map([...perfis.values()].map((p) => [p.id, p.nome]));

  // Corretores: quem já tem vínculo + quem casa com um agente do 3C Plus.
  const agentePorEmail = new Map(agentes.filter((a) => a.email).map((a) => [a.email!, a]));
  const ids = new Set<string>(porUsuario.keys());
  for (const [email, p] of perfis) if (agentePorEmail.has(email)) ids.add(p.id);
  const emailPorId = new Map([...perfis.entries()].map(([e, p]) => [p.id, e]));
  const corretores = [...ids].map((id) => {
    const l = porUsuario.get(id);
    const email = emailPorId.get(id) ?? null;
    const agente3c = email ? (agentePorEmail.get(email) ?? null) : null;
    return {
      user_id: id,
      nome: nomePorId.get(id) ?? "(inativo)",
      agent_id: texto(l?.agent_id),
      agente_3c: agente3c ? { id: agente3c.id, nome: agente3c.nome } : null,
      token_conectado: !!l?.token_atualizado_em,
      token_atualizado_em: texto(l?.token_atualizado_em),
      campanha: campanhaEfetiva(l?.campaign_id, cfgTcplus.data?.valor) || null,
    };
  });
  corretores.sort((a, b) => a.nome.localeCompare(b.nome));

  // Autoteste do webhook: um evento neutro com o segredo. 200 = a function
  // está publicada e o segredo bate; o evento é ignorado (não grava nada).
  let webhookTeste: { status: number; ok: boolean } | null = null;
  if (webhookSecret) {
    try {
      const r = await fetch(`${url}/functions/v1/tcplus-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": webhookSecret },
        body: JSON.stringify({ event: "crm-diagnostico" }),
        signal: AbortSignal.timeout(10_000),
      });
      webhookTeste = { status: r.status, ok: r.ok };
      await r.body?.cancel();
    } catch {
      webhookTeste = { status: 0, ok: false };
    }
  }
  const webhookUrl = `${url}/functions/v1/tcplus-webhook`;

  return json({
    ok: true,
    ambiente: {
      base_url: amb.baseUrl,
      auth_mode: amb.authMode,
      token_gestor_configurado: !!tokenGestor,
      webhook_secret_configurado: !!webhookSecret,
    },
    gestor: {
      ok: !!cfg,
      base_url_funcional: cfg?.baseUrl ?? null,
      // Se só o host padrão respondeu, o configurado está errado (ou vazio).
      sugerir_base_url: !!cfg && cfg.baseUrl !== amb.baseUrl ? cfg.baseUrl : null,
      usuario: me ? { id: texto(me.id), nome: texto(me.name), email: texto(me.email) } : null,
      tentativas,
    },
    campanhas,
    campanha_unica: campanhaUnica
      ? {
          id: campanhaUnica,
          nome: campanhas.find((c) => c.id === campanhaUnica)?.nome ?? null,
          existe: campanhas.length === 0 ? null : campanhas.some((c) => c.id === campanhaUnica),
        }
      : null,
    agentes_3c: agentes.length,
    agentes_sem_corretor: agentes
      .filter((a) => !a.email || !perfis.has(a.email))
      .map((a) => a.nome ?? a.email ?? `#${a.id}`),
    corretores,
    webhook: {
      // Com o segredo só para o admin (é quem cola no 3C Plus).
      url: ehAdmin && webhookSecret ? `${webhookUrl}?secret=${webhookSecret}` : webhookUrl,
      url_com_segredo: ehAdmin && !!webhookSecret,
      autoteste: webhookTeste,
      ultimo_evento_em: texto(ultimaChamada.data?.atualizado_em),
    },
  });
}

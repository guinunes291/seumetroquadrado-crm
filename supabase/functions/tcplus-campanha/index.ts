// Discador automático via campanha do 3C Plus: sobe a fila de leads do
// corretor como LISTA DE MAILING na campanha dedicada dele e loga o agente
// na campanha — o discador do 3C Plus liga sozinho e só entrega ao agente
// quem atende. Docs: docs/integracoes/3cplus-discador.md.
//
// Body:
//   { acao: "iniciar", lead_ids: string[] }
//     -> higiene (logout + apaga listas anteriores do CRM na campanha), cria
//        uma lista nova, sobe o lote (mailing_sync.json), garante peso >= 1 e
//        faz o login do agente na campanha. Devolve `list_id` — os lotes
//        seguintes e o "parar" o usam. Até MAX_LEADS_POR_LOTE por chamada.
//   { acao: "adicionar", lead_ids: string[], list_id: string }
//     -> SÓ sobe mais um lote na lista da sessão (o front fatia a base
//        completa em lotes de 100: o primeiro "iniciar", o resto "adicionar").
//   { acao: "parar", limpar?: boolean }
//     -> logout do agente (+ apaga as listas do CRM na campanha se limpar).
//
// Dois tokens, dois papéis (regra do 3C Plus):
//   * TCPLUS_API_TOKEN (gestor, secret) — cria lista, sobe mailing, ajusta
//     peso, apaga lista: operações administrativas da campanha.
//   * token do AGENTE (telefonia_agentes.api_token, lido pela service_role)
//     — login/logout na campanha: só o próprio agente pode.
//
// A fila é lida com o JWT do corretor — a RLS garante que só a carteira
// dele entra; opt-out, lixeira e sem telefone são descartados aqui de novo
// (defesa em camadas). O `identifier` de cada contato é o UUID do lead: o
// webhook casa o CallHistory ao lead por ele, sem depender do telefone.
//
// Secrets: TCPLUS_API_TOKEN (obrigatório), TCPLUS_BASE_URL / TCPLUS_AUTH_MODE
// (opcionais), SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { comCapturaDeErro } from "../_shared/error-tracking.ts";
import {
  TCPLUS_BASE_URL_PADRAO,
  mensagemDeErroTcplus,
  tcplusRequest,
  toTcplusNumero,
  type TcplusAuthMode,
  type TcplusConfig,
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

const MAX_LEADS_POR_LOTE = 100;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** `{data:{...}}` ou o próprio objeto — o 3C Plus envelopa em `data`. */
function dados(body: unknown): Obj {
  if (isObj(body) && isObj(body.data)) return body.data;
  return isObj(body) ? body : {};
}

Deno.serve((req: Request) => comCapturaDeErro("tcplus-campanha", () => handleRequest(req)));

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  let body: { acao?: string; lead_ids?: unknown; list_id?: unknown; limpar?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (body.acao !== "iniciar" && body.acao !== "adicionar" && body.acao !== "parar") {
    return json({ error: "acao_invalida" }, 400);
  }

  const tokenGestor = (Deno.env.get("TCPLUS_API_TOKEN") ?? "").trim();
  if (!tokenGestor) return json({ error: "tcplus_nao_configurado" }, 503);
  const baseUrl = Deno.env.get("TCPLUS_BASE_URL") ?? TCPLUS_BASE_URL_PADRAO;
  const authMode: TcplusAuthMode =
    Deno.env.get("TCPLUS_AUTH_MODE") === "query" ? "query" : "bearer";

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

  // Vínculo do corretor no 3C Plus (service_role: o token não tem SELECT
  // para o app). Só a linha do usuário autenticado.
  const { data: agente } = await admin
    .from("telefonia_agentes")
    .select("api_token, campaign_id")
    .eq("user_id", uid)
    .maybeSingle();
  const tokenAgente = ((agente?.api_token as string | null) ?? "").trim();
  const campaignId = ((agente?.campaign_id as string | null) ?? "").trim();
  if (!campaignId) return json({ error: "campanha_nao_configurada" }, 422);
  if (!tokenAgente) return json({ error: "token_nao_configurado" }, 422);

  const gestor: TcplusConfig = { baseUrl, token: tokenGestor, authMode };
  const agenteCfg: TcplusConfig = { baseUrl, token: tokenAgente, authMode };
  const base = `/campaigns/${encodeURIComponent(campaignId)}`;

  // Marcador das listas que o CRM cria nesta campanha PARA ESTE corretor:
  // a higiene e o "parar" apagam só o que é nosso, sem tocar em listas
  // subidas pela gestão no painel do 3C Plus.
  const marcador = `[crm:${uid.slice(0, 8)}]`;
  async function listasDoCrm(): Promise<Array<{ id: string; name: string }>> {
    const r = await tcplusRequest(gestor, "GET", `${base}/lists`, { qs: { per_page: "200" } });
    if (!r.ok) return [];
    // A listagem vem como `{data:[...]}` (paginada) ou como array puro.
    const d = dados(r.body);
    const linhas: unknown[] = Array.isArray(r.body)
      ? r.body
      : Array.isArray(d.data)
        ? d.data
        : Array.isArray(d)
          ? (d as unknown[])
          : [];
    return linhas
      .filter(isObj)
      .map((l) => ({ id: String(l.id ?? ""), name: String(l.name ?? "") }))
      .filter((l) => l.id && l.name.includes(marcador));
  }
  async function apagarListasDoCrm(): Promise<number> {
    let apagadas = 0;
    for (const lista of await listasDoCrm()) {
      const r = await tcplusRequest(gestor, "DELETE", `${base}/lists/${lista.id}`);
      if (r.ok) apagadas++;
    }
    return apagadas;
  }

  // ---- parar ----------------------------------------------------------------
  if (body.acao === "parar") {
    // Logout de agente já deslogado devolve erro — é sucesso do ponto de
    // vista do corretor: o cockpit fecha e a limpeza roda mesmo assim.
    const logout = await tcplusRequest(agenteCfg, "POST", "/agent/logout");
    let apagadas: number | null = null;
    if (body.limpar === true) apagadas = await apagarListasDoCrm();
    return json({
      ok: true,
      parada: true,
      logout: logout.ok ? "deslogado" : `ja_deslogado_ou_recusado: ${mensagemDeErroTcplus(logout)}`,
      listas_apagadas: apagadas,
    });
  }

  // ---- iniciar / adicionar --------------------------------------------------
  const adicionar = body.acao === "adicionar";

  // Guarda de campanha COMPARTILHADA: o discador entrega as chamadas a
  // QUALQUER agente logado na campanha — o lead do corretor A cairia no
  // corretor B, e a higiene de um apagaria a lista do outro. Recusar alto e
  // cedo é melhor do que corromper em silêncio. (Service role só para esta
  // contagem: a RLS não deixa um corretor enxergar o vínculo dos outros.)
  const { count: compartilhada } = await admin
    .from("telefonia_agentes")
    .select("user_id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .neq("user_id", uid);
  if ((compartilhada ?? 0) > 0) return json({ error: "campanha_compartilhada" }, 409);

  const leadIds = Array.isArray(body.lead_ids)
    ? (body.lead_ids.filter((v) => typeof v === "string") as string[]).slice(0, MAX_LEADS_POR_LOTE)
    : [];
  if (leadIds.length === 0) return json({ error: "missing_lead_ids" }, 400);

  // Leitura com a RLS do corretor: lead fora da carteira simplesmente não
  // volta. Opt-out/lixeira caem aqui mesmo que o front tenha deixado passar.
  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, nome, telefone, projeto_nome")
    .in("id", leadIds)
    .eq("na_lixeira", false)
    .is("deleted_at", null)
    .eq("opt_out", false);
  if (leadsErr) return json({ error: "leads_query_failed", detail: leadsErr.message }, 500);

  const discaveis = (leads ?? [])
    .map((l) => ({ ...l, numeroTcplus: toTcplusNumero(l.telefone as string | null) }))
    .filter((l): l is typeof l & { numeroTcplus: string } => l.numeroTcplus !== null);
  if (discaveis.length === 0) return json({ error: "nenhum_lead_discavel" }, 422);

  let listId: string;
  let login: string | null = null;
  let listasApagadas = 0;
  if (adicionar) {
    listId = typeof body.list_id === "string" ? body.list_id.trim() : "";
    if (!listId) return json({ error: "missing_list_id" }, 400);
  } else {
    // Higiene do lote: desloga e apaga QUALQUER lista anterior do CRM nesta
    // campanha antes de subir a nova. Sem isso, contatos restantes de uma
    // sessão anterior continuariam sendo discados no próximo login do agente
    // — sem ninguém ter clicado "Iniciar agora". Best-effort.
    await tcplusRequest(agenteCfg, "POST", "/agent/logout");
    listasApagadas = await apagarListasDoCrm();

    const { data: perfil } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", uid)
      .maybeSingle();
    const quando = new Date().toISOString().slice(0, 16).replace("T", " ");
    const nome = `CRM ${(perfil?.nome as string | undefined) ?? "corretor"} ${quando} ${marcador}`;
    const criada = await tcplusRequest(gestor, "POST", `${base}/lists`, { body: { name: nome } });
    if (criada.status === 401 || criada.status === 403) {
      return json(
        { error: "tcplus_token_gestor_invalido", detail: mensagemDeErroTcplus(criada) },
        502,
      );
    }
    if (criada.status === 0) return json({ error: "tcplus_indisponivel" }, 502);
    const idCriado = dados(criada.body).id;
    if (!criada.ok || idCriado === undefined || idCriado === null) {
      return json({ error: "tcplus_recusou", detail: mensagemDeErroTcplus(criada) }, 502);
    }
    listId = String(idCriado);
  }

  // Sobe o lote (mailing_sync.json: array de {phone, identifier, data}). O
  // 3C Plus responde com importados/filtrados — filtrado NÃO é erro nosso
  // (número inválido, blacklist, duplicado), mas é reportado.
  const contatos = discaveis.map((l) => ({
    phone: l.numeroTcplus,
    identifier: l.id as string,
    data: {
      nome: (l.nome as string) ?? "(sem nome)",
      ...((l.projeto_nome as string | null) ? { projeto: l.projeto_nome } : {}),
      origem: "CRM Seu Metro Quadrado",
    },
  }));
  const upload = await tcplusRequest(gestor, "POST", `${base}/lists/${listId}/mailing_sync.json`, {
    body: contatos,
    timeoutMs: 30_000,
  });
  if (!upload.ok) {
    if (upload.status === 0) return json({ error: "tcplus_indisponivel" }, 502);
    return json({ error: "tcplus_recusou", detail: mensagemDeErroTcplus(upload) }, 502);
  }
  const resultado = dados(upload.body);
  const importados = isObj(resultado.imported) ? resultado.imported : {};
  const filtrados = isObj(resultado.filtered) ? resultado.filtered : {};
  const enviados = Number(importados.quantity ?? contatos.length) || 0;
  const filtradosQtd = Number(filtrados.quantity ?? 0) || 0;
  const detalhesFiltrados = Array.isArray(filtrados.details) ? filtrados.details.slice(0, 10) : [];

  if (!adicionar) {
    // Peso da lista >= 1: lista com peso 0 não é discada (gotcha conhecido).
    await tcplusRequest(gestor, "PUT", `${base}/lists/${listId}`, { body: { weight: 1 } });
    // Login do agente na campanha (modo discador): a partir daqui o 3C Plus
    // disca a lista e entrega ao agente quem atende. Token inválido é erro
    // do corretor; outra recusa (ex.: já logado pelo webphone) é reportada
    // — sem login, nada toca, e o front avisa.
    const r = await tcplusRequest(agenteCfg, "POST", "/agent/login", {
      body: { campaign: Number(campaignId) || campaignId },
    });
    if (r.status === 401 || r.status === 403) {
      return json({ error: "tcplus_token_invalido", detail: mensagemDeErroTcplus(r) }, 422);
    }
    login = r.ok ? "ok" : `falhou: ${mensagemDeErroTcplus(r)}`;
  }

  return json({
    ok: true,
    campanha: campaignId,
    list_id: listId,
    enviados,
    filtrados: filtradosQtd,
    detalhes_filtrados: detalhesFiltrados,
    ignorados: leadIds.length - discaveis.length,
    listas_apagadas: listasApagadas,
    login,
  });
}

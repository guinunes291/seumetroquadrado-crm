// Discador automático via campanha do 3C Plus, sobre o BOLSÃO: a fila do
// discador é tudo que está fora da carteira ativa dos corretores — a base
// SEM dono (docs/ops/bolsao-oportunidades-fatia4.md §1), a mesma população
// de bolsao_v1. A reserva do lote acontece AQUI, com service_role, pela RPC
// discador_bolsao_reservar_v1: o corretor não enxerga (nem deve) o telefone
// de um lead que não é dele; o CRM sobe os números para a campanha do 3C
// Plus, o discador liga, e quem ATENDE entra na carteira de quem falou
// (webhook -> discador_bolsao_assumir_v1). Docs: docs/integracoes/3cplus-discador.md.
//
// Body:
//   { acao: "iniciar", quantidade?: number }
//     -> higiene (logout do agente, apaga as listas do CRM na campanha, solta
//        as reservas anteriores), reserva o lote no Bolsão, cria uma lista
//        nova, sobe o mailing (identifier = UUID do lead), garante peso >= 1
//        e loga o agente na campanha. Devolve `list_id`.
//   { acao: "adicionar", list_id: string, quantidade?: number }
//     -> reserva mais um lote e sobe na MESMA lista (sem higiene).
//   { acao: "reservar", quantidade?: number }
//     -> modo um a um: solta as reservas anteriores e reserva um lote pequeno,
//        sem mailing nem login (o click-to-call disca um por vez). Devolve a
//        sessão ANONIMIZADA (bolsao_discagem_minha_v1: telefone mascarado).
//   { acao: "parar", limpar?: boolean }
//     -> logout do agente, (limpar) apaga as listas do CRM, solta as reservas.
//   { acao: "liberar" }
//     -> só solta as reservas (encerrar o um a um).
//
// Dois tokens, dois papéis (regra do 3C Plus):
//   * TCPLUS_API_TOKEN (gestor, secret) — cria lista, sobe mailing, ajusta
//     peso, apaga lista: operações administrativas da campanha.
//   * token do AGENTE (telefonia_agentes.api_token, lido pela service_role)
//     — login/logout na campanha: só o próprio agente pode.
//
// Secrets: TCPLUS_API_TOKEN (obrigatório para iniciar/adicionar/parar),
// TCPLUS_BASE_URL / TCPLUS_AUTH_MODE (opcionais), SUPABASE_URL /
// SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.

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

// Teto por chamada (a RPC também limita em 500). O lote real vem de
// gestao_config.bolsao.discador_lote (default 200) quando o front não manda.
const MAX_RESERVA = 500;
// Contatos por request de mailing_sync.json.
const CHUNK_MAILING = 100;
// Lote do modo um a um: o corretor disca um por vez; reservar demais tranca
// lead que ninguém vai discar hoje.
const LOTE_UM_A_UM = 20;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** `{data:{...}}` ou o próprio objeto — o 3C Plus envelopa em `data`. */
function dados(body: unknown): Obj {
  if (isObj(body) && isObj(body.data)) return body.data;
  return isObj(body) ? body : {};
}

type LeadReservado = {
  lead_id: string;
  nome: string | null;
  telefone: string | null;
  projeto_nome: string | null;
  status: string;
  dias_parado: number;
};

const ACOES = new Set(["iniciar", "adicionar", "reservar", "parar", "liberar"]);

Deno.serve((req: Request) => comCapturaDeErro("tcplus-campanha", () => handleRequest(req)));

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  let body: { acao?: string; quantidade?: unknown; list_id?: unknown; limpar?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const acao = body.acao ?? "";
  if (!ACOES.has(acao)) return json({ error: "acao_invalida" }, 400);
  const precisaGestor = acao === "iniciar" || acao === "adicionar" || acao === "parar";

  const tokenGestor = (Deno.env.get("TCPLUS_API_TOKEN") ?? "").trim();
  if (precisaGestor && !tokenGestor) return json({ error: "tcplus_nao_configurado" }, 503);
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

  // ---- liberar: só solta as reservas (encerrar o um a um) -------------------
  if (acao === "liberar") {
    const { data: n } = await admin.rpc("discador_bolsao_liberar_v1", { _corretor: uid });
    return json({ ok: true, liberadas: Number(n ?? 0) });
  }

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

  const quantidade =
    typeof body.quantidade === "number" && Number.isFinite(body.quantidade)
      ? Math.min(Math.max(Math.floor(body.quantidade), 1), MAX_RESERVA)
      : null;

  // Reserva no Bolsão (service_role): devolve o telefone inteiro — nunca
  // sai desta function sem máscara.
  async function reservar(
    modo: "campanha" | "um_a_um",
    qtd: number | null,
    listId: string | null,
  ): Promise<{ leads: LeadReservado[]; erro: string | null }> {
    const { data, error } = await admin.rpc("discador_bolsao_reservar_v1", {
      _corretor: uid,
      _quantidade: qtd,
      _modo: modo,
      _campaign_id: campaignId,
      _list_id: listId,
    });
    if (error) return { leads: [], erro: error.message };
    return { leads: (data as LeadReservado[] | null) ?? [], erro: null };
  }
  async function liberar(listId: string | null = null): Promise<number> {
    const { data } = await admin.rpc("discador_bolsao_liberar_v1", {
      _corretor: uid,
      _list_id: listId,
    });
    return Number(data ?? 0);
  }
  // A sessão como o corretor a vê: anonimizada (RPC com o JWT dele).
  async function minhaSessao(): Promise<unknown[]> {
    const { data } = await supabase.rpc("bolsao_discagem_minha_v1");
    return (data as unknown[] | null) ?? [];
  }

  // ---- reservar: modo um a um ------------------------------------------------
  if (acao === "reservar") {
    await liberar();
    const { leads, erro } = await reservar("um_a_um", quantidade ?? LOTE_UM_A_UM, null);
    if (erro) return json({ error: "reserva_falhou", detail: erro }, 500);
    if (leads.length === 0) return json({ error: "bolsao_vazio" }, 422);
    return json({ ok: true, reservados: leads.length, sessao: await minhaSessao() });
  }

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
  if (acao === "parar") {
    // Logout de agente já deslogado devolve erro — é sucesso do ponto de
    // vista do corretor: o cockpit fecha e a limpeza roda mesmo assim.
    const logout = await tcplusRequest(agenteCfg, "POST", "/agent/logout");
    let apagadas: number | null = null;
    if (body.limpar === true) apagadas = await apagarListasDoCrm();
    const liberadas = await liberar();
    return json({
      ok: true,
      parada: true,
      logout: logout.ok ? "deslogado" : `ja_deslogado_ou_recusado: ${mensagemDeErroTcplus(logout)}`,
      listas_apagadas: apagadas,
      reservas_liberadas: liberadas,
    });
  }

  // ---- iniciar / adicionar --------------------------------------------------
  const adicionar = acao === "adicionar";

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

  let listId: string;
  let listasApagadas = 0;
  let reservasLiberadas = 0;
  if (adicionar) {
    listId = typeof body.list_id === "string" ? body.list_id.trim() : "";
    if (!listId) return json({ error: "missing_list_id" }, 400);
  } else {
    // Higiene do lote: desloga, apaga QUALQUER lista anterior do CRM nesta
    // campanha e solta as reservas antes de montar a nova. Sem isso,
    // contatos restantes de uma sessão anterior continuariam sendo discados
    // no próximo login do agente — sem ninguém ter clicado "Iniciar agora".
    await tcplusRequest(agenteCfg, "POST", "/agent/logout");
    listasApagadas = await apagarListasDoCrm();
    reservasLiberadas = await liberar();

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

  // O lote sai do Bolsão, já reservado para este corretor/lista.
  const { leads, erro: erroReserva } = await reservar("campanha", quantidade, listId);
  if (erroReserva) return json({ error: "reserva_falhou", detail: erroReserva }, 500);
  const discaveis = leads
    .map((l) => ({ ...l, numeroTcplus: toTcplusNumero(l.telefone) }))
    .filter((l): l is typeof l & { numeroTcplus: string } => l.numeroTcplus !== null);
  if (discaveis.length === 0) {
    // Nada para discar: solta o que porventura reservou e avisa.
    await liberar(listId);
    return json({ error: "bolsao_vazio" }, 422);
  }

  // Sobe o lote (mailing_sync.json: array de {phone, identifier, data}), em
  // fatias. O 3C Plus responde com importados/filtrados — filtrado NÃO é
  // erro nosso (número inválido, blacklist, duplicado), mas é reportado.
  const contatos = discaveis.map((l) => ({
    phone: l.numeroTcplus,
    identifier: l.lead_id,
    data: {
      nome: l.nome ?? "(sem nome)",
      ...(l.projeto_nome ? { projeto: l.projeto_nome } : {}),
      origem: "Bolsão CRM Seu Metro Quadrado",
      parado_ha_dias: l.dias_parado,
    },
  }));
  let enviados = 0;
  let filtradosQtd = 0;
  const detalhesFiltrados: unknown[] = [];
  for (let i = 0; i < contatos.length; i += CHUNK_MAILING) {
    const fatia = contatos.slice(i, i + CHUNK_MAILING);
    const upload = await tcplusRequest(
      gestor,
      "POST",
      `${base}/lists/${listId}/mailing_sync.json`,
      {
        body: fatia,
        timeoutMs: 30_000,
      },
    );
    if (!upload.ok) {
      // Primeiro lote recusado = nada subiu: erro de verdade (e solta a
      // reserva). Lote seguinte recusado: o que subiu continua valendo.
      if (i === 0) {
        await liberar(listId);
        if (upload.status === 0) return json({ error: "tcplus_indisponivel" }, 502);
        return json({ error: "tcplus_recusou", detail: mensagemDeErroTcplus(upload) }, 502);
      }
      filtradosQtd += fatia.length;
      detalhesFiltrados.push({ motive: `upload_recusado: ${mensagemDeErroTcplus(upload)}` });
      continue;
    }
    const resultado = dados(upload.body);
    const importados = isObj(resultado.imported) ? resultado.imported : {};
    const filtrados = isObj(resultado.filtered) ? resultado.filtered : {};
    enviados += Number(importados.quantity ?? fatia.length) || 0;
    filtradosQtd += Number(filtrados.quantity ?? 0) || 0;
    if (Array.isArray(filtrados.details)) detalhesFiltrados.push(...filtrados.details);
  }

  let login: string | null = null;
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
    reservados: leads.length,
    enviados,
    filtrados: filtradosQtd,
    detalhes_filtrados: detalhesFiltrados.slice(0, 10),
    listas_apagadas: listasApagadas,
    reservas_liberadas: reservasLiberadas,
    login,
  });
}

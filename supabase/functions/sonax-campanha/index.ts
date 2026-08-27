// Discador automático via campanha do Sonax em POOL COMPARTILHADO: a fila é
// TODA a base do CRM em Aguardando atendimento (não só a carteira do
// corretor). O servidor seleciona e RESERVA cada lote (anti-colisão entre
// corretores), enfileira na campanha do corretor e dá play — o PABX disca
// sozinho e SÓ conecta ao ramal quem atende. Quem atende aparece no pop-up do
// CRM; a tabulação de interesse é que move o lead para a carteira do corretor
// (sonax-tabulacoes). Docs: docs/integracoes/sonax-discador.md.
//
// Body:
//   { acao: "iniciar" }   -> higiene do lote, reserva + enfileira o 1º lote do
//     pool (até MAX_LEADS_POR_LOTE), garante o login do atendente e dá
//     play_campanha. Devolve restante_pool para o front continuar.
//   { acao: "adicionar" } -> reserva + enfileira o PRÓXIMO lote do pool na
//     campanha já em curso (sem higiene — ela apagaria os lotes anteriores).
//     Dá play de novo no fim (best-effort) caso a fila tenha esgotado.
//   { acao: "parar", limpar?: boolean } -> stop_campanha (+ limpa contatos
//     restantes se limpar=true) e devolve as reservas deste corretor ao pool.
//
// Requer JWT (verify_jwt = true) para autenticar o corretor; a seleção do
// pool usa a service role (a RLS não deixa um corretor ler a base alheia — a
// leitura aqui é restrita ao recorte fixo do pool: aguardando_atendimento,
// sem lixeira/deleted/opt-out, com telefone).
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   SONAX_TOKEN       (obrigatório) — token de ativação da API v1
//   SONAX_ID_CLIENTE  (obrigatório) — id do cliente Sonax (dados de ativação)
//   SONAX_API_URL     (opcional) — default
//     https://api.sonax.net.br/a2billing_v2/admin/Public/dbdial_webapi.php
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY — automáticas

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

const MAX_LEADS_POR_LOTE = 100;
const CONCORRENCIA = 4;

type AcaoSonax = { ok: boolean; resposta: string };

Deno.serve((req: Request) => comCapturaDeErro("sonax-campanha", () => handleRequest(req)));

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  // lead_ids de versões antigas do front é aceito e IGNORADO: a fila agora é
  // o pool do CRM, selecionado aqui no servidor.
  let body: { acao?: string; limpar?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (body.acao !== "iniciar" && body.acao !== "adicionar" && body.acao !== "parar") {
    return json({ error: "acao_invalida" }, 400);
  }

  const token = Deno.env.get("SONAX_TOKEN");
  const idCliente = Deno.env.get("SONAX_ID_CLIENTE");
  if (!token || !idCliente) return json({ error: "sonax_nao_configurado" }, 503);
  const apiUrl =
    Deno.env.get("SONAX_API_URL") ??
    "https://api.sonax.net.br/a2billing_v2/admin/Public/dbdial_webapi.php";

  // Uma ação v1 do Sonax: GET com acao + credenciais + parâmetros. Recusa
  // (parâmetro errado / sem resultados) volta HTTP 404 — contrato da API.
  async function acaoSonax(acao: string, params: Record<string, string>): Promise<AcaoSonax> {
    const qs = new URLSearchParams({ acao, id_cliente: idCliente!, token: token!, ...params });
    try {
      const resp = await fetch(`${apiUrl}?${qs}`, { signal: AbortSignal.timeout(15_000) });
      const texto = (await resp.text()).slice(0, 300);
      return { ok: resp.ok, resposta: texto || `http_${resp.status}` };
    } catch (e) {
      return { ok: false, resposta: e instanceof Error ? e.message : String(e) };
    }
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "server_config" }, 503);
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Service role: seleção/reserva do pool e contagem da guarda de campanha —
  // a RLS não deixa um corretor enxergar a base (nem os perfis) dos outros.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);
  const uid = userData.user.id;

  const { data: contaAtiva, error: contaError } = await supabase.rpc("conta_atual_ativa");
  if (contaError || !contaAtiva) return json({ error: "account_inactive" }, 403);

  const { data: prof } = await supabase
    .from("profiles")
    .select("ramal_sonax, sonax_id_atendente, sonax_id_campanha")
    .eq("id", uid)
    .maybeSingle();
  const ramal = ((prof?.ramal_sonax as string | null) ?? "").trim();
  const idAtendente = ((prof?.sonax_id_atendente as string | null) ?? "").trim();
  const idCampanha = ((prof?.sonax_id_campanha as string | null) ?? "").trim();
  if (!idCampanha) return json({ error: "campanha_nao_configurada" }, 422);

  // ---- parar ----------------------------------------------------------------
  if (body.acao === "parar") {
    // Campanha já parada (fila esgotou sozinha) devolve 404 no contrato v1 —
    // isso é sucesso do ponto de vista do corretor, não recusa: a limpeza
    // segue e o cockpit fecha.
    const stop = await acaoSonax("stop_campanha", { id_campanha: idCampanha });
    let limpeza: AcaoSonax | null = null;
    if (body.limpar === true) {
      limpeza = await acaoSonax("limpa_contatos_campanha", { id_campanha: idCampanha });
    }
    // Devolve ao pool as reservas deste corretor — parar significa "não vou
    // trabalhar esses leads agora"; outro corretor pode discá-los.
    const { error: reservaErr } = await admin
      .from("leads")
      .update({ discador_reservado_por: null, discador_reservado_em: null })
      .eq("discador_reservado_por", uid);
    if (reservaErr) console.error("sonax-campanha limpar_reservas:", reservaErr);
    return json({
      ok: true,
      parada: true,
      stop: stop.ok ? "parada" : `ja_parada_ou_recusada: ${stop.resposta}`,
      limpeza: limpeza?.ok ?? null,
    });
  }

  // ---- iniciar / adicionar --------------------------------------------------
  const adicionar = body.acao === "adicionar";
  if (!ramal) return json({ error: "ramal_nao_configurado" }, 422);

  // Guarda de campanha COMPARTILHADA: dois corretores na mesma campanha se
  // atropelam — a higiene do lote de um APAGA a fila do outro e a fila
  // entrega chamadas a qualquer ramal logado. Recusar alto e cedo é melhor
  // do que corromper em silêncio.
  const { count: compartilhada } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("sonax_id_campanha", idCampanha)
    .neq("id", uid);
  if ((compartilhada ?? 0) > 0) {
    return json({ error: "campanha_compartilhada" }, 409);
  }

  // ---- POOL: toda a base em Aguardando atendimento --------------------------
  // A fila não é a carteira do corretor: é o pool inteiro do CRM que ainda
  // aguarda primeiro atendimento. Candidatos LIVRES (sem reserva, ou com
  // reserva expirada pelo TTL), quem espera há mais tempo primeiro. O lote é
  // RESERVADO antes de enfileirar — dois corretores discando ao mesmo tempo
  // nunca pegam o mesmo lead; lead discado e não trabalhado volta ao pool
  // sozinho quando a reserva expira.
  const POOL_TTL_HORAS = 12;
  const corte = new Date(Date.now() - POOL_TTL_HORAS * 3_600_000).toISOString();
  const livre = `discador_reservado_em.is.null,discador_reservado_em.lt.${corte}`;
  const { data: candidatos, error: poolErr } = await admin
    .from("leads")
    .select("id, nome, telefone, projeto_nome")
    .eq("status", "aguardando_atendimento")
    .eq("na_lixeira", false)
    .is("deleted_at", null)
    .eq("opt_out", false)
    .or(livre)
    .order("ultima_interacao", { ascending: true, nullsFirst: true })
    .limit(MAX_LEADS_POR_LOTE * 2);
  if (poolErr) return json({ error: "pool_query_failed", detail: poolErr.message }, 500);

  const discaveis = (candidatos ?? [])
    .map((l) => ({ ...l, numeroSonax: toSonaxNumero(l.telefone as string | null) }))
    .filter((l): l is typeof l & { numeroSonax: string } => l.numeroSonax !== null)
    .slice(0, MAX_LEADS_POR_LOTE);
  if (discaveis.length === 0) {
    // Pool esgotado: no iniciar é aviso ao corretor; no adicionar encerra o
    // laço do front normalmente.
    if (adicionar) return json({ ok: true, enviados: 0, falhas: 0, restante_pool: 0 });
    return json({ error: "pool_vazio" }, 422);
  }

  // Reserva com RECHECK da condição de livre: se outro corretor reservou no
  // meio tempo, o UPDATE não pega a linha e o lead sai deste lote.
  const { data: reservados, error: claimErr } = await admin
    .from("leads")
    .update({ discador_reservado_por: uid, discador_reservado_em: new Date().toISOString() })
    .in(
      "id",
      discaveis.map((l) => l.id as string),
    )
    .or(livre)
    .select("id");
  if (claimErr) return json({ error: "claim_failed", detail: claimErr.message }, 500);
  const reservadosSet = new Set((reservados ?? []).map((r) => r.id as string));
  const lote = discaveis.filter((l) => reservadosSet.has(l.id as string));
  if (lote.length === 0) {
    if (adicionar) return json({ ok: true, enviados: 0, falhas: 0, restante_pool: 0 });
    return json({ error: "pool_vazio" }, 422);
  }

  // Higiene do lote: para a discagem e limpa QUALQUER sobra de sessões
  // anteriores ANTES de enfileirar. Sem isso, contatos restantes ficam na
  // campanha em play e o PABX volta a discá-los sozinho no próximo login do
  // agente — sem ninguém ter clicado "Iniciar agora". Best-effort: stop de
  // campanha já parada devolve 404 e segue. Em "adicionar" a higiene é
  // PULADA — ela apagaria os lotes anteriores da mesma sessão.
  if (!adicionar) {
    await acaoSonax("stop_campanha", { id_campanha: idCampanha });
    await acaoSonax("limpa_contatos_campanha", { id_campanha: idCampanha });
  }

  // Login do atendente na fila (best-effort: se já está logado, o Sonax só
  // devolve o status — não derruba o fluxo). Só no primeiro lote.
  let loginAtendente: string | null = null;
  if (!adicionar && idAtendente) {
    const login = await acaoSonax("login", { id_atendente: idAtendente, ramal });
    loginAtendente = login.resposta;
  }

  // Enfileira cada lead na campanha (acao=chamada), com concorrência limitada
  // para não estourar a API. O `script` aparece na tela do agente ao atender.
  let enviados = 0;
  const falhas: Array<{ lead_id: string; detalhe: string }> = [];
  for (let i = 0; i < lote.length; i += CONCORRENCIA) {
    const fatia = lote.slice(i, i + CONCORRENCIA);
    const resultados = await Promise.all(
      fatia.map((l) =>
        acaoSonax("chamada", {
          id_contato: l.id as string,
          numero: l.numeroSonax,
          id_campanha: idCampanha,
          prioridade: "1",
          script:
            `Lead CRM: ${(l.nome as string) ?? "(sem nome)"}` +
            ((l.projeto_nome as string | null) ? ` — ${l.projeto_nome}` : ""),
        }).then((r) => ({ lead: l, r })),
      ),
    );
    for (const { lead, r } of resultados) {
      if (r.ok) enviados++;
      else falhas.push({ lead_id: lead.id as string, detalhe: r.resposta });
    }
  }

  // Lead reservado mas recusado pelo Sonax volta ao pool na hora — sem isso
  // ficaria travado até o TTL sem ninguém ter discado.
  if (falhas.length > 0) {
    const { error: soltarErr } = await admin
      .from("leads")
      .update({ discador_reservado_por: null, discador_reservado_em: null })
      .in(
        "id",
        falhas.map((f) => f.lead_id),
      );
    if (soltarErr) console.error("sonax-campanha soltar_falhas:", soltarErr);
  }

  if (enviados === 0) {
    return json({ error: "sonax_recusou", detail: falhas[0]?.detalhe ?? "fila_vazia" }, 502);
  }

  // Play: o discador começa a ligar. Quem atender cai na fila -> ramal.
  // Também roda no "adicionar" (best-effort): se a fila esgotou entre lotes e
  // a campanha parou sozinha, o play religa; se já está tocando, o Sonax só
  // recusa e segue.
  const play = await acaoSonax("play_campanha", { id_campanha: idCampanha });

  // Quanto ainda há no pool: o front continua chamando "adicionar" até zerar.
  const { count: restantePool } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("status", "aguardando_atendimento")
    .eq("na_lixeira", false)
    .is("deleted_at", null)
    .eq("opt_out", false)
    .or(livre);

  return json({
    ok: true,
    campanha: idCampanha,
    enviados,
    falhas: falhas.length,
    restante_pool: restantePool ?? 0,
    login_atendente: loginAtendente,
    play: play.ok ? "ok" : `falhou: ${play.resposta}`,
  });
}

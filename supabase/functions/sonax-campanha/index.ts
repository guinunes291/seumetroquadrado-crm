// Discador automático via campanha do Sonax: enfileira leads na campanha do
// corretor e dá play — o PABX disca a fila sozinho e SÓ conecta ao ramal quem
// atende (a campanha, criada no painel Sonax, aponta para a fila do corretor
// com descarte de caixa postal). Docs: docs/integracoes/sonax-discador.md.
//
// Body:
//   { acao: "iniciar", lead_ids: string[] }   -> higiene do lote, insere cada
//     lead na campanha (acao=chamada), garante o login do atendente e dá
//     play_campanha. Aceita até MAX_LEADS_POR_LOTE por chamada.
//   { acao: "adicionar", lead_ids: string[] } -> SÓ enfileira mais um lote na
//     campanha já em curso (o front fatia a base completa em lotes de 100 e
//     manda o primeiro como "iniciar" e o resto como "adicionar" — repetir a
//     higiene aqui apagaria os lotes anteriores). Dá play de novo no fim
//     (best-effort) para o caso de a fila ter esgotado entre lotes.
//   { acao: "parar", limpar?: boolean }       -> stop_campanha (+ limpa
//     contatos restantes da fila se limpar=true).
//
// Requer JWT (verify_jwt = true). Os leads são lidos com o client do próprio
// corretor — a RLS garante que só a carteira dele entra na fila; opt-out,
// lixeira e sem telefone são descartados aqui de novo (defesa em camadas).
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   SONAX_TOKEN       (obrigatório) — token de ativação da API v1
//   SONAX_ID_CLIENTE  (obrigatório) — id do cliente Sonax (dados de ativação)
//   SONAX_API_URL     (opcional) — default
//     https://api.sonax.net.br/a2billing_v2/admin/Public/dbdial_webapi.php
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

const MAX_LEADS_POR_LOTE = 100;
const CONCORRENCIA = 4;

type AcaoSonax = { ok: boolean; resposta: string };

Deno.serve((req: Request) => comCapturaDeErro("sonax-campanha", () => handleRequest(req)));

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  let body: { acao?: string; lead_ids?: unknown; limpar?: boolean };
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
  // do que corromper em silêncio. (Service role só para esta contagem: a RLS
  // não deixa um corretor enxergar o perfil dos outros.)
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { count: compartilhada } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("sonax_id_campanha", idCampanha)
      .neq("id", uid);
    if ((compartilhada ?? 0) > 0) {
      return json({ error: "campanha_compartilhada" }, 409);
    }
  }
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
    .map((l) => ({ ...l, numeroSonax: toSonaxNumero(l.telefone as string | null) }))
    .filter((l): l is typeof l & { numeroSonax: string } => l.numeroSonax !== null);
  if (discaveis.length === 0) return json({ error: "nenhum_lead_discavel" }, 422);

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
  for (let i = 0; i < discaveis.length; i += CONCORRENCIA) {
    const lote = discaveis.slice(i, i + CONCORRENCIA);
    const resultados = await Promise.all(
      lote.map((l) =>
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

  if (enviados === 0) {
    return json({ error: "sonax_recusou", detail: falhas[0]?.detalhe ?? "fila_vazia" }, 502);
  }

  // Play: o discador começa a ligar. Quem atender cai na fila -> ramal.
  // Também roda no "adicionar" (best-effort): se a fila esgotou entre lotes e
  // a campanha parou sozinha, o play religa; se já está tocando, o Sonax só
  // recusa e segue.
  const play = await acaoSonax("play_campanha", { id_campanha: idCampanha });

  return json({
    ok: true,
    campanha: idCampanha,
    enviados,
    ignorados: leadIds.length - discaveis.length,
    falhas: falhas.length,
    login_atendente: loginAtendente,
    play: play.ok ? "ok" : `falhou: ${play.resposta}`,
  });
}

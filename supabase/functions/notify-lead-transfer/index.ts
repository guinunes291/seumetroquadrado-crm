// Notifica via WhatsApp (Z-API) o corretor quando um lead é transferido
// manualmente — QUALQUER origem. Requer JWT (verify_jwt default = true).
//
// Body: { lead_id: string, corretor_id: string, contexto?: "sdr" }
//    ou { lead_ids: string[], corretor_id: string }   ← transferência em LOTE
//
// LOTE (2026-09-17): a UI de transferência em massa mandava uma chamada por
// lead, e o corretor recebia N mensagens em sequência — rajada que o WhatsApp
// trata como spam e que já custa bloqueio de instância. Agora o lote chega
// numa lista só e sai UMA mensagem de resumo por corretor, qualquer que seja
// o tamanho da seleção. A única regra de elegibilidade é a RLS do chamador:
// quem não enxerga o lead não notifica sobre ele.
//
// ORIGEM (2026-09-17): o aviso valia só para origem=facebook — herança de
// quando o Facebook Ads era a única entrada com roleta. Lead transferido é
// lead que mudou de dono, venha de onde vier: portal, indicação, importação
// ou campanha. O corretor precisa saber em todos os casos, então o filtro
// saiu dos dois caminhos (individual e lote).
//
// contexto "sdr" (2026-09-04): entrega feita pelo SDR (visita agendada ou
// entrega manual). Vale para qualquer origem e a mensagem traz o que o
// corretor precisa para assumir: visita marcada, renda, projeto e o resumo
// da qualificação — nunca o telefone do cliente (LGPD, regra da casa).
//
// Secrets reutilizadas: ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, APP_BASE_URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  LOTE_CHUNK_LEITURA,
  LOTE_MAX_IDS,
  mensagemTransferenciaIndividual,
  mensagemTransferenciaLote,
  type LeadResumo,
} from "../_shared/notificacao-transferencia.ts";

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

function toZapiPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11) d = "55" + d;
  return d;
}

function mensagemSdr(opts: {
  nomeLead: string;
  projeto: string | null;
  renda: string | null;
  link: string;
  sdr: {
    sdrNome: string | null;
    visita: string | null;
    local: string | null;
    tipoRenda: string | null;
    fgts: boolean | null;
    resumo: string | null;
  };
}): string {
  return (
    `🔥 *Lead do SDR para você!*\n\n` +
    `👤 Nome: ${opts.nomeLead}\n` +
    `🏢 Projeto: ${opts.projeto ?? "—"}\n` +
    (opts.sdr.visita
      ? `📅 Visita: ${opts.sdr.visita}${opts.sdr.local ? ` · ${opts.sdr.local}` : ""}\n`
      : `📌 Entrega manual (sem visita marcada)\n`) +
    `💰 Renda: ${opts.renda ?? "—"}${opts.sdr.tipoRenda ? ` (${opts.sdr.tipoRenda})` : ""}\n` +
    `🏦 FGTS: ${opts.sdr.fgts == null ? "—" : opts.sdr.fgts ? "sim" : "não"}\n` +
    (opts.sdr.resumo ? `📝 ${opts.sdr.resumo.slice(0, 300)}\n` : "") +
    `🙋 SDR: ${opts.sdr.sdrNome ?? "—"}\n\n` +
    `🔗 Abrir no CRM: ${opts.link}`
  );
}

/** Um envio de texto pela Z-API. Chamada ÚNICA por notificação — inclusive no
 *  lote, que é o ponto da mudança. */
async function sendZapi(telefone: string | null | undefined, message: string): Promise<string> {
  const instance = Deno.env.get("ZAPI_INSTANCE_ID");
  const token = Deno.env.get("ZAPI_TOKEN");
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
  if (!instance || !token) return "zapi_nao_configurada";
  const phone = toZapiPhone(telefone);
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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Exige a identidade do chamador. A leitura do lead passa pela RLS deste
  // usuário — sem service_role, sem bypass —, então só é possível notificar
  // sobre leads da própria carteira. Isso fecha o IDOR/vazamento de PII sem
  // exigir papel fixo, preservando o fluxo de roleta (o corretor vira dono do
  // lead antes de a notificação disparar).
  const authorization = req.headers.get("authorization") ?? "";

  let body: {
    lead_id?: string;
    lead_ids?: unknown;
    corretor_id?: string;
    contexto?: string;
    token?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !anonKey) return json({ error: "server_config" }, 503);

  // Chamada interna (banco → pg_net, `_sdr_notificar_corretor`): o banco não
  // guarda chave nenhuma — manda um TOKEN de uso único (sdr_avisos_corretor,
  // 1 h de validade) e esta função, com a service role que recebe do
  // ambiente, consome o token e descobre lead/corretor. O token só existe se
  // o motor gravou a entrega; o lead é relido abaixo com a mesma checagem
  // (corretor_id + sdr_entregue_em). Sempre contexto SDR.
  let leadId = body.lead_id;
  let corretorId = body.corretor_id;
  let contextoSdr = body.contexto === "sdr";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const interna = token.length > 0;

  // Lote: só no caminho por usuário e fora do contexto SDR (a entrega do SDR é
  // sempre um lead de cada vez, com token próprio).
  const loteIds =
    !interna && !contextoSdr && Array.isArray(body.lead_ids)
      ? [
          ...new Set(
            (body.lead_ids as unknown[])
              .filter((id): id is string => typeof id === "string" && id.length > 0)
              .slice(0, LOTE_MAX_IDS),
          ),
        ]
      : [];
  const emLote = loteIds.length > 0;

  if (interna && serviceKey.length === 0) return json({ error: "server_config" }, 503);

  const supabase = createClient(url, interna ? serviceKey : anonKey, {
    global: { headers: { Authorization: interna ? `Bearer ${serviceKey}` : authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (interna) {
    const { data: aviso, error: avisoErr } = await supabase
      .from("sdr_avisos_corretor")
      .update({ consumido_em: new Date().toISOString() })
      .eq("token", token)
      .is("consumido_em", null)
      .gt("expira_em", new Date().toISOString())
      .select("lead_id, corretor_id")
      .maybeSingle();
    if (avisoErr) return json({ error: "token_check_failed" }, 500);
    if (!aviso) return json({ error: "unauthorized", motivo: "token_invalido" }, 401);
    leadId = String((aviso as { lead_id: string }).lead_id);
    corretorId = String((aviso as { corretor_id: string }).corretor_id);
    contextoSdr = true;
  } else {
    // Caminho por usuário: identidade do chamador, leitura sob a RLS dele.
    if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "unauthorized" }, 401);

    const { data: contaAtiva, error: contaError } = await supabase.rpc("conta_atual_ativa");
    if (contaError || !contaAtiva) return json({ error: "account_inactive" }, 403);
  }
  if ((!leadId && !emLote) || !corretorId) return json({ error: "missing_params" }, 400);

  const appUrl = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/+$/, "");

  // ---------------------------------------------------------------------
  // Lote: lê os leads visíveis ao chamador (RLS) e manda UMA mensagem de
  // resumo. Nada de um envio por lead.
  // ---------------------------------------------------------------------
  if (emLote) {
    const elegiveis: LeadResumo[] = [];
    for (let i = 0; i < loteIds.length; i += LOTE_CHUNK_LEITURA) {
      const fatia = loteIds.slice(i, i + LOTE_CHUNK_LEITURA);
      const { data: rows, error: rowsErr } = await supabase
        .from("leads")
        .select("id, nome, projeto_nome, renda_informada")
        .in("id", fatia);
      if (rowsErr) return json({ error: "leads_read_failed" }, 500);
      for (const row of (rows ?? []) as Record<string, unknown>[]) {
        // Leads fora da carteira simplesmente não voltam (RLS) — é a única
        // filtragem que sobra; origem não decide mais quem recebe aviso.
        elegiveis.push({
          nome: (row.nome as string | null) ?? null,
          projeto: (row.projeto_nome as string | null) ?? null,
          renda: (row.renda_informada as string | null) ?? null,
        });
      }
    }
    if (elegiveis.length === 0) {
      return json({ ok: true, skipped: "nenhum_lead_elegivel", leads_notificados: 0 });
    }

    const { data: profLote } = await supabase
      .from("profiles")
      .select("nome,telefone")
      .eq("id", corretorId)
      .maybeSingle();

    const notificacao = await sendZapi(
      profLote?.telefone as string | null | undefined,
      mensagemTransferenciaLote(elegiveis, {
        linkLista: appUrl ? `${appUrl}/leads` : "/leads",
      }),
    );
    return json({ ok: true, notificacao, leads_notificados: elegiveis.length, envios: 1 });
  }

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select(
      contextoSdr
        ? "id, nome, projeto_nome, renda_informada, tipo_renda, usa_fgts, resumo_qualificacao, sdr_id, corretor_id, sdr_entregue_em"
        : "id, nome, projeto_nome, renda_informada",
    )
    .eq("id", leadId)
    .maybeSingle();

  // Lead fora da carteira volta vazio pela RLS — indistinguível de inexistente,
  // então não vaza a existência de leads de outras carteiras.
  if (leadErr || !lead) return json({ error: "lead_not_found" }, 404);
  const leadAny = lead as Record<string, unknown>;
  if (contextoSdr) {
    // Só o próprio SDR dono (ou quem acessa o lead) notifica, e só sobre o
    // corretor que o banco acabou de registrar como dono — nada de avisar
    // terceiros com dados do cliente.
    if (leadAny.corretor_id !== corretorId || !leadAny.sdr_entregue_em) {
      return json({ ok: true, skipped: "sdr_entrega_nao_confirmada" });
    }
  }

  let sdrInfo: Parameters<typeof mensagemSdr>[0]["sdr"] | undefined;
  if (contextoSdr) {
    const [{ data: sdrProf }, { data: visita }] = await Promise.all([
      supabase
        .from("profiles")
        .select("nome")
        .eq("id", String(leadAny.sdr_id ?? ""))
        .maybeSingle(),
      supabase
        .from("agendamentos")
        .select("data_inicio, local")
        .eq("lead_id", leadId)
        .eq("corretor_id", corretorId)
        .in("status", ["agendado", "confirmado", "remarcado"])
        .order("data_inicio", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    const visitaFmt = visita?.data_inicio
      ? new Date(visita.data_inicio as string).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    sdrInfo = {
      sdrNome: (sdrProf?.nome as string | null) ?? null,
      visita: visitaFmt,
      local: (visita?.local as string | null) ?? null,
      tipoRenda: (leadAny.tipo_renda as string | null) ?? null,
      fgts: typeof leadAny.usa_fgts === "boolean" ? (leadAny.usa_fgts as boolean) : null,
      resumo: (leadAny.resumo_qualificacao as string | null) ?? null,
    };
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("nome,telefone")
    .eq("id", corretorId)
    .maybeSingle();

  const dadosMensagem = {
    nomeLead: (lead.nome as string | null) ?? "(sem nome)",
    projeto: (lead.projeto_nome as string | null) ?? null,
    renda: (lead.renda_informada as string | null) ?? null,
    link: appUrl ? `${appUrl}/leads/${lead.id}` : `/leads/${lead.id}`,
  };
  const notificacao = await sendZapi(
    prof?.telefone as string | null | undefined,
    sdrInfo
      ? mensagemSdr({ ...dadosMensagem, sdr: sdrInfo })
      : mensagemTransferenciaIndividual(dadosMensagem),
  );

  return json({ ok: true, notificacao });
});

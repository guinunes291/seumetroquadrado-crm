// Webhook de eventos do 3C Plus (Configurações → Integrações no 3C Plus).
// Dois eventos interessam ao CRM:
//   * call-was-connected        — cliente na linha com o agente (screen pop);
//   * call-history-was-created  — a chamada terminou: status, duração,
//                                 gravação, QUALIFICAÇÃO (tabulação) e o
//                                 mailing_data.identifier (UUID do lead).
// Qualquer outro evento (agent-is-idle, ...) é aceito e ignorado.
//
// Fluxo: valida o secret; extrai a chamada do envelope (parser tolerante em
// _shared/tcplus.ts); resolve o LEAD (identifier → telefone com variantes) e
// o CORRETOR (agent.id → telefonia_agentes; e-mail do agente → profiles;
// linha do click-to-call pendente); grava/atualiza `chamadas` (idempotente
// por sid; a linha que a tcplus-discar criou SEM sid é adotada por número +
// corretor) e ecoa uma interação `ligacao` na timeline no primeiro evento de
// atendimento real. Lead do BOLSÃO (sem dono) que ATENDEU vira um ATENDIDO
// de quem falou (RPC discador_bolsao_atender_v1: aba Atendidos, sem posse —
// o lead segue no Bolsão, discável por outros). A qualificação move o lead
// de etapa na hora, pela RPC oficial transicionar_lead, conforme o
// mapeamento em gestao_config (telefonia_tabulacao_status) — sem polling de
// arquivo; e quando a etapa nova está em
// gestao_config.bolsao.discador_posse_a_partir_de (agendado em diante, por
// default), aí sim o lead entra na carteira de quem avançou
// (discador_bolsao_assumir_v1).
//
// Autenticação: header x-webhook-secret, Authorization: Bearer <secret> OU
// ?secret= na query. A exceção ao P-3 ("nunca secret em query") é
// deliberada: a tela de Integrações do 3C Plus pode não aceitar headers
// customizados. Use um secret exclusivo desta função e o kill-switch
// TCPLUS_ALLOW_QUERY_SECRET=false assim que o header for possível.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   TCPLUS_WEBHOOK_SECRET       (obrigatório)
//   TCPLUS_ALLOW_QUERY_SECRET   (opcional, default "true")
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — injetadas automaticamente
//
// config: verify_jwt = false (supabase/config.toml).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { comCapturaDeErro } from "../_shared/error-tracking.ts";
import {
  classificarDesfecho,
  eventoDeConexao,
  eventoDeHistorico,
  extrairChamadaDoEvento,
  normalizarNome,
  variantesTelefone,
  type ChamadaTcplus,
} from "../_shared/tcplus.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Comparação em tempo constante via digest (não vaza o tamanho nem o prefixo). */
async function secretsIguais(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAIS = new Set(["concluida", "nao_atendida", "falha"]);
const STATUS_ATENDIDA = new Set(["atendida", "falando", "concluida"]);
// Etapas que a qualificação pode acionar. Fechamento e pós-venda nunca são
// automatizados (exigem venda aprovada e papel de gestão).
const ALVOS_VALIDOS = new Set([
  "novo",
  "aguardando_corretor",
  "aguardando_atendimento",
  "aguardando_retorno",
  "qualificacao_corretor",
  "em_atendimento",
  "qualificado",
  "agendado",
  "visita_realizada",
  "proposta_enviada",
  "analise_credito",
  "perdido",
]);
// Janela em que uma linha de click-to-call sem sid ainda pode ser adotada
// pelo evento do 3C Plus (a discagem manual responde 204 sem id).
const JANELA_CLICK2CALL_MS = 2 * 60 * 60 * 1000;

type LinhaChamada = {
  id: string;
  payload: Record<string, unknown>;
  lead_id: string | null;
  corretor_id: string | null;
  status: string;
  direcao: string;
  origem: string;
  tabulacao: string | null;
  provider_call_id: string | null;
};

Deno.serve((req: Request) => comCapturaDeErro("tcplus-webhook", () => handleRequest(req)));

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // Liveness para a validação de URL do painel (sem dado nenhum).
  if (req.method === "GET") return json({ ok: true, servico: "tcplus-webhook" });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const reqUrl = new URL(req.url);
  const secret = Deno.env.get("TCPLUS_WEBHOOK_SECRET");
  const allowQuerySecret =
    (Deno.env.get("TCPLUS_ALLOW_QUERY_SECRET") ?? "true").toLowerCase() !== "false";
  const viaHeader = req.headers.get("x-webhook-secret");
  const viaBearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || null;
  const viaQuery = allowQuerySecret ? reqUrl.searchParams.get("secret") : null;
  const provided = viaHeader ?? viaBearer ?? viaQuery;
  if (!secret || !provided || !(await secretsIguais(provided, secret))) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  // Um evento por request é o normal; um array (ou `{events:[...]}`) também
  // é aceito — cada item é processado e nenhum se perde.
  const eventos: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { events?: unknown }).events)
      ? (body as { events: unknown[] }).events
      : [body];

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const resultados: unknown[] = [];
  for (const evento of eventos) {
    try {
      resultados.push(await processarEvento(supabase, evento));
    } catch (e) {
      console.error("tcplus-webhook evento_falhou:", e);
      resultados.push({ erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return json(
    eventos.length === 1 ? { ok: true, ...(resultados[0] as object) } : { ok: true, resultados },
  );
}

// deno-lint-ignore no-explicit-any
type Db = ReturnType<typeof createClient<any>>;

async function processarEvento(supabase: Db, payload: unknown): Promise<Record<string, unknown>> {
  const c: ChamadaTcplus = extrairChamadaDoEvento(payload);
  const conexao = eventoDeConexao(c.evento);
  const historico = eventoDeHistorico(c.evento);
  if (!conexao && !historico) return { evento: c.evento, ignorado: true };
  if (!c.sid && !c.numero) return { evento: c.evento, erro: "missing_sid_or_numero" };

  const variantes = variantesTelefone(c.numero);
  const numeroNacional = variantes[0] ?? c.numero;

  // ---- LEAD: identifier (UUID plantado no mailing) é autoritativo; telefone
  // com variantes (DDI/nono dígito) é o fallback (receptivo, manual).
  let leadId: string | null = null;
  if (c.identifier && UUID_RE.test(c.identifier)) {
    const { data } = await supabase.from("leads").select("id").eq("id", c.identifier).maybeSingle();
    if (data) leadId = data.id as string;
  }
  if (!leadId) {
    for (const candidato of variantes) {
      const { data } = await supabase.rpc("buscar_lead_ativo_por_telefone_global", {
        _telefone: candidato,
      });
      if (data) {
        leadId = data as string;
        break;
      }
    }
  }

  // ---- CORRETOR: agent.id -> telefonia_agentes; e-mail do agente -> profiles.
  let corretorId: string | null = null;
  if (c.agentId) {
    const { data } = await supabase
      .from("telefonia_agentes")
      .select("user_id")
      .eq("agent_id", c.agentId)
      .limit(1);
    corretorId = (data?.[0]?.user_id as string | undefined) ?? null;
  }
  if (!corretorId && c.agentEmail) {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", c.agentEmail)
      .limit(1);
    corretorId = (data?.[0]?.id as string | undefined) ?? null;
  }

  // ---- Linha existente: pelo sid (idempotência) ou a linha do click-to-call
  // que a tcplus-discar criou sem sid (a discagem manual responde 204).
  async function buscarPorSid(): Promise<LinhaChamada | null> {
    if (!c.sid) return null;
    const { data } = await supabase
      .from("chamadas")
      .select(
        "id, payload, lead_id, corretor_id, status, direcao, origem, tabulacao, provider_call_id",
      )
      .eq("provider_call_id", c.sid)
      .maybeSingle();
    return (data as LinhaChamada | null) ?? null;
  }
  async function buscarClick2callPendente(): Promise<LinhaChamada | null> {
    if (!numeroNacional) return null;
    const desde = new Date(Date.now() - JANELA_CLICK2CALL_MS).toISOString();
    let q = supabase
      .from("chamadas")
      .select(
        "id, payload, lead_id, corretor_id, status, direcao, origem, tabulacao, provider_call_id",
      )
      .eq("provider", "3cplus")
      .eq("origem", "click2call")
      .is("provider_call_id", null)
      .in("numero", Array.from(new Set(variantes.length ? variantes : [numeroNacional])))
      .gte("criado_em", desde)
      .order("criado_em", { ascending: false })
      .limit(1);
    if (corretorId) q = q.eq("corretor_id", corretorId);
    const { data } = await q;
    return (data?.[0] as LinhaChamada | undefined) ?? null;
  }

  let existente = await buscarPorSid();
  let adotada = false;
  if (!existente && !c.receptivo) {
    existente = await buscarClick2callPendente();
    adotada = !!existente;
  }
  if (existente && !corretorId) corretorId = existente.corretor_id;
  if (existente && !leadId) leadId = existente.lead_id;

  // ---- Status. Conexão = cliente na linha. Histórico = terminou: o
  // desfecho vem dos buckets de status/hangup; atendimento anterior nunca
  // regride ("concluida"), e sem nenhuma pista de conversa é "não atendida".
  const desfecho = historico ? classificarDesfecho(c) : null;
  const tabulacao = c.qualificacao?.nome ?? null;
  const chaveEvento = `evento_${c.evento.replace(/[^a-z0-9]+/g, "_")}`;
  const payloadEvento = {
    evento: c.evento,
    sid: c.sid,
    numero: c.numero,
    agent_id: c.agentId,
    agent_email: c.agentEmail,
    campaign_id: c.campaignId,
    identifier: c.identifier,
    status_id: c.statusId,
    hangup_cause: c.hangupCause,
    desfecho,
    qualificacao: c.qualificacao,
    qualificacao_nota: c.qualificacaoNota,
    duracao_seg: c.duracaoSeg,
    gravacao: c.gravacao,
    data_chamada: c.dataChamada,
    recebido_em: new Date().toISOString(),
    bruto: c.bruto,
  };

  function statusNovo(atual: string | null, jaAtendida: boolean): string {
    if (conexao) return atual && TERMINAIS.has(atual) ? "concluida" : "atendida";
    if (jaAtendida || desfecho === "atendida") return "concluida";
    if (desfecho === "falha") return "falha";
    return "nao_atendida";
  }

  // ---- Atendido: lead do Bolsão (sem dono) que ATENDEU vira um atendido de
  // quem falou — aba Atendidos, SEM posse. Ele segue no Bolsão, discável por
  // outros corretores, até alguém avançar a fase. A RPC é idempotente por
  // chamada (os dois eventos da mesma ligação contam um atendimento) e
  // recusa lead com dono (é ligação da carteira de alguém, não do Bolsão).
  async function registrarAtendimento(
    leadAlvo: string | null,
    chamadaId: string | null,
  ): Promise<string> {
    if (!leadAlvo || !corretorId) return "nao_aplicavel";
    const { data, error } = await supabase.rpc("discador_bolsao_atender_v1", {
      _lead: leadAlvo,
      _corretor: corretorId,
      _chamada: chamadaId,
    });
    if (error) {
      console.error("tcplus-webhook atender_failed:", error);
      return `falhou: ${error.message}`;
    }
    const r = (data ?? {}) as { ok?: boolean; motivo?: string };
    return r.motivo ?? (r.ok ? "atendido" : "recusado");
  }

  // ---- Posse ao AVANÇAR: só quando a qualificação levou o lead a uma etapa
  // de gestao_config.bolsao.discador_posse_a_partir_de (agendado em diante,
  // por default) e ele ainda não tem dono. Aí ele entra na carteira de quem
  // avançou, sai do Bolsão e os atendimentos de todos se encerram. A RPC
  // recusa lead com dono, em triagem de SDR ou com venda viva.
  async function posseSeAvancou(leadAlvo: string | null, funil: string): Promise<string> {
    if (!leadAlvo || !corretorId) return "nao_aplicavel";
    if (!funil.startsWith("aplicada:")) return "nao_aplicavel";
    const alvo = funil.slice("aplicada:".length);
    const { data: cfg } = await supabase
      .from("gestao_config")
      .select("valor")
      .eq("chave", "bolsao")
      .maybeSingle();
    const listaCfg = (cfg?.valor as { discador_posse_a_partir_de?: unknown } | null)
      ?.discador_posse_a_partir_de;
    const etapasDePosse = Array.isArray(listaCfg)
      ? listaCfg.filter((v): v is string => typeof v === "string")
      : ["agendado", "visita_realizada", "proposta_enviada", "analise_credito"];
    if (!etapasDePosse.includes(alvo)) return "antes_da_posse";
    const { data, error } = await supabase.rpc("discador_bolsao_assumir_v1", {
      _lead: leadAlvo,
      _corretor: corretorId,
      _motivo: `Discador 3C Plus: avançou para ${alvo} (${c.evento})`,
    });
    if (error) {
      console.error("tcplus-webhook assumir_failed:", error);
      return `falhou: ${error.message}`;
    }
    const r = (data ?? {}) as { ok?: boolean; motivo?: string };
    return r.motivo ?? (r.ok ? "assumido" : "recusado");
  }

  // A timeline só ganha a ligação quando o agente ATENDEU de fato — no
  // primeiro evento de atendimento. Chamada que ninguém atendeu fica só no
  // histórico do Discador. Dedupe por chamada_id cobre o eco que a
  // tcplus-discar já fez para o click-to-call.
  async function ecoarInteracao(
    linha: { id: string; direcao: string; origem: string },
    leadEco: string | null,
  ): Promise<string> {
    if (!leadEco) return "sem_lead";
    const { data: jaTem } = await supabase
      .from("interacoes")
      .select("id")
      .contains("metadata", { chamada_id: linha.id })
      .limit(1);
    if (jaTem && jaTem.length > 0) return "ja_ecoada";
    const titulo =
      linha.direcao === "entrada"
        ? "Ligação recebida (3C Plus)"
        : linha.origem === "click2call"
          ? "Ligação via discador (click-to-call)"
          : "Ligação de campanha (discador 3C Plus)";
    const agente =
      c.bruto.agent && typeof c.bruto.agent === "object"
        ? ((c.bruto.agent as { name?: unknown }).name ?? null)
        : null;
    const partes = [
      c.numero ? `Número: ${c.numero}.` : null,
      agente ? `Agente: ${String(agente)}.` : null,
      c.campaignId ? `Campanha: ${c.campaignId}.` : null,
      tabulacao ? `Qualificação: ${tabulacao}.` : null,
    ].filter(Boolean);
    const { error } = await supabase.from("interacoes").insert({
      lead_id: leadEco,
      autor_id: corretorId,
      tipo: "ligacao",
      direcao: linha.direcao,
      titulo,
      conteudo: partes.join(" ") || "Chamada atendida no 3C Plus.",
      metadata: {
        fonte: "tcplus_webhook",
        chamada_id: linha.id,
        ...(c.sid ? { sid: c.sid } : {}),
        evento: c.evento,
      },
    });
    if (error) console.error("tcplus-webhook interacao_failed:", error);
    return error ? "falhou" : "ok";
  }

  // Aplica o evento sobre uma linha existente — caminho normal, adoção do
  // click-to-call e o PERDEDOR da corrida de insert (23505): nenhum evento é
  // descartado.
  async function aplicarAtualizacao(linha: LinhaChamada): Promise<Record<string, unknown>> {
    const jaAtendidaAntes =
      STATUS_ATENDIDA.has(linha.status) ||
      Object.keys(linha.payload).some((k) => k.startsWith("evento_") && eventoDeConexao(k));
    const novoStatus = statusNovo(linha.status, jaAtendidaAntes);
    const patch: Record<string, unknown> = {
      status: novoStatus,
      ...(leadId ? { lead_id: leadId } : {}),
      ...(corretorId ? { corretor_id: corretorId } : {}),
      ...(c.sid && !linha.provider_call_id ? { provider_call_id: c.sid } : {}),
      ...(c.agentExtension ? { ramal: c.agentExtension } : {}),
      ...(c.duracaoSeg !== null ? { duracao_segundos: c.duracaoSeg } : {}),
      ...(c.gravacao ? { gravacao_url: c.gravacao } : {}),
      ...(tabulacao ? { tabulacao } : {}),
      payload: { ...linha.payload, [chaveEvento]: payloadEvento },
    };
    const { error: updErr } = await supabase.from("chamadas").update(patch).eq("id", linha.id);
    if (updErr) {
      // Adoção perdeu a corrida: outro evento já gravou este sid noutra linha
      // — aplica nela em vez de duplicar.
      if ((updErr as { code?: string }).code === "23505" && adotada) {
        const vencedora = await buscarPorSid();
        if (vencedora) {
          adotada = false;
          return await aplicarAtualizacao(vencedora);
        }
      }
      console.error("tcplus-webhook update_failed:", updErr);
    }
    const atendeuAgora = !jaAtendidaAntes && (conexao || desfecho === "atendida");
    // Atendeu: vira atendido (sem posse). A posse só vem com o avanço de fase.
    const atendimento =
      conexao || desfecho === "atendida"
        ? await registrarAtendimento(leadId ?? linha.lead_id, linha.id)
        : "nao_aplicavel";
    const timeline = atendeuAgora
      ? await ecoarInteracao(linha, leadId ?? linha.lead_id)
      : "nao_aplicavel";
    const funil = await aplicarQualificacao(leadId ?? linha.lead_id, tabulacao, linha.tabulacao);
    const posse = await posseSeAvancou(leadId ?? linha.lead_id, funil);
    return {
      evento: c.evento,
      chamada_id: linha.id,
      atualizada: true,
      adotada,
      status: novoStatus,
      lead: leadId ?? linha.lead_id ?? "nao_encontrado",
      corretor: corretorId ?? "nao_encontrado",
      atendimento,
      posse,
      timeline,
      funil,
    };
  }

  // ---- Qualificação -> etapa do funil (mapeamento em gestao_config). Só
  // qualificação NOVA (diferente da já gravada na chamada) processa: se o
  // corretor mudar a etapa manualmente depois, o sync não briga.
  async function aplicarQualificacao(
    leadAlvo: string | null,
    nome: string | null,
    anterior: string | null,
  ): Promise<string> {
    if (!nome || !leadAlvo) return "nao_aplicavel";
    if (anterior && normalizarNome(anterior) === normalizarNome(nome)) return "ja_processada";
    const { data: cfg } = await supabase
      .from("gestao_config")
      .select("valor")
      .eq("chave", "telefonia_tabulacao_status")
      .maybeSingle();
    const valor =
      (cfg?.valor as {
        mapeamento?: Record<string, string>;
        followup_padrao_horas?: unknown;
      } | null) ?? {};
    const mapa = new Map<string, string>();
    for (const [k, v] of Object.entries(valor.mapeamento ?? {})) {
      if (ALVOS_VALIDOS.has(v)) mapa.set(normalizarNome(k), v);
    }
    const alvo = mapa.get(normalizarNome(nome));
    if (!alvo) return "sem_mapeamento";
    const horas = Number(valor.followup_padrao_horas ?? 24) || 24;

    const { data: lead } = await supabase
      .from("leads")
      .select("status, proxima_acao, proximo_followup")
      .eq("id", leadAlvo)
      .maybeSingle();
    if (!lead) return "lead_nao_encontrado";
    if (lead.status === alvo) return "ja_na_etapa";

    // A RPC exige "próxima ação OU follow-up" nas etapas ativas e follow-up
    // FUTURO em aguardando_retorno. Só preenche o que o lead ainda não tem —
    // uma ação/follow-up já planejados pelo corretor não são sobrescritos.
    const temFollowupFuturo =
      !!lead.proximo_followup && new Date(lead.proximo_followup as string) > new Date();
    const precisaFollowup = alvo === "aguardando_retorno" && !temFollowupFuturo;
    const precisaAcao = !lead.proxima_acao && !temFollowupFuturo && !precisaFollowup;
    const args = {
      p_motivo: `Qualificação do discador (3C Plus): ${nome}`,
      ...(precisaAcao
        ? { p_proxima_acao: `Retomar contato após qualificação "${nome}" no discador` }
        : {}),
      ...(precisaFollowup
        ? { p_proximo_followup: new Date(Date.now() + horas * 3_600_000).toISOString() }
        : {}),
    };
    const transicionar = async (para: string) =>
      (
        await supabase.rpc("transicionar_lead", {
          p_lead_id: leadAlvo,
          p_novo_status: para,
          ...args,
        })
      ).error;
    let error = await transicionar(alvo);
    // A máquina de estados não liga toda etapa a toda etapa (ex.: aguardando
    // atendimento -> agendado, perdido -> agendado). Um lead que o discador
    // acabou de reativar do Bolsão está justamente nessas etapas; a escala
    // natural passa por "em atendimento" (o corretor falou com o cliente) e
    // de lá para a etapa que a qualificação pede.
    if (error && /n[aã]o permitida/i.test(error.message) && alvo !== "em_atendimento") {
      const viaAtendimento = await transicionar("em_atendimento");
      if (!viaAtendimento) error = await transicionar(alvo);
    }
    if (error) {
      console.error("tcplus-webhook transicao_failed:", error);
      return `falhou: ${error.message}`;
    }
    return `aplicada:${alvo}`;
  }

  if (existente) return await aplicarAtualizacao(existente);

  // ---- Linha nova (campanha, receptivo ou manual feito fora do CRM).
  const direcao = c.receptivo ? "entrada" : "saida";
  const origem = c.receptivo ? "receptivo" : c.manual ? "click2call" : "campanha";
  const status = statusNovo(null, false);
  const { data: nova, error: insErr } = await supabase
    .from("chamadas")
    .insert({
      lead_id: leadId,
      corretor_id: corretorId,
      direcao,
      origem,
      provider: "3cplus",
      provider_call_id: c.sid,
      numero: numeroNacional ?? "-",
      ramal: c.agentExtension,
      status,
      ...(c.duracaoSeg !== null ? { duracao_segundos: c.duracaoSeg } : {}),
      ...(c.gravacao ? { gravacao_url: c.gravacao } : {}),
      ...(tabulacao ? { tabulacao } : {}),
      payload: { [chaveEvento]: payloadEvento },
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    // Corrida entre dois eventos do mesmo sid: o UNIQUE parcial barrou o
    // segundo insert — o evento perdedor é APLICADO sobre a linha vencedora.
    if ((insErr as { code?: string }).code === "23505" && c.sid) {
      const vencedora = await buscarPorSid();
      if (vencedora) return await aplicarAtualizacao(vencedora);
    }
    console.error("tcplus-webhook insert_failed:", insErr);
    return { evento: c.evento, erro: "insert_failed", detail: insErr.message };
  }

  const linha = { id: nova!.id as string, direcao, origem };
  const atendeu = conexao || desfecho === "atendida";
  const atendimento = atendeu ? await registrarAtendimento(leadId, linha.id) : "nao_aplicavel";
  const timeline = atendeu ? await ecoarInteracao(linha, leadId) : "nao_aplicavel";
  const funil = await aplicarQualificacao(leadId, tabulacao, null);
  const posse = await posseSeAvancou(leadId, funil);
  return {
    evento: c.evento,
    chamada_id: linha.id,
    status,
    lead: leadId ?? "nao_encontrado",
    corretor: corretorId ?? "nao_encontrado",
    atendimento,
    posse,
    timeline,
    funil,
  };
}

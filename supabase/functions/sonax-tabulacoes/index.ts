// Sincroniza as TABULAÇÕES do discador Sonax com o funil do CRM: baixa o
// arquivo de contatos da campanha do corretor (acao=download_arquivo_contato
// — o id_contato de cada linha é o UUID do lead, gravado pela sonax-campanha
// no enfileiramento), casa cada tabulação NOVA com a chamada registrada e
// move o lead de etapa conforme o mapeamento em gestao_config
// (telefonia_tabulacao_status).
//
// Body: {} — sincroniza a campanha do corretor autenticado. A aba Discador
// chama automaticamente a cada 2 min enquanto aberta, e no botão
// "Sincronizar tabulações".
//
// Idempotência: a tabulação vigente fica gravada em chamadas.tabulacao
// (última chamada de campanha do lead); só uma tabulação DIFERENTE da
// gravada dispara processamento. Se o corretor mudar a etapa manualmente
// depois, o sync não briga — a tabulação já processada não reaplica.
//
// POOL COMPARTILHADO + atribuição por interesse: o discador liga para leads
// de TODA a base (sonax-campanha), então o lead da chamada pode ainda não ser
// do corretor. Tabulação de INTERESSE (alvo em etapa ativa) primeiro move o
// lead para a carteira do corretor da chamada (corretor_id, com
// corretor_anterior_id preservado) e então transiciona com o JWT dele
// (autoria correta). Tabulação de DESCARTE (alvo perdido) transiciona via
// service role SEM atribuir — lead sem interesse não entra na base ativa de
// ninguém. A service role também marca chamadas.tabulacao e lê o mapeamento
// em gestao_config.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   SONAX_TOKEN / SONAX_ID_CLIENTE (obrigatórios) — dados de ativação v1
//   SONAX_API_URL (opcional)
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY — automáticas

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { comCapturaDeErro } from "../_shared/error-tracking.ts";

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

// Comparação tolerante: minúsculas, sem acento, espaços colapsados.
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const STATUS_VALIDOS = new Set([
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
  "contrato_fechado",
  "pos_venda",
  "perdido",
]);

type Par = { leadId: string; tabulacao: string };

// O contrato v1 não fixa o formato do arquivo de contatos — este parser cobre
// JSON (array de objetos) e CSV/;/tab com cabeçalho contendo "tabula". Formato
// não reconhecido volta uma amostra no resultado para calibrarmos o parser
// com o arquivo real, em vez de adivinhar errado em silêncio.
function extrairPares(texto: string): { pares: Par[]; formato: string; amostra?: string } {
  const t = texto.trim();
  if (!t) return { pares: [], formato: "vazio" };

  try {
    const raiz: unknown = JSON.parse(t);
    const rows = Array.isArray(raiz)
      ? raiz
      : Array.isArray((raiz as { contatos?: unknown[] })?.contatos)
        ? (raiz as { contatos: unknown[] }).contatos
        : null;
    if (rows) {
      const pares: Par[] = [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const obj = row as Record<string, unknown>;
        let leadId: string | null = null;
        let tabulacao: string | null = null;
        for (const [k, v] of Object.entries(obj)) {
          const valor = String(v ?? "");
          if (!leadId && UUID_RE.test(valor)) leadId = valor.match(UUID_RE)![0].toLowerCase();
          if (normalizar(k).includes("tabula") && valor.trim()) tabulacao = valor.trim();
        }
        if (leadId && tabulacao) pares.push({ leadId, tabulacao });
      }
      return { pares, formato: "json" };
    }
  } catch {
    // não é JSON — tenta CSV
  }

  const linhas = t.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return { pares: [], formato: "desconhecido", amostra: t.slice(0, 200) };
  const sep = [";", ",", "\t"].reduce((melhor, s) =>
    linhas[0].split(s).length > linhas[0].split(melhor).length ? s : melhor,
  );
  const header = linhas[0].split(sep).map((c) => normalizar(c.replace(/"/g, "")));
  const idxTab = header.findIndex((c) => c.includes("tabula"));
  if (idxTab === -1) {
    return { pares: [], formato: "sem_coluna_tabulacao", amostra: linhas[0].slice(0, 200) };
  }
  const pares: Par[] = [];
  for (const linha of linhas.slice(1)) {
    const celulas = linha.split(sep).map((c) => c.replace(/^"|"$/g, "").trim());
    const uuid = linha.match(UUID_RE)?.[0]?.toLowerCase() ?? null;
    const tabulacao = celulas[idxTab]?.trim();
    if (uuid && tabulacao) pares.push({ leadId: uuid, tabulacao });
  }
  return { pares, formato: `csv(${sep})` };
}

Deno.serve((req: Request) => comCapturaDeErro("sonax-tabulacoes", () => handleRequest(req)));

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const token = Deno.env.get("SONAX_TOKEN");
  const idCliente = Deno.env.get("SONAX_ID_CLIENTE");
  if (!token || !idCliente) return json({ error: "sonax_nao_configurado" }, 503);
  const apiUrl =
    Deno.env.get("SONAX_API_URL") ??
    "https://api.sonax.net.br/a2billing_v2/admin/Public/dbdial_webapi.php";

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

  const { data: prof } = await supabase
    .from("profiles")
    .select("sonax_id_campanha")
    .eq("id", uid)
    .maybeSingle();
  const idCampanha = ((prof?.sonax_id_campanha as string | null) ?? "").trim();
  if (!idCampanha) return json({ error: "campanha_nao_configurada" }, 422);

  // Arquivo de contatos da campanha (contrato v1: recusa/vazio devolve 404).
  const qs = new URLSearchParams({
    acao: "download_arquivo_contato",
    id_cliente: idCliente,
    token,
    id_campanha: idCampanha,
  });
  let arquivo = "";
  try {
    const resp = await fetch(`${apiUrl}?${qs}`, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) return json({ ok: true, contatos: 0, motivo: "arquivo_indisponivel" });
    arquivo = await resp.text();
  } catch (e) {
    console.error("sonax-tabulacoes download falhou:", e);
    return json({ error: "sonax_indisponivel" }, 502);
  }

  const { pares, formato, amostra } = extrairPares(arquivo);
  if (pares.length === 0) {
    return json({ ok: true, contatos: 0, formato, ...(amostra ? { amostra } : {}) });
  }

  // Mapeamento tabulação -> etapa (gestao_config; leitura via service role
  // porque a policy de SELECT é só da gestão e o sync roda para corretor).
  const { data: cfg } = await admin
    .from("gestao_config")
    .select("valor")
    .eq("chave", "telefonia_tabulacao_status")
    .maybeSingle();
  const mapaBruto = ((cfg?.valor as { mapeamento?: Record<string, string> } | null)?.mapeamento ??
    {}) as Record<string, string>;
  const mapa = new Map<string, string>();
  for (const [k, v] of Object.entries(mapaBruto)) {
    if (STATUS_VALIDOS.has(v)) mapa.set(normalizar(k), v);
  }

  // Cap de segurança: arquivo gigante não estoura o timeout da function; o
  // corte é reportado (contatos vs processados) em vez de silencioso.
  const MAX_PARES = 300;
  const paresLimitados = pares.slice(0, MAX_PARES);

  // LOTE, não N+1: uma consulta (por fatia de 100) traz as chamadas de
  // campanha DESTE corretor para os leads do arquivo; a mais recente de cada
  // lead é o marcador de idempotência. O recorte por corretor importa no pool
  // compartilhado: cada sync processa só as ligações do próprio corretor —
  // a atribuição por interesse vai para quem de fato atendeu.
  const leadIds = Array.from(new Set(paresLimitados.map((par) => par.leadId)));
  const chamadaPorLead = new Map<string, { id: string; tabulacao: string | null }>();
  for (let i = 0; i < leadIds.length; i += 100) {
    const fatia = leadIds.slice(i, i + 100);
    const { data: linhas } = await admin
      .from("chamadas")
      .select("id, lead_id, tabulacao")
      .in("lead_id", fatia)
      .eq("origem", "campanha")
      .eq("corretor_id", uid)
      .order("criado_em", { ascending: false });
    for (const linha of linhas ?? []) {
      const lid = linha.lead_id as string;
      if (!chamadaPorLead.has(lid)) {
        chamadaPorLead.set(lid, {
          id: linha.id as string,
          tabulacao: (linha.tabulacao as string | null) ?? null,
        });
      }
    }
  }

  // Espelho Deno de followUpParaStatus (src/lib/follow-up.ts): a RPC
  // transicionar_lead EXIGE próxima ação ou follow-up nas etapas ativas — o
  // front sempre envia o template, e sem ele toda transição do sync falharia
  // com "informe próxima ação ou follow-up".
  const DIA_MS = 86_400_000;
  function templateFollowUp(
    status: string,
    nome: string,
  ): { acao: string; vencimento: string } | null {
    const emDias = (n: number) => new Date(Date.now() + n * DIA_MS).toISOString();
    const n = nome.trim() || "o cliente";
    switch (status) {
      case "em_atendimento":
        return { acao: `Follow-up com ${n}`, vencimento: emDias(1) };
      case "aguardando_retorno":
        return { acao: `Retomar contato com ${n}`, vencimento: emDias(1) };
      case "qualificacao_corretor":
        return { acao: `Qualificar ${n} (perfil, renda e urgência)`, vencimento: emDias(1) };
      case "qualificado":
        return { acao: `Apresentar opções aderentes para ${n}`, vencimento: emDias(2) };
      case "agendado":
        return { acao: `Confirmar visita com ${n}`, vencimento: emDias(1) };
      case "visita_realizada":
        return { acao: `Pós-visita: definir próximo passo com ${n}`, vencimento: emDias(2) };
      case "proposta_enviada":
        return { acao: `Acompanhar a proposta de ${n}`, vencimento: emDias(2) };
      case "analise_credito":
        return { acao: `Cobrar retorno do crédito de ${n}`, vencimento: emDias(3) };
      default:
        return null; // perdido/fechado não pedem follow-up
    }
  }

  // Transiciona com a RPC oficial. A etapa de entrada (aguardando
  // atendimento) não pula direto para agendado/aguardando_retorno na máquina
  // de estados — mas o atendimento ACONTECEU na ligação, então o pulo
  // intermediário por em_atendimento espelha a realidade e destrava a
  // tabulação ("agendou visita" num lead novo). O client é parametrizado:
  // interesse usa o JWT do corretor (autoria dele, lead já na carteira);
  // descarte usa a service role (lead do pool, fora de qualquer carteira).
  async function transicionar(
    client: typeof supabase,
    leadId: string,
    nomeLead: string,
    alvo: string,
    motivo: string,
  ): Promise<{ ok: boolean; erro?: string }> {
    const chamarRpc = (status: string) => {
      const tpl = templateFollowUp(status, nomeLead);
      return client.rpc("transicionar_lead", {
        p_lead_id: leadId,
        p_novo_status: status,
        p_motivo: motivo,
        ...(tpl ? { p_proxima_acao: tpl.acao, p_proximo_followup: tpl.vencimento } : {}),
      });
    };
    let { error } = await chamarRpc(alvo);
    if (error && /n.o permitida/i.test(error.message) && alvo !== "em_atendimento") {
      const hop = await chamarRpc("em_atendimento");
      if (!hop.error) ({ error } = await chamarRpc(alvo));
    }
    return error ? { ok: false, erro: error.message } : { ok: true };
  }

  let novas = 0;
  let aplicadas = 0;
  let jaProcessadas = 0;
  let semChamada = 0;
  let semMapeamento = 0;
  let jaNaEtapa = 0;
  const bloqueadas: Array<{ lead_id: string; tabulacao: string; erro: string }> = [];

  for (const { leadId, tabulacao } of paresLimitados) {
    const chamada = chamadaPorLead.get(leadId);
    if (!chamada) {
      semChamada++;
      continue;
    }
    if (chamada.tabulacao && normalizar(chamada.tabulacao) === normalizar(tabulacao)) {
      jaProcessadas++;
      continue;
    }
    novas++;

    // A TRANSIÇÃO vem antes do marcador: se a RPC falhar (transitório, lead
    // travado, fora da carteira), a chamada fica SEM marcar e o próximo sync
    // tenta de novo — marcar primeiro engoliria a falha para sempre.
    const alvo = mapa.get(normalizar(tabulacao));
    let desfecho: "aplicada" | "sem_mapeamento" | "ja_na_etapa" | null = null;
    if (!alvo) {
      desfecho = "sem_mapeamento";
    } else {
      // Lead lido via service role: no pool compartilhado ele pode ainda não
      // ser da carteira de ninguém que este JWT enxergue.
      const { data: lead } = await admin
        .from("leads")
        .select("id, nome, status, corretor_id")
        .eq("id", leadId)
        .maybeSingle();
      if (!lead) {
        // Apagado/limpo depois da discagem: desfecho definitivo, marca e segue.
        desfecho = "sem_mapeamento";
      } else if (lead.status === alvo) {
        desfecho = "ja_na_etapa";
      } else {
        const interesse = alvo !== "perdido";
        // ATRIBUIÇÃO POR INTERESSE: só quem ATENDEU e tabulou interesse leva
        // o lead para a carteira. Descarte (perdido) nunca atribui — lead sem
        // interesse não entra na base ativa do corretor.
        if (interesse && (lead.corretor_id as string | null) !== uid) {
          const { error: atribuirErr } = await admin
            .from("leads")
            .update({
              corretor_anterior_id: (lead.corretor_id as string | null) ?? null,
              corretor_id: uid,
              data_distribuicao: new Date().toISOString(),
            })
            .eq("id", leadId);
          if (atribuirErr) {
            bloqueadas.push({ lead_id: leadId, tabulacao, erro: atribuirErr.message });
            continue;
          }
        }
        // Interesse transiciona com o JWT do corretor (autoria dele, lead já
        // na carteira); descarte transiciona via service role sem atribuir.
        const r = await transicionar(
          interesse ? supabase : admin,
          leadId,
          (lead.nome as string) ?? "",
          alvo,
          `Tabulação do discador: ${tabulacao}`,
        );
        if (!r.ok) {
          bloqueadas.push({ lead_id: leadId, tabulacao, erro: r.erro ?? "rpc_falhou" });
          continue;
        }
        desfecho = "aplicada";
        // Lead trabalhado: devolve a reserva do pool (não precisa esperar TTL).
        const { error: reservaErr } = await admin
          .from("leads")
          .update({ discador_reservado_por: null, discador_reservado_em: null })
          .eq("id", leadId);
        if (reservaErr) console.error("sonax-tabulacoes limpar_reserva:", reservaErr);
        // "Não perturbar" descarta DE VERDADE: além de perder o lead, marca
        // opt-out — o discador e o click-to-call nunca mais discam para ele.
        if (alvo === "perdido" && /nao (perturbar|ligar)|descadastr/.test(normalizar(tabulacao))) {
          const { error: optErr } = await admin
            .from("leads")
            .update({ opt_out: true })
            .eq("id", leadId);
          if (optErr) console.error("sonax-tabulacoes opt_out_failed:", optErr);
        }
      }
    }

    // Marcador de idempotência só depois do desfecho definitivo.
    const { error: updErr } = await admin
      .from("chamadas")
      .update({ tabulacao })
      .eq("id", chamada.id);
    if (updErr) console.error("sonax-tabulacoes chamada_update_failed:", updErr);
    chamada.tabulacao = tabulacao;

    if (desfecho === "aplicada") aplicadas++;
    else if (desfecho === "sem_mapeamento") semMapeamento++;
    else if (desfecho === "ja_na_etapa") jaNaEtapa++;
  }

  return json({
    ok: true,
    formato,
    contatos: pares.length,
    processados: paresLimitados.length,
    novas,
    aplicadas,
    ja_processadas: jaProcessadas,
    ja_na_etapa: jaNaEtapa,
    sem_chamada: semChamada,
    sem_mapeamento: semMapeamento,
    bloqueadas: bloqueadas.slice(0, 10),
  });
}

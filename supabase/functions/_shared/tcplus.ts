// Helpers compartilhados da telefonia 3C Plus (espelho Deno — as functions não
// importam de src/). Mantém tcplus-discar, tcplus-campanha e tcplus-webhook
// com UMA definição de: cliente HTTP, normalização de número, leitura
// tolerante dos eventos do webhook e classificação do desfecho da chamada.
//
// Este arquivo é TS puro (sem Deno.*): a suíte vitest importa daqui para
// testar a normalização e o parser de eventos com amostras sintéticas.
//
// Fonte do contrato: SDK oficial `@3cplus/3cplusv2-sdk` (rotas v1) e o pacote
// `n8n-nodes-tcplus` (mailing_sync.json, campos do CallHistory, buckets de
// status/hangup). A doc oficial (https://api-docs.3c.plus) é a referência
// final — os nomes de campo do evento têm CANDIDATOS aqui justamente para
// tolerar variações; calibre com o payload cru gravado em chamadas.payload.

export const TCPLUS_BASE_URL_PADRAO = "https://app.3c.plus/api/v1";

/** Como o token vai na requisição. O SDK oficial manda `Authorization:
 *  Bearer` para qualquer token (fixo ou JWT de 12h); o nó n8n manda
 *  `?api_token=`. Default = header (regra da casa: segredo nunca em query);
 *  `query` fica como válvula de escape sem redeploy (TCPLUS_AUTH_MODE). */
export type TcplusAuthMode = "bearer" | "query";

export type TcplusConfig = {
  baseUrl: string;
  token: string;
  authMode: TcplusAuthMode;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type TcplusResposta = {
  ok: boolean;
  /** 0 = falha de rede/timeout (sem resposta HTTP). */
  status: number;
  body: unknown;
  /** Texto cru (truncado) para payload de auditoria e mensagens de erro. */
  texto: string;
};

/**
 * Uma requisição à API v1 do 3C Plus. Nunca lança: erro de rede volta como
 * `{ ok:false, status:0 }` e erro HTTP como `{ ok:false, status }` com o corpo
 * — quem chama decide o que é tolerável (ex.: login de agente já logado).
 * Muitas ações de agente devolvem 204 (aceito, assíncrono): `ok` sem corpo.
 */
export async function tcplusRequest(
  cfg: TcplusConfig,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: { body?: unknown; qs?: Record<string, string>; timeoutMs?: number } = {},
): Promise<TcplusResposta> {
  const url = new URL(cfg.baseUrl.replace(/\/$/, "") + path);
  for (const [k, v] of Object.entries(opts.qs ?? {})) url.searchParams.set(k, v);
  if (cfg.authMode === "query") url.searchParams.set("api_token", cfg.token);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.authMode === "bearer") headers["Authorization"] = `Bearer ${cfg.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const doFetch = cfg.fetchImpl ?? fetch;
  try {
    const resp = await doFetch(url.toString(), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? cfg.timeoutMs ?? 15_000),
    });
    // O corpo inteiro vira JSON; só a PRÉVIA de texto é truncada (auditoria e
    // mensagens de erro). Truncar antes do parse quebrava respostas grandes
    // (ex.: a lista criada em POST /lists tem mais de 1000 caracteres) — o id
    // sumia e a function tratava um 200 como recusa.
    const completo = await resp.text();
    const texto = completo.slice(0, 1000);
    let body: unknown = null;
    if (completo) {
      try {
        body = JSON.parse(completo);
      } catch {
        body = texto;
      }
    }
    return { ok: resp.ok, status: resp.status, body, texto };
  } catch (e) {
    return { ok: false, status: 0, body: null, texto: e instanceof Error ? e.message : String(e) };
  }
}

/** Mensagem legível de um erro do 3C Plus (dois formatos conhecidos:
 *  `{status_code,title,detail}` e `{detail,errors}` de validação). */
export function mensagemDeErroTcplus(r: TcplusResposta): string {
  const b = r.body;
  if (b && typeof b === "object") {
    const o = b as Record<string, unknown>;
    const titulo = typeof o.title === "string" ? o.title : null;
    const detalhe =
      typeof o.detail === "string" ? o.detail : typeof o.message === "string" ? o.message : null;
    const campos =
      o.errors && typeof o.errors === "object"
        ? Object.entries(o.errors as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("; ") : String(v)}`)
            .join(" | ")
        : null;
    const partes = [titulo, detalhe, campos].filter(Boolean);
    if (partes.length) return partes.join(" — ").slice(0, 300);
  }
  return (r.texto || (r.status ? `http_${r.status}` : "sem_resposta")).slice(0, 300);
}

// ---------------------------------------------------------------------------
// Telefone
// ---------------------------------------------------------------------------

/**
 * Número no formato que o mailing do 3C Plus espera: nacional com DDD, só
 * dígitos, sem DDI (a plataforma acrescenta o 55). Celular = 11 dígitos
 * (DDD + 9 + 8); fixo = 10. Celular antigo sem o nono dígito (10 dígitos com
 * 3º dígito 6–9) ganha o 9 — fixo (3º dígito 2–5) fica com 10. Devolve null
 * quando o que sobra não é um telefone BR discável.
 */
export function toTcplusNumero(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "").replace(/^0+/, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + "9" + d.slice(2);
  return d.length >= 10 && d.length <= 11 ? d : null;
}

/** Formato do número na discagem manual (TCPLUS_DIAL_FORMAT). */
export type TcplusDialFormato = "nacional" | "ddi";

export function toTcplusDial(numero: string, formato: TcplusDialFormato): string {
  return formato === "ddi" ? `55${numero}` : numero;
}

/**
 * Variantes do número para casar um lead pelo telefone: com/sem DDI 55 e
 * com/sem o nono dígito — o CRM pode ter o cadastro num formato e o evento
 * do 3C Plus chegar em outro. A primeira é sempre a forma nacional.
 */
export function variantesTelefone(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let d = String(raw).replace(/\D/g, "").replace(/^0+/, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length < 8) return [];
  const nacionais = new Set<string>([d]);
  if (d.length === 11 && d[2] === "9") nacionais.add(d.slice(0, 2) + d.slice(3));
  else if (d.length === 10 && /[6-9]/.test(d[2])) nacionais.add(d.slice(0, 2) + "9" + d.slice(2));
  const out: string[] = [];
  for (const n of nacionais) {
    out.push(n);
    out.push("55" + n);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Eventos do webhook
// ---------------------------------------------------------------------------

export type QualificacaoTcplus = {
  id: string | null;
  nome: string | null;
  conversion: boolean | null;
  should_insert_blacklist: boolean | null;
  dmc: boolean | null;
  callback: boolean | null;
};

export type ChamadaTcplus = {
  /** Nome do evento normalizado (minúsculas, `_` -> `-`). */
  evento: string;
  /** `sid` do CallHistory (chave de idempotência); fallback `id`/`call_id`. */
  sid: string | null;
  /** Número do cliente, só dígitos (como veio). */
  numero: string | null;
  agentId: string | null;
  agentEmail: string | null;
  agentExtension: string | null;
  campaignId: string | null;
  /** `mailing_data.identifier` — o UUID do lead que a tcplus-campanha planta. */
  identifier: string | null;
  qualificacao: QualificacaoTcplus | null;
  qualificacaoNota: string | null;
  statusId: number | null;
  hangupCause: number | null;
  /** Tempo de conversa (s) quando o evento traz. */
  duracaoSeg: number | null;
  gravacao: string | null;
  /** Chamada manual (discagem do agente = click-to-call do CRM). */
  manual: boolean;
  /** Receptivo (cliente ligou). */
  receptivo: boolean;
  dataChamada: string | null;
  /** O objeto da chamada como veio (auditoria/calibração). */
  bruto: Record<string, unknown>;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function pick(o: Obj, ...chaves: string[]): unknown {
  for (const chave of chaves) {
    const partes = chave.split(".");
    let atual: unknown = o;
    for (const p of partes) {
      if (!isObj(atual)) {
        atual = undefined;
        break;
      }
      atual = atual[p];
    }
    if (atual !== undefined && atual !== null && atual !== "") return atual;
  }
  return undefined;
}

const str = (v: unknown): string | null =>
  v === undefined || v === null || v === "" ? null : String(v);

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
};

const bool = (v: unknown): boolean | null =>
  typeof v === "boolean"
    ? v
    : v === 1 || v === "1" || v === "true"
      ? true
      : v === 0 || v === "0" || v === "false"
        ? false
        : null;

/** "83", "1:23", "00:01:23" -> segundos. */
export function parseDuracaoSeg(v: unknown): number | null {
  const n = num(v);
  if (n !== null) return n >= 0 ? n : null;
  if (typeof v !== "string") return null;
  const partes = v
    .trim()
    .split(":")
    .map((p) => Number(p));
  if (partes.length < 2 || partes.length > 3 || partes.some((p) => !Number.isFinite(p)))
    return null;
  return partes.reduce((acc, p) => acc * 60 + p, 0);
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Primeiro UUID encontrado em qualquer valor (raso) de um objeto. */
function uuidEmValores(o: unknown): string | null {
  if (!isObj(o)) return null;
  for (const v of Object.values(o)) {
    if (typeof v === "string") {
      const m = v.match(UUID_RE);
      if (m) return m[0].toLowerCase();
    }
  }
  return null;
}

/**
 * Lê um evento do webhook do 3C Plus e devolve os campos que o CRM usa. O
 * envelope pode ser `{event, data:{callHistory}}`, `{event, data:{call}}`,
 * `{type, payload}` ou o próprio objeto da chamada — e cada campo tem
 * candidatos (o CallHistory usa `sid`, `number`, `agent{id,name}`,
 * `campaign{id}`, `mailing_data{identifier,phone}`, `qualification{...}`,
 * `status_id`, `hangup_cause`, `recording`, `call_date_rfc3339`).
 */
export function extrairChamadaDoEvento(payload: unknown): ChamadaTcplus {
  const raiz: Obj = isObj(payload) ? payload : {};
  const eventoBruto =
    str(pick(raiz, "event", "type", "name", "data.event", "event_name")) ?? "desconhecido";
  const evento = eventoBruto.toLowerCase().replace(/_/g, "-");

  const candidatos = [
    pick(raiz, "data.callHistory"),
    pick(raiz, "data.call_history"),
    pick(raiz, "data.call"),
    pick(raiz, "callHistory"),
    pick(raiz, "call_history"),
    pick(raiz, "call"),
    pick(raiz, "payload"),
    pick(raiz, "data"),
    raiz,
  ];
  const chamada: Obj = (candidatos.find((c) => isObj(c)) as Obj | undefined) ?? raiz;

  const qualBruta = pick(chamada, "qualification", "qualificacao");
  let qualificacao: QualificacaoTcplus | null = null;
  if (isObj(qualBruta)) {
    qualificacao = {
      id: str(pick(qualBruta, "id")),
      nome: str(pick(qualBruta, "name", "nome")),
      conversion: bool(pick(qualBruta, "conversion")),
      should_insert_blacklist: bool(pick(qualBruta, "should_insert_blacklist")),
      dmc: bool(pick(qualBruta, "dmc")),
      callback: bool(pick(qualBruta, "callback", "allow_schedule")),
    };
  } else {
    const nome = str(pick(chamada, "qualification_name", "qualification.name"));
    const id = str(pick(chamada, "qualification_id"));
    if (nome || id) {
      qualificacao = {
        id,
        nome,
        conversion: null,
        should_insert_blacklist: null,
        dmc: null,
        callback: null,
      };
    }
  }

  const mailing = pick(chamada, "mailing_data", "mailing");
  const identifier =
    str(pick(chamada, "mailing_data.identifier", "mailing.identifier", "identifier")) ??
    uuidEmValores(mailing);

  const numeroBruto = str(
    pick(chamada, "number", "phone", "mailing_data.phone", "destination", "dst", "phone_number"),
  );
  const numero = numeroBruto ? numeroBruto.replace(/\D/g, "") || null : null;

  const modo = str(pick(chamada, "mode", "call_mode", "type", "call_type"))?.toLowerCase() ?? "";
  const manual =
    bool(pick(chamada, "manual", "is_manual", "is_manual_call")) === true ||
    modo.includes("manual");
  const receptivo =
    bool(pick(chamada, "receptive", "is_receptive", "inbound")) === true ||
    modo.includes("receptive") ||
    modo.includes("inbound") ||
    str(pick(chamada, "direction"))?.toLowerCase() === "inbound";

  const hangupBruto = pick(chamada, "hangup_cause", "hangup_cause_code");
  const dataChamada = str(
    pick(chamada, "call_date_rfc3339", "call_date", "created_at", "started_at", "date"),
  );

  return {
    evento,
    sid: str(pick(chamada, "sid", "call_sid", "call_id", "uuid", "id")),
    numero,
    agentId: str(pick(chamada, "agent.id", "agent_id", "user.id", "user_id")),
    agentEmail:
      str(pick(chamada, "agent.email", "user.email", "agent_email"))?.toLowerCase() ?? null,
    agentExtension: str(
      pick(chamada, "agent.extension_number", "agent.extension", "extension_number", "extension"),
    ),
    campaignId: str(pick(chamada, "campaign.id", "campaign_id")),
    identifier: identifier ? (identifier.match(UUID_RE)?.[0]?.toLowerCase() ?? identifier) : null,
    qualificacao,
    qualificacaoNota: str(pick(chamada, "qualification_note", "note", "observation")),
    statusId: num(pick(chamada, "status_id", "status")),
    hangupCause: num(hangupBruto),
    duracaoSeg: parseDuracaoSeg(
      pick(
        chamada,
        "speaking_time",
        "billsec",
        "talk_time",
        "talking_time",
        "duration",
        "call_duration",
      ),
    ),
    gravacao: str(pick(chamada, "recording", "recording_url", "record_url", "audio_url")),
    manual,
    receptivo,
    dataChamada,
    bruto: chamada,
  };
}

// ---------------------------------------------------------------------------
// Desfecho
// ---------------------------------------------------------------------------

export type DesfechoTcplus = "atendida" | "nao_atendida" | "falha" | "desconhecido";

// Buckets herdados do n8n-nodes-tcplus (validados em produção por terceiros):
// status_id 5/9/15 = sem contato, 6 = abandonada, 14 = falha; 8 = encerrada
// pela causa de desligamento (SIP/Q.931: 17–20 ocupado/não atende, 21–22/28
// número inválido/recusado, 34/102/487/606/609 falha de rede/timeout).
const STATUS_NAO_ATENDIDA = new Set([5, 6, 9, 15]);
const STATUS_FALHA = new Set([14]);
const HANGUP_NAO_ATENDIDA = new Set([17, 18, 19, 20, 21]);
const HANGUP_FALHA = new Set([22, 28, 34, 102, 487, 606, 609]);

/** Eventos que significam "cliente na linha com o agente". */
export function eventoDeConexao(evento: string): boolean {
  return evento.includes("connected") || evento.includes("answered") || evento.includes("bridged");
}

/** Eventos que significam "chamada terminou e o histórico foi gerado". */
export function eventoDeHistorico(evento: string): boolean {
  return (
    evento.includes("history") ||
    evento.includes("finished") ||
    evento.includes("hangup") ||
    evento.includes("ended")
  );
}

/**
 * Desfecho de uma chamada terminada. Status negativo vence (o discador
 * registra "não atende"/"falha" mesmo sem o agente); fora disso, qualificação
 * aplicada, status de atendimento ou tempo de conversa > 0 indicam que o
 * agente falou com o cliente. Sem nenhuma pista: desconhecido — quem chama
 * preserva o estado que já tinha.
 */
export function classificarDesfecho(c: ChamadaTcplus): DesfechoTcplus {
  if (c.statusId !== null) {
    if (STATUS_FALHA.has(c.statusId)) return "falha";
    if (STATUS_NAO_ATENDIDA.has(c.statusId)) return "nao_atendida";
    if (c.statusId === 8) {
      if (c.hangupCause !== null && HANGUP_FALHA.has(c.hangupCause)) return "falha";
      if (c.hangupCause !== null && HANGUP_NAO_ATENDIDA.has(c.hangupCause)) return "nao_atendida";
      return (c.duracaoSeg ?? 0) > 0 ? "atendida" : "nao_atendida";
    }
  }
  if (c.qualificacao) return "atendida";
  if ((c.duracaoSeg ?? 0) > 0) return "atendida";
  if (c.statusId === 7) return "atendida";
  return "desconhecido";
}

/** Comparação tolerante de nomes de qualificação (minúsculas, sem acento,
 *  espaços colapsados) — a mesma régua do mapeamento em gestao_config. */
export function normalizarNome(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

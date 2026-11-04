// Cliente mínimo da API do Zernio (https://zernio.com/api/v1), só no servidor.
// A chave vem do secret ZERNIO_API_KEY e nunca sai daqui: não é logada, não
// vai para o navegador e não aparece em mensagem de erro.

const BASE = "https://zernio.com/api/v1";
const TIMEOUT_MS = 15_000;

export class ZernioErro extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ZernioErro";
  }
}

export function zernioConfigurado(): boolean {
  return (process.env.ZERNIO_API_KEY ?? "").trim().length > 0;
}

function chave(): string {
  const k = (process.env.ZERNIO_API_KEY ?? "").trim();
  if (!k) throw new ZernioErro("ZERNIO_API_KEY não configurada.", 0);
  return k;
}

type Json = Record<string, unknown>;

async function chamar(
  metodo: "GET" | "POST" | "PUT",
  caminho: string,
  corpo?: Json,
): Promise<Json> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${chave()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: ctrl.signal,
    });
    const texto = await res.text();
    let json: Json = {};
    try {
      const v: unknown = texto ? JSON.parse(texto) : {};
      if (v && typeof v === "object" && !Array.isArray(v)) json = v as Json;
    } catch {
      // Corpo não-JSON: segue vazio e o status decide.
    }
    if (!res.ok) {
      const msg =
        (typeof json.error === "string" && json.error) ||
        (typeof json.message === "string" && json.message) ||
        `HTTP ${res.status}`;
      throw new ZernioErro(`Zernio ${caminho.split("?")[0]}: ${msg}`.slice(0, 300), res.status);
    }
    return json;
  } catch (e) {
    if (e instanceof ZernioErro) throw e;
    const motivo =
      e instanceof Error && e.name === "AbortError" ? "tempo esgotado" : "falha de rede";
    throw new ZernioErro(`Zernio ${caminho.split("?")[0]}: ${motivo}`, 0);
  } finally {
    clearTimeout(timer);
  }
}

export type ContaInstagram = { id: string; username: string | null };

/** Descobre a conta do Instagram conectada no Zernio (GET /accounts). */
export async function descobrirContaInstagram(preferida?: string | null): Promise<ContaInstagram> {
  const json = await chamar("GET", "/accounts");
  const lista = [json.accounts, json.data, json.items].find(Array.isArray) ?? [];
  const contas: ContaInstagram[] = [];
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const a = item as Json;
    if (a.platform !== "instagram") continue;
    const id = [a._id, a.id, a.accountId].find((v) => typeof v === "string");
    if (typeof id !== "string") continue;
    contas.push({ id, username: typeof a.username === "string" ? a.username : null });
  }
  if (contas.length === 0) {
    throw new ZernioErro("Nenhuma conta do Instagram conectada no Zernio.", 404);
  }
  return contas.find((c) => c.id === preferida) ?? contas[0];
}

const NOME_WEBHOOK = "CRM SMQ - DM Instagram";
// message.received: DMs (pedido original). comment.received: quem comenta a
// palavra no post, que é o CTA do carrossel ("Comenta FAIXA").
const EVENTOS_WEBHOOK = ["message.received", "comment.received"];

/**
 * Cadastra o webhook no Zernio com o segredo do HMAC. Se já houver um
 * cadastrado por este painel, ATUALIZA o mesmo (PUT /webhooks/settings) em
 * vez de criar outro: um segundo webhook com o segredo antigo falharia a
 * assinatura a cada entrega até o Zernio desligá-lo.
 */
export async function cadastrarWebhook(args: {
  url: string;
  secret: string;
  accountId: string;
  webhookIdAtual?: string | null;
}): Promise<{ id: string | null; acao: "criado" | "atualizado" }> {
  const corpo = {
    name: NOME_WEBHOOK,
    url: args.url,
    secret: args.secret,
    events: EVENTOS_WEBHOOK,
    accountIds: [args.accountId],
    isActive: true,
  };
  if (args.webhookIdAtual) {
    try {
      await chamar("PUT", "/webhooks/settings", { webhookId: args.webhookIdAtual, ...corpo });
      return { id: args.webhookIdAtual, acao: "atualizado" };
    } catch (e) {
      // Apagado no Zernio: cai para a criação. Outro erro sobe.
      if (!(e instanceof ZernioErro) || e.status !== 404) throw e;
    }
  }
  const json = await chamar("POST", "/webhooks/settings", corpo);
  const w = json.webhook && typeof json.webhook === "object" ? (json.webhook as Json) : json;
  const id = [w._id, w.id].find((v) => typeof v === "string");
  return { id: typeof id === "string" ? id : null, acao: "criado" };
}

/** Envia texto numa conversa existente (o id vem no webhook). */
export async function enviarMensagem(args: {
  conversationId: string;
  accountId: string;
  texto: string;
}): Promise<void> {
  await chamar("POST", `/inbox/conversations/${encodeURIComponent(args.conversationId)}/messages`, {
    accountId: args.accountId,
    message: args.texto,
  });
}

/**
 * DM privada para quem comentou. O Instagram permite UMA por comentário, em
 * até 7 dias, e só texto puro é garantido para quem não segue a conta.
 */
export async function responderComentarioNoPrivado(args: {
  postId: string;
  commentId: string;
  accountId: string;
  texto: string;
}): Promise<void> {
  await chamar(
    "POST",
    `/inbox/comments/${encodeURIComponent(args.postId)}/${encodeURIComponent(args.commentId)}/private-reply`,
    { accountId: args.accountId, message: args.texto },
  );
}

/** Resposta pública embaixo do comentário. */
export async function responderComentarioEmPublico(args: {
  postId: string;
  commentId: string;
  accountId: string;
  texto: string;
}): Promise<void> {
  await chamar("POST", `/inbox/comments/${encodeURIComponent(args.postId)}`, {
    accountId: args.accountId,
    commentId: args.commentId,
    message: args.texto,
  });
}

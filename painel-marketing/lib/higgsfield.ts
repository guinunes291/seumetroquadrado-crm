import "server-only";

// API do Higgsfield (https://docs.higgsfield.ai). As chaves ficam em
// HIGGSFIELD_API_KEY_ID e HIGGSFIELD_API_KEY_SECRET, só no servidor. Nunca entram
// em log, auditoria, mensagem de erro ou resposta ao navegador.
// A API é paga à parte do plano do site: o saldo é carregado em console.higgsfield.ai.

const BASE = "https://api.higgsfield.ai";

export class ErroHiggsfield extends Error {
  constructor(
    public traduzido: string,
    public status?: number,
  ) {
    super(traduzido);
  }
}

export function higgsfieldConfigurado(): boolean {
  return Boolean(process.env.HIGGSFIELD_API_KEY_ID && process.env.HIGGSFIELD_API_KEY_SECRET);
}

function autorizacao(): string {
  const id = process.env.HIGGSFIELD_API_KEY_ID;
  const segredo = process.env.HIGGSFIELD_API_KEY_SECRET;
  if (!id || !segredo)
    throw new ErroHiggsfield("O Painel ainda não tem a chave da API do Higgsfield configurada.");
  return `Key ${id}:${segredo}`;
}

// Tradução da tabela de erros da documentação para o que fazer.
export function traduzirErroHiggsfield(status: number): string {
  if (status === 401)
    return "A chave da API do Higgsfield foi recusada. Gere uma nova em console.higgsfield.ai.";
  if (status === 403)
    return "Falta saldo na API do Higgsfield. Carregue em console.higgsfield.ai e tente de novo.";
  if (status === 400 || status === 422)
    return "O Higgsfield recusou os parâmetros do vídeo (arquivo, formato ou texto).";
  if (status === 404) return "Este modelo não está liberado para a conta da API do Higgsfield.";
  if (status === 423 || status === 503)
    return "O modelo de vídeo está indisponível no Higgsfield agora. Tente mais tarde.";
  if (status === 429)
    return "A fila de vídeos do Higgsfield está cheia. Espere um terminar e tente de novo.";
  return `O Higgsfield devolveu um erro (código ${status}).`;
}

async function chamar<T>(
  metodo: "GET" | "POST",
  caminho: string,
  corpo?: unknown,
  extras: Record<string, string> = {},
): Promise<T> {
  const r = await fetch(`${BASE}/${caminho}`, {
    method: metodo,
    headers: {
      Authorization: autorizacao(),
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
      ...extras,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new ErroHiggsfield(traduzirErroHiggsfield(r.status), r.status);
  // O cancelamento responde 202 sem corpo.
  const texto = await r.text();
  return (texto ? JSON.parse(texto) : {}) as T;
}

// Custo em dólar que o próprio Higgsfield calcula para estes parâmetros.
export async function estimarCusto(endpoint: string, corpo: unknown): Promise<number> {
  const r = await chamar<{ usd?: string | number }>("POST", `estimate/${endpoint}`, corpo);
  return Number(r.usd);
}

export type Envio = { request_id: string; status: string };

// O Idempotency-Key é o id do pedido no Painel. Por isso, e só por isso, aqui
// pode repetir depois de uma queda de rede ou erro 5xx: o Higgsfield reconhece
// a chave e devolve o mesmo pedido em vez de gerar (e cobrar) outro vídeo.
export async function enviarVideo(endpoint: string, corpo: unknown, chave: string): Promise<Envio> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await chamar<Envio>("POST", endpoint, corpo, { "Idempotency-Key": chave });
    } catch (e) {
      ultimo = e;
      const repetivel =
        !(e instanceof ErroHiggsfield) || (e.status !== undefined && e.status >= 500);
      if (!repetivel) throw e;
      await new Promise((ok) => setTimeout(ok, 1500 * (tentativa + 1)));
    }
  }
  if (ultimo instanceof ErroHiggsfield) throw ultimo;
  throw new ErroHiggsfield(
    "O Higgsfield não respondeu. Como o pedido leva uma chave única, mandar de novo não gera um segundo vídeo; tente mais tarde.",
  );
}

export type Situacao = {
  status: "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";
  video?: { url: string };
  error?: string;
};

export async function situacaoDoVideo(requestId: string): Promise<Situacao> {
  return chamar<Situacao>("GET", `requests/${encodeURIComponent(requestId)}/status`);
}

// Só funciona enquanto o pedido está na fila; aí o Higgsfield devolve o valor.
export async function cancelarVideo(requestId: string): Promise<boolean> {
  try {
    await chamar<unknown>("POST", `requests/${encodeURIComponent(requestId)}/cancel`);
    return true;
  } catch (e) {
    if (e instanceof ErroHiggsfield && e.status === 400) return false;
    throw e;
  }
}

// Devolver ao Marquinhos: o CRM empurra cada pedido (devolver / retomar) para
// o webhook do n8n que comanda o Marquinhos no 4099. Mesmo desenho dos avisos
// do Link de Proposta: o banco guarda a fila (marquinhos_devolucoes), o
// servidor reivindica e chama o webhook logo após o pedido e a cada minuto no
// cron push-dispatch; falha tenta de novo a cada 5 min até 3 vezes e então o
// corretor recebe push — nenhum pedido some em silêncio.
//
// Envs: N8N_MARQUINHOS_DEVOLUCAO_URL (webhook do n8n) e SAMI_WRITE_KEY
// (header x-sami-key, o mesmo segredo dos canais da Sami). Sem a URL, nada é
// reivindicado: os pedidos esperam a configuração em vez de gastar as
// tentativas. SERVER-ONLY.

import {
  montarPedidoN8n,
  type ItemFila,
  type PedidoN8n,
} from "@/features/mensagens/devolucao-marquinhos";

const TIMEOUT_MS = 20_000;

type RespostaN8n = { ok: boolean; erro: string | null };

export function configDevolucaoMarquinhos(): { url: string; chave: string } | null {
  const url = process.env.N8N_MARQUINHOS_DEVOLUCAO_URL?.trim() ?? "";
  const chave = process.env.SAMI_WRITE_KEY ?? "";
  if (!/^https:\/\//.test(url) || chave.length < 16) return null;
  return { url, chave };
}

/** Interpreta a resposta do n8n: só `{ ok: true }` com HTTP 2xx é sucesso. */
export function lerRespostaN8n(status: number, corpo: string): RespostaN8n {
  let j: { ok?: unknown; erro?: unknown } = {};
  try {
    const parsed: unknown = JSON.parse(corpo);
    if (parsed && typeof parsed === "object") j = parsed as typeof j;
  } catch {
    /* corpo não JSON */
  }
  const erroTexto = typeof j.erro === "string" ? j.erro : corpo;
  if (status < 200 || status >= 300) {
    return { ok: false, erro: `HTTP ${status}: ${erroTexto.slice(0, 300)}` };
  }
  if (j.ok === true) return { ok: true, erro: null };
  return {
    ok: false,
    erro: typeof j.erro === "string" ? j.erro.slice(0, 300) : "n8n respondeu sem ok=true",
  };
}

async function chamarWebhook(pedido: PedidoN8n, url: string, chave: string): Promise<RespostaN8n> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sami-key": chave },
      body: JSON.stringify(pedido),
      signal: ctrl.signal,
    });
    return lerRespostaN8n(res.status, await res.text());
  } catch (e) {
    const abort = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      erro: abort
        ? "webhook sem resposta em 20s"
        : `falha de rede: ${e instanceof Error ? e.message : "desconhecida"}`,
    };
  } finally {
    clearTimeout(t);
  }
}

export type ResultadoDespachoDevolucao = {
  id: string;
  acao: string;
  status: string;
  erro: string | null;
};

export async function despacharDevolucoesMarquinhos(
  limite = 20,
): Promise<ResultadoDespachoDevolucao[]> {
  const cfg = configDevolucaoMarquinhos();
  if (!cfg) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("marquinhos_devolucoes_reivindicar_envio", {
    _limite: limite,
  });
  if (error) {
    // Migração ainda não aplicada no ambiente: silencioso (nada para despachar).
    if (error.code !== "PGRST202") {
      console.error("[marquinhos-devolucao] reivindicar falhou", error.message);
    }
    return [];
  }
  const itens: ItemFila[] = data ?? [];
  return Promise.all(
    itens.map(async (item): Promise<ResultadoDespachoDevolucao> => {
      const pedido = montarPedidoN8n(item);
      const r = pedido
        ? await chamarWebhook(pedido, cfg.url, cfg.chave)
        : { ok: false, erro: `pedido inválido (${item.acao}/${item.objetivo})` };
      const { data: status, error: e2 } = await supabaseAdmin.rpc(
        "marquinhos_devolucao_registrar_envio",
        {
          _id: item.id,
          _acao: item.acao,
          _ok: r.ok,
          _erro: r.erro ?? "",
        },
      );
      if (e2) console.error("[marquinhos-devolucao] registrar falhou", e2.message);
      return { id: item.id, acao: item.acao, status: String(status ?? "erro"), erro: r.erro };
    }),
  );
}

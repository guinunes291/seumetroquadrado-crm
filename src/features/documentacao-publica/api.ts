// Chamadas das páginas públicas do link de documentação (/documentos/<slug> e
// /pasta/<token>) às rotas /api/public/documentacao e
// /api/public/documentacao-arquivo. Sem login e sem Supabase no navegador.

import { ARQUIVO_MAX_BYTES } from "@/lib/documentacao-link";

export class DocumentacaoHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "DocumentacaoHttpError";
  }
}

function codigoDe(data: unknown): string {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string"
    ? data.error
    : "request_failed";
}

export async function documentacaoApi<T>(payload: unknown): Promise<T> {
  const response = await fetch("/api/public/documentacao", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !data) throw new DocumentacaoHttpError(response.status, codigoDe(data));
  return data as T;
}

export type AlvoDoEnvio = { documentacaoId: string } | { tipo: string };

/**
 * Um arquivo para a pasta, com progresso (fetch não informa o upload; XHR sim).
 * Devolve o item que recebeu o arquivo.
 */
export function enviarArquivoDaPasta(
  token: string,
  alvo: AlvoDoEnvio,
  arquivo: Blob,
  nome: string,
  onProgresso?: (fracao: number) => void,
): Promise<{ documentacao_id: string; versao: number }> {
  if (arquivo.size > ARQUIVO_MAX_BYTES) {
    return Promise.reject(new DocumentacaoHttpError(413, "arquivo_grande"));
  }
  const form = new FormData();
  form.set("token", token);
  if ("documentacaoId" in alvo) form.set("documentacao_id", alvo.documentacaoId);
  else form.set("tipo", alvo.tipo);
  form.set("arquivo", arquivo, nome);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/public/documentacao-arquivo");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgresso) onProgresso(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new DocumentacaoHttpError(0, "network_error"));
    xhr.ontimeout = () => reject(new DocumentacaoHttpError(0, "network_error"));
    xhr.onload = () => {
      const data: unknown = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300 && data && typeof data === "object") {
        resolve(data as { documentacao_id: string; versao: number });
      } else {
        reject(new DocumentacaoHttpError(xhr.status, codigoDe(data)));
      }
    };
    xhr.timeout = 5 * 60 * 1000;
    xhr.send(form);
  });
}

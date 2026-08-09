// Rastreamento de erro no NAVEGADOR. Gated: sem VITE_SENTRY_DSN (ou fora de
// produção) tudo aqui é no-op — mesmo padrão do register-sw. Carregado por
// import() dinâmico no __root para não pesar o chunk de entrada.
// (Sem o sufixo .client.ts de propósito: o import-protection do server build
// nega *.client.* importado da árvore de rotas; aqui o guard é de runtime.)
//
// Teto de eventos por sessão + dedupe do último erro: um erro em loop de
// render não pode virar tempestade de rede (nem estourar a cota do projeto).

import { buildEvent, sendEvent } from "./error-tracking";

let installed = false;
let sent = 0;
let lastKey = "";
const MAX_EVENTS_PER_SESSION = 20;

function dsn(): string | undefined {
  const value = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  return value && import.meta.env.PROD ? value : undefined;
}

function environment(): string {
  return (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? "production";
}

export function captureClientError(error: unknown, mechanism: string, handled = false) {
  if (typeof window === "undefined") return;
  const target = dsn();
  if (!target || sent >= MAX_EVENTS_PER_SESSION) return;
  const key = `${mechanism}:${error instanceof Error ? error.message : String(error)}`;
  if (key === lastKey) return;
  lastKey = key;
  sent += 1;
  void sendEvent(
    target,
    buildEvent(
      error,
      { mechanism, handled, tags: { route: window.location.pathname } },
      environment(),
    ),
  );
}

/** Instala os listeners globais que hoje não existem no cliente (P1 do 0.1). */
export function initErrorTracking() {
  if (installed || typeof window === "undefined" || !dsn()) return;
  installed = true;
  window.addEventListener("error", (event) =>
    captureClientError(event.error ?? event.message, "onerror"),
  );
  window.addEventListener("unhandledrejection", (event) =>
    captureClientError(event.reason, "unhandledrejection"),
  );
}

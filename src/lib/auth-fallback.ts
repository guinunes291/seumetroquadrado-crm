import type { Session } from "@supabase/supabase-js";

/**
 * Guardas de resiliência para o boot autenticado.
 *
 * O supabase-js pode PENDURAR indefinidamente em duas situações reais:
 *  - deadlock do Navigator LockManager no Safari/iOS após a aba ser suspensa
 *    (o lock sb-*-auth-token nunca é liberado pelo contexto zumbi);
 *  - fetch sem timeout em rede móvel instável.
 * Como as rotas autenticadas têm ssr:false, qualquer espera infinita no guard
 * significa tela escura sem nada renderizado. Estes helpers garantem que toda
 * etapa de auth do boot tem um teto de tempo e um plano B local.
 */

/** Teto para a validação de usuário no servidor (getUser). */
export const AUTH_USER_TIMEOUT_MS = 6_000;
/** Teto por tentativa do RPC de estado da conta. */
export const ACCOUNT_RPC_TIMEOUT_MS = 3_500;

export type SettledStep<T> = { ok: true; value: T } | { ok: false };

/**
 * Resolve com o valor da promise ou, após `ms`, com { ok: false } — nunca
 * rejeita. Exceções também viram { ok: false }: para o boot, "demorou demais"
 * e "explodiu" degradam do mesmo jeito.
 */
export function settleWithTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<SettledStep<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false }), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      () => {
        clearTimeout(timer);
        resolve({ ok: false });
      },
    );
  });
}

/**
 * Lê a sessão persistida pelo supabase-js direto do localStorage
 * (chave sb-<ref>-auth-token), sem passar pelo LockManager nem pela rede.
 * É o plano B quando getSession/getUser não respondem: com sessão local o app
 * segue (a RLS continua sendo a barreira real no servidor); sem ela, /auth.
 */
export function readLocalSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        "user" in parsed &&
        (parsed as Session).user &&
        typeof (parsed as Session).user === "object"
      ) {
        return parsed as Session;
      }
    }
  } catch {
    /* storage bloqueado ou JSON corrompido — trata como sem sessão */
  }
  return null;
}

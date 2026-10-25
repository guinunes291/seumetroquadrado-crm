import { useCallback, useEffect, useRef } from "react";

// Tracking por sessão do Link de Proposta: seção mais visível (IntersectionObserver),
// relógio de 1s só com a aba visível, heartbeat de 15s e sendBeacon ao sair.
// Não conta prévia (?previa=1) nem quem está logado no CRM neste aparelho.

type Evento = { tipo: string; secao?: string | null; chave: string };

const ENDPOINT = "/api/public/propostas";
const SESSAO_NOVA_MS = 30 * 60_000;

function aleatorio(n = 24) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join("");
}

function logadoNoCrm(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "";
      if (/^sb-.+-auth-token$/.test(k) && localStorage.getItem(k)) return true;
    }
  } catch {
    /* sem storage */
  }
  return false;
}

function aparelho(): string {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "celular";
  return "computador";
}
function navegador(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/SamsungBrowser/.test(ua)) return "Samsung";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  if (/Firefox\//.test(ua)) return "Firefox";
  return "Outro";
}

type Estado = { chave: string; ultimo: number; total: number; secoes: Record<string, number>; vistas: string[] };

export function usePropostaTracking(token: string, ativo: boolean) {
  const estado = useRef<Estado | null>(null);
  const fila = useRef<Evento[]>([]);
  const habilitado = useRef(false);
  const prof = useRef(0);
  const storeKey = `smq:proposta:${token.slice(0, 10)}`;

  const salvar = useCallback(() => {
    try {
      if (estado.current) localStorage.setItem(storeKey, JSON.stringify(estado.current));
    } catch {
      /* sem storage */
    }
  }, [storeKey]);

  const payload = useCallback(() => {
    const e = estado.current!;
    const eventos = fila.current.splice(0, 20);
    return JSON.stringify({
      token,
      chave: e.chave,
      aparelho: aparelho(),
      navegador: navegador(),
      tempo_total_s: Math.min(14400, Math.round(e.total)),
      profundidade: Math.min(100, Math.round(prof.current)),
      tempo_por_secao: Object.fromEntries(Object.entries(e.secoes).map(([k, v]) => [k, Math.min(14400, Math.round(v))])),
      eventos,
    });
  }, [token]);

  const enviar = useCallback(
    (beacon = false) => {
      if (!habilitado.current || !estado.current) return;
      const body = payload();
      salvar();
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }));
        return;
      }
      void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(
        () => undefined,
      );
    },
    [payload, salvar],
  );

  const evento = useCallback((tipo: string, secao?: string) => {
    if (!habilitado.current) return;
    fila.current.push({ tipo, secao: secao ?? null, chave: `${tipo}-${aleatorio(12)}` });
  }, []);

  useEffect(() => {
    if (!ativo) return;
    const previa = new URLSearchParams(window.location.search).get("previa") === "1";
    if (previa || logadoNoCrm()) return;
    habilitado.current = true;

    let salvo: Estado | null = null;
    try {
      salvo = JSON.parse(localStorage.getItem(storeKey) ?? "null");
    } catch {
      salvo = null;
    }
    const agora = Date.now();
    estado.current =
      salvo && agora - salvo.ultimo < SESSAO_NOVA_MS
        ? salvo
        : { chave: aleatorio(24), ultimo: agora, total: 0, secoes: {}, vistas: [] };
    fila.current.push({ tipo: "abertura", chave: `abertura-${estado.current.chave}` });

    const ratios = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const id = (en.target as HTMLElement).dataset.secao!;
          ratios.set(id, en.isIntersecting ? en.intersectionRatio : 0);
          const e = estado.current!;
          if (en.isIntersecting && en.intersectionRatio > 0.3 && !e.vistas.includes(id)) {
            e.vistas.push(id);
            fila.current.push({ tipo: "secao_vista", secao: id, chave: `vista-${e.chave}-${id}` });
          }
        }
      },
      { threshold: [0, 0.15, 0.3, 0.5, 0.75, 1] },
    );
    document.querySelectorAll<HTMLElement>("[data-secao]").forEach((el) => io.observe(el));

    const onScroll = () => {
      const h = document.documentElement;
      const p = ((h.scrollTop + window.innerHeight) / Math.max(1, h.scrollHeight)) * 100;
      if (p > prof.current) prof.current = p;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !estado.current) return;
      const e = estado.current;
      e.total += 1;
      e.ultimo = Date.now();
      let melhor: string | null = null;
      let r = 0;
      ratios.forEach((v, k) => {
        if (v > r) {
          r = v;
          melhor = k;
        }
      });
      if (melhor) e.secoes[melhor] = (e.secoes[melhor] ?? 0) + 1;
    }, 1000);

    enviar();
    const hb = window.setInterval(() => {
      if (document.visibilityState === "visible") enviar();
    }, 15_000);
    const onHide = () => {
      if (document.visibilityState === "hidden") enviar(true);
    };
    const onPageHide = () => enviar(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      io.disconnect();
      window.clearInterval(tick);
      window.clearInterval(hb);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [ativo, enviar, storeKey]);

  return { evento };
}

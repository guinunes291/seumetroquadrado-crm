// Refina, no navegador, a posição dos stands que chegaram com coordenada
// estimada — o mesmo mecanismo do mapa standalone, agora dentro do app.
//
// Por que no navegador e não no servidor: o Nominatim pede no máximo uma
// consulta por segundo, e 45 endereços em fila não cabem numa requisição de
// servidor. No navegador a fila corre em segundo plano, o pino "pula" para o
// lugar certo quando a resposta chega, e o resultado fica no localStorage —
// cada endereço custa UMA consulta por navegador, para sempre.
//
// As regras (o que aceitar, como montar a busca, como ler o cache) moram em
// lib/lojas/lojas.ts; aqui só se agenda a fila.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  aceitarGeocodificacao,
  aplicarCacheGeo,
  CHAVE_CACHE_GEO,
  chaveGeo,
  lerCacheGeo,
  urlGeocodificacao,
  type CacheGeo,
  type Loja,
} from "@/lib/lojas/lojas";

/** Política de uso do Nominatim: no máximo uma consulta por segundo. */
const INTERVALO_MS = 1100;

type RespostaNominatim = { lat?: string; lon?: string }[];

export function usePosicoesRefinadas(lojas: readonly Loja[]): Loja[] {
  const [cache, setCache] = useState<CacheGeo>({});
  const [cacheLido, setCacheLido] = useState(false);
  // Endereço que já foi consultado nesta sessão não volta para a fila — nem o
  // que o Nominatim não achou (tenta de novo só na próxima visita à página).
  const tentadas = useRef(new Set<string>());
  // Hora da última consulta, para o espaçamento valer também entre reinícios
  // da fila (cada posição achada reinicia o efeito).
  const ultimaConsulta = useRef(0);

  // localStorage só existe no navegador: lido depois da montagem (SSR).
  useEffect(() => {
    let bruto: string | null = null;
    try {
      bruto = window.localStorage.getItem(CHAVE_CACHE_GEO);
    } catch {
      // modo privado / storage bloqueado: segue sem cache
    }
    setCache(lerCacheGeo(bruto));
    setCacheLido(true);
  }, []);

  useEffect(() => {
    if (!cacheLido) return;
    try {
      window.localStorage.setItem(CHAVE_CACHE_GEO, JSON.stringify(cache));
    } catch {
      // sem storage o refinamento vale só para esta visita
    }
  }, [cache, cacheLido]);

  const refinadas = useMemo(() => aplicarCacheGeo(lojas, cache), [lojas, cache]);

  useEffect(() => {
    if (!cacheLido || typeof fetch === "undefined") return;
    const fila = refinadas.filter((l) => !l.exata && !tentadas.current.has(chaveGeo(l)));
    if (fila.length === 0) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const consultar = (loja: Loja) => {
      tentadas.current.add(chaveGeo(loja));
      ultimaConsulta.current = Date.now();
      fetch(urlGeocodificacao(loja), {
        headers: { accept: "application/json" },
        signal: controller.signal,
      })
        .then((r) => (r.ok ? (r.json() as Promise<RespostaNominatim>) : null))
        .then((resposta) => {
          const achado = Array.isArray(resposta) ? resposta[0] : undefined;
          if (!achado) return;
          const ponto = { lat: Number(achado.lat), lng: Number(achado.lon) };
          if (!aceitarGeocodificacao(loja, ponto)) return;
          setCache((atual) => ({ ...atual, [chaveGeo(loja)]: [ponto.lat, ponto.lng] }));
        })
        .catch(() => {
          // Rede fora: o pino fica na estimativa. Consulta CANCELADA (a lista
          // mudou no meio) não conta como tentativa — volta para a próxima fila.
          if (controller.signal.aborted) tentadas.current.delete(chaveGeo(loja));
        })
        .finally(agendar);
    };

    function agendar() {
      if (controller.signal.aborted) return;
      const proxima = fila.shift();
      if (!proxima) return;
      const espera = Math.max(0, ultimaConsulta.current + INTERVALO_MS - Date.now());
      timer = setTimeout(() => consultar(proxima), espera);
    }

    agendar();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [cacheLido, refinadas]);

  return refinadas;
}

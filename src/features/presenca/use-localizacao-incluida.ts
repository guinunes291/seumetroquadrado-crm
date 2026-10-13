// "Incluir minha localização" (13/10/2026) — a leitura da tela, local a cada
// tela (diálogo ou card). Só vai nos chunks lazy.
//
// Por que um hook por tela, e não um estado de módulo: a leitura some ao
// fechar o diálogo (nada de posição velha reaparecendo amanhã), não vaza
// entre testes e o card e o diálogo nunca estão na tela juntos.
//
// Nunca automática: só por toque (Incluir, Incluir de novo). Nada ao montar,
// nada de watchPosition, nada de prefetch das filiais.
//
// Privacidade: a posição fica só neste estado React — nunca em
// localStorage/sessionStorage, URL, cache do react-query ou Sentry (o Sentry
// recebe só o tipo da falha).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  lerLocalizacaoAgora,
  registrarFalhaLocalizacao,
  useBuscarFiliais,
  type LeituraIncluida,
} from "./presenca-client";
import {
  leituraValida,
  precisaoAproximada,
  VALIDADE_LEITURA_MS,
  type FalhaLocalizacao,
} from "./presenca-derive";
import type { CoordenadasFilial } from "./localizacao-previa";

export type EstadoLocalizacao =
  | { fase: "vazia" }
  | { fase: "lendo" }
  /** `coordenadas` null = a consulta das filiais falhou e não havia cache. */
  | { fase: "incluida"; leitura: LeituraIncluida; coordenadas: CoordenadasFilial[] | null }
  | { fase: "vencida"; lidaEm: number }
  | { fase: "falhou"; falha: FalhaLocalizacao; em: number };

export type ResultadoIncluir =
  | { ok: true; leitura: LeituraIncluida }
  | { ok: false; falha: FalhaLocalizacao }
  | { ok: false; cancelada: true };

const VAZIA: EstadoLocalizacao = { fase: "vazia" };

export function useLocalizacaoIncluida(): {
  estado: EstadoLocalizacao;
  /** Lê o GPS agora e as coordenadas das filiais. Nunca rejeita. */
  incluir(): Promise<ResultadoIncluir>;
  /** Descarta a resposta que ainda vai chegar (o estado volta a vazio). */
  cancelar(): void;
  /** Volta a "vazia" e descarta a pendente (o diálogo fechou). */
  limpar(): void;
  /** A leitura, se vale AGORA (confere com Date.now(), não pelo estado renderizado). */
  leituraValidaAgora(): LeituraIncluida | null;
  /** O Incluir falhou há ≤ 60 s? (Depois disso o passo a passo fica, mas não conta.) */
  falhaRecenteAgora(): FalhaLocalizacao | null;
} {
  const buscarFiliais = useBuscarFiliais();
  const [estado, setEstado] = useState<EstadoLocalizacao>(VAZIA);
  // O estado mais novo fora do ciclo de render: o toque confere a leitura
  // com o relógio de agora, mesmo de dentro de um closure velho.
  const atual = useRef<EstadoLocalizacao>(VAZIA);
  // Cada leitura ganha um número; a resposta de uma leitura cancelada (ou
  // substituída) chega com o número velho e é ignorada.
  const token = useRef(0);
  const montado = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mudar = useCallback((e: EstadoLocalizacao) => {
    atual.current = e;
    setEstado(e);
  }, []);

  const pararTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      token.current += 1;
      pararTimer();
    };
  }, [pararTimer]);

  const incluir = useCallback(async (): Promise<ResultadoIncluir> => {
    token.current += 1;
    const meu = token.current;
    pararTimer();
    mudar({ fase: "lendo" });
    const [r, filiais] = await Promise.all([lerLocalizacaoAgora(), buscarFiliais()]);
    if (meu !== token.current || !montado.current) return { ok: false, cancelada: true };
    if (!r.ok) {
      mudar({ fase: "falhou", falha: r.falha, em: Date.now() });
      registrarFalhaLocalizacao(r.falha, "previa");
      return { ok: false, falha: r.falha };
    }
    const leitura = r.leitura;
    mudar({ fase: "incluida", leitura, coordenadas: filiais });
    if (precisaoAproximada(leitura.precisao)) registrarFalhaLocalizacao("aproximada", "previa");
    // Venceu: a tela diz "A localização das 09:31 venceu" e o toque volta ao
    // fluxo de antes. (O "falhou" não vence na tela: o passo a passo fica.)
    timer.current = setTimeout(
      () => {
        timer.current = null;
        const e = atual.current;
        if (e.fase === "incluida" && e.leitura === leitura) {
          mudar({ fase: "vencida", lidaEm: leitura.lidaEm });
        }
      },
      Math.max(0, leitura.lidaEm + VALIDADE_LEITURA_MS + 50 - Date.now()),
    );
    return { ok: true, leitura };
  }, [buscarFiliais, mudar, pararTimer]);

  const cancelar = useCallback(() => {
    token.current += 1;
    if (atual.current.fase === "lendo") mudar(VAZIA);
  }, [mudar]);

  const limpar = useCallback(() => {
    token.current += 1;
    pararTimer();
    if (atual.current.fase !== "vazia") mudar(VAZIA);
  }, [mudar, pararTimer]);

  const leituraValidaAgora = useCallback((): LeituraIncluida | null => {
    const e = atual.current;
    return e.fase === "incluida" && leituraValida(e.leitura, Date.now()) ? e.leitura : null;
  }, []);

  const falhaRecenteAgora = useCallback((): FalhaLocalizacao | null => {
    const e = atual.current;
    if (e.fase !== "falhou") return null;
    const d = Date.now() - e.em;
    return d >= 0 && d <= VALIDADE_LEITURA_MS ? e.falha : null;
  }, []);

  return { estado, incluir, cancelar, limpar, leituraValidaAgora, falhaRecenteAgora };
}

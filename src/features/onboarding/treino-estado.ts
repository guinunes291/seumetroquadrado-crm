// Estado do treino do onboarding, publicado pelo OnboardingGlobal para os
// pop-ups obrigatórios que vêm depois dele (o check-in do dia). AGENTS.md: o
// treino prático não pode ser atrapalhado — nada obrigatório abre por cima
// dele, nem quando o corretor o reabre pelo menu ("Como usar o CRM").
//
// Um estado de módulo, e não um usePreference próprio: a conclusão grava na
// instância do OnboardingGlobal, e uma segunda instância só veria a mudança
// no próximo pull do servidor (5 min depois).

import { useSyncExternalStore } from "react";

export type EstadoTreino = {
  /** O OnboardingGlobal já sabe se o treino é obrigatório (papéis e preferências lidos). */
  decidido: boolean;
  /** O treino está na tela (obrigatório ou reaberto pelo menu). */
  aberto: boolean;
};

const INICIAL: EstadoTreino = { decidido: false, aberto: false };

let estado: EstadoTreino = INICIAL;
const ouvintes = new Set<() => void>();

export function publicarEstadoTreino(novo: EstadoTreino) {
  if (novo.decidido === estado.decidido && novo.aberto === estado.aberto) return;
  estado = { ...novo };
  for (const avisar of ouvintes) avisar();
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  return () => {
    ouvintes.delete(avisar);
  };
}

export function useEstadoTreino(): EstadoTreino {
  return useSyncExternalStore(
    assinar,
    () => estado,
    () => INICIAL,
  );
}

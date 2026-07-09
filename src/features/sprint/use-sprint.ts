// Modo Sprint — ciclo de prospecção cronometrado (30/60/90min) com fila
// snapshot dos leads mais quentes por score. Estado 100% client-side em
// localStorage (zero migration); as métricas do resultado vêm das tabelas
// já existentes (interações/tarefas do período do sprint).

import { useCallback, useSyncExternalStore } from "react";

export type SprintLead = {
  id: string;
  nome: string;
  telefone: string | null;
};

export type SprintState = {
  startedAt: number;
  durationMin: 30 | 60 | 90;
  /** Meta de contatos do sprint. */
  goal: number;
  /** Fila snapshot no momento do início (não muda durante o sprint). */
  queue: SprintLead[];
  /** Leads já atacados neste sprint. */
  done: string[];
};

export const SPRINT_STORAGE_KEY = "smq-sprint";

// ---------- núcleo puro (testável) ----------

export function criarSprint(
  queue: SprintLead[],
  durationMin: 30 | 60 | 90,
  goal: number,
  now: number,
): SprintState {
  return {
    startedAt: now,
    durationMin,
    goal: Math.max(1, Math.round(goal)),
    queue: queue.slice(0, 20),
    done: [],
  };
}

export function sprintFimMs(s: SprintState): number {
  return s.startedAt + s.durationMin * 60_000;
}

export function sprintRestanteMs(s: SprintState, now: number): number {
  return Math.max(0, sprintFimMs(s) - now);
}

export function sprintExpirado(s: SprintState, now: number): boolean {
  return sprintRestanteMs(s, now) === 0;
}

export function marcarFeito(s: SprintState, leadId: string): SprintState {
  if (s.done.includes(leadId)) return s;
  return { ...s, done: [...s.done, leadId] };
}

export function proximoLead(s: SprintState): SprintLead | null {
  return s.queue.find((l) => !s.done.includes(l.id)) ?? null;
}

export function parseSprint(raw: string | null): SprintState | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as SprintState;
    if (
      typeof p?.startedAt !== "number" ||
      ![30, 60, 90].includes(p?.durationMin) ||
      !Array.isArray(p?.queue) ||
      !Array.isArray(p?.done)
    ) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

// ---------- store de módulo + hook ----------

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: SprintState | null | undefined;

function read(): SprintState | null {
  if (cache !== undefined) return cache;
  try {
    cache = parseSprint(
      typeof localStorage === "undefined" ? null : localStorage.getItem(SPRINT_STORAGE_KEY),
    );
  } catch {
    cache = null;
  }
  return cache;
}

function write(next: SprintState | null) {
  cache = next;
  try {
    if (next === null) localStorage.removeItem(SPRINT_STORAGE_KEY);
    else localStorage.setItem(SPRINT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* modo privado: sprint vive só em memória */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSprint() {
  const sprint = useSyncExternalStore(subscribe, read, () => null);

  const start = useCallback((queue: SprintLead[], durationMin: 30 | 60 | 90, goal: number) => {
    write(criarSprint(queue, durationMin, goal, Date.now()));
  }, []);

  const done = useCallback((leadId: string) => {
    const s = read();
    if (s) write(marcarFeito(s, leadId));
  }, []);

  const stop = useCallback(() => write(null), []);

  return { sprint, start, done, stop };
}

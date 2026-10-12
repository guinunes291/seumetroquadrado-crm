// Regras PURAS da tela de Tarefas no padrão Lançamento (2026-10): em que grupo
// cada tarefa cai, os três números do topo e a linha de meta. Sem React nem
// Supabase — testável em tests/tarefas-lancamento.test.tsx.
//
// "Vencida" é a mesma conta de sempre (isAtrasada em lib/tarefas: aberta e
// com vencimento antes de agora). O quick-add grava SEM data de vencimento —
// por isso existe o grupo "Sem data" (decisão do dono, 12/10/2026), em vez de
// o insert ganhar um vencimento padrão.

import { addDays, endOfWeek, format, isSameDay, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TIPO_LABEL, type TarefaTipo } from "@/lib/tarefas";

export type TarefaBase = {
  id: string;
  status: string;
  data_vencimento: string | null;
  data_conclusao?: string | null;
};

export type GrupoTarefa = "vencidas" | "hoje" | "depois" | "sem_data";

export const ORDEM_GRUPOS: readonly GrupoTarefa[] = ["vencidas", "hoje", "depois", "sem_data"];

export const GRUPO_LABEL: Record<GrupoTarefa, string> = {
  vencidas: "Vencidas",
  hoje: "Hoje",
  depois: "Depois",
  sem_data: "Sem data",
};

export const GRUPO_HINT: Record<GrupoTarefa, string> = {
  vencidas: "o prazo passou — resolva ou adie",
  hoje: "vencem até o fim do dia",
  depois: "os próximos dias, pela data",
  sem_data: "criadas pela linha rápida — dê um prazo quando puder",
};

/** Ponto do grupo: só "Vencidas" acende em vermelho; hoje é o dourado da vez. */
export const GRUPO_DOT: Record<GrupoTarefa, string> = {
  vencidas: "bg-destructive",
  hoje: "bg-gold-500",
  depois: "bg-primary",
  sem_data: "bg-border",
};

/** Prioridade como ponto à esquerda do título (o selo saiu da linha). */
export const PRIORIDADE_DOT: Record<string, string> = {
  urgente: "bg-destructive",
  alta: "bg-warning",
  media: "bg-muted-foreground/60",
  baixa: "bg-border",
};

export function estaAberta(t: Pick<TarefaBase, "status">): boolean {
  return t.status !== "concluida" && t.status !== "cancelada";
}

/** null = encerrada (concluída ou cancelada) — mora atrás de "Ver concluídas". */
export function grupoDaTarefa(t: TarefaBase, agora: Date = new Date()): GrupoTarefa | null {
  if (!estaAberta(t)) return null;
  if (!t.data_vencimento) return "sem_data";
  const venc = Date.parse(t.data_vencimento);
  if (Number.isNaN(venc)) return "sem_data";
  if (venc < agora.getTime()) return "vencidas";
  if (venc < addDays(startOfDay(agora), 1).getTime()) return "hoje";
  return "depois";
}

export type TarefasAgrupadas<T> = {
  grupos: Record<GrupoTarefa, T[]>;
  /** Concluídas e canceladas, da mais recente para a mais antiga. */
  encerradas: T[];
};

const porVencimento = (a: TarefaBase, b: TarefaBase) =>
  Date.parse(a.data_vencimento ?? "") - Date.parse(b.data_vencimento ?? "");

const porConclusaoDesc = (a: TarefaBase, b: TarefaBase) =>
  (Date.parse(b.data_conclusao ?? "") || 0) - (Date.parse(a.data_conclusao ?? "") || 0);

export function agruparTarefas<T extends TarefaBase>(
  lista: readonly T[],
  agora: Date = new Date(),
): TarefasAgrupadas<T> {
  const grupos: Record<GrupoTarefa, T[]> = { vencidas: [], hoje: [], depois: [], sem_data: [] };
  const encerradas: T[] = [];
  for (const t of lista) {
    const g = grupoDaTarefa(t, agora);
    if (g) grupos[g].push(t);
    else encerradas.push(t);
  }
  grupos.vencidas.sort(porVencimento);
  grupos.hoje.sort(porVencimento);
  grupos.depois.sort(porVencimento);
  encerradas.sort(porConclusaoDesc);
  return { grupos, encerradas };
}

/** "hoje" | "ontem" | "sexta" (até 6 dias atrás) | "em 01/10". */
function diaDoPassado(d: Date, agora: Date): string {
  if (isSameDay(d, agora)) return "hoje";
  if (isSameDay(d, addDays(agora, -1))) return "ontem";
  if (d >= addDays(startOfDay(agora), -6)) {
    return format(d, "EEEE", { locale: ptBR }).replace("-feira", "");
  }
  return `em ${format(d, "dd/MM")}`;
}

/** "hoje" | "ontem" | "amanhã" | "sex, 09/10". */
function diaCurto(d: Date, agora: Date): string {
  if (isSameDay(d, agora)) return "hoje";
  if (isSameDay(d, addDays(agora, -1))) return "ontem";
  if (isSameDay(d, addDays(agora, 1))) return "amanhã";
  return format(d, "EEEEEE, dd/MM", { locale: ptBR });
}

export type NumerosDasTarefas = {
  vencidas: number;
  paraHoje: number;
  estaSemana: number;
  hintVencidas: string;
  hintHoje: string;
  hintSemana: string;
};

/**
 * Os três números com dono do topo: Vencidas · Para hoje · Esta semana.
 * "Esta semana" conta as de hoje e as que vencem até domingo (semana de
 * segunda a domingo) — vencidas ficam de fora (já têm o próprio número).
 */
export function numerosDasTarefas<T extends TarefaBase>(
  grupos: Record<GrupoTarefa, T[]>,
  agora: Date = new Date(),
): NumerosDasTarefas {
  const fimDaSemana = endOfWeek(agora, { weekStartsOn: 1 });
  const daSemana = grupos.depois.filter(
    (t) => Date.parse(t.data_vencimento ?? "") <= fimDaSemana.getTime(),
  ).length;
  const vencidas = grupos.vencidas.length;
  const paraHoje = grupos.hoje.length;
  const maisAntiga = grupos.vencidas[0]?.data_vencimento;
  const proxima = grupos.hoje[0]?.data_vencimento;
  const ate = `até ${format(fimDaSemana, "EEEEEE", { locale: ptBR })}., ${format(fimDaSemana, "dd/MM")}`;
  return {
    vencidas,
    paraHoje,
    estaSemana: paraHoje + daSemana,
    hintVencidas: maisAntiga
      ? `a mais antiga venceu ${diaDoPassado(new Date(maisAntiga), agora)}`
      : "nada vencido",
    hintHoje: proxima ? `a próxima às ${format(new Date(proxima), "HH:mm")}` : "nada para hoje",
    hintSemana:
      paraHoje > 0 ? `contando ${paraHoje === 1 ? "a 1" : `as ${paraHoje}`} de hoje · ${ate}` : ate,
  };
}

/**
 * A linha de meta da tarefa (uma só): prazo · lead · corretor (gestão) · tipo.
 * "venceu sex, 09/10 · 18:00" | "hoje · 12:00" | "sem prazo" | "concluída hoje".
 */
export function metaDaTarefa(
  t: TarefaBase & { tipo: string },
  opts: { lead?: string | null; corretor?: string | null; agora?: Date } = {},
): string {
  const agora = opts.agora ?? new Date();
  let prazo: string;
  if (t.status === "concluida") {
    prazo = t.data_conclusao
      ? `concluída ${diaCurto(new Date(t.data_conclusao), agora)}`
      : "concluída";
  } else if (t.status === "cancelada") {
    prazo = "cancelada";
  } else if (!t.data_vencimento) {
    prazo = "sem prazo";
  } else {
    const venc = new Date(t.data_vencimento);
    const hora = format(venc, "HH:mm");
    const dia = diaCurto(venc, agora);
    prazo = venc.getTime() < agora.getTime() ? `venceu ${dia} · ${hora}` : `${dia} · ${hora}`;
  }
  return [prazo, opts.lead, opts.corretor, TIPO_LABEL[t.tipo as TarefaTipo] ?? t.tipo]
    .filter(Boolean)
    .join(" · ");
}

/** Concluídas hoje — a nota de "Ver concluídas (N) · 3 hoje". */
export function concluidasHoje(lista: readonly TarefaBase[], agora: Date = new Date()): number {
  return lista.filter(
    (t) =>
      t.status === "concluida" &&
      !!t.data_conclusao &&
      isSameDay(new Date(t.data_conclusao), agora),
  ).length;
}

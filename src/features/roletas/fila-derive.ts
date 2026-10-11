// O que as telas dizem sobre a fila de cada roleta (puro, testável). A regra
// mora no banco (20261015120000); aqui é só o texto e a ordem de exibição.

import { motivoInaptidaoLabel } from "@/lib/distribuicao";
import type { FilaRoleta, MecanicaRoleta, MinhaPosicao, PapelRoleta } from "./fila-client";

export const ordinal = (n: number) => `${n}º`;

/** O nome da fila como o time fala dela. */
export function nomeDaFila(r: { papel: PapelRoleta; nome: string }): string {
  if (r.papel === "sdr") return "Agendados do SDR";
  if (r.papel === "marquinhos") return "Marquinhos";
  return r.nome;
}

/** Como a vez anda em cada mecânica (uma linha, sem jargão). */
export function comoAndaAVez(m: MecanicaRoleta): string {
  if (m === "ponderado_semana")
    return "Peso da semana: quem bateu a meta recebe mais vezes na volta.";
  if (m === "ponderado_faixa") return "Por faixa: a faixa A recebe mais vezes que a B e a C.";
  return "Quem está há mais tempo sem receber vai primeiro.";
}

/** "1º Lara · 2º Leo · 3º Lia" — a fila em uma linha. */
export function filaEmLinha(r: FilaRoleta, max = 6): string {
  if (r.fila.length === 0) return "";
  const nomes = r.fila
    .slice(0, max)
    .map((p) => `${ordinal(p.posicao ?? 0)} ${primeiroNome(p.nome)}`)
    .join(" · ");
  return r.fila.length > max ? `${nomes} · +${r.fila.length - max}` : nomes;
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

/** Quem está fora da fila agora e por quê (um motivo, o primeiro). */
export function foraEmLinha(r: FilaRoleta, max = 4): string {
  const xs = r.fora.slice(0, max).map((p) => {
    const m = p.motivos?.[0];
    return m ? `${primeiroNome(p.nome)} (${motivoInaptidaoLabel(m).toLowerCase()})` : p.nome;
  });
  return r.fora.length > max ? `${xs.join(", ")} e mais ${r.fora.length - max}` : xs.join(", ");
}

/** Ordem do painel do SDR: a fila dele primeiro, depois zona, Marquinhos, campanhas. */
const ORDEM_PAPEL: Record<PapelRoleta, number> = { sdr: 0, zona: 1, marquinhos: 2, campanha: 3 };
export function ordenarFilas(rs: FilaRoleta[]): FilaRoleta[] {
  return [...rs].sort(
    (a, b) => ORDEM_PAPEL[a.papel] - ORDEM_PAPEL[b.papel] || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** A zona que abre: a última que a pessoa olhou, se ainda existe; senão a primeira. */
export function zonaInicial(zonas: string[], salva: string | null): string | null {
  if (salva && zonas.includes(salva)) return salva;
  return zonas[0] ?? null;
}

export type TextoPosicao = {
  fila: string;
  valor: string;
  detalhe: string | null;
  /** O motivo se resolve com check-in (link para /presenca). */
  checkin: boolean;
  apto: boolean;
};

/** A linha do corretor: "Zona Leste — 2º de 6" ou "fora agora — sem check-in". */
export function textoMinhaPosicao(p: MinhaPosicao): TextoPosicao {
  const base = nomeDaFila(p);
  // A roleta de zona já é a zona; a do SDR sem zona é "fora" (toda visita tem
  // zona); nas outras, sem zona é a fila dos leads que chegam sem zona.
  const fila =
    p.papel === "zona" || (p.papel === "sdr" && !p.zona)
      ? base
      : `${base} · ${p.zona ?? "lead sem zona"}`;
  if (p.apto && p.posicao != null) {
    return {
      fila,
      valor: `${ordinal(p.posicao)} de ${p.total}`,
      detalhe: p.posicao === 1 ? "Você é o próximo." : null,
      checkin: false,
      apto: true,
    };
  }
  return {
    fila,
    valor: "fora da fila agora",
    detalhe: p.motivos.length > 0 ? p.motivos.map(motivoInaptidaoLabel).join(" · ") : null,
    checkin: p.motivos.includes("ausente_hoje"),
    apto: false,
  };
}

export type GrupoFora = {
  motivo: string;
  rotulo: string;
  /** As filas, sem repetir a mesma roleta em zonas diferentes. */
  filas: string[];
  checkin: boolean;
};

/**
 * Quem está fora, agrupado pelo motivo: o corretor sem check-in fica fora de
 * todas as filas que exigem presença — em vez de uma linha por roleta e zona
 * (30+ para quem atende três zonas), uma linha por motivo.
 */
export function agruparFora(ps: MinhaPosicao[]): GrupoFora[] {
  const grupos = new Map<string, GrupoFora>();
  for (const p of ps) {
    if (p.apto && p.posicao != null) continue;
    const motivo = p.motivos[0] ?? "sem_motivo";
    const g = grupos.get(motivo) ?? {
      motivo,
      rotulo: motivo === "sem_motivo" ? "Fora da fila agora" : motivoInaptidaoLabel(motivo),
      filas: [],
      checkin: motivo === "ausente_hoje",
    };
    const nome = nomeDaFila(p);
    if (!g.filas.includes(nome)) g.filas.push(nome);
    grupos.set(motivo, g);
  }
  // O check-in primeiro (é o que ele resolve agora), depois o resto.
  return [...grupos.values()].sort((a, b) => Number(b.checkin) - Number(a.checkin));
}

/** "Zona Leste, Marquinhos e mais 8" — a lista curta de um grupo. */
export function filasEmLinha(filas: string[], max = 3): string {
  if (filas.length <= max) return filas.join(", ");
  return `${filas.slice(0, max).join(", ")} e mais ${filas.length - max}`;
}

/** Primeiro quem está na fila (pela posição), depois quem está fora. */
export function ordenarMinhas(ps: MinhaPosicao[]): MinhaPosicao[] {
  return [...ps].sort((a, b) => {
    if (a.apto !== b.apto) return a.apto ? -1 : 1;
    return (
      (a.posicao ?? 999) - (b.posicao ?? 999) ||
      ORDEM_PAPEL[a.papel] - ORDEM_PAPEL[b.papel] ||
      a.nome.localeCompare(b.nome, "pt-BR")
    );
  });
}

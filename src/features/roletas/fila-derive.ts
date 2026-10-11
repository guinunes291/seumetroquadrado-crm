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
  const curtos = nomesCurtos(r.fila.map((p) => p.nome));
  const nomes = r.fila
    .slice(0, max)
    .map((p, i) => `${ordinal(p.posicao ?? 0)} ${curtos[i]}`)
    .join(" · ");
  return r.fila.length > max ? `${nomes} · +${r.fila.length - max}` : nomes;
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

/**
 * O primeiro nome de cada um; quando ele se repete na mesma lista, a inicial
 * do sobrenome desempata ("Ana C." e "Ana R." — visto no Centro, 11/10).
 */
export function nomesCurtos(nomes: string[]): string[] {
  const repetidos = new Set<string>();
  const vistos = new Set<string>();
  for (const n of nomes) {
    const p = primeiroNome(n);
    if (vistos.has(p)) repetidos.add(p);
    vistos.add(p);
  }
  return nomes.map((n) => {
    const partes = n.trim().split(/\s+/);
    const p = partes[0] || n;
    const inicial = partes[1]?.[0];
    return repetidos.has(p) && inicial ? `${p} ${inicial.toUpperCase()}.` : p;
  });
}

/** "no Sul", "na Grande SP" — a zona dentro da frase. */
export function emZona(zona: string): string {
  return zona === "Grande SP" ? "na Grande SP" : `no ${zona}`;
}

/** Quem está fora da fila agora e por quê (um motivo, o primeiro). */
export function foraEmLinha(r: FilaRoleta, max = 4): string {
  const curtos = nomesCurtos(r.fora.map((p) => p.nome));
  const xs = r.fora.slice(0, max).map((p, i) => {
    const m = p.motivos?.[0];
    // A vez é uma só: ele é o 1º de outra zona — diz qual.
    if (m === "vez_em_outra_zona" && p.vez_em) return `${curtos[i]} (vez ${emZona(p.vez_em)})`;
    return m ? `${curtos[i]} (${motivoInaptidaoLabel(m).toLowerCase()})` : p.nome;
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

/** "Agendados do SDR · Leste", "Roleta Zona Leste", "Cury · lead sem zona". */
export function nomeDaFilaComZona(p: MinhaPosicao): string {
  const base = nomeDaFila(p);
  // A roleta de zona já é a zona; a do SDR sem zona é "fora" (toda visita tem
  // zona); nas outras, sem zona é a fila dos leads que chegam sem zona.
  return p.papel === "zona" || (p.papel === "sdr" && !p.zona)
    ? base
    : `${base} · ${p.zona ?? "lead sem zona"}`;
}

/** A linha do corretor: "Zona Leste — 2º de 6" ou "fora agora — sem check-in". */
export function textoMinhaPosicao(p: MinhaPosicao): TextoPosicao {
  const fila = nomeDaFilaComZona(p);
  // A vez é uma só: ele é o 1º de outra zona; aqui a vez passa ao próximo.
  if (p.motivos.includes("vez_em_outra_zona") && p.vez_em) {
    return {
      fila,
      valor: `vez ${emZona(p.vez_em)}`,
      detalhe: `Você é o próximo ${emZona(p.vez_em)}; aqui a vez passa ao próximo até a sua chegar.`,
      checkin: false,
      apto: false,
    };
  }
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
    // A vez é uma só: um grupo por zona onde a vez dele está ("Sua vez agora
    // é no Sul"), com a fila E a zona de onde ele saiu.
    const vez = motivo === "vez_em_outra_zona" && p.vez_em ? p.vez_em : null;
    const chave = vez ? `${motivo}:${vez}` : motivo;
    const g = grupos.get(chave) ?? {
      motivo,
      rotulo: vez
        ? `Sua vez agora é ${emZona(vez)}`
        : motivo === "sem_motivo"
          ? "Fora da fila agora"
          : motivoInaptidaoLabel(motivo),
      filas: [],
      checkin: motivo === "ausente_hoje",
    };
    const nome = vez ? nomeDaFilaComZona(p) : nomeDaFila(p);
    if (!g.filas.includes(nome)) g.filas.push(nome);
    grupos.set(chave, g);
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

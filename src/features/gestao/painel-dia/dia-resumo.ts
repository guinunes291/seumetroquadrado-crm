// A conta do topo da aba Dia (BI · Relatórios na identidade Lançamento, como
// no vídeo de lançamento): as vendas das últimas 12 semanas a partir da série
// diária do dashboard, e a conversão do mês. Pura, para ser testável
// (tests/bi-lancamento.test.tsx).
//
// Semanas de segunda a domingo, contadas no calendário de São Paulo — é nele
// que `dashboard_serie_diaria` devolve os dias. O chamador passa o "agora"
// já em São Paulo (agoraSaoPaulo), e a conta aqui é só de calendário.

import { dateKey } from "@/lib/periodo";

export type SemanaVendas = {
  /** Segunda-feira da semana, AAAA-MM-DD. */
  inicio: string;
  vendas: number;
  /** A semana corrente — em dourado no gráfico (ainda em andamento). */
  atual: boolean;
};

const DIA_MS = 24 * 60 * 60 * 1000;

const utcDoDia = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

/** Segunda-feira (meia-noite local) da semana de `d`. */
function segundaDe(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** A segunda-feira que abre a janela de `n` semanas terminando na de `agora`. */
export function inicioDasSemanas(agora: Date, n = 12): Date {
  const s = segundaDe(agora);
  s.setDate(s.getDate() - 7 * (n - 1));
  return s;
}

/** Soma a série diária em `n` semanas; dia fora da janela é ignorado. */
export function vendasPorSemana(
  serie: { dia: string; vendas: number }[],
  agora: Date,
  n = 12,
): SemanaVendas[] {
  const primeira = inicioDasSemanas(agora, n);
  const semanas: SemanaVendas[] = Array.from({ length: n }, (_, i) => {
    const d = new Date(primeira);
    d.setDate(d.getDate() + 7 * i);
    return { inicio: dateKey(d), vendas: 0, atual: i === n - 1 };
  });
  const base = utcDoDia(primeira);
  for (const p of serie) {
    const [y, m, d] = p.dia.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) continue;
    const idx = Math.floor((Date.UTC(y, m - 1, d) - base) / DIA_MS / 7);
    if (idx >= 0 && idx < n) semanas[idx].vendas += Number(p.vendas) || 0;
  }
  return semanas;
}

/**
 * Conversão do mês: vendas do mês ÷ leads que entraram no mês, em %, com uma
 * casa. É a leitura de vitrine do topo — não coorte (a venda de hoje pode ser
 * de um lead de meses atrás); a tela diz isso no rótulo. Sem leads, sem número.
 */
export function conversaoDoMes(vendas: number, leads: number): number | null {
  if (!leads || leads <= 0) return null;
  return Math.round((vendas / leads) * 1000) / 10;
}

// Métricas do painel do gestor do Link de Proposta (funções puras, testadas).
import { somarTempoPorSecao } from "@/lib/proposta-link";

export type PropostaPainel = {
  id: string;
  modelo: "apresentacao" | "proposta";
  corretor_id: string | null;
  projeto_id: string | null;
  created_at: string;
  primeira_abertura_em: string | null;
  aceita_em: string | null;
  sessoes: { tempo_total_s: number | null; tempo_por_secao: unknown }[];
  visita_pedida: boolean;
};

export type MetricasPainel = {
  enviadas: number;
  apresentacoes: number;
  propostas: number;
  abertas: number;
  pctAbertas: number | null;
  tempoPrimeiraAberturaS: number | null;
  tempoMedioLeituraS: number | null;
  secaoMaisLida: string | null;
  visitasPedidas: number;
  pctApresentacaoVisita: number | null;
  aceites: number;
  pctPropostaAceite: number | null;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function calcularMetricas(lista: PropostaPainel[]): MetricasPainel {
  const apres = lista.filter((p) => p.modelo === "apresentacao");
  const props = lista.filter((p) => p.modelo === "proposta");
  const abertas = lista.filter((p) => p.primeira_abertura_em);
  const ate1a = abertas.map((p) => Math.max(0, (Date.parse(p.primeira_abertura_em!) - Date.parse(p.created_at)) / 1000));
  const sessoes = lista.flatMap((p) => p.sessoes);
  const leituras = sessoes.map((s) => Number(s.tempo_total_s ?? 0)).filter((s) => s > 0);
  const porSecao = somarTempoPorSecao(sessoes);
  const top = Object.entries(porSecao).sort((a, b) => b[1] - a[1])[0];
  const visitas = apres.filter((p) => p.visita_pedida).length;
  const aceites = props.filter((p) => p.aceita_em).length;
  return {
    enviadas: lista.length,
    apresentacoes: apres.length,
    propostas: props.length,
    abertas: abertas.length,
    pctAbertas: pct(abertas.length, lista.length),
    tempoPrimeiraAberturaS: media(ate1a),
    tempoMedioLeituraS: media(leituras),
    secaoMaisLida: top && top[1] > 0 ? top[0] : null,
    visitasPedidas: visitas,
    pctApresentacaoVisita: pct(visitas, apres.length),
    aceites,
    pctPropostaAceite: pct(aceites, props.length),
  };
}

export type Periodo = "7d" | "30d" | "90d" | "mes" | "tudo";

/** Início do período em ISO (mês atual no calendário de Brasília). */
export function inicioPeriodo(periodo: Periodo, agora = new Date()): string | null {
  if (periodo === "tudo") return null;
  if (periodo === "mes") {
    const brt = new Date(agora.getTime() - 3 * 3600_000);
    return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), 1, 3)).toISOString();
  }
  const dias = { "7d": 7, "30d": 30, "90d": 90 }[periodo];
  return new Date(agora.getTime() - dias * 86400_000).toISOString();
}

export function agruparPorCorretor(lista: PropostaPainel[]) {
  const m = new Map<string, PropostaPainel[]>();
  for (const p of lista) {
    const k = p.corretor_id ?? "sem";
    m.set(k, [...(m.get(k) ?? []), p]);
  }
  return [...m.entries()].map(([corretor_id, ps]) => ({ corretor_id, ...calcularMetricas(ps) }));
}

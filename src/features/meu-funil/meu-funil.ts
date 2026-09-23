// Meu Funil — lógica pura do estudo diário do corretor (sem React, sem banco).
//
// A RPC meu_funil_estudo devolve a COORTE dos leads recebidos no período, por
// origem e grupo, com etapas CUMULATIVAS (quem chegou à pasta também agendou e
// visitou). Daqui saem:
//   - o funil por etapa e as taxas de passagem (com a régua do time ao lado);
//   - a matemática da venda: quantos leads / conversas / agendamentos /
//     visitas / pastas custam 1 venda;
//   - a conversão por origem;
//   - o gargalo (a passagem que mais perde contra o time) → foco sugerido;
//   - o plano do mês: o que falta produzir para bater a meta.
//
// BASE IMPORTADA: origem Importação e Google Sheets (sem entrega do SDR) é
// estudada à parte. São cargas em lote de contatos frios; somadas ao funil
// real, inflam "leads por venda" e escondem a conversão verdadeira do lead
// que chega quente.

import { diaDaSemanaIso, somarDias } from "@/features/metas-dia/metas-dia";

export type GrupoFunil = "real" | "base";

export type ContagemFunil = {
  recebidos: number;
  conversou: number;
  agendou: number;
  visitou: number;
  pasta: number;
  vendas: number;
  perdidos: number;
};

export type LinhaOrigem = ContagemFunil & { origem: string; grupo: GrupoFunil };

export type LinhaTime = ContagemFunil & { grupo: GrupoFunil; corretores: number };

export type MeuFunilRpc = {
  dias: number;
  inicio: string;
  fim: string;
  minhas: LinhaOrigem[];
  time: LinhaTime[];
  mes: { inicio: string; vendas: number; meta_vendas: number | null };
  atualizado_em: string | null;
};

/** Origens que são carga em lote — estudadas fora do funil real. */
export const ORIGENS_BASE_IMPORTADA = ["importacao", "google_sheets"] as const;

/** Abaixo disso, uma taxa é "amostra pequena": mostra, mas não dá veredito. */
export const AMOSTRA_MINIMA = 10;

/** Tempo mínimo com a tela aberta antes de liberar o "concluí o estudo". */
// 3 minutos: o bastante para ler a matemática da venda, o funil e a origem —
// menos que isso o corretor só rola a tela até o botão.
export const SEGUNDOS_MINIMOS_ESTUDO = 180;

export const PERIODOS_DIAS = [30, 90, 180] as const;
export type PeriodoDias = (typeof PERIODOS_DIAS)[number];
export const PERIODO_PADRAO: PeriodoDias = 90;

const VAZIO: ContagemFunil = {
  recebidos: 0,
  conversou: 0,
  agendou: 0,
  visitou: 0,
  pasta: 0,
  vendas: 0,
  perdidos: 0,
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function contagem(r: Record<string, unknown>): ContagemFunil {
  return {
    recebidos: num(r.recebidos),
    conversou: num(r.conversou),
    agendou: num(r.agendou),
    visitou: num(r.visitou),
    pasta: num(r.pasta),
    vendas: num(r.vendas),
    perdidos: num(r.perdidos),
  };
}

function grupo(v: unknown): GrupoFunil {
  return v === "base" ? "base" : "real";
}

/** Blinda a tela contra payload parcial/antigo: nunca NaN, nunca undefined. */
export function normalizarMeuFunil(raw: unknown): MeuFunilRpc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  const mes = (r.mes && typeof r.mes === "object" ? r.mes : {}) as Record<string, unknown>;
  const meta = Number(mes.meta_vendas);
  return {
    dias: num(r.dias) || PERIODO_PADRAO,
    inicio: String(r.inicio ?? ""),
    fim: String(r.fim ?? ""),
    minhas: lista(r.minhas).map((l) => ({
      ...contagem(l),
      origem: String(l.origem ?? "outro"),
      grupo: grupo(l.grupo),
    })),
    time: lista(r.time).map((l) => ({
      ...contagem(l),
      grupo: grupo(l.grupo),
      corretores: num(l.corretores),
    })),
    mes: {
      inicio: String(mes.inicio ?? ""),
      vendas: num(mes.vendas),
      meta_vendas: mes.meta_vendas === null || !Number.isFinite(meta) ? null : Math.max(0, meta),
    },
    atualizado_em: typeof r.atualizado_em === "string" ? r.atualizado_em : null,
  };
}

/** Soma as origens de um grupo. */
export function somarGrupo(linhas: LinhaOrigem[], g: GrupoFunil): ContagemFunil {
  return linhas
    .filter((l) => l.grupo === g)
    .reduce<ContagemFunil>(
      (acc, l) => ({
        recebidos: acc.recebidos + l.recebidos,
        conversou: acc.conversou + l.conversou,
        agendou: acc.agendou + l.agendou,
        visitou: acc.visitou + l.visitou,
        pasta: acc.pasta + l.pasta,
        vendas: acc.vendas + l.vendas,
        perdidos: acc.perdidos + l.perdidos,
      }),
      { ...VAZIO },
    );
}

/** Contagem do time num grupo (null = o time não tem esse grupo no período). */
export function timeDoGrupo(time: LinhaTime[], g: GrupoFunil): ContagemFunil | null {
  const t = time.find((x) => x.grupo === g);
  return t && t.recebidos > 0 ? t : null;
}

// ---------------------------------------------------------------------------
// Etapas e taxas de passagem
// ---------------------------------------------------------------------------

export type EtapaChave = "recebidos" | "conversou" | "agendou" | "visitou" | "pasta" | "vendas";

export const ETAPAS: Array<{ chave: EtapaChave; label: string; verbo: string }> = [
  { chave: "recebidos", label: "Leads recebidos", verbo: "receber" },
  { chave: "conversou", label: "Conversas", verbo: "conversar com" },
  { chave: "agendou", label: "Agendamentos", verbo: "agendar" },
  { chave: "visitou", label: "Visitas", verbo: "visitar com" },
  { chave: "pasta", label: "Pastas", verbo: "montar pasta de" },
  { chave: "vendas", label: "Vendas", verbo: "vender" },
];

/**
 * Foco do dia: a passagem que o corretor vai atacar. Cada uma nomeia a etapa
 * de CHEGADA ("agendar" = transformar conversa em agendamento). "volume" é a
 * alavanca de topo: mais leads (captação, oferta ativa, indicação).
 */
export type FocoChave = "volume" | "conversar" | "agendar" | "visitar" | "pasta" | "fechar";

export const FOCOS: Array<{ chave: FocoChave; label: string; dica: string }> = [
  {
    chave: "volume",
    label: "Gerar mais leads",
    dica: "Captação própria, oferta ativa e pedido de indicação. O funil converte, mas entra pouca gente.",
  },
  {
    chave: "conversar",
    label: "Conversar com quem recebi",
    dica: "Primeiro contato rápido e cadência completa: ligação + WhatsApp até o cliente responder.",
  },
  {
    chave: "agendar",
    label: "Transformar conversa em agendamento",
    dica: "Toda conversa termina com dia e hora marcados. Ofereça duas opções de horário, não pergunte se ele quer.",
  },
  {
    chave: "visitar",
    label: "Fazer o agendado comparecer",
    dica: "Confirme na véspera e 2h antes, mande localização e lembre o que ele vai ver.",
  },
  {
    chave: "pasta",
    label: "Transformar visita em pasta",
    dica: "Simule na visita e peça os documentos ali mesmo. Visita sem simulação vira 'vou pensar'.",
  },
  {
    chave: "fechar",
    label: "Fechar as pastas",
    dica: "Acompanhe a análise todo dia, antecipe pendências e marque a assinatura assim que aprovar.",
  },
];

/** Passagem → foco que a ataca. */
const FOCO_DA_PASSAGEM: Record<Exclude<EtapaChave, "recebidos">, FocoChave> = {
  conversou: "conversar",
  agendou: "agendar",
  visitou: "visitar",
  pasta: "pasta",
  vendas: "fechar",
};

export type Passagem = {
  de: EtapaChave;
  para: Exclude<EtapaChave, "recebidos">;
  label: string;
  /** Base da taxa (volume da etapa anterior). */
  base: number;
  volume: number;
  /** % de quem estava na etapa anterior e chegou a esta (null sem base). */
  taxa: number | null;
  taxaTime: number | null;
  /** Pontos percentuais contra o time (positivo = acima). */
  gapPp: number | null;
  amostraPequena: boolean;
  foco: FocoChave;
};

function pct(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : null;
}

export function passagens(minha: ContagemFunil, time: ContagemFunil | null): Passagem[] {
  const out: Passagem[] = [];
  for (let i = 1; i < ETAPAS.length; i++) {
    const de = ETAPAS[i - 1].chave;
    const para = ETAPAS[i].chave as Passagem["para"];
    const taxa = pct(minha[para], minha[de]);
    const taxaTime = time ? pct(time[para], time[de]) : null;
    out.push({
      de,
      para,
      label: `${ETAPAS[i - 1].label} → ${ETAPAS[i].label}`,
      base: minha[de],
      volume: minha[para],
      taxa,
      taxaTime,
      gapPp: taxa !== null && taxaTime !== null ? Math.round((taxa - taxaTime) * 10) / 10 : null,
      amostraPequena: minha[de] < AMOSTRA_MINIMA,
      foco: FOCO_DA_PASSAGEM[para],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// A matemática da venda
// ---------------------------------------------------------------------------

export type PorVenda = {
  chave: Exclude<EtapaChave, "vendas">;
  label: string;
  /** Quantos desta etapa para 1 venda (null = sem venda no período). */
  meu: number | null;
  time: number | null;
};

/** Razão com 1 casa (ex.: 32,5 leads por venda); null sem venda. */
function razao(parte: number, vendas: number): number | null {
  return vendas > 0 ? Math.round((parte / vendas) * 10) / 10 : null;
}

export function matematicaDaVenda(minha: ContagemFunil, time: ContagemFunil | null): PorVenda[] {
  return ETAPAS.filter((e) => e.chave !== "vendas").map((e) => ({
    chave: e.chave as PorVenda["chave"],
    label: e.label,
    meu: razao(minha[e.chave], minha.vendas),
    time: time ? razao(time[e.chave], time.vendas) : null,
  }));
}

// ---------------------------------------------------------------------------
// Conversão por origem
// ---------------------------------------------------------------------------

export type OrigemResumo = LinhaOrigem & {
  pctConversa: number | null;
  pctAgendamento: number | null;
  pctVisita: number | null;
  pctPasta: number | null;
  pctVenda: number | null;
  leadsPorVenda: number | null;
  amostraPequena: boolean;
};

/** Origens de um grupo, da que mais entrega venda à que menos. */
export function resumoPorOrigem(linhas: LinhaOrigem[], g: GrupoFunil): OrigemResumo[] {
  return linhas
    .filter((l) => l.grupo === g && l.recebidos > 0)
    .map((l) => ({
      ...l,
      pctConversa: pct(l.conversou, l.recebidos),
      pctAgendamento: pct(l.agendou, l.recebidos),
      pctVisita: pct(l.visitou, l.recebidos),
      pctPasta: pct(l.pasta, l.recebidos),
      pctVenda: pct(l.vendas, l.recebidos),
      leadsPorVenda: razao(l.recebidos, l.vendas),
      amostraPequena: l.recebidos < AMOSTRA_MINIMA,
    }))
    .sort(
      (a, b) =>
        (b.pctVenda ?? -1) - (a.pctVenda ?? -1) ||
        (b.pctAgendamento ?? -1) - (a.pctAgendamento ?? -1) ||
        b.recebidos - a.recebidos,
    );
}

// ---------------------------------------------------------------------------
// Diagnóstico: onde o funil vaza
// ---------------------------------------------------------------------------

export type Diagnostico = {
  foco: FocoChave;
  /** Passagem que motivou o foco (null = foco de volume / sem dado). */
  passagem: Passagem | null;
  motivo: string;
};

/**
 * Gargalo = a passagem com amostra suficiente que MAIS perde contra o time
 * (em pontos percentuais). Sem referência do time, a de menor taxa. Funil sem
 * leads ou todas as passagens acima do time → "volume": o que falta é gente
 * entrando, não conversão.
 */
export function diagnosticar(ps: Passagem[], minha: ContagemFunil): Diagnostico {
  if (minha.recebidos === 0) {
    return {
      foco: "volume",
      passagem: null,
      motivo: "Você não recebeu leads no período. Sem entrada não existe funil — comece pelo topo.",
    };
  }
  const medidas = ps.filter((p) => p.taxa !== null && !p.amostraPequena);
  const comTime = medidas.filter((p) => p.gapPp !== null);

  if (comTime.length > 0) {
    const pior = [...comTime].sort((a, b) => a.gapPp! - b.gapPp!)[0];
    if (pior.gapPp! < 0) {
      return {
        foco: pior.foco,
        passagem: pior,
        motivo: `Em ${pior.label.toLowerCase()} você converte ${fmtPct(pior.taxa)} e o time ${fmtPct(pior.taxaTime)} — é aqui que o seu funil mais vaza.`,
      };
    }
    return {
      foco: "volume",
      passagem: null,
      motivo:
        "Todas as suas passagens estão na média do time ou acima. Seu funil converte — para vender mais, ponha mais gente nele.",
    };
  }

  if (medidas.length > 0) {
    const pior = [...medidas].sort((a, b) => a.taxa! - b.taxa!)[0];
    return {
      foco: pior.foco,
      passagem: pior,
      motivo: `Sua menor taxa é em ${pior.label.toLowerCase()}: ${fmtPct(pior.taxa)}.`,
    };
  }

  return {
    foco: "conversar",
    passagem: null,
    motivo: `Ainda são poucos leads para medir taxas com segurança (menos de ${AMOSTRA_MINIMA} por etapa). Foque em conversar com todos que chegaram.`,
  };
}

// ---------------------------------------------------------------------------
// Plano do mês (cálculo reverso)
// ---------------------------------------------------------------------------

/** Dias úteis (seg–sex) de `dia` até o fim do mês, INCLUINDO `dia` se útil. */
export function diasUteisRestantesNoMes(dia: string): number {
  const mes = dia.slice(0, 7);
  let n = 0;
  for (let d = dia; d.slice(0, 7) === mes; d = somarDias(d, 1)) {
    if (diaDaSemanaIso(d) <= 5) n++;
  }
  return n;
}

export type PlanoItem = {
  chave: Exclude<EtapaChave, "vendas">;
  label: string;
  /** Total que precisa produzir no resto do mês. */
  total: number;
  /** Por dia útil restante (1 casa; null sem dia útil). */
  porDia: number | null;
};

export type PlanoMes = {
  meta: number;
  feitas: number;
  faltam: number;
  diasUteis: number;
  /** Régua usada: a do próprio corretor ou, sem venda no período, a do time. */
  fonte: "minha" | "time" | null;
  itens: PlanoItem[];
};

/**
 * Quanto de cada etapa falta produzir para as vendas que faltam, com a
 * conversão do PRÓPRIO corretor. Sem venda no período (razão indefinida), usa
 * a do time e declara — nunca inventa uma razão.
 */
export function planoDoMes(input: {
  meta: number;
  vendasMes: number;
  dia: string;
  minha: PorVenda[];
}): PlanoMes {
  const meta = Math.max(0, Math.floor(input.meta));
  const faltam = Math.max(0, meta - input.vendasMes);
  const diasUteis = diasUteisRestantesNoMes(input.dia);
  const temMinha = input.minha.every((p) => p.meu !== null);
  const temTime = input.minha.every((p) => p.time !== null);
  const fonte = temMinha ? "minha" : temTime ? "time" : null;
  const itens = fonte
    ? input.minha.map((p) => {
        const r = (fonte === "minha" ? p.meu : p.time) as number;
        const total = Math.ceil(r * faltam);
        return {
          chave: p.chave,
          label: p.label,
          total,
          porDia: diasUteis > 0 ? Math.round((total / diasUteis) * 10) / 10 : null,
        };
      })
    : [];
  return { meta, feitas: input.vendasMes, faltam, diasUteis, fonte, itens };
}

// ---------------------------------------------------------------------------
// Obrigatoriedade diária
// ---------------------------------------------------------------------------

export type EstudoDia = {
  dia: string;
  foco: FocoChave;
  compromisso: string | null;
  segundos_na_tela: number;
  concluido_em: string;
};

/**
 * Deve abrir o estudo obrigatório? Só corretor e só sem registro de HOJE (o
 * banco é a fonte). Todos os dias, fim de semana inclusive — não há "pular".
 */
export function precisaEstudar(input: {
  ehCorretor: boolean;
  estudoHoje: EstudoDia | null | undefined;
}): boolean {
  return input.ehCorretor && !input.estudoHoje;
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const fmt1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function fmtNum(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : fmt1.format(n);
}

export function fmtPct(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${fmt1.format(n)}%`;
}

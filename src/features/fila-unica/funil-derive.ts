// Funil das etapas da Fila Única — lógica PURA sobre as linhas de
// fila_funil_v1. Reproduz o desenho do mockup aprovado: degraus com largura
// pela raiz quadrada do volume, barra vermelha de parados 5+ dias, e no
// trilho lateral um marcador por divisa com a conversão atual → meta da casa.
//
// A conversão é uma APROXIMAÇÃO pelo status atual: "chegou à etapa seguinte
// ou além ÷ chegou a esta etapa ou além". Não é coorte (a coorte real vive na
// Inteligência, só para a gestão) e não conta os perdidos. O texto do recorte
// diz isso com todas as letras — nunca uma taxa inventada.

export type FunilRecorte = "safra" | "base";

/** Linha da RPC fila_funil_v1. */
export type FunilRow = {
  recorte: string;
  etapa: string;
  ordem: number;
  quantidade: number;
  parados: number;
};

export type EtapaKey =
  | "entrada"
  | "aguardando_atendimento"
  | "aguardando_retorno"
  | "qualificacao_corretor"
  | "em_atendimento"
  | "agendado"
  | "visita_realizada"
  | "analise_credito"
  | "venda";

type EtapaDef = {
  key: EtapaKey;
  ordem: number;
  label: string;
  /** Rótulo para o celular: cabe em 66 px, quebra só entre palavras. */
  labelCurto: string;
  sub: string;
};

/** Ordem do funil comercial (a mesma de funil_ordem no banco). */
export const ETAPAS_FUNIL: EtapaDef[] = [
  { key: "entrada", ordem: 0, label: "Entrada", labelCurto: "Entrada", sub: "novo, sem corretor" },
  {
    key: "aguardando_atendimento",
    ordem: 1,
    label: "Aguardando atendimento",
    labelCurto: "Aguard. atend.",
    sub: "distribuído, sem 1º contato",
  },
  {
    key: "aguardando_retorno",
    ordem: 2,
    label: "Aguardando retorno",
    labelCurto: "Aguard. retorno",
    sub: "cliente pediu retorno",
  },
  {
    key: "qualificacao_corretor",
    ordem: 3,
    label: "Qualificação corretor",
    labelCurto: "Qualific. corretor",
    sub: "entregue pelo bot ou SDR",
  },
  {
    key: "em_atendimento",
    ordem: 4,
    label: "Em atendimento",
    labelCurto: "Em atend.",
    sub: "conversa em andamento",
  },
  { key: "agendado", ordem: 5, label: "Agendado", labelCurto: "Agendado", sub: "visita marcada" },
  {
    key: "visita_realizada",
    ordem: 6,
    label: "Visita realizada",
    labelCurto: "Visita feita",
    sub: "validada",
  },
  {
    key: "analise_credito",
    ordem: 7,
    label: "Análise de crédito",
    labelCurto: "Análise crédito",
    sub: "pasta na Caixa",
  },
  { key: "venda", ordem: 8, label: "Venda", labelCurto: "Venda", sub: "contrato fechado" },
];

type PassagemDef = { de: EtapaKey; para: EtapaKey; label: string; meta: number; fonte: string };

/** Metas de passagem da casa — skills de rotina comercial e mentor, política
 *  de distribuição v1. A fonte vai no tooltip do marcador. */
export const PASSAGENS: PassagemDef[] = [
  {
    de: "entrada",
    para: "aguardando_atendimento",
    label: "distribuição",
    meta: 100,
    fonte: "política v1: lead com dono em 1h útil",
  },
  {
    de: "aguardando_atendimento",
    para: "aguardando_retorno",
    label: "1º contato efetivo",
    meta: 50,
    fonte: "política v1: contato efetivo 50% (provisório)",
  },
  {
    de: "aguardando_retorno",
    para: "qualificacao_corretor",
    label: "qualificação",
    meta: 50,
    fonte: "rotina comercial: 50% dos que responderam",
  },
  {
    de: "qualificacao_corretor",
    para: "em_atendimento",
    label: "vira conversa",
    meta: 90,
    fonte: "proposta: qualificado vira conversa em 1 dia",
  },
  {
    de: "em_atendimento",
    para: "agendado",
    label: "agendamento",
    meta: 70,
    fonte: "rotina comercial: 70% dos qualificados",
  },
  {
    de: "agendado",
    para: "visita_realizada",
    label: "comparecimento",
    meta: 65,
    fonte: "protocolo D-2/D-1/D+0: 60 a 75%",
  },
  {
    de: "visita_realizada",
    para: "analise_credito",
    label: "pasta / proposta",
    meta: 75,
    fonte: "rotina comercial: 75% das visitas",
  },
  {
    de: "analise_credito",
    para: "venda",
    label: "fechamento",
    meta: 30,
    fonte: "rotina comercial: 30% · coorte mede 39%",
  },
];

/** Por que cada etapa parada custa caro — copy do painel de vazamentos. */
export const VAZAMENTO_COPY: Record<EtapaKey, string> = {
  entrada: "Lead sem dono não é atendido por ninguém. A roleta existe para isso.",
  aguardando_atendimento:
    "Lead distribuído sem o primeiro contato. Cada dia parado aqui derruba a taxa de resposta — e o SLA devolve o lead para a roleta.",
  aguardando_retorno:
    "O cliente pediu retorno e ninguém voltou. É a passagem mais barata de recuperar: uma mensagem.",
  qualificacao_corretor:
    "O lead chegou qualificado pelo bot ou pelo SDR e o corretor não deu o passo seguinte. É perda de investimento em mídia.",
  em_atendimento:
    "“Em atendimento” virou rótulo, não estado. Sem próximo passo com data, o lead esfria aqui.",
  agendado:
    "Visita marcada sem confirmação. Confirmar em D-2, D-1 e no dia é o que sustenta o comparecimento.",
  visita_realizada:
    "Visitou e não foi para a pasta. A proposta precisa sair enquanto a visita está fresca.",
  analise_credito:
    "A passagem mais saudável do funil: pasta parada é venda parada. Cobrar a Caixa e o cliente é a ação do dia.",
  venda: "Venda fechada não para — pós-venda é outra régua.",
};

export type FunilTom = "good" | "warn" | "crit";

export type FunilEtapa = {
  key: EtapaKey;
  ordem: number;
  label: string;
  labelCurto: string;
  sub: string;
  quantidade: number;
  parados: number;
  /** % de parados sobre a etapa (null fora do funil comercial ou com etapa vazia). */
  pctParados: number | null;
  /** Largura relativa do degrau (0..1), raiz quadrada do volume sobre o maior. */
  largura: number;
};

export type FunilPassagem = {
  de: EtapaKey;
  para: EtapaKey;
  label: string;
  /** Conversão aproximada (%) — null sem denominador ou quando o recorte não a mede. */
  atual: number | null;
  meta: number;
  fonte: string;
  tom: FunilTom | null;
  nota: string | null;
};

export type FunilLeitura = {
  recorte: FunilRecorte;
  dias: number;
  etapas: FunilEtapa[];
  /** Uma passagem por divisa entre etapas consecutivas de `etapas`. */
  passagens: FunilPassagem[];
  /** Leads vivos ou fechados (fora os perdidos). */
  total: number;
  perdidos: number;
  /** Etapas do funil comercial com mais leads parados — as três mais caras. */
  vazamentos: FunilEtapa[];
  nota: string;
};

const LARGURA_MIN = 0.13;
const LARGURA_VAZIA = 0.1;

/** Conversão de uma passagem (%) — "chegou à seguinte ou além ÷ chegou a esta ou além". */
export function conversaoAproximada(chegouAqui: number, chegouSeguinte: number): number | null {
  if (chegouAqui <= 0) return null;
  return Math.round((chegouSeguinte / chegouAqui) * 100);
}

export function tomDaPassagem(atual: number | null, meta: number): FunilTom | null {
  if (atual === null) return null;
  const r = atual / meta;
  return r >= 1 ? "good" : r >= 0.7 ? "warn" : "crit";
}

function notaDoRecorte(recorte: FunilRecorte, dias: number): string {
  if (recorte === "safra") {
    return (
      `Safra: leads criados nos últimos ${dias} dias, pelo status atual. As setas medem ` +
      `"chegou à etapa seguinte ou além ÷ chegou a esta etapa ou além": é aproximação, ` +
      `não coorte, e não conta os perdidos. Venda fica em branco porque o ciclo é maior que ${dias} dias.`
    );
  }
  return (
    "Base inteira: a carteira viva ou fechada, pelo status atual. As setas usam o mesmo " +
    "cálculo aproximado; os perdidos ficam na saída lateral."
  );
}

/** Funde as linhas de um recorte no desenho do funil. Etapas sem linha valem 0;
 *  "entrada" só aparece quando há lead sem dono no recorte. */
export function montarFunil(
  rows: FunilRow[],
  recorte: FunilRecorte,
  opts: { dias?: number } = {},
): FunilLeitura {
  const dias = opts.dias ?? 30;
  const porEtapa = new Map<string, { quantidade: number; parados: number }>();
  let perdidos = 0;
  for (const r of rows) {
    if (r.recorte !== recorte) continue;
    if (r.etapa === "perdido") {
      perdidos += r.quantidade;
      continue;
    }
    const atual = porEtapa.get(r.etapa) ?? { quantidade: 0, parados: 0 };
    porEtapa.set(r.etapa, {
      quantidade: atual.quantidade + r.quantidade,
      parados: atual.parados + r.parados,
    });
  }

  const defs = ETAPAS_FUNIL.filter(
    (d) => d.key !== "entrada" || (porEtapa.get("entrada")?.quantidade ?? 0) > 0,
  );
  const maior = Math.max(0, ...defs.map((d) => porEtapa.get(d.key)?.quantidade ?? 0));

  const etapas: FunilEtapa[] = defs.map((d) => {
    const v = porEtapa.get(d.key) ?? { quantidade: 0, parados: 0 };
    const comercial = d.ordem >= 1 && d.ordem <= 7;
    return {
      key: d.key,
      ordem: d.ordem,
      label: d.label,
      labelCurto: d.labelCurto,
      sub: d.sub,
      quantidade: v.quantidade,
      parados: comercial ? v.parados : 0,
      pctParados:
        comercial && v.quantidade > 0 ? Math.round((v.parados / v.quantidade) * 100) : null,
      largura:
        v.quantidade <= 0 || maior <= 0
          ? LARGURA_VAZIA
          : Math.max(LARGURA_MIN, Math.sqrt(v.quantidade / maior)),
    };
  });

  // "Chegou a esta etapa ou além": soma da etapa e das seguintes.
  const chegou: number[] = [];
  let acc = 0;
  for (let i = etapas.length - 1; i >= 0; i--) {
    acc += etapas[i].quantidade;
    chegou[i] = acc;
  }

  const passagens: FunilPassagem[] = [];
  for (let i = 0; i < etapas.length - 1; i++) {
    const de = etapas[i].key;
    const para = etapas[i + 1].key;
    const def = PASSAGENS.find((p) => p.de === de && p.para === para);
    if (!def) continue;
    const mede = !(recorte === "safra" && para === "venda");
    const atual = mede ? conversaoAproximada(chegou[i], chegou[i + 1]) : null;
    passagens.push({
      de,
      para,
      label: def.label,
      atual,
      meta: def.meta,
      fonte: def.fonte,
      tom: tomDaPassagem(atual, def.meta),
      nota: !mede ? `ciclo maior que ${dias} dias` : atual === null ? "sem lead na etapa" : null,
    });
  }

  const vazamentos = etapas
    .filter((e) => e.pctParados !== null && e.parados > 0)
    .sort((a, b) => b.parados - a.parados || (b.pctParados ?? 0) - (a.pctParados ?? 0))
    .slice(0, 3);

  return {
    recorte,
    dias,
    etapas,
    passagens,
    total: etapas.reduce((s, e) => s + e.quantidade, 0),
    perdidos,
    vazamentos,
    nota: notaDoRecorte(recorte, dias),
  };
}

/** Geometria do degrau: largura da caixa e o polígono do trapézio, como no
 *  mockup (topo = largura desta etapa, base = largura da seguinte). */
export function geometriaDoDegrau(
  etapas: FunilEtapa[],
  i: number,
): { caixa: number; clipPath: string } {
  const topo = etapas[i].largura;
  const base = i < etapas.length - 1 ? etapas[i + 1].largura : topo * 0.6;
  const caixa = Math.max(topo, base);
  const tIn = ((caixa - topo) / 2 / caixa) * 100;
  const bIn = ((caixa - base) / 2 / caixa) * 100;
  const f = (n: number) => Math.round(n * 100) / 100;
  return {
    caixa,
    clipPath: `polygon(${f(tIn)}% 0, ${f(100 - tIn)}% 0, ${f(100 - bIn)}% 100%, ${f(bIn)}% 100%)`,
  };
}

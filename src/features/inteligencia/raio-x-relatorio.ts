// Modelo do relatório do Raio-X do Corretor (o PDF da reunião 1:1).
//
// A tela mostra números; o relatório precisa CONCLUIR. Aqui mora a lógica pura
// que transforma os dados da tela em documento: leitura do período, gargalo
// principal, quanto vale fechar esse gap, tendência, e o plano de ação que o
// gestor leva para a conversa. Sem browser, sem SQL — testável direto.

import type { CoorteAgregada } from "./funil-derive";
import type { SinalCorretor } from "./performance-derive";
import type { MotivoPerdaRow, PerformanceDrillRow } from "./queries";
import type { ComparacaoMetrica, PassagemComparada, Trimestre } from "./raio-x-derive";

// ---------------------------------------------------------------------------
// Formatação (compartilhada com o renderizador do PDF)
// ---------------------------------------------------------------------------

export const brl = (n: number): string =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const brlCompacto = (n: number): string =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });

export const numero = (n: number): string => n.toLocaleString("pt-BR");

export const pct = (n: number, casas = 1): string =>
  `${n.toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;

/** Um decimal, vírgula brasileira — "2,6 vendas" e não "2.6". */
export const decimal = (n: number): string =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** "2026-07-01" → "jul/26" (o toLocaleDateString devolveria "jul. de 26"). */
export const mesCurto = (iso: string): string => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MESES_CURTOS[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`;
};

export const minutos = (n: number | null): string =>
  n === null ? "—" : n >= 60 ? `${Math.round((n / 60) * 10) / 10}h` : `${Math.round(n)}min`;

// ---------------------------------------------------------------------------
// Tipos do relatório
// ---------------------------------------------------------------------------

export type Tom = "positivo" | "atencao" | "critico" | "neutro";

/** Um parágrafo de leitura do período — o que o número quer dizer. */
export type Leitura = { tom: Tom; titulo: string; texto: string };

/** Uma linha do plano de ação da 1:1. */
export type Acao = { prioridade: number; titulo: string; porque: string; como: string };

export type Tendencia = {
  recentes: { meses: number; vendas: number; vgv: number };
  anteriores: { meses: number; vendas: number; vgv: number };
  deltaVendasPct: number | null;
  direcao: "subindo" | "caindo" | "estavel";
};

export type ImpactoGap = {
  etapa: string;
  gapPp: number;
  minhaTaxa: number;
  taxaTime: number;
  vendasExtras: number;
  vgvExtra: number | null;
};

export type ItemCarteira = {
  etapa: string;
  label: string;
  quantidade: number;
  parados: number | null;
  vgv: number | null;
};

export type ItemExcecao = { tipo: string; tipoLabel: string; leadNome: string };

export type MetaRelatorio = {
  metaVgv: number;
  metaVendas: number;
  realizadoVgv: number;
  realizadoVendas: number;
  projecaoVgv: number | null;
  farol: "verde" | "ambar" | "vermelho" | "neutro";
  diasUteis: { total: number; passados: number; restantes: number } | null;
};

export type RaioXRelatorioInput = {
  nome: string;
  periodoLabel: string;
  de: string | null;
  ate: string | null;
  geradoEm: Date;
  geradoPor: string | null;
  presente: boolean | null;
  cargaAtiva: number;
  capacidadePct: number | null;
  sinal: SinalCorretor;
  comparacoes: ComparacaoMetrica[];
  funil: PassagemComparada[];
  /** Coorte sem cobertura mínima: o funil do período não é confiável. */
  funilIndisponivel: boolean;
  coorte: CoorteAgregada | null;
  coberturaMinima: number;
  serie: PerformanceDrillRow[];
  trimestres: Trimestre[];
  carteira: ItemCarteira[];
  excecoes: ItemExcecao[];
  perdas: Array<MotivoPerdaRow & { label: string }>;
  comissoes: { pago: number; aberto: number };
  meta: MetaRelatorio | null;
  atualizadoEm: string | null;
};

export type Totais = {
  leads: number;
  contatos: number;
  agendamentos: number;
  visitas: number;
  noShows: number;
  analises: number;
  vendas: number;
  vgv: number;
  ticketMedio: number | null;
  /** Vendas por 100 leads recebidos na janela (null sem leads). */
  conversaoPct: number | null;
};

export type RaioXRelatorio = RaioXRelatorioInput & {
  totais: Totais;
  gargalo: PassagemComparada | null;
  forte: PassagemComparada | null;
  impacto: ImpactoGap | null;
  tendencia: Tendencia | null;
  leituras: Leitura[];
  acoes: Acao[];
  /** Soma dos "parados" da carteira — o dinheiro esquecido na gaveta. */
  paradosNaCarteira: number;
};

// ---------------------------------------------------------------------------
// Blocos de análise
// ---------------------------------------------------------------------------

const GAP_RELEVANTE_PP = 3;

/** Etapa em que ele mais fica atrás do time (gap negativo mais fundo). */
export function gargaloPrincipal(funil: PassagemComparada[]): PassagemComparada | null {
  const candidatos = funil.filter(
    (f) => f.gapPp !== null && f.gapPp <= -GAP_RELEVANTE_PP && f.minhaTaxa !== null,
  );
  if (candidatos.length === 0) return null;
  return candidatos.reduce((pior, f) => ((f.gapPp ?? 0) < (pior.gapPp ?? 0) ? f : pior));
}

/** Etapa em que ele mais supera o time — o que preservar (e ensinar). */
export function pontoForte(funil: PassagemComparada[]): PassagemComparada | null {
  const candidatos = funil.filter((f) => f.gapPp !== null && f.gapPp >= GAP_RELEVANTE_PP);
  if (candidatos.length === 0) return null;
  return candidatos.reduce((melhor, f) => ((f.gapPp ?? 0) > (melhor.gapPp ?? 0) ? f : melhor));
}

export function totaisDaSerie(serie: PerformanceDrillRow[]): Totais {
  const acc = serie.reduce(
    (a, m) => ({
      leads: a.leads + m.leads_recebidos,
      contatos: a.contatos + m.contatos,
      agendamentos: a.agendamentos + m.agendamentos_criados,
      visitas: a.visitas + m.visitas_realizadas,
      noShows: a.noShows + m.no_shows,
      analises: a.analises + m.analises,
      vendas: a.vendas + m.vendas,
      vgv: a.vgv + (Number(m.vgv) || 0),
    }),
    {
      leads: 0,
      contatos: 0,
      agendamentos: 0,
      visitas: 0,
      noShows: 0,
      analises: 0,
      vendas: 0,
      vgv: 0,
    },
  );
  return {
    ...acc,
    ticketMedio: acc.vendas > 0 ? Math.round(acc.vgv / acc.vendas) : null,
    conversaoPct: acc.leads > 0 ? Math.round((acc.vendas / acc.leads) * 1000) / 10 : null,
  };
}

/**
 * Compara a metade recente da série com a anterior (mínimo 2 meses de cada
 * lado). É a leitura de trajetória: subindo, caindo ou estável.
 */
export function tendenciaSerie(serie: PerformanceDrillRow[]): Tendencia | null {
  if (serie.length < 4) return null;
  const ordenada = [...serie].sort((a, b) => a.mes.localeCompare(b.mes));
  const corte = Math.floor(ordenada.length / 2);
  const soma = (rows: PerformanceDrillRow[]) => ({
    meses: rows.length,
    vendas: rows.reduce((s, m) => s + m.vendas, 0),
    vgv: rows.reduce((s, m) => s + (Number(m.vgv) || 0), 0),
  });
  const anteriores = soma(ordenada.slice(0, corte));
  const recentes = soma(ordenada.slice(corte));
  // Normaliza por mês: as metades podem ter tamanhos diferentes (série ímpar).
  const mediaAnt = anteriores.vendas / anteriores.meses;
  const mediaRec = recentes.vendas / recentes.meses;
  const deltaVendasPct = mediaAnt > 0 ? Math.round(((mediaRec - mediaAnt) / mediaAnt) * 100) : null;
  const direcao: Tendencia["direcao"] =
    deltaVendasPct === null
      ? mediaRec > 0
        ? "subindo"
        : "estavel"
      : deltaVendasPct >= 15
        ? "subindo"
        : deltaVendasPct <= -15
          ? "caindo"
          : "estavel";
  return { recentes, anteriores, deltaVendasPct, direcao };
}

/**
 * Quanto vale fechar o gargalo: elevar UMA etapa até a taxa do time multiplica
 * tudo o que vem depois. Mantém as demais taxas dele — é o ganho conservador
 * de corrigir só aquele ponto, não uma promessa de virar o melhor do time.
 */
export function impactoDoGap(
  gargalo: PassagemComparada | null,
  vendasNoPeriodo: number,
  ticketMedio: number | null,
): ImpactoGap | null {
  if (!gargalo || gargalo.minhaTaxa === null || gargalo.taxaTime === null) return null;
  if (gargalo.minhaTaxa <= 0 || vendasNoPeriodo <= 0) return null;
  const fator = gargalo.taxaTime / gargalo.minhaTaxa;
  const vendasExtras = Math.round((vendasNoPeriodo * fator - vendasNoPeriodo) * 10) / 10;
  if (vendasExtras <= 0) return null;
  return {
    etapa: gargalo.etapa,
    gapPp: gargalo.gapPp ?? 0,
    minhaTaxa: gargalo.minhaTaxa,
    taxaTime: gargalo.taxaTime,
    vendasExtras,
    vgvExtra: ticketMedio !== null ? Math.round(vendasExtras * ticketMedio) : null,
  };
}

function comparacao(comparacoes: ComparacaoMetrica[], chave: string): ComparacaoMetrica | null {
  return comparacoes.find((c) => c.chave === chave) ?? null;
}

/** Verdadeiro quando o corretor está melhor que o time naquela métrica. */
function acimaDoTime(c: ComparacaoMetrica | null): boolean | null {
  if (!c || c.deltaPct === null) return null;
  return c.menorMelhor ? c.deltaPct < 0 : c.deltaPct > 0;
}

// ---------------------------------------------------------------------------
// Leitura do período (o texto que o gestor lê em voz alta na 1:1)
// ---------------------------------------------------------------------------

export function leiturasDoPeriodo(
  input: RaioXRelatorioInput,
  ctx: {
    totais: Totais;
    gargalo: PassagemComparada | null;
    forte: PassagemComparada | null;
    impacto: ImpactoGap | null;
    tendencia: Tendencia | null;
    paradosNaCarteira: number;
  },
): Leitura[] {
  const out: Leitura[] = [];
  const primeiroNome = input.nome.split(" ")[0];
  const vendas = comparacao(input.comparacoes, "vendas");
  const resposta = comparacao(input.comparacoes, "primeira_resposta");
  const visitas = comparacao(input.comparacoes, "visitas_realizadas");

  // 1. Resultado no período.
  if (ctx.totais.vendas > 0 || ctx.totais.leads > 0) {
    const acima = acimaDoTime(vendas);
    out.push({
      tom: acima === null ? "neutro" : acima ? "positivo" : "atencao",
      titulo: "Resultado do período",
      texto:
        `${ctx.totais.vendas} venda(s) e ${brl(ctx.totais.vgv)} de VGV em ${numero(ctx.totais.leads)} leads recebidos` +
        (ctx.totais.conversaoPct !== null
          ? ` — conversão de ${pct(ctx.totais.conversaoPct)} lead→venda`
          : "") +
        (ctx.totais.ticketMedio !== null
          ? `, ticket médio de ${brl(ctx.totais.ticketMedio)}`
          : "") +
        (vendas?.deltaPct != null
          ? `. Contra a média do time: ${vendas.deltaPct > 0 ? "+" : ""}${vendas.deltaPct}% em vendas.`
          : ". Sem amostra do time suficiente para comparar."),
    });
  }

  // 2. Tendência.
  if (ctx.tendencia) {
    const t = ctx.tendencia;
    out.push({
      tom: t.direcao === "subindo" ? "positivo" : t.direcao === "caindo" ? "critico" : "neutro",
      titulo:
        t.direcao === "subindo"
          ? "Trajetória em alta"
          : t.direcao === "caindo"
            ? "Trajetória em queda"
            : "Trajetória estável",
      texto:
        `Últimos ${t.recentes.meses} meses: ${t.recentes.vendas} venda(s) · ${brl(t.recentes.vgv)}. ` +
        `Os ${t.anteriores.meses} meses anteriores: ${t.anteriores.vendas} venda(s) · ${brl(t.anteriores.vgv)}` +
        (t.deltaVendasPct !== null
          ? ` (${t.deltaVendasPct > 0 ? "+" : ""}${t.deltaVendasPct}% em vendas por mês).`
          : "."),
    });
  }

  // 3. Gargalo do funil + o que vale corrigir.
  if (input.funilIndisponivel) {
    out.push({
      tom: "neutro",
      titulo: "Funil sem base confiável",
      texto: `A cobertura de histórico da coorte ficou abaixo de ${input.coberturaMinima}% no período — as taxas de passagem seriam enganosas e por isso não entram neste relatório.`,
    });
  } else if (ctx.gargalo) {
    out.push({
      tom: (ctx.gargalo.gapPp ?? 0) <= -10 ? "critico" : "atencao",
      titulo: `O funil trava em: ${ctx.gargalo.etapa}`,
      texto:
        `${primeiroNome} converte ${pct(ctx.gargalo.minhaTaxa ?? 0)} nessa passagem contra ${pct(ctx.gargalo.taxaTime ?? 0)} do time ` +
        `(${ctx.gargalo.gapPp} p.p. abaixo).` +
        (ctx.impacto
          ? ` Levar só essa etapa ao patamar do time valeria ~${decimal(ctx.impacto.vendasExtras)} venda(s) a mais no mesmo volume de leads` +
            (ctx.impacto.vgvExtra !== null ? ` (~${brl(ctx.impacto.vgvExtra)} de VGV).` : ".")
          : ""),
    });
  } else if (input.funil.length > 0) {
    out.push({
      tom: "positivo",
      titulo: "Funil sem gargalo relevante",
      texto: `Nenhuma etapa está mais de ${GAP_RELEVANTE_PP} p.p. abaixo da média do time no período — o problema (se houver) é de volume de entrada, não de conversão.`,
    });
  }

  // 4. Ponto forte a preservar.
  if (ctx.forte) {
    out.push({
      tom: "positivo",
      titulo: `Força: ${ctx.forte.etapa}`,
      texto: `${pct(ctx.forte.minhaTaxa ?? 0)} contra ${pct(ctx.forte.taxaTime ?? 0)} do time (+${ctx.forte.gapPp} p.p.). Vale mapear o que ele(a) faz aqui e transformar em padrão do time.`,
    });
  }

  // 5. Velocidade de resposta — o KPI que mais mexe no topo do funil.
  if (resposta?.valor != null) {
    const rapido = acimaDoTime(resposta);
    out.push({
      tom: rapido === false ? "atencao" : rapido === true ? "positivo" : "neutro",
      titulo: "Tempo de 1ª resposta",
      texto:
        `Mediana de ${minutos(resposta.valor)} para o primeiro retorno` +
        (resposta.mediaTime !== null
          ? ` contra ${minutos(Math.round(resposta.mediaTime))} do time.`
          : ".") +
        (rapido === false
          ? " Lead de portal esfria em minutos: essa diferença aparece lá na frente como visita que não aconteceu."
          : ""),
    });
  }

  // 6. Esforço x resultado (visita é a moeda do mês).
  if (visitas?.valor != null && ctx.totais.noShows > 0) {
    const taxaNoShow =
      ctx.totais.visitas + ctx.totais.noShows > 0
        ? Math.round((ctx.totais.noShows / (ctx.totais.visitas + ctx.totais.noShows)) * 1000) / 10
        : null;
    if (taxaNoShow !== null && taxaNoShow >= 20) {
      out.push({
        tom: "atencao",
        titulo: "No-show alto",
        texto: `${ctx.totais.noShows} visita(s) agendada(s) não aconteceram — ${pct(taxaNoShow)} das visitas marcadas. Confirmação D-1 e lembrete no dia resolvem a maior parte disso.`,
      });
    }
  }

  // 7. Carteira parada — receita já paga esperando follow-up.
  if (ctx.paradosNaCarteira > 0) {
    const carteiraTotal = input.carteira.reduce((s, c) => s + c.quantidade, 0);
    const share =
      carteiraTotal > 0 ? Math.round((ctx.paradosNaCarteira / carteiraTotal) * 100) : null;
    out.push({
      tom: share !== null && share >= 30 ? "critico" : "atencao",
      titulo: "Carteira parada",
      texto:
        `${ctx.paradosNaCarteira} lead(s) ativos sem movimento` +
        (share !== null ? ` — ${share}% da carteira de ${carteiraTotal}.` : ".") +
        " Lead já pago que ninguém tocou é o retrabalho mais caro da operação.",
    });
  }

  // 8. Meta do mês corrente.
  if (input.meta && input.meta.metaVgv > 0) {
    const m = input.meta;
    out.push({
      tom:
        m.farol === "verde"
          ? "positivo"
          : m.farol === "vermelho"
            ? "critico"
            : m.farol === "ambar"
              ? "atencao"
              : "neutro",
      titulo: "Ritmo da meta (mês corrente)",
      texto:
        `${brl(m.realizadoVgv)} de ${brl(m.metaVgv)}` +
        (m.diasUteis
          ? ` em ${m.diasUteis.passados} de ${m.diasUteis.total} dias úteis (${m.diasUteis.restantes} restantes)`
          : "") +
        (m.projecaoVgv !== null ? `. Projeção linear de fechamento: ${brl(m.projecaoVgv)}.` : "."),
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Plano de ação (o que sai combinado da 1:1)
// ---------------------------------------------------------------------------

export function planoDeAcao(
  input: RaioXRelatorioInput,
  ctx: {
    totais: Totais;
    gargalo: PassagemComparada | null;
    impacto: ImpactoGap | null;
    tendencia: Tendencia | null;
    paradosNaCarteira: number;
  },
): Acao[] {
  const candidatas: Array<Acao & { peso: number }> = [];
  const resposta = comparacao(input.comparacoes, "primeira_resposta");
  const contatos = comparacao(input.comparacoes, "contatos");

  if (ctx.gargalo) {
    candidatas.push({
      peso: 100 + Math.abs(ctx.gargalo.gapPp ?? 0),
      prioridade: 0,
      titulo: `Atacar a passagem "${ctx.gargalo.etapa}"`,
      porque:
        `${pct(ctx.gargalo.minhaTaxa ?? 0)} contra ${pct(ctx.gargalo.taxaTime ?? 0)} do time` +
        (ctx.impacto
          ? ` — vale ~${decimal(ctx.impacto.vendasExtras)} venda(s)` +
            (ctx.impacto.vgvExtra !== null ? ` / ${brl(ctx.impacto.vgvExtra)}` : "") +
            " no mesmo volume de leads."
          : "."),
      como: "Revisar 5 leads que morreram nessa etapa na semana, roleplay do trecho do atendimento correspondente e checklist obrigatório antes de mover o lead.",
    });
  }

  if (ctx.paradosNaCarteira > 0) {
    candidatas.push({
      peso: 60 + Math.min(40, ctx.paradosNaCarteira),
      prioridade: 0,
      titulo: `Zerar os ${ctx.paradosNaCarteira} leads parados da carteira`,
      porque:
        "Lead ativo sem interação é receita já paga parada — e é o que mais infla a carga sem gerar visita.",
      como: "Bloquear 1h por dia para follow-up da fila de parados, começando pelos de maior valor potencial; descartar com motivo o que não tem perfil.",
    });
  }

  if (resposta && acimaDoTime(resposta) === false) {
    candidatas.push({
      peso: 80,
      prioridade: 0,
      titulo: "Cortar o tempo de 1ª resposta",
      porque: `Mediana de ${minutos(resposta.valor)} contra ${minutos(resposta.mediaTime !== null ? Math.round(resposta.mediaTime) : null)} do time.`,
      como: "Notificação de lead novo ativa no celular, mensagem-padrão de abertura pronta e meta de responder em até 5 minutos no horário comercial.",
    });
  }

  if (input.excecoes.length > 0) {
    candidatas.push({
      peso: 70 + Math.min(30, input.excecoes.length),
      prioridade: 0,
      titulo: `Fechar as ${input.excecoes.length} exceção(ões) abertas hoje`,
      porque:
        "São os leads que o Painel do Dia já sinalizou como fora do padrão (SLA, visita sem registro, análise parada).",
      como: "Resolver antes do fim do dia, na ordem do painel, e registrar o desfecho no CRM em cada uma.",
    });
  }

  if (contatos && acimaDoTime(contatos) === false && ctx.totais.leads > 0) {
    candidatas.push({
      peso: 50,
      prioridade: 0,
      titulo: "Subir o volume de contatos reais",
      porque: `${numero(ctx.totais.contatos)} contatos para ${numero(ctx.totais.leads)} leads no período — abaixo da média do time.`,
      como: "Meta diária de contatos definida na reunião e conferida no Painel do Dia; cadência de 3 tentativas por lead novo em canais diferentes.",
    });
  }

  const perdaTop = [...input.perdas].sort((a, b) => b.quantidade - a.quantidade)[0];
  if (perdaTop && perdaTop.quantidade >= 3) {
    candidatas.push({
      peso: 40 + perdaTop.quantidade,
      prioridade: 0,
      titulo: `Tratar a perda nº 1: ${perdaTop.label}`,
      porque:
        `${perdaTop.quantidade} lead(s) perdidos por esse motivo no período` +
        (perdaTop.vgv_estimado ? ` (~${brl(Number(perdaTop.vgv_estimado))} estimados).` : "."),
      como: "Treinar a objeção correspondente e antecipar o filtro na qualificação, antes de investir visita no lead.",
    });
  }

  if (ctx.tendencia?.direcao === "caindo") {
    candidatas.push({
      peso: 90,
      prioridade: 0,
      titulo: "Plano de recuperação de ritmo",
      porque: `Vendas por mês caíram ${Math.abs(ctx.tendencia.deltaVendasPct ?? 0)}% na comparação entre as metades do período.`,
      como: "Definir meta semanal de visitas com acompanhamento às sextas e revisar a origem dos leads que ele(a) vem recebendo.",
    });
  }

  if (candidatas.length === 0) {
    candidatas.push({
      peso: 1,
      prioridade: 0,
      titulo: "Manter o padrão e aumentar volume",
      porque:
        "Nenhum gargalo relevante de conversão no período — o teto agora é entrada de leads e capacidade.",
      como: "Avaliar aumento do limite diário na roleta e acompanhar a carga ativa para não derrubar a qualidade do atendimento.",
    });
  }

  return candidatas
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 4)
    .map(({ peso: _peso, ...a }, i) => ({ ...a, prioridade: i + 1 }));
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

export function montarRelatorioRaioX(input: RaioXRelatorioInput): RaioXRelatorio {
  const totais = totaisDaSerie(input.serie);
  const funil = input.funilIndisponivel ? [] : input.funil;
  const gargalo = gargaloPrincipal(funil);
  const forte = pontoForte(funil);
  const impacto = impactoDoGap(gargalo, totais.vendas, totais.ticketMedio);
  const tendencia = tendenciaSerie(input.serie);
  const paradosNaCarteira = input.carteira.reduce((s, c) => s + (c.parados ?? 0), 0);
  const ctx = { totais, gargalo, forte, impacto, tendencia, paradosNaCarteira };
  return {
    ...input,
    totais,
    gargalo,
    forte,
    impacto,
    tendencia,
    paradosNaCarteira,
    leituras: leiturasDoPeriodo(input, ctx),
    acoes: planoDeAcao(input, ctx),
  };
}

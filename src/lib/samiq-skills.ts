// Skills da Sami como FERRAMENTAS (Onda S5, decisão D16) — a parte PURA.
//
// Quatro habilidades que antes viviam em prompts soltos viram funções
// determinísticas que o modelo chama e narra:
//  1) pré-análise MCMV: tabela APROVE 2026 (orcamento.ts) + estimativa de
//     prestação (mcmv-estimativa.ts). O modelo NUNCA faz aritmética de parcela.
//  2) qualificação em 7 dimensões: o que já se sabe do cliente, o que falta e
//     a pergunta certa para cada lacuna — alimenta propor_qualificacao (D2d).
//  3) curadoria com estoque real: projetos + unidades disponíveis + campanha
//     vigente + "cabe na renda", ordenados por aderência.
//  4) preparador de visita: o kit é montado no servidor (samiq-skills.server.ts)
//     com as consultas; aqui fica só a regra de "o que checar antes".
//
// Sem rede nem Supabase. Toda saída passa pela minimização padrão.

import { z } from "zod";
import { avaliarAderencia, calcularOrcamento, type ResultadoOrcamento } from "@/lib/orcamento";
import { RENDA_MIN_APROVE } from "@/lib/aprove2026";
import {
  arredondaPrestacao,
  avaliarRenda,
  faixaPorRenda,
  rendaMinimaEstimada,
} from "@/lib/mcmv-estimativa";
import { focosPorProjeto, type FocoRow } from "@/lib/prateleira";
import { displayNameForSamiQ, redactSamiQFreeText } from "@/lib/samiq-governance";
import type { LeadDetalheRow } from "@/lib/samiq-tools";

// ---------------------------------------------------------------------------
// 1) Pré-análise MCMV
// ---------------------------------------------------------------------------

export const PreAnaliseMcmvInput = z.object({
  renda: z
    .number()
    .positive()
    .max(1_000_000)
    .describe("Renda bruta familiar mensal em reais (composição, se houver)"),
  entrada: z.number().min(0).max(50_000_000).optional().describe("Recursos próprios em reais"),
  fgts: z.number().min(0).max(50_000_000).optional().describe("Saldo de FGTS em reais"),
  tem_36_meses_registro: z
    .boolean()
    .optional()
    .describe("true quando o cliente tem 36 meses ou mais de carteira assinada (taxa com redutor)"),
  tem_dependente: z
    .boolean()
    .optional()
    .describe("true quando há dependente (subsídio maior na Faixa 1)"),
  preco_imovel: z
    .number()
    .positive()
    .max(50_000_000)
    .optional()
    .describe("Preço do imóvel em reais, para responder 'cabe?'"),
});
export type PreAnaliseMcmvArgs = z.infer<typeof PreAnaliseMcmvInput>;

const arredonda = (v: number) => Math.round(v);

/**
 * Pré-análise determinística. É ESTIMATIVA para orientar a conversa, nunca
 * aprovação — a saída já traz o aviso que o modelo deve repetir.
 */
export function preAnaliseMcmv(args: PreAnaliseMcmvArgs): Record<string, unknown> {
  const renda = args.renda;
  const entrada = Math.max(0, args.entrada ?? 0);
  const fgts = Math.max(0, args.fgts ?? 0);
  const aviso =
    "Estimativa para orientar a conversa, não é aprovação de crédito. A Caixa decide na análise.";

  const orcamento: ResultadoOrcamento = calcularOrcamento({
    renda,
    tem36MesesRegistro: args.tem_36_meses_registro === true,
    temDependente: args.tem_dependente === true,
    fgts,
    entrada,
  });
  const faixa = faixaPorRenda(renda);

  if (!orcamento.enquadra) {
    return {
      enquadra: false,
      motivo: `Renda abaixo do mínimo da tabela APROVE 2026 (R$ ${RENDA_MIN_APROVE}). Vale checar composição de renda.`,
      faixa_estimada: faixa.rotulo,
      aviso,
    };
  }

  const base: Record<string, unknown> = {
    enquadra: true,
    faixa: `Faixa ${orcamento.faixa}`,
    segmento: orcamento.segmento,
    renda_consultada: orcamento.rendaConsultada,
    taxa_efetiva: orcamento.taxaEfetiva,
    usou_redutor_36_meses: orcamento.usouRedutor,
    parcela_estimada: arredondaPrestacao(orcamento.parcelaEstimada),
    financiamento_maximo: arredonda(orcamento.financiamento),
    subsidio: arredonda(orcamento.subsidio),
    fgts: arredonda(orcamento.fgts),
    entrada: arredonda(orcamento.entrada),
    poder_de_compra_sem_construtora: arredonda(orcamento.recursosNaoConstrutora),
    teto_do_imovel: arredonda(orcamento.tetoImovel),
    teto_avaliacao_segmento: arredonda(orcamento.tetoAvaliacaoSegmento),
    aviso,
  };

  if (args.preco_imovel) {
    const preco = args.preco_imovel;
    const ader = avaliarAderencia(preco, orcamento);
    const prest = avaliarRenda(renda, preco, { entrada: entrada + fgts + orcamento.subsidio });
    base.imovel = {
      preco,
      cabe: ader.cabe,
      dentro_da_avaliacao: ader.dentroDaAvaliacao,
      parcelar_com_construtora: ader.valorParcelarConstrutora,
      percentual_construtora: ader.percentualConstrutora,
      estoura_parcelamento_20pct: ader.estouraParcelamento,
      folga_ate_o_teto: ader.folga,
      prestacao_total_estimada: arredondaPrestacao(prest.prestacaoTotal),
      comprometimento_da_renda_pct: Math.round(prest.comprometimento * 1000) / 10,
      renda_minima_estimada_para_este_preco: rendaMinimaEstimada(preco, {
        entrada: entrada + fgts + orcamento.subsidio,
      }),
    };
  }
  return base;
}

// ---------------------------------------------------------------------------
// 2) Qualificação em 7 dimensões
// ---------------------------------------------------------------------------

export const AvaliarQualificacaoInput = z.object({
  leadId: z.string().uuid().describe("id do cliente"),
});

export type DimensaoQualificacao = {
  chave: "renda" | "entrada_fgts" | "credito" | "regiao" | "necessidade" | "urgencia" | "motivacao";
  rotulo: string;
  /** O que já está no CRM (resumido) ou null. */
  sabemos: string | null;
  /** Pergunta sugerida quando falta. */
  pergunta: string;
};

export type QualificacaoLead = Pick<
  LeadDetalheRow,
  | "nome"
  | "renda_informada"
  | "entrada_disponivel"
  | "usa_fgts"
  | "tem_fgts"
  | "fgts_valor"
  | "tipo_renda"
  | "faixa_mcmv"
  | "bairro"
  | "zona"
  | "projeto_nome"
  | "objecoes"
  | "observacoes"
  | "proxima_acao"
  | "temperatura"
  | "proximo_followup"
> & {
  resumo_qualificacao?: string | null;
  motivo_handoff?: string | null;
};

const temTexto = (v: string | null | undefined) => !!v && v.trim().length > 0;

/** Lê "R$ 3.500", "3500,00", "3.5k" → número (ou null). */
export function rendaNumerica(valor: string | number | null | undefined): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) && valor > 0 ? valor : null;
  if (!valor) return null;
  const s = valor.toLowerCase().replace(/r\$/g, "").trim();
  const mil = /\b(\d+(?:[.,]\d+)?)\s*(k|mil)\b/.exec(s);
  if (mil) return Math.round(parseFloat(mil[1].replace(",", ".")) * 1000);
  const m = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/.exec(s);
  if (!m) return null;
  const bruto = m[0];
  const n =
    bruto.includes(".") && bruto.includes(",")
      ? parseFloat(bruto.replace(/\./g, "").replace(",", "."))
      : /^\d{1,3}(\.\d{3})+$/.test(bruto)
        ? parseFloat(bruto.replace(/\./g, ""))
        : parseFloat(bruto.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mencao(texto: string | null | undefined, padrao: RegExp): boolean {
  return !!texto && padrao.test(texto);
}

/**
 * Scorecard das 7 dimensões a partir do que está no CRM. Determinístico: o
 * modelo usa para fazer a pergunta certa e, com a resposta, propor_qualificacao.
 */
export function avaliarQualificacao7D(lead: QualificacaoLead): {
  cliente: string | null;
  pontuacao: number;
  total: number;
  dimensoes: DimensaoQualificacao[];
  proximas_perguntas: string[];
  pre_analise_possivel: boolean;
} {
  const livre = [lead.observacoes, lead.resumo_qualificacao, lead.proxima_acao, lead.motivo_handoff]
    .filter(Boolean)
    .join(" \n ");
  const objecoes = (lead.objecoes ?? []).join(", ");
  const renda = rendaNumerica(lead.renda_informada);
  const regiao = [lead.bairro, lead.zona].filter(Boolean).join(" / ");

  const dims: DimensaoQualificacao[] = [
    {
      chave: "renda",
      rotulo: "Renda familiar e composição",
      sabemos: renda
        ? `R$ ${renda}${lead.tipo_renda ? ` (${lead.tipo_renda})` : ""}${lead.faixa_mcmv ? ` · ${lead.faixa_mcmv}` : ""}`
        : lead.tipo_renda
          ? `só o tipo de renda (${lead.tipo_renda})`
          : null,
      pergunta:
        "Qual a renda bruta da família que vai entrar no financiamento? Vai compor renda com alguém?",
    },
    {
      chave: "entrada_fgts",
      rotulo: "Entrada e FGTS",
      sabemos:
        temTexto(lead.entrada_disponivel) || lead.tem_fgts != null || lead.fgts_valor
          ? [
              temTexto(lead.entrada_disponivel) ? `entrada ${lead.entrada_disponivel}` : null,
              lead.tem_fgts === true
                ? `tem FGTS${lead.fgts_valor ? ` (R$ ${lead.fgts_valor})` : ""}`
                : lead.tem_fgts === false
                  ? "sem FGTS"
                  : null,
              lead.usa_fgts ? "quer usar FGTS" : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : null,
      pergunta: "Tem algum valor de entrada guardado? E saldo de FGTS — sabe quanto?",
    },
    {
      chave: "credito",
      rotulo: "Situação de crédito (restrição, carteira, imóvel anterior)",
      sabemos: mencao(
        livre + " " + objecoes,
        /restri[çc]|nome (sujo|limpo)|serasa|spc|score|carteira|clt|aut[ôo]nomo|36 meses|j[áa] (tem|possui) im[óo]vel/i,
      )
        ? "há menção a crédito/carteira nas anotações"
        : lead.tipo_renda
          ? `tipo de renda: ${lead.tipo_renda}`
          : null,
      pergunta:
        "O nome está limpo? Tem carteira assinada há mais de 3 anos? Já teve imóvel financiado no nome?",
    },
    {
      chave: "regiao",
      rotulo: "Região e deslocamento",
      sabemos: regiao || (lead.projeto_nome ? `interesse em ${lead.projeto_nome}` : null),
      pergunta:
        "Em que região precisa morar (trabalho, escola, família)? Até quanto tempo de deslocamento aceita?",
    },
    {
      chave: "necessidade",
      rotulo: "Necessidade (dormitórios, vaga, família)",
      sabemos: mencao(livre, /dorm|quarto|vaga|garagem|filho|casal|sozinh|fam[íi]lia/i)
        ? "há menção a tipologia/família nas anotações"
        : null,
      pergunta: "Quantas pessoas vão morar? Precisa de 2 dormitórios? Vaga de garagem é essencial?",
    },
    {
      chave: "urgencia",
      rotulo: "Urgência e momento",
      sabemos: mencao(
        livre,
        /aluguel|mudar|prazo|urg[êe]nc|casament|m[êe]s que vem|at[ée] (o fim|dezembro|janeiro)|contrato (vence|acaba)/i,
      )
        ? "há menção a prazo/aluguel nas anotações"
        : lead.temperatura
          ? `temperatura ${lead.temperatura}`
          : null,
      pergunta: "Paga aluguel hoje? Qual o prazo ideal para mudar? Tem algo que empurra a decisão?",
    },
    {
      chave: "motivacao",
      rotulo: "Motivação e objeções",
      sabemos: objecoes
        ? `objeções: ${objecoes}`
        : mencao(livre, /sonho|primeir[oa] im[óo]vel|sair do aluguel|investi|alugar/i)
          ? "há menção ao motivo da compra nas anotações"
          : null,
      pergunta:
        "O que faz você querer comprar agora? O que te preocupa mais: parcela, entrada ou localização?",
    },
  ];

  const respondidas = dims.filter((d) => d.sabemos != null);
  return {
    cliente: displayNameForSamiQ(lead.nome),
    pontuacao: respondidas.length,
    total: dims.length,
    dimensoes: dims.map((d) => ({
      ...d,
      sabemos: d.sabemos ? redactSamiQFreeText(d.sabemos, 160) : null,
    })),
    proximas_perguntas: dims.filter((d) => d.sabemos == null).map((d) => d.pergunta),
    pre_analise_possivel: renda != null,
  };
}

// ---------------------------------------------------------------------------
// 3) Curadoria com estoque real
// ---------------------------------------------------------------------------

export const CurarEstoqueInput = z.object({
  renda: z.number().positive().max(1_000_000).optional().describe("Renda bruta familiar mensal"),
  entrada: z
    .number()
    .min(0)
    .max(50_000_000)
    .optional()
    .describe("Entrada + FGTS + subsídio conhecido, em reais"),
  dorms: z.number().int().min(1).max(5).optional().describe("Dormitórios desejados"),
  regiao: z.string().max(60).optional().describe("Região, zona ou bairro (busca parcial)"),
  preco_max: z.number().positive().optional().describe("Preço máximo em reais"),
  limite: z.number().int().min(1).max(8).optional().describe("Padrão 5"),
});
export type CurarEstoqueArgs = z.infer<typeof CurarEstoqueInput>;

export type ProjetoCuradoriaRow = {
  id: string;
  nome: string | null;
  bairro: string | null;
  cidade: string | null;
  regiao: string | null;
  zona_smq: string | null;
  tipologia: string | null;
  dorms_min: number | null;
  dorms_max: number | null;
  preco_a_partir: number | null;
  renda_minima: number | null;
  status_entrega: string | null;
  ano_entrega: number | null;
  argumentos_venda: string[] | null;
  diferenciais: unknown;
  perfil_ideal: string | null;
  disponibilidade_resumo: string | null;
  construtora: string | null;
};

export type UnidadeCuradoriaRow = {
  projeto_id: string;
  status: string;
  valor: number | null;
  dormitorios: number | null;
  tipologia: string | null;
  vagas: number | null;
};

export type ProjetoCurado = {
  id: string;
  nome: string | null;
  localizacao: string;
  construtora: string | null;
  dormitorios: string | number | undefined;
  preco_a_partir: number | null;
  unidades_disponiveis: number;
  menor_unidade_disponivel: number | null;
  campanha: string | null;
  cabe_na_renda: boolean | null;
  prestacao_estimada: number | null;
  argumentos: string[];
  perfil_ideal: string | undefined;
  entrega: string | undefined;
  por_que: string[];
  pontuacao: number;
};

function normalizar(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function textoLista(v: unknown, max = 4): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean).slice(0, max);
  if (typeof v === "string" && v.trim()) return [v.trim().slice(0, 200)];
  return [];
}

/**
 * Ordena o estoque pela aderência: cabe na renda (quando informada), tem
 * unidade disponível, campanha vigente, dormitórios pedidos, região pedida.
 * Nada some — o que não casa vai para baixo com o motivo.
 */
export function curarEstoque(args: {
  projetos: ProjetoCuradoriaRow[];
  unidades: UnidadeCuradoriaRow[];
  focos: FocoRow[];
  criterios: CurarEstoqueArgs;
  agora: number;
}): { criterios: Record<string, unknown>; projetos: ProjetoCurado[]; aviso: string } {
  const { criterios } = args;
  const limite = criterios.limite ?? 5;
  const focos = focosPorProjeto(args.focos, args.agora);
  const regiao = normalizar(criterios.regiao);

  const porProjeto = new Map<string, UnidadeCuradoriaRow[]>();
  for (const u of args.unidades) {
    if (u.status !== "disponivel") continue;
    const lista = porProjeto.get(u.projeto_id) ?? [];
    lista.push(u);
    porProjeto.set(u.projeto_id, lista);
  }

  const itens: ProjetoCurado[] = args.projetos.map((p) => {
    const disponiveis = porProjeto.get(p.id) ?? [];
    const disponiveisFiltradas = criterios.dorms
      ? disponiveis.filter((u) => u.dormitorios == null || u.dormitorios === criterios.dorms)
      : disponiveis;
    const valores = disponiveisFiltradas
      .map((u) => u.valor)
      .filter((v): v is number => typeof v === "number" && v > 0);
    const menorUnidade = valores.length ? Math.min(...valores) : null;
    const precoRef = menorUnidade ?? p.preco_a_partir;
    const foco = focos.get(p.id) ?? null;

    const porQue: string[] = [];
    let pontos = 0;

    let cabe: boolean | null = null;
    let prestacao: number | null = null;
    if (criterios.renda && precoRef) {
      const av = avaliarRenda(criterios.renda, precoRef, { entrada: criterios.entrada });
      cabe = av.cabe;
      prestacao = arredondaPrestacao(av.prestacaoTotal);
      if (cabe) {
        pontos += 40;
        porQue.push(`cabe na renda (prestação estimada R$ ${prestacao})`);
      } else {
        porQue.push(
          av.motivo === "acima_teto_faixa"
            ? "acima do teto da faixa"
            : `prestação estimada R$ ${prestacao} passa de 30% da renda`,
        );
      }
    } else if (criterios.renda && p.renda_minima) {
      cabe = criterios.renda >= p.renda_minima;
      pontos += cabe ? 25 : 0;
      porQue.push(cabe ? "renda acima da mínima do projeto" : "renda abaixo da mínima do projeto");
    }

    if (disponiveisFiltradas.length > 0) {
      pontos += 20;
      porQue.push(`${disponiveisFiltradas.length} unidade(s) disponível(is) no estoque`);
    } else if (disponiveis.length > 0 && criterios.dorms) {
      porQue.push(`sem unidade de ${criterios.dorms} dorm. disponível`);
    } else if (p.disponibilidade_resumo) {
      porQue.push(`estoque: ${p.disponibilidade_resumo.slice(0, 80)}`);
    }

    if (foco) {
      pontos += 15;
      porQue.push(`campanha vigente${foco.motivo ? `: ${foco.motivo}` : ""}`);
    }

    if (criterios.dorms) {
      const min = p.dorms_min ?? p.dorms_max;
      const max = p.dorms_max ?? p.dorms_min;
      const casa =
        (min == null && max == null) ||
        ((min ?? 0) <= criterios.dorms && criterios.dorms <= (max ?? 99));
      if (casa) pontos += 10;
      else porQue.push(`não tem ${criterios.dorms} dormitórios`);
    }

    if (regiao.length >= 2) {
      const alvo = normalizar([p.regiao, p.zona_smq, p.bairro, p.cidade].filter(Boolean).join(" "));
      // Região pedida pesa mais que campanha: quem pediu "leste" não quer
      // ver a Zona Sul em primeiro por causa de um feirão.
      if (alvo.includes(regiao)) {
        pontos += 20;
        porQue.push("na região pedida");
      } else porQue.push("fora da região pedida");
    }

    if (criterios.preco_max && precoRef && precoRef > criterios.preco_max) {
      pontos -= 30;
      porQue.push("acima do preço máximo");
    }

    return {
      id: p.id,
      nome: p.nome,
      localizacao: [p.bairro, p.regiao ?? p.zona_smq, p.cidade].filter(Boolean).join(" · "),
      construtora: p.construtora,
      dormitorios:
        p.dorms_min != null && p.dorms_max != null && p.dorms_min !== p.dorms_max
          ? `${p.dorms_min} a ${p.dorms_max}`
          : (p.dorms_min ?? p.dorms_max ?? undefined),
      preco_a_partir: p.preco_a_partir,
      unidades_disponiveis: disponiveisFiltradas.length,
      menor_unidade_disponivel: menorUnidade,
      campanha: foco ? (foco.motivo ?? "campanha vigente") : null,
      cabe_na_renda: cabe,
      prestacao_estimada: prestacao,
      argumentos: textoLista(p.argumentos_venda, 3)
        .concat(textoLista(p.diferenciais, 2))
        .slice(0, 4),
      perfil_ideal: p.perfil_ideal ? p.perfil_ideal.slice(0, 160) : undefined,
      entrega:
        p.status_entrega || p.ano_entrega
          ? [p.status_entrega, p.ano_entrega].filter(Boolean).join(" · ")
          : undefined,
      por_que: porQue,
      pontuacao: pontos,
    };
  });

  itens.sort(
    (a, b) =>
      b.pontuacao - a.pontuacao ||
      (a.preco_a_partir ?? Number.MAX_SAFE_INTEGER) - (b.preco_a_partir ?? Number.MAX_SAFE_INTEGER),
  );

  return {
    criterios: {
      renda: criterios.renda,
      entrada: criterios.entrada,
      dorms: criterios.dorms,
      regiao: criterios.regiao,
      preco_max: criterios.preco_max,
    },
    projetos: itens.slice(0, limite),
    aviso:
      "Prestação é estimativa (PRICE, teto da faixa, 420 meses); estoque é o cadastrado no CRM — confirme na tabela da construtora antes de prometer.",
  };
}

// ---------------------------------------------------------------------------
// 4) Preparador de visita — regra do checklist (a coleta é do servidor)
// ---------------------------------------------------------------------------

export const PrepararVisitaInput = z.object({
  leadId: z.string().uuid().describe("id do cliente da visita"),
});

export type KitVisitaEntrada = {
  lead: QualificacaoLead & { id: string; status: string | null };
  visita: {
    quando: string | null;
    local: string | null;
    status: string | null;
    titulo: string | null;
  } | null;
  projeto: ProjetoCuradoriaRow | null;
  documentosPendentes: string[];
  objecoes: string[];
  ultimasInteracoes: Array<{ tipo: string | null; em: string | null }>;
};

/** Monta o checklist "antes de sair" a partir do que o servidor coletou. */
export function montarChecklistVisita(kit: KitVisitaEntrada): {
  checklist: string[];
  alertas: string[];
  qualificacao: ReturnType<typeof avaliarQualificacao7D>;
} {
  const q = avaliarQualificacao7D(kit.lead);
  const checklist: string[] = [];
  const alertas: string[] = [];

  if (!kit.visita) alertas.push("Não há visita agendada aberta para este cliente no CRM.");
  else if (kit.visita.status === "agendado")
    alertas.push("A visita ainda não foi confirmada com o cliente — confirme antes.");
  if (kit.visita && !kit.visita.local && !kit.projeto)
    alertas.push("A visita não tem local nem empreendimento definido.");

  const renda = rendaNumerica(kit.lead.renda_informada);
  if (renda && kit.projeto?.preco_a_partir) {
    const av = avaliarRenda(renda, kit.projeto.preco_a_partir, {
      entrada: rendaNumerica(kit.lead.entrada_disponivel) ?? 0,
    });
    checklist.push(
      av.cabe
        ? `Simulação rápida: prestação estimada R$ ${arredondaPrestacao(av.prestacaoTotal)} cabe nos 30% da renda.`
        : `Atenção: prestação estimada R$ ${arredondaPrestacao(av.prestacaoTotal)} passa de 30% da renda — leve alternativa mais barata.`,
    );
  } else if (!renda) {
    checklist.push("Renda não está no CRM: pergunte antes de simular na visita.");
  }

  if (kit.documentosPendentes.length > 0) {
    checklist.push(
      `Peça para levar: ${kit.documentosPendentes.slice(0, 5).join(", ")}${kit.documentosPendentes.length > 5 ? " e outros" : ""}.`,
    );
  }
  if (kit.objecoes.length > 0) {
    checklist.push(`Prepare resposta para: ${kit.objecoes.slice(0, 4).join("; ")}.`);
  }
  if (kit.projeto) {
    const args = textoLista(kit.projeto.argumentos_venda, 3);
    if (args.length) checklist.push(`Argumentos do ${kit.projeto.nome}: ${args.join("; ")}.`);
    if (kit.projeto.perfil_ideal)
      checklist.push(`Perfil ideal do projeto: ${kit.projeto.perfil_ideal.slice(0, 120)}.`);
  }
  for (const pergunta of q.proximas_perguntas.slice(0, 3)) checklist.push(`Perguntar: ${pergunta}`);
  if (kit.ultimasInteracoes.length === 0)
    alertas.push("Nenhuma interação registrada: é o primeiro contato real com este cliente.");

  return { checklist, alertas, qualificacao: q };
}

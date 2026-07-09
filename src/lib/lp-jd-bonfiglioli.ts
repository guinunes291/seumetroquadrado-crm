// Dados, configuração e lógica pura da landing page pública do lançamento
// Vibra Jardim Bonfiglioli (/jd-bonfiglioli). Única fonte confirmada: material
// comercial do lançamento. O que não está confirmado fica em LP_CONFIG.aConfirmar
// e NUNCA é afirmado como fato na página.

import { z } from "zod";
import { simular, parcelaPrice, COMPROMETIMENTO_MAX } from "@/lib/simulador";
import { buildWhatsAppUrl } from "@/lib/templates";
import { onlyDigits } from "@/lib/validators";

// ---------------------------------------------------------------------------
// Plantas (material confirmado)
// ---------------------------------------------------------------------------

export type PlantaSegmento = "HIS1" | "HIS2" | "R2V";

export type Planta = {
  id: string;
  metragem: number;
  dorms: number;
  segmento: PlantaSegmento;
  preco: number;
  /** Selo comercial confirmado no material (ex.: planta inédita). */
  destaque?: string;
  /** Caminho em public/ para a planta ilustrativa — a confirmar (renders). */
  img?: string;
};

export const PLANTAS: Planta[] = [
  { id: "32-his1", metragem: 32, dorms: 2, segmento: "HIS1", preco: 237_900 },
  { id: "35-his1", metragem: 35, dorms: 2, segmento: "HIS1", preco: 252_900 },
  { id: "35-his2", metragem: 35, dorms: 2, segmento: "HIS2", preco: 272_900 },
  { id: "37-his2", metragem: 37, dorms: 2, segmento: "HIS2", preco: 284_900 },
  {
    id: "41-his2",
    metragem: 41,
    dorms: 2,
    segmento: "HIS2",
    preco: 309_900,
    destaque: "Planta inédita e exclusiva",
  },
  {
    id: "41-r2v",
    metragem: 41,
    dorms: 2,
    segmento: "R2V",
    preco: 339_900,
    destaque: "Planta inédita e exclusiva",
  },
  { id: "42-his2", metragem: 42, dorms: 2, segmento: "HIS2", preco: 319_900 },
];

export function menorPreco(): number {
  return Math.min(...PLANTAS.map((p) => p.preco));
}

export function plantaLabel(p: Planta): string {
  return `${p.metragem} m² · ${p.segmento} — ${formatBRL(p.preco)}`;
}

export function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

// ---------------------------------------------------------------------------
// Configuração do lançamento
// ---------------------------------------------------------------------------

export const LP_CONFIG = {
  /**
   * TODO(a confirmar): número oficial de WhatsApp da SMQ com DDD (ex.:
   * "11999999999"). Enquanto vazio, os CTAs de WhatsApp degradam para o
   * formulário — nenhum link quebrado é renderizado.
   */
  whatsapp: "",
  origem: "lp-jd-bonfiglioli",
  regiao: "Jardim Bonfiglioli — Zona Oeste (SP)",
  lancamento: "Agosto",
  chequeBonus: 2_000,
  enderecoTerreno: "Rua Dr. Astor Guimarães Dias — Jardim Bonfiglioli",
  enderecoDecorado: "Mega Loja — Av. Min. Laudo Ferreira de Camargo, 433",
  metro: "Estação Vila Sônia (Linha 4-Amarela)",
  aConfirmar: [
    "renda mínima por segmento",
    "condições de entrada",
    "enquadramento Minha Casa Minha Vida / subsídio",
    "itens de lazer",
    "varanda",
    "imagens e renders oficiais",
    "distâncias exatas (metrô, USP, comércio)",
    "número oficial de WhatsApp da SMQ",
  ],
} as const;

export const DISCLAIMER_CREDITO =
  "Condições sujeitas à análise de crédito, disponibilidade e regras do programa.";

export const DISCLAIMER_VALORES =
  "Valores, condições e disponibilidade sujeitos à alteração sem aviso prévio. " +
  "Aprovação e condições de financiamento sujeitas à análise de crédito, " +
  "regras do programa e políticas da instituição financeira.";

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export type FaqItem = { pergunta: string; resposta: string };

export const FAQ_ITEMS: FaqItem[] = [
  {
    pergunta: "Onde fica o empreendimento?",
    resposta:
      "O terreno fica na Rua Dr. Astor Guimarães Dias, no Jardim Bonfiglioli, Zona Oeste de São Paulo — próximo à Estação Vila Sônia do Metrô (Linha 4-Amarela). O apartamento decorado pode ser visitado na Mega Loja, Av. Min. Laudo Ferreira de Camargo, 433.",
  },
  {
    pergunta: "Quais são as metragens e os valores?",
    resposta:
      "São plantas de 2 dormitórios de 32 a 42 m², com valores de tabela a partir de R$ 237.900 no lançamento. Os valores variam conforme a planta e o segmento (HIS1, HIS2 ou R2V) e estão sujeitos a alteração e disponibilidade.",
  },
  {
    pergunta: "Qual a renda mínima para comprar?",
    resposta:
      "A renda mínima por segmento será confirmada na abertura oficial do lançamento. Deixe seu contato que nossa equipe avisa você assim que a tabela de renda sair — e já adianta a sua simulação.",
  },
  {
    pergunta: "Entra no Minha Casa Minha Vida?",
    resposta:
      "O enquadramento no programa depende da faixa do imóvel e do seu perfil, e será confirmado com as condições oficiais do lançamento. Nossa equipe verifica o seu caso na análise, sem compromisso.",
  },
  {
    pergunta: "Posso usar FGTS?",
    resposta:
      "Em geral, o FGTS pode ser usado na compra do primeiro imóvel residencial, seguindo as regras da Caixa. Na sua simulação a gente confere se o seu saldo pode entrar como parte do pagamento.",
  },
  {
    pergunta: "Tem entrada facilitada?",
    resposta:
      "As condições de entrada do lançamento serão divulgadas na abertura de vendas. O que já está confirmado: Cheque Bônus de R$ 2.000 para usar na negociação. Cadastre-se para receber a tabela completa em primeira mão.",
  },
  {
    pergunta: "Como funciona a simulação?",
    resposta:
      "Você informa sua renda aproximada e nossa equipe monta uma simulação personalizada com as condições vigentes de financiamento, uso de FGTS e possíveis subsídios. A simulação da página é uma estimativa inicial — a oficial é feita com o banco.",
  },
  {
    pergunta: "Preciso pagar algo para simular?",
    resposta:
      "Não. A simulação e o atendimento da Seu Metro Quadrado são gratuitos e sem compromisso.",
  },
  {
    pergunta: "Posso comprar mesmo pagando aluguel?",
    resposta:
      "Sim — esse é o caso mais comum entre nossos clientes. O aluguel atual não impede a aprovação; o que conta é a análise de renda e crédito. Muitas vezes a parcela do financiamento fica próxima do valor do aluguel.",
  },
  {
    pergunta: "A aprovação é garantida?",
    resposta:
      "Não. Nenhuma aprovação é garantida: toda compra passa por análise de crédito do banco e pelas regras do programa vigente. O nosso papel é preparar sua documentação e buscar a melhor condição possível para o seu perfil.",
  },
];

// ---------------------------------------------------------------------------
// Simulação rápida ("veja se sua renda aprova") — reutiliza lib/simulador.ts
// ---------------------------------------------------------------------------

/** Premissas padrão da estimativa — editáveis na UI e rotuladas como estimativa. */
export const SIM_DEFAULTS = {
  jurosAnual: 10,
  meses: 360,
  entradaPct: 0.1,
} as const;

export type SimOpts = {
  jurosAnual?: number;
  meses?: number;
  /** Entrada em R$; quando ausente usa entradaPct sobre o valor do imóvel. */
  entrada?: number | null;
  entradaPct?: number;
};

export type AvaliacaoPlanta = {
  planta: Planta;
  entrada: number;
  parcela: number;
  rendaMinima: number;
  /** parcela/renda (0..1+) ou null sem renda. */
  comprometimento: number | null;
  cabe: boolean;
};

/**
 * Avalia todas as plantas para uma renda: parcela estimada (Price), renda
 * mínima pelo limite de comprometimento (~30%) e se "cabe" na renda informada.
 */
export function avaliarPlantas(renda: number | null, opts: SimOpts = {}): AvaliacaoPlanta[] {
  const jurosAnual = opts.jurosAnual ?? SIM_DEFAULTS.jurosAnual;
  const meses = opts.meses ?? SIM_DEFAULTS.meses;
  const entradaPct = opts.entradaPct ?? SIM_DEFAULTS.entradaPct;

  return PLANTAS.map((planta) => {
    const entrada =
      opts.entrada != null ? Math.min(opts.entrada, planta.preco) : planta.preco * entradaPct;
    const r = simular({
      valorImovel: planta.preco,
      entrada,
      jurosAnual,
      meses,
      rendaMensal: renda,
    });
    return {
      planta,
      entrada,
      parcela: r.parcela,
      rendaMinima: r.rendaMinima,
      comprometimento: r.comprometimentoRenda,
      cabe: renda != null && renda > 0 && r.rendaMinima <= renda,
    };
  });
}

/**
 * Inversa da tabela Price: maior valor financiável para uma parcela máxima.
 * Com juros zero degrada para parcela × meses.
 */
export function valorMaxFinanciavel(parcelaMax: number, jurosAnual: number, meses: number): number {
  if (parcelaMax <= 0 || meses <= 0) return 0;
  const i = Math.pow(1 + (jurosAnual || 0) / 100, 1 / 12) - 1;
  if (i <= 0) return parcelaMax * meses;
  const f = Math.pow(1 + i, meses);
  return (parcelaMax * (f - 1)) / (i * f);
}

/** Teto de imóvel estimado para uma renda (parcela máx. = renda × limite). */
export function tetoImovelParaRenda(renda: number, opts: SimOpts = {}): number {
  const jurosAnual = opts.jurosAnual ?? SIM_DEFAULTS.jurosAnual;
  const meses = opts.meses ?? SIM_DEFAULTS.meses;
  const parcelaMax = renda * COMPROMETIMENTO_MAX;
  const financiavel = valorMaxFinanciavel(parcelaMax, jurosAnual, meses);
  return financiavel + (opts.entrada ?? 0);
}

export { parcelaPrice, COMPROMETIMENTO_MAX };

/** Rola suavemente até uma âncora da página (no-op em SSR). */
export function scrollToLpId(id: string): void {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export const WHATSAPP_MSG_PADRAO =
  "Olá! Vim da página do Vibra Jardim Bonfiglioli e quero receber as condições do lançamento.";

/**
 * Link de WhatsApp da SMQ ou null enquanto o número não está configurado —
 * os CTAs devem degradar para o formulário (nunca renderizar wa.me sem número).
 */
export function lpWhatsAppHref(mensagem: string = WHATSAPP_MSG_PADRAO): string | null {
  if (!LP_CONFIG.whatsapp) return null;
  return buildWhatsAppUrl(LP_CONFIG.whatsapp, mensagem);
}

// ---------------------------------------------------------------------------
// Formulário de captação → POST /api/public/webhooks/landing
// ---------------------------------------------------------------------------

export const RENDA_FAIXAS = [
  "Até R$ 2.500",
  "R$ 2.500 a R$ 3.500",
  "R$ 3.500 a R$ 5.000",
  "R$ 5.000 a R$ 8.000",
  "Acima de R$ 8.000",
  "Prefiro não informar",
] as const;

export const HORARIOS_CONTATO = ["Manhã", "Tarde", "Noite"] as const;

export const lpLeadSchema = z.object({
  nome: z.string().trim().min(3, "Digite seu nome completo (mínimo 3 letras)."),
  whatsapp: z.string().refine((v) => {
    const d = onlyDigits(v);
    return d.length >= 10 && d.length <= 11;
  }, "Digite um WhatsApp válido com DDD (ex.: 11 98765-4321)."),
});

export type LpLeadFields = z.infer<typeof lpLeadSchema>;

export type MarketingParams = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
};

const MARKETING_KEYS: (keyof MarketingParams)[] = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
];

/** Extrai parâmetros de campanha de uma query string ("?utm_source=..."). */
export function extractMarketing(search: string): MarketingParams {
  const params = new URLSearchParams(search);
  const out = {} as MarketingParams;
  for (const key of MARKETING_KEYS) out[key] = params.get(key);
  return out;
}

export type SimulacaoLead = {
  renda: number;
  entrada?: number | null;
  aluguelAtual?: number | null;
  financiamento?: number | null;
  parcela?: number | null;
  tetoImovel?: number | null;
  segmento?: string | null;
};

export type LandingPayloadInput = {
  nome: string;
  whatsapp: string;
  rendaFaixa?: string | null;
  melhorHorario?: string | null;
  interessePlanta?: string | null;
  marketing?: Partial<MarketingParams> | null;
  simulacao?: SimulacaoLead | null;
  pagina?: string | null;
  referrer?: string | null;
  timestampCliente?: string | null;
};

/**
 * Monta o payload exatamente no contrato de /api/public/webhooks/landing.
 * Honeypots vazios sinalizam envio humano; campos extras (melhor horário,
 * planta de interesse) ficam persistidos na coluna `raw`.
 */
export function buildLandingPayload(input: LandingPayloadInput): Record<string, unknown> {
  const mk = input.marketing ?? {};
  return {
    tipo: input.simulacao ? "simulacao" : "interesse",
    nome: input.nome.trim(),
    whatsapp: onlyDigits(input.whatsapp),
    renda: input.rendaFaixa ?? null,
    regiao: LP_CONFIG.regiao,
    origem: LP_CONFIG.origem,
    pagina: input.pagina ?? null,
    referrer: input.referrer ?? null,
    timestamp_cliente: input.timestampCliente ?? null,
    website: "",
    simHp: "",
    melhor_horario: input.melhorHorario ?? null,
    interesse_planta: input.interessePlanta ?? null,
    marketing: {
      utm_source: mk.utm_source ?? null,
      utm_medium: mk.utm_medium ?? null,
      utm_campaign: mk.utm_campaign ?? null,
      utm_term: mk.utm_term ?? null,
      utm_content: mk.utm_content ?? null,
      gclid: mk.gclid ?? null,
      fbclid: mk.fbclid ?? null,
    },
    ...(input.simulacao ? { simulacao: input.simulacao } : {}),
  };
}

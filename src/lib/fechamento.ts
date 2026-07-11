import { z } from "zod";
import { INTENT_BADGE_BORDERED, INTENT_DOT } from "@/lib/status-tones";

/** Etapas comerciais que entram no sinal de fechamento. */
export const ETAPAS_RADAR = [
  "analise_credito",
  "proposta_enviada",
  "visita_realizada",
  "agendado",
  "qualificado",
  "aguardando_retorno",
  "em_atendimento",
] as const;

export type FechamentoInput = {
  status?: string | null;
  temperatura?: string | null;
  ultimaInteracao?: string | null;
  proximoFollowup?: string | null;
  agora?: Date;
};

export type FechamentoTier = "alta" | "media" | "baixa";

export type IndiceFechamentoHeuristico = {
  indice: number;
  nivel: FechamentoTier;
  fatores: string[];
  metodo: "heuristico";
};

const BASE_ETAPA: Record<string, number> = {
  analise_credito: 72,
  proposta_enviada: 60,
  visita_realizada: 48,
  agendado: 35,
  qualificado: 24,
  aguardando_retorno: 16,
  em_atendimento: 14,
};

export function diasDesde(iso: string | null | undefined, agora: Date): number | null {
  if (!iso) return null;
  const instante = Date.parse(iso);
  if (Number.isNaN(instante)) return null;
  return Math.max(0, Math.floor((agora.getTime() - instante) / 86_400_000));
}

/**
 * Índice local explicável para testes e usos sem histórico suficiente.
 *
 * É uma ordenação heurística de 0–100, não uma previsão individual. A tela
 * principal usa a RPC calibrada e identifica este método quando a etapa ainda
 * não possui a amostra mínima de vendas aprovadas.
 */
export function indiceSinalFechamento(input: FechamentoInput): IndiceFechamentoHeuristico {
  const agora = input.agora ?? new Date();
  let indice = BASE_ETAPA[input.status ?? ""] ?? 0;
  const fatores: string[] = [];
  const etapa = etapaCurta(input.status);
  if (etapa) fatores.push(etapa);

  if (input.temperatura === "quente") {
    indice += 15;
    fatores.push("Temperatura quente");
  } else if (input.temperatura === "frio") {
    indice -= 12;
    fatores.push("Temperatura fria");
  }

  const dias = diasDesde(input.ultimaInteracao, agora);
  if (dias === null) {
    indice -= 10;
    fatores.push("Sem interação registrada");
  } else if (dias <= 2) {
    indice += 10;
    fatores.push("Interação nos últimos 2 dias");
  } else if (dias > 14) {
    indice -= 18;
    fatores.push(`${dias} dias sem interação`);
  } else if (dias > 7) {
    indice -= 8;
    fatores.push(`${dias} dias sem interação`);
  }

  if (input.proximoFollowup && Date.parse(input.proximoFollowup) >= agora.getTime()) {
    indice += 5;
    fatores.push("Follow-up programado");
  }

  indice = Math.max(0, Math.min(100, Math.round(indice)));
  const nivel: FechamentoTier = indice >= 55 ? "alta" : indice >= 30 ? "media" : "baixa";

  return { indice, nivel, fatores, metodo: "heuristico" };
}

function etapaCurta(status?: string | null): string {
  switch (status) {
    case "analise_credito":
      return "Em análise de crédito";
    case "proposta_enviada":
      return "Proposta enviada";
    case "visita_realizada":
      return "Visita realizada";
    case "agendado":
      return "Visita agendada";
    case "qualificado":
      return "Qualificado";
    case "aguardando_retorno":
      return "Aguardando retorno";
    case "em_atendimento":
      return "Em atendimento";
    default:
      return "";
  }
}

const fechamentoSinalSchema = z
  .object({
    id: z.string().uuid(),
    nome: z.string().min(1),
    telefone: z.string(),
    status: z.enum(ETAPAS_RADAR),
    temperatura: z.string().nullable(),
    ultima_interacao: z.string().nullable(),
    proximo_followup: z.string().nullable(),
    projeto_nome: z.string().nullable(),
    indice: z.coerce.number().int().min(0).max(100),
    nivel: z.enum(["alta", "media", "baixa"]),
    metodo: z.enum(["historico_calibrado", "heuristico"]),
    taxa_historica_pct: z.coerce.number().min(0).max(100).nullable(),
    amostra_etapa: z.coerce.number().int().nonnegative(),
    vendas_aprovadas_etapa: z.coerce.number().int().nonnegative(),
    documentos_pendentes: z.coerce.number().int().nonnegative(),
    fatores: z.array(z.string().min(1)).min(1).max(8),
  })
  .superRefine((item, context) => {
    const nivelEsperado: FechamentoTier =
      item.indice >= 55 ? "alta" : item.indice >= 30 ? "media" : "baixa";
    if (item.nivel !== nivelEsperado) {
      context.addIssue({
        code: "custom",
        path: ["nivel"],
        message: "Nível incompatível com o índice",
      });
    }
    if (item.vendas_aprovadas_etapa > item.amostra_etapa) {
      context.addIssue({
        code: "custom",
        path: ["vendas_aprovadas_etapa"],
        message: "Vendas aprovadas excedem a amostra da etapa",
      });
    }
    if (item.metodo === "historico_calibrado" && item.taxa_historica_pct === null) {
      context.addIssue({
        code: "custom",
        path: ["taxa_historica_pct"],
        message: "Sinal calibrado sem taxa histórica",
      });
    }
    if (item.metodo === "historico_calibrado" && item.amostra_etapa < 30) {
      context.addIssue({
        code: "custom",
        path: ["amostra_etapa"],
        message: "Sinal calibrado sem a amostra mínima",
      });
    }
    if (item.metodo === "historico_calibrado" && item.taxa_historica_pct !== null) {
      const taxaEsperada = Number(
        ((100 * item.vendas_aprovadas_etapa) / item.amostra_etapa).toFixed(1),
      );
      if (Math.abs(item.taxa_historica_pct - taxaEsperada) > 0.05) {
        context.addIssue({
          code: "custom",
          path: ["taxa_historica_pct"],
          message: "Taxa histórica incompatível com a amostra",
        });
      }
    }
    if (item.metodo === "heuristico" && item.taxa_historica_pct !== null) {
      context.addIssue({
        code: "custom",
        path: ["taxa_historica_pct"],
        message: "Sinal heurístico não deve expor taxa de amostra insuficiente",
      });
    }
    if (item.metodo === "heuristico" && item.amostra_etapa >= 30) {
      context.addIssue({
        code: "custom",
        path: ["amostra_etapa"],
        message: "Sinal heurístico apesar de haver amostra suficiente",
      });
    }
  });

const fechamentoResponseSchema = z
  .object({
    items: z.array(fechamentoSinalSchema).max(50),
    total_count: z.coerce.number().int().nonnegative(),
    contagens: z.object({
      alta: z.coerce.number().int().nonnegative(),
      media: z.coerce.number().int().nonnegative(),
      baixa: z.coerce.number().int().nonnegative(),
    }),
    limit: z.coerce.number().int().min(1).max(50),
    amostra_minima: z.literal(30),
    janela_coorte_dias: z.literal(365),
    horizonte_conversao_dias: z.literal(90),
    indice_semantica: z.literal("sinal_de_priorizacao_nao_probabilidade"),
  })
  .superRefine((response, context) => {
    if (response.total_count < response.items.length) {
      context.addIssue({
        code: "custom",
        path: ["total_count"],
        message: "Contagem total menor que os itens retornados",
      });
    }
    if (
      response.contagens.alta + response.contagens.media + response.contagens.baixa !==
      response.total_count
    ) {
      context.addIssue({
        code: "custom",
        path: ["contagens"],
        message: "Contagens por nível incompatíveis com o total",
      });
    }
    if (response.items.length > response.limit) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Resposta excede o limite declarado",
      });
    }
  });

export type FechamentoSinal = z.infer<typeof fechamentoSinalSchema>;
export type FechamentoResponse = z.infer<typeof fechamentoResponseSchema>;

export function parseFechamentoResponse(input: unknown): FechamentoResponse {
  return fechamentoResponseSchema.parse(input);
}

export const FECHAMENTO_TIER_LABEL: Record<FechamentoTier, string> = {
  alta: "Sinal forte",
  media: "Sinal moderado",
  baixa: "Sinal inicial",
};

export const FECHAMENTO_TIER_TONE: Record<FechamentoTier, string> = {
  alta: INTENT_BADGE_BORDERED.success,
  media: INTENT_BADGE_BORDERED.warning,
  baixa: INTENT_BADGE_BORDERED.neutral,
};

export const FECHAMENTO_TIER_DOT: Record<FechamentoTier, string> = {
  alta: INTENT_DOT.success,
  media: INTENT_DOT.warning,
  baixa: INTENT_DOT.neutral,
};

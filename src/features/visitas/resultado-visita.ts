// Resultado estruturado da visita: as duas perguntas que transformam a nota
// solta em algo que a operação consegue somar no fim do mês.
//
// As chaves de objeção reaproveitam, onde significam a mesma coisa, as
// categorias de motivo de perda (lib/leads: MOTIVO_PERDA_CATEGORIAS). Isso é
// deliberado: permite cruzar "a objeção que apareceu na visita" com "o motivo
// pelo qual o lead foi perdido semanas depois" sem tradução manual — que é a
// pergunta que ninguém conseguia responder com texto livre.
//
// Os mesmos valores estão nos CHECKs da tabela visita_execucoes
// (migration 20260731150000): front e banco não podem divergir em silêncio.

export const INTERESSE_VISITA = ["alto", "medio", "baixo", "sem_interesse"] as const;
export type InteresseVisita = (typeof INTERESSE_VISITA)[number];

export const INTERESSE_LABEL: Record<InteresseVisita, string> = {
  alto: "Alto — quer avançar agora",
  medio: "Médio — gostou, mas tem pendência",
  baixo: "Baixo — sem entusiasmo",
  sem_interesse: "Sem interesse — não é para ele",
};

export const OBJECAO_VISITA = [
  "sem_objecao",
  "preco_parcela",
  "entrada_alta",
  "credito_renda",
  "estourou_teto",
  "metragem",
  "localizacao",
  "prazo_entrega",
  "condominio",
  "decisor_ausente",
  "quer_comparar",
  "timing_adiou",
  "outro",
] as const;
export type ObjecaoVisita = (typeof OBJECAO_VISITA)[number];

export const OBJECAO_LABEL: Record<ObjecaoVisita, string> = {
  sem_objecao: "Sem objeção — saiu interessado",
  preco_parcela: "Achou caro / parcela não cabe",
  entrada_alta: "Entrada ou sinal alto demais",
  credito_renda: "Crédito: renda insuficiente ou informal",
  estourou_teto: "Renda acima do teto MCMV",
  metragem: "Metragem ou planta não atendeu",
  localizacao: "Localização não agradou",
  prazo_entrega: "Prazo de entrega longo",
  condominio: "Condomínio alto",
  decisor_ausente: "Decisor não estava presente",
  quer_comparar: "Quer ver outras opções antes",
  timing_adiou: "Adiou a decisão",
  outro: "Outro",
};

/** Objeções que também são categoria de perda — o cruzamento que interessa. */
export const OBJECAO_TAMBEM_MOTIVO_PERDA: ObjecaoVisita[] = [
  "preco_parcela",
  "credito_renda",
  "estourou_teto",
  "timing_adiou",
];

/**
 * Sugestão de temperatura a partir do interesse lido na visita. É só
 * SUGESTÃO exibida ao corretor: mudar a temperatura do lead sozinho, por
 * causa de um select, tiraria dele uma decisão que é de leitura humana.
 */
export function temperaturaSugerida(interesse: InteresseVisita): "quente" | "morno" | "frio" {
  if (interesse === "alto") return "quente";
  if (interesse === "medio") return "morno";
  return "frio";
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { semTravessao } from "./formato";
import { temPreco, verificarTexto, type Problema } from "./compliance";

// Squad da Fase 2. Os agentes só PROPÕEM: nada do que escrevem vai para a Meta
// sem passar pelos campos do formulário e pelo botão Aprovar.
//   Estrategista de Performance (Opus): lê o Diagnóstico e sugere orçamento e foco.
//   Copywriter (Sonnet): textos para os criativos da Fase 3.
//   Auditor de Compliance (Haiku + regras fixas): barra promessa de crédito,
//   valor de aprovação, preço sem tabela e travessão.
//   Roteirista de Vídeo (Sonnet, Fase 4): transforma a ideia em prompt para o
//   Higgsfield; o prompt passa pelas mesmas regras fixas antes do pedido.
// A chave fica em ANTHROPIC_API_KEY, só no servidor.

const ESTRATEGISTA = "claude-opus-5-5";
const COPYWRITER = "claude-sonnet-5-5";
const AUDITOR = "claude-haiku-5-5";

const REGRAS_SMQ = `Regras da Seu Metro Quadrado (SMQ), imobiliária de lançamentos econômicos (MCMV) em São Paulo:
- Nunca prometa aprovação de crédito nem diga que o financiamento é garantido, fácil ou certo.
- Nunca informe valor de aprovação de crédito.
- Preço só pode aparecer se vier da tabela oficial do empreendimento, com a data da tabela. Se você não recebeu a tabela, não escreva preço, entrada nem parcela.
- Nunca use travessão (—) nem meia-risca (–). Use vírgula, ponto ou dois-pontos.
- Escreva em português do Brasil, tom próximo e direto, sem exagero.`;

export function agentesDisponiveis(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function cliente() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 1 });
}

export class AgenteRecusou extends Error {}

async function perguntar<T>(
  modelo: string,
  sistema: string,
  pedido: string,
  formato: z.ZodType<T>,
  esforco: "low" | "medium" | "high",
): Promise<T> {
  // Fallback do servidor (troca de modelo em caso de recusa) vale para Opus e
  // Sonnet; o Haiku não tem.
  const comFallback = modelo !== AUDITOR;
  const r = await cliente().beta.messages.parse({
    model: modelo,
    max_tokens: 16000,
    system: sistema,
    messages: [{ role: "user", content: pedido }],
    output_config: { effort: esforco, format: betaZodOutputFormat(formato) },
    ...(comFallback
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  });
  if (r.stop_reason === "refusal") throw new AgenteRecusou("O agente recusou o pedido.");
  if (!r.parsed_output) throw new Error("O agente não devolveu a resposta no formato combinado.");
  return r.parsed_output as T;
}

// Estrategista -------------------------------------------------------------

const Estrategia = z.object({
  leitura: z.string().describe("2 a 4 frases sobre o que os números dizem deste empreendimento"),
  orcamento_diario_sugerido: z.number().describe("em reais"),
  raio_km_sugerido: z.number().nullable(),
  justificativa: z.string(),
  riscos: z
    .array(z.string())
    .describe("o que pode dar errado e o que acompanhar nos primeiros dias"),
});
export type Estrategia = z.infer<typeof Estrategia>;

export async function estrategista(contexto: {
  empreendimento: string;
  objetivoDoPedido: string;
  orcamentoPedido: number;
  modelo: string;
  diagnostico: Record<string, unknown> | null;
}): Promise<Estrategia> {
  const r = await perguntar(
    ESTRATEGISTA,
    `Você é o Estrategista de Performance da SMQ. Analisa dados de Meta Ads e do funil (leads, visitas, vendas) e recomenda orçamento e foco geográfico para campanhas de lançamento imobiliário. Seja concreto e use os números recebidos. Quando faltar dado, diga que falta em vez de supor.\n\n${REGRAS_SMQ}`,
    `Pedido do Guilherme: ${contexto.objetivoDoPedido}
Empreendimento: ${contexto.empreendimento}
Campanha modelo escolhida para copiar: ${contexto.modelo}
Orçamento diário que ele colocou: R$ ${contexto.orcamentoPedido}
Diagnóstico dos últimos 30 dias deste empreendimento (gasto e resultados da Meta, leads no funil, visitas e vendas): ${JSON.stringify(contexto.diagnostico ?? "sem dados no período")}

Diga se o orçamento faz sentido, qual raio usar em volta do empreendimento e o que acompanhar.`,
    Estrategia,
    "medium",
  );
  return {
    ...r,
    leitura: semTravessao(r.leitura),
    justificativa: semTravessao(r.justificativa),
    riscos: r.riscos.map(semTravessao),
  };
}

// Copywriter + Auditor --------------------------------------------------------

const Textos = z.object({
  variacoes: z
    .array(
      z.object({
        titulo: z.string().describe("até 40 caracteres"),
        texto_principal: z.string().describe("até 300 caracteres"),
        descricao: z.string().describe("até 30 caracteres"),
      }),
    )
    .describe("3 variações com ângulos diferentes"),
});

const Auditoria = z.object({
  aprovado: z.boolean(),
  problemas: z.array(z.object({ variacao: z.number(), regra: z.string(), trecho: z.string() })),
});

export type Variacao = z.infer<typeof Textos>["variacoes"][number] & {
  problemas: Problema[];
  temPreco: boolean;
};

export async function copywriterComAuditoria(contexto: {
  empreendimento: string;
  briefing: string;
}): Promise<{ variacoes: Variacao[]; auditor: string }> {
  const t = await perguntar(
    COPYWRITER,
    `Você é o Copywriter da SMQ. Escreve textos de anúncio para Facebook e Instagram de lançamentos imobiliários econômicos em São Paulo, com foco em gerar conversa e visita.\n\n${REGRAS_SMQ}`,
    `Empreendimento: ${contexto.empreendimento}\nBriefing: ${contexto.briefing || "sem briefing extra"}\n\nEscreva 3 variações.`,
    Textos,
    "low",
  );
  const variacoes: Variacao[] = t.variacoes.map((v) => {
    const limpo = {
      titulo: semTravessao(v.titulo),
      texto_principal: semTravessao(v.texto_principal),
      descricao: semTravessao(v.descricao),
    };
    const tudo = `${limpo.titulo}\n${limpo.texto_principal}\n${limpo.descricao}`;
    return { ...limpo, problemas: verificarTexto(tudo), temPreco: temPreco(tudo) };
  });

  // O Auditor revisa o que as regras fixas não pegam (sentido, insinuação).
  const a = await perguntar(
    AUDITOR,
    `Você é o Auditor de Compliance da SMQ. Revise textos de anúncio e aponte qualquer violação. Seja rigoroso: na dúvida, aponte.\n\n${REGRAS_SMQ}`,
    variacoes
      .map(
        (v, i) =>
          `Variação ${i + 1}:\nTítulo: ${v.titulo}\nTexto: ${v.texto_principal}\nDescrição: ${v.descricao}`,
      )
      .join("\n\n"),
    Auditoria,
    "low",
  );
  for (const p of a.problemas) {
    const v = variacoes[p.variacao - 1];
    if (v) v.problemas.push({ regra: semTravessao(p.regra), trecho: p.trecho });
  }
  return {
    variacoes,
    auditor:
      a.aprovado && a.problemas.length === 0
        ? "Auditor não encontrou problema."
        : "Auditor apontou problemas.",
  };
}

// Roteirista de vídeo -----------------------------------------------------------

const Roteiro = z.object({
  prompt: z
    .string()
    .describe(
      "prompt em inglês para o Seedance 2.5, 60 a 120 palavras, descrevendo cena, câmera, luz e ritmo",
    ),
  resumo: z.string().describe("uma frase em português dizendo o que o vídeo vai mostrar"),
  alertas: z
    .array(z.string())
    .describe("pontos do pedido que você não seguiu por causa das regras, em português"),
});
export type Roteiro = z.infer<typeof Roteiro>;

export async function roteiristaDeVideo(contexto: {
  tipo: "gerar" | "editar";
  empreendimento: string;
  ideia: string;
  formato: string;
  comImagem: boolean;
}): Promise<Roteiro> {
  const r = await perguntar(
    COPYWRITER,
    `Você é o Roteirista de Vídeo da SMQ. Transforma o pedido do Guilherme num prompt para o modelo de vídeo Seedance 2.5 (Higgsfield), que entende melhor inglês.
- Vídeo de lançamento imobiliário econômico em São Paulo: fachada, área de lazer, apartamento decorado, bairro, família, luz natural.
- Identidade da marca quando couber: azul-marinho (#0F1E3A), dourado (#B89968) e creme (#F5F1EA), visual limpo e elegante.
- Não peça texto escrito na tela, letreiro, legenda nem número: o modelo erra letras e números, e a legenda entra depois. Nunca coloque preço, entrada, parcela, taxa ou valor de aprovação.
- Sem fala nem narração: no máximo som ambiente ou música suave, porque a voz gerada pode prometer o que não pode.
- Não invente detalhe do empreendimento que não foi dito (número de torres, itens de lazer, metragem).
- ${contexto.tipo === "editar" ? "É uma EDIÇÃO de um vídeo existente: escreva a instrução do que mudar, mantendo o resto do vídeo como está." : contexto.comImagem ? "O vídeo parte de uma imagem enviada: descreva o movimento a partir dela, sem trocar o que aparece nela." : "É um vídeo novo a partir de texto."}

${REGRAS_SMQ}`,
    `Empreendimento: ${contexto.empreendimento}
Formato: ${contexto.formato}
Pedido do Guilherme: ${contexto.ideia}`,
    Roteiro,
    "low",
  );
  return {
    prompt: semTravessao(r.prompt),
    resumo: semTravessao(r.resumo),
    alertas: r.alertas.map(semTravessao),
  };
}

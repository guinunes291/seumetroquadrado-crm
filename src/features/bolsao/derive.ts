// Lógica pura do Bolsão de oportunidades — a base geral da casa, sem dono.
//
// Desenho e medições: docs/ops/bolsao-oportunidades-fatia4.md.
//
// O Bolsão é o terceiro nível do modelo: carteira ativa (65, com dono,
// trabalho diário) → Reserva (com dono, esperando vaga) → Bolsão (SEM dono,
// discador e SDR). Tudo que não é Facebook, Marquinhos, Impulso SMQ ou SDR
// nasce aqui.
//
// Este módulo não sabe nada de React nem de Supabase: é o lugar onde as
// regras de leitura ficam testáveis sem montar tela.

/** Uma linha como `bolsao_v1` devolve — anonimizada por construção. */
export interface LinhaBolsao {
  lead_id: string;
  nome: string;
  /** Mascarado no banco: `(11) •••••0001`. Discar exige puxar o lead. */
  telefone_mascarado: string | null;
  status: string;
  origem: string | null;
  projeto_nome: string | null;
  bairro: string | null;
  zona: string | null;
  parado_desde: string;
  dias_parado: number;
  tem_interacao: boolean;
  tem_contato: boolean;
  em_triagem_sdr: boolean;
}

/**
 * O relógio de 7 dias (§5.1 do documento) é a régua de posse: lead com toque
 * nos últimos 7 dias não sai do dono. Aqui ele vira leitura — no Bolsão
 * ninguém tem dono, mas a temperatura diz o que esperar da ligação.
 */
export const PUXAR_FRIO_DIAS = 7;

export type Frieza = "recente" | "morno" | "frio" | "esquecido";

export function friezaDoLead(diasParado: number): Frieza {
  if (diasParado < PUXAR_FRIO_DIAS) return "recente";
  if (diasParado < 30) return "morno";
  if (diasParado < 180) return "frio";
  return "esquecido";
}

export const ROTULO_FRIEZA: Record<Frieza, string> = {
  recente: "tocado esta semana",
  morno: "parado há semanas",
  frio: "parado há meses",
  esquecido: "parado há mais de 6 meses",
};

/**
 * O que se sabe do histórico, sem dizer QUEM fez — o §5.2 do documento é
 * explícito: a anonimização vaza pelo histórico se a tela mostrar autor ou
 * texto. Aqui só cabem contagem e temperatura.
 */
export type Sinal = "nunca_tocado" | "so_tentativa" | "houve_conversa";

export function sinalDoLead(linha: Pick<LinhaBolsao, "tem_interacao" | "tem_contato">): Sinal {
  if (linha.tem_interacao) return "houve_conversa";
  if (linha.tem_contato) return "so_tentativa";
  return "nunca_tocado";
}

export const ROTULO_SINAL: Record<Sinal, string> = {
  nunca_tocado: "nunca tocado",
  so_tentativa: "tentaram, sem resposta",
  houve_conversa: "já houve conversa",
};

/**
 * Estoque é só o que ninguém conquistou nem pagou (§4 do documento).
 * Facebook, chatbot (Marquinhos), impulso_smq — custeado pela empresa — e
 * lead trazido pelo próprio corretor NÃO são estoque comum, e encontrar um
 * deles solto no Bolsão é sinal de que algo os soltou: a régua de devolução,
 * o motor de SDR ou a mão de alguém.
 */
const ORIGENS_DE_ESTOQUE = new Set(["importacao", "google_sheets", "outro"]);

export function ehEstoque(origem: string | null): boolean {
  return origem === null || ORIGENS_DE_ESTOQUE.has(origem);
}

export interface ResumoBolsao {
  total: number;
  nuncaTocados: number;
  jaHouveConversa: number;
  emTriagemSdr: number;
  naoEstoque: number;
}

export function resumoBolsao(linhas: readonly LinhaBolsao[]): ResumoBolsao {
  let nuncaTocados = 0;
  let jaHouveConversa = 0;
  let emTriagemSdr = 0;
  let naoEstoque = 0;
  for (const l of linhas) {
    const sinal = sinalDoLead(l);
    if (sinal === "nunca_tocado") nuncaTocados += 1;
    if (sinal === "houve_conversa") jaHouveConversa += 1;
    if (l.em_triagem_sdr) emTriagemSdr += 1;
    if (!ehEstoque(l.origem)) naoEstoque += 1;
  }
  return { total: linhas.length, nuncaTocados, jaHouveConversa, emTriagemSdr, naoEstoque };
}

/**
 * A frase do placar. Diz o tamanho do que está à vista, não da base inteira —
 * a RPC pagina, e prometer 38 mil numa tela que mostra 50 seria mentira de
 * interface.
 */
export function frasePlacar(resumo: ResumoBolsao, busca: string): string {
  if (resumo.total === 0) {
    return busca.trim()
      ? "Nenhum lead sem dono bate com essa busca."
      : "Nenhum lead sem dono para mostrar.";
  }
  const partes = [`${resumo.total} ${resumo.total === 1 ? "lead" : "leads"} sem dono`];
  if (resumo.jaHouveConversa > 0) partes.push(`${resumo.jaHouveConversa} já tiveram conversa`);
  if (resumo.nuncaTocados > 0) partes.push(`${resumo.nuncaTocados} nunca tocados`);
  if (resumo.emTriagemSdr > 0) partes.push(`${resumo.emTriagemSdr} com o SDR`);
  return `${partes.join(" · ")}.`;
}

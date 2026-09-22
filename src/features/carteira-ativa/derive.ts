// Carteira ativa — lógica PURA da leitura.
//
// A classificação (quem ocupa vaga, em qual faixa, e por que quem ficou de
// fora ficou) é do BANCO: `_carteira_classificar`, chamada por
// `carteira_ativa_v1` e `carteira_reserva_v1`. Duplicá-la aqui seria a
// divergência garantida — a Reserva é, por definição, o complemento exato da
// carteira ativa, e duas implementações da mesma regra param de fechar no
// primeiro ajuste.
//
// O que mora aqui é o que a TELA precisa e o banco não deve saber: os rótulos
// das faixas, a leitura do placar (ocupadas / vagas / estourou) e o
// agrupamento da Reserva por categoria de motivo — o motivo vem do banco como
// frase pronta ("sem movimento há 60 dias"), porque é isso que o corretor lê;
// a tela agrupa para o gestor ver o padrão.
//
// Desenho e medições: docs/ops/carteira-ativa-40-fatia3.md.

/**
 * Teto padrão da carteira ativa — o espelho de
 * `gestao_config.capacidade_leads_ativos_por_corretor`, que é a FONTE DE
 * VERDADE. Este valor só vale enquanto a config não chega do banco (e no
 * banco antigo, sem a Fatia 3); nunca substitui o valor real.
 *
 * Vive aqui, e não em dois arquivos, de propósito: o mesmo número era
 * `LIMITE_FILA` na Fila Única e `TETO_PADRAO` na carteira, e ao subir de 40
 * para 65 em 13/09/2026 ficou claro que duas constantes para um número são
 * duas chances de esquecer uma. `LIMITE_FILA` passou a importar daqui.
 */
export const TETO_PADRAO = 65;

/** Espelho de `gestao_config.carteira_ativa.cap_resgate` — quantos leads o
 *  corretor pode puxar da Reserva a dedo. Mesma regra do teto: o banco manda,
 *  isto é o fallback. Escala com o teto (8 quando o teto era 40). */
export const CAP_RESGATE_PADRAO = 13;

/**
 * As faixas, na ordem de precedência com que enchem as vagas.
 *
 * Sem `sla` desde 20260925120000: o lead recém-chegado ("chegaram agora")
 * está na BASE EM FORMAÇÃO — em D1/D2/D3 da cadência, fora dos 65. Os 65 são
 * só o que avançou de fase ou agendou para frente. `formacao` também não é
 * faixa daqui: `carteira_ativa_v1` nunca a devolve.
 */
export const FAIXAS = ["fundo", "resgate", "conversa"] as const;
export type Faixa = (typeof FAIXAS)[number];

export const FAIXA_LABEL: Record<Faixa, string> = {
  fundo: "Fundo do funil",
  resgate: "Resgatados por você",
  conversa: "Conversa viva",
};

export const FAIXA_HINT: Record<Faixa, string> = {
  fundo: "agendado, visita, proposta e análise de crédito — converte 39% e nunca sai da carteira",
  resgate: "você puxou da Reserva",
  conversa: "o cliente respondeu, ou você combinou de voltar",
};

/** Uma linha da carteira ativa, como `carteira_ativa_v1` devolve. */
export type LinhaCarteira = {
  lead_id: string;
  nome: string;
  telefone: string | null;
  status: string;
  temperatura: string | null;
  projeto_nome: string | null;
  created_at: string;
  movimento: string;
  dias_parado: number;
  proximo_followup: string | null;
  valor: number | null;
  faixa: string;
  posicao: number;
};

/** Uma linha da Reserva, como `carteira_reserva_v1` devolve. */
export type LinhaReserva = {
  lead_id: string;
  nome: string;
  telefone: string | null;
  status: string;
  temperatura: string | null;
  projeto_nome: string | null;
  created_at: string;
  movimento: string;
  dias_parado: number;
  valor: number | null;
  motivo: string;
  total: number;
};

export type CategoriaMotivo = "sem_movimento" | "sem_passo" | "sem_conversa" | "sem_vaga";

export const MOTIVO_LABEL: Record<CategoriaMotivo, string> = {
  sem_movimento: "Parados",
  sem_passo: "Sem próximo passo",
  sem_conversa: "Nunca engataram",
  sem_vaga: "Sem vaga hoje",
};

/**
 * Categoriza a frase que o banco devolveu. Deliberadamente tolerante: um
 * motivo novo no banco cai em "sem_vaga" em vez de sumir da tela ou quebrar
 * o agrupamento — perder um lead de vista é pior que rotulá-lo mal.
 */
export function categoriaDoMotivo(motivo: string): CategoriaMotivo {
  const m = motivo.toLowerCase();
  if (m.startsWith("sem movimento")) return "sem_movimento";
  if (m.startsWith("sem próximo passo")) return "sem_passo";
  if (m.startsWith("nunca respondeu") || m.startsWith("sem conversa")) return "sem_conversa";
  return "sem_vaga";
}

export type ResumoCarteira = {
  /** Quantas das vagas do teto estão ocupadas. */
  ocupadas: number;
  teto: number;
  /** Vagas livres, nunca negativo. */
  vagas: number;
  /**
   * A carteira passou do teto. Só acontece pelo fundo do funil, que nunca é
   * devolvido: quem estoura para de RECEBER, mas não perde negócio avançado.
   */
  estourou: boolean;
  /** Quanto o fundo sozinho ocupa — o número que explica um estouro. */
  fundo: number;
  porFaixa: Record<Faixa, number>;
  /** Soma do VGV estimado das vagas ocupadas (nulos não entram). */
  emJogo: number;
};

export function resumoCarteira(linhas: LinhaCarteira[], teto: number): ResumoCarteira {
  const porFaixa: Record<Faixa, number> = { fundo: 0, resgate: 0, conversa: 0 };
  let emJogo = 0;
  for (const l of linhas) {
    if ((FAIXAS as readonly string[]).includes(l.faixa)) porFaixa[l.faixa as Faixa] += 1;
    if (typeof l.valor === "number" && Number.isFinite(l.valor)) emJogo += l.valor;
  }
  const ocupadas = linhas.length;
  return {
    ocupadas,
    teto,
    vagas: Math.max(0, teto - ocupadas),
    estourou: ocupadas > teto,
    fundo: porFaixa.fundo,
    porFaixa,
    emJogo,
  };
}

/** Agrupa a Reserva por categoria de motivo, na ordem em que custa dinheiro. */
export const ORDEM_MOTIVO: CategoriaMotivo[] = [
  "sem_passo",
  "sem_conversa",
  "sem_movimento",
  "sem_vaga",
];

export function agruparReservaPorMotivo(
  linhas: LinhaReserva[],
): { categoria: CategoriaMotivo; label: string; quantidade: number }[] {
  const contagem = new Map<CategoriaMotivo, number>();
  for (const l of linhas) {
    const cat = categoriaDoMotivo(l.motivo);
    contagem.set(cat, (contagem.get(cat) ?? 0) + 1);
  }
  return ORDEM_MOTIVO.filter((cat) => (contagem.get(cat) ?? 0) > 0).map((cat) => ({
    categoria: cat,
    label: MOTIVO_LABEL[cat],
    quantidade: contagem.get(cat) ?? 0,
  }));
}

/** Agrupa a carteira ativa por faixa, preservando a ordem de precedência e a
 *  posição dentro de cada grupo. Faixas vazias não viram seção. */
export function agruparPorFaixa(
  linhas: LinhaCarteira[],
): { faixa: Faixa; label: string; hint: string; itens: LinhaCarteira[] }[] {
  return FAIXAS.map((faixa) => ({
    faixa,
    label: FAIXA_LABEL[faixa],
    hint: FAIXA_HINT[faixa],
    itens: linhas.filter((l) => l.faixa === faixa).sort((a, b) => a.posicao - b.posicao),
  })).filter((g) => g.itens.length > 0);
}

/**
 * A frase do placar. Existe como função pura porque é a mensagem que decide o
 * comportamento do corretor, e errar o tom aqui é caro: quem estourou por ter
 * muito negócio avançado não pode receber uma bronca.
 */
export function fraseDoPlacar(r: ResumoCarteira): string {
  if (r.estourou) {
    return `${r.ocupadas} na carteira, ${r.fundo} no fundo do funil. Você não recebe lead novo até desovar — nenhum negócio avançado foi devolvido.`;
  }
  if (r.vagas === 0) {
    return `Carteira cheia: ${r.ocupadas} de ${r.teto}. O próximo lead entra quando um sair.`;
  }
  if (r.vagas === 1) return `${r.ocupadas} de ${r.teto} — 1 vaga livre.`;
  return `${r.ocupadas} de ${r.teto} — ${r.vagas} vagas livres.`;
}

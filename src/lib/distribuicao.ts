// Distribuição v3 — lógica pura e vocabulário (labels pt-BR).
//
// Este módulo espelha, de forma testável, as regras que vivem no banco
// (migrations distribuicao_v3_*): cálculo do % trabalhado, resolução de
// roleta por origem/canal, ordem do rodízio e janela de funcionamento.
// A DECISÃO real é sempre do motor SQL (_distribuir_lead_v3) — aqui é a
// mesma régua para exibição, ordenação e testes, nunca uma segunda fonte
// de verdade para atribuir lead.
//
// Desde a quebra em módulos (2026-10): o mapa das filiais em
// distribuicao-filiais.ts e o vocabulário dos motivos/gatilhos em
// distribuicao-rotulos.ts (reexportados daqui).

import type { Database } from "@/integrations/supabase/types";

export {
  ordenarZonas,
  agruparFiliais,
  filiaisDaRegiao,
  zonasSoltas,
  uniaoDasZonas,
  rotuloFilial,
  femininoNaFrase,
  listarNomes,
  filiaisQueAlternam,
  frasesAlternancia,
  secoesDeCampanhas,
  descricaoRoletaFilial,
} from "./distribuicao-filiais";
export type { ZonaRoletaLinha, FilialRoleta } from "./distribuicao-filiais";

export {
  MOTIVO_INAPTIDAO_LABEL,
  motivoInaptidaoLabel,
  MOTIVO_EXCECAO_LABEL,
  motivoExcecaoLabel,
  EXCECAO_STATUS_LABEL,
  ACAO_PARTICIPANTE_LABEL,
  RESULTADO_LABEL,
  GATILHO_LABEL,
  gatilhoLabel,
} from "./distribuicao-rotulos";
export type { MotivoInaptidao, MotivoExcecao } from "./distribuicao-rotulos";

export type LeadOrigem = Database["public"]["Enums"]["lead_origem"];

// Roletas de FILIAL (decisão do dono, 12/10/2026: "vamos montar roletas por
// filial, fica mais simples de distribuir em apenas 3 roletas"). A roleta de
// tipo 'zona' é o time fixo de uma filial e recebe os leads das zonas que ela
// atende (mapa em zonas_roletas: Oeste, Norte e Sul → Barra Funda; Centro e
// Leste → Liberdade; Leste e Grande SP → Belém — a Leste alterna entre as
// duas). A zona continua no lead; o time passou a ser a filial. A lista das
// roletas de filial NUNCA é uma constante aqui: vem de `roletas` (tipo 'zona',
// ativa) na ordem de `filiais.ordem`, para a gestão poder abrir uma loja nova
// sem deploy.
export type RoletaSlug = "plantao" | "marquinhos" | "landing" | "base" | "agendados-sdr";

/** As três roletas de filial da 0079 — o nome vem de roletas.nome; aqui é só
 *  o fallback de rótulo quando a tela tem o slug e não a linha. */
export type RoletaFilialSlug = "filial-barra-funda" | "filial-liberdade" | "filial-belem";

/** As seis roletas de zona (16/08 e 03/10) ficaram INATIVAS em 12/10/2026,
 *  nunca apagadas: histórico, tokens de webhook antigos e rollback. Os slugs
 *  seguem aqui só para o histórico e os filtros lerem "(antiga)". */
export type RoletaZonaLegadaSlug =
  "zona-norte" | "zona-sul" | "zona-leste" | "zona-oeste" | "zona-centro" | "zona-grande-sp";

export const ROLETA_LABEL: Record<RoletaSlug | RoletaFilialSlug | RoletaZonaLegadaSlug, string> = {
  plantao: "Roleta Plantão",
  marquinhos: "Roleta Marquinhos",
  landing: "Roleta Landing Page",
  base: "Roleta Base",
  "agendados-sdr": "Agendados do SDR",
  "filial-barra-funda": "Roleta Barra Funda",
  "filial-liberdade": "Roleta Liberdade",
  "filial-belem": "Roleta Belém",
  "zona-norte": "Roleta Zona Norte (antiga)",
  "zona-sul": "Roleta Zona Sul (antiga)",
  "zona-leste": "Roleta Zona Leste (antiga)",
  "zona-oeste": "Roleta Zona Oeste (antiga)",
  "zona-centro": "Roleta Centro (antiga)",
  "zona-grande-sp": "Roleta Grande SP (antiga)",
};

/** Nome vindo do banco (roletas.nome) vence o mapa fixo — campanha e roleta
 *  nova nunca mais aparecem como slug cru. */
export function roletaLabel(slug: string | null | undefined, nome?: string | null): string {
  if (nome && nome.trim() !== "") return nome;
  if (!slug) return "—";
  return ROLETA_LABEL[slug as keyof typeof ROLETA_LABEL] ?? slug;
}

// ---------------------------------------------------------------------------
// % trabalhado — mesma fórmula de _elegibilidade_roleta:
//   pct = 100 × (carteira − aguardando) / carteira  · carteira 0 → 100
// ---------------------------------------------------------------------------
export function calcPctTrabalhado(carteiraTotal: number, aguardando: number): number {
  if (carteiraTotal <= 0) return 100;
  const pct = (100 * (carteiraTotal - aguardando)) / carteiraTotal;
  return Math.round(pct * 10) / 10;
}

// ---------------------------------------------------------------------------
// Resolução origem/canal → roleta (mesma regra de _resolver_roleta_lead):
// canal 'webhook_landing' resolve pela linha EDITÁVEL da origem 'site' no
// mapa (2026-08-16 — o destino fixo saiu do código para a gestão poder
// mesclar/reapontar a roleta da landing); as demais origens seguem o mapa.
// ---------------------------------------------------------------------------
export function resolverRoletaPorOrigem(
  origem: string,
  canalEntrada: string | null,
  mapa: Partial<Record<string, string | null>>,
): RoletaSlug | null {
  const chave = canalEntrada === "webhook_landing" ? "site" : origem;
  return (mapa[chave] as RoletaSlug | null | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Rodízio: próximo da vez = apto há mais tempo sem receber (NULLS FIRST),
// desempate por inclusão mais antiga. Dados vêm do SERVIDOR
// (elegibilidade_roleta) — nunca do relógio do navegador.
// ---------------------------------------------------------------------------
export interface ParticipanteRodizio {
  corretor_id: string;
  apto: boolean;
  ultimo_lead_em: string | null;
  incluido_em?: string | null;
}

export function proximoDaVez<T extends ParticipanteRodizio>(participantes: T[]): T | null {
  const aptos = participantes.filter((p) => p.apto);
  if (aptos.length === 0) return null;
  const sorted = [...aptos].sort((a, b) => {
    if (a.ultimo_lead_em === null && b.ultimo_lead_em !== null) return -1;
    if (a.ultimo_lead_em !== null && b.ultimo_lead_em === null) return 1;
    if (a.ultimo_lead_em !== b.ultimo_lead_em) {
      return (a.ultimo_lead_em ?? "") < (b.ultimo_lead_em ?? "") ? -1 : 1;
    }
    return (a.incluido_em ?? "") < (b.incluido_em ?? "") ? -1 : 1;
  });
  return sorted[0] ?? null;
}

// ---------------------------------------------------------------------------
// Janela de funcionamento (horários em "HH:MM" ou "HH:MM:SS", relógio BRT
// vindo do servidor). Janela atravessando a meia-noite é suportada
// (ex.: 20:00 → 02:00).
// ---------------------------------------------------------------------------
function toMinutos(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

export function dentroDoHorario(
  inicio: string | null,
  fim: string | null,
  agoraHHMM: string,
): boolean {
  if (!inicio || !fim) return true; // sem janela = 24h
  const a = toMinutos(agoraHHMM);
  const i = toMinutos(inicio);
  const f = toMinutos(fim);
  if (i <= f) return a >= i && a <= f;
  return a >= i || a <= f; // janela overnight
}

// ---------------------------------------------------------------------------
// Participação percentual (aba Landing): fatia de cada corretor no volume.
// ---------------------------------------------------------------------------
export function participacaoPercentual(recebidos: number, totalRoleta: number): number {
  if (totalRoleta <= 0) return 0;
  return Math.round((1000 * recebidos) / totalRoleta) / 10;
}

// ---------------------------------------------------------------------------
// Contexto da decisão (distribuicao_log_contexto.contexto) → estrutura de
// exibição para o dialog "por que este corretor?".
// ---------------------------------------------------------------------------
export interface DecisaoContexto {
  roleta: string | null;
  gatilho: string | null;
  regra: string | null;
  percentualMinimo: number | null;
  aptos: Array<{ corretor_id: string; nome: string; ultimo_lead_em: string | null }>;
  inaptos: Array<{
    corretor_id: string;
    nome: string;
    motivos: string[];
    pct_trabalhado?: number;
    recebidos_hoje?: number;
    limite_diario?: number;
  }>;
  vencedor: { corretor_id: string; nome: string } | null;
  corretorAnterior: { corretor_id: string; ativo: boolean; politica?: string } | null;
  duplicadoId: string | null;
}

export function resumoDecisao(contexto: unknown): DecisaoContexto {
  const c = (contexto ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const obj = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

  const vencedor = obj(c.vencedor);
  const anterior = obj(c.corretor_anterior);
  const dedup = obj(c.dedup);

  return {
    roleta: typeof c.roleta === "string" ? c.roleta : null,
    gatilho: typeof c.gatilho === "string" ? c.gatilho : null,
    regra: typeof c.regra === "string" ? c.regra : null,
    percentualMinimo: typeof c.percentual_minimo === "number" ? c.percentual_minimo : null,
    aptos: arr(c.aptos) as DecisaoContexto["aptos"],
    inaptos: arr(c.inaptos) as DecisaoContexto["inaptos"],
    vencedor: vencedor
      ? { corretor_id: String(vencedor.corretor_id ?? ""), nome: String(vencedor.nome ?? "") }
      : null,
    corretorAnterior: anterior
      ? {
          corretor_id: String(anterior.corretor_id ?? ""),
          ativo: Boolean(anterior.ativo),
          politica: typeof anterior.politica === "string" ? anterior.politica : undefined,
        }
      : null,
    duplicadoId:
      dedup && typeof dedup.duplicado_id === "string" ? (dedup.duplicado_id as string) : null,
  };
}

/**
 * Presença obrigatória em toda fila (decisão do dono, 09/10/2026; migration
 * 20261013120000): o banco religa `exigir_presenca` em qualquer fila que não
 * seja a do SDR — o interruptor da Central fica travado. A fila do SDR
 * (Agendados do SDR) fica de fora por decisão do dono: entrega por agenda
 * livre, "sem presença do dia" (docs/politica-sdr-v1.md, item 7).
 */
export function presencaObrigatoria(roleta: { tipo?: string | null }): boolean {
  return roleta.tipo !== "sdr";
}

export const PRESENCA_OBRIGATORIA_HINT =
  "Obrigatória em toda fila: só recebe quem fez check-in hoje (filial, ou em casa com a meta do mês anterior).";

/**
 * O item de presença do menu da linha (aba da roleta de plantão, gestão).
 * Presente → "marcar_ausente" (inclusive a própria linha: encerrar o dia vale).
 * Ausente → "marcar_presente", MENOS na própria linha: a gestão não se liga nas
 * roletas (decisão do dono, 13/10/2026) — o gestor que também é corretor faz o
 * check-in como todo corretor, com a localização. null = sem o item.
 */
export function acaoPresencaDaGestao(
  linha: { corretor_id: string; presente: boolean },
  meuId: string | null | undefined,
): "marcar_ausente" | "marcar_presente" | null {
  if (linha.presente) return "marcar_ausente";
  if (meuId && linha.corretor_id === meuId) return null;
  return "marcar_presente";
}

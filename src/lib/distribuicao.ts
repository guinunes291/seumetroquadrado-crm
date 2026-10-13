// Distribuição v3 — lógica pura e vocabulário (labels pt-BR).
//
// Este módulo espelha, de forma testável, as regras que vivem no banco
// (migrations distribuicao_v3_*): cálculo do % trabalhado, resolução de
// roleta por origem/canal, ordem do rodízio e janela de funcionamento.
// A DECISÃO real é sempre do motor SQL (_distribuir_lead_v3) — aqui é a
// mesma régua para exibição, ordenação e testes, nunca uma segunda fonte
// de verdade para atribuir lead.

import type { Database } from "@/integrations/supabase/types";
import { ZONAS_REGIAO } from "@/lib/zonas";

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
  // Plantão, Landing e Base saíram em 13/10/2026 (roletas simples): ficam só
  // para o histórico ler "(antiga)".
  plantao: "Roleta Plantão (antiga)",
  marquinhos: "Roleta Marquinhos",
  landing: "Roleta Landing Page (antiga)",
  base: "Roleta Base (antiga)",
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
// O mapa das filiais (zonas_roletas + roletas + filiais), puro e testável. A
// verdade mora no banco; aqui é a mesma leitura para a aba Corretores (editor
// por filial), a aba Filas (ordem das filiais) e as descrições.
// ---------------------------------------------------------------------------

/** Uma linha de zonas_roletas já com o nome da roleta e a filial dela. */
export interface ZonaRoletaLinha {
  zona: string;
  roleta_slug: string;
  roleta_nome: string;
  roleta_ativa: boolean;
  filial_slug: string | null;
  filial_nome: string | null;
  filial_ordem: number | null;
}

/** Uma filial com a roleta dela e as zonas que atende. */
export interface FilialRoleta {
  /** Slug da FILIAL (filiais.slug), não da roleta. */
  slug: string;
  nome: string;
  ordem: number;
  roletaSlug: string;
  roletaNome: string;
  /** Na ordem dos chips (ZONAS_REGIAO), não na alfabética do banco. */
  zonas: string[];
}

/** Zonas na ordem dos chips; o que não é zona conhecida vai para o fim. */
export function ordenarZonas(zonas: readonly string[]): string[] {
  const pos = (z: string) => {
    const i = ZONAS_REGIAO.indexOf(z as (typeof ZONAS_REGIAO)[number]);
    return i === -1 ? 99 : i;
  };
  return [...new Set(zonas)].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b, "pt-BR"));
}

/** As filiais com roleta ATIVA, na ordem de filiais.ordem (empate pelo nome). */
export function agruparFiliais(linhas: readonly ZonaRoletaLinha[]): FilialRoleta[] {
  const porRoleta = new Map<string, FilialRoleta>();
  for (const l of linhas) {
    if (!l.filial_slug || !l.roleta_ativa) continue;
    const f = porRoleta.get(l.roleta_slug) ?? {
      slug: l.filial_slug,
      nome: l.filial_nome ?? l.filial_slug,
      ordem: l.filial_ordem ?? 99,
      roletaSlug: l.roleta_slug,
      roletaNome: l.roleta_nome,
      zonas: [],
    };
    f.zonas.push(l.zona);
    porRoleta.set(l.roleta_slug, f);
  }
  return [...porRoleta.values()]
    .map((f) => ({ ...f, zonas: ordenarZonas(f.zonas) }))
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** A filial está inteira na região do corretor: todas as zonas dela ⊆ região.
 *  (A região é o espelho das roletas de filial em que ele está, então é
 *  tudo ou nada por filial.) */
export function filiaisDaRegiao(filiais: readonly FilialRoleta[], zonas: readonly string[]) {
  const regiao = new Set(zonas);
  return filiais.filter((f) => f.zonas.length > 0 && f.zonas.every((z) => regiao.has(z)));
}

/** Zonas da região que nenhuma filial inteira cobre — não deve acontecer
 *  (a RPC recusa região que não é por filial); a tela mostra a zona solta. */
export function zonasSoltas(filiais: readonly FilialRoleta[], zonas: readonly string[]): string[] {
  const cobertas = new Set(filiaisDaRegiao(filiais, zonas).flatMap((f) => f.zonas));
  return ordenarZonas(zonas.filter((z) => !cobertas.has(z)));
}

/** A união das zonas das filiais marcadas — o que atualizar_corretor_distribuicao
 *  espera (mandar só parte das zonas de uma filial dá "a região é por filial"). */
export function uniaoDasZonas(
  filiais: readonly FilialRoleta[],
  marcadas: ReadonlySet<string>,
): string[] {
  return ordenarZonas(filiais.filter((f) => marcadas.has(f.slug)).flatMap((f) => f.zonas));
}

/** "Belém — Leste, Grande SP" (separador configurável: "·" nos badges). */
export function rotuloFilial(f: FilialRoleta, separador = " — "): string {
  return `${f.nome}${separador}${f.zonas.join(", ")}`;
}

/** Nomes que levam artigo feminino na frase ("na Belém", "a Liberdade");
 *  o resto é masculino ("no Sul", "o Centro"). Lista explícita de propósito:
 *  a tela não adivinha gênero de nome de loja. */
const NOMES_FEMININOS = new Set(["Grande SP", "Barra Funda", "Liberdade", "Belém"]);
export function femininoNaFrase(nome: string): boolean {
  return NOMES_FEMININOS.has(nome);
}

/** "Liberdade e Belém", "Norte, Sul e Oeste". */
export function listarNomes(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** As outras filiais que atendem a mesma zona ("A Leste alterna com a Belém"). */
export function filiaisQueAlternam(f: FilialRoleta, todas: readonly FilialRoleta[]) {
  return f.zonas
    .map((zona) => ({
      zona,
      com: todas.filter((o) => o.slug !== f.slug && o.zonas.includes(zona)).map((o) => o.nome),
    }))
    .filter((x) => x.com.length > 0);
}

/** "A Leste alterna entre Liberdade e Belém." — uma frase por zona que mais de
 *  uma filial atende (o rodízio entre as roletas da mesma zona). */
export function frasesAlternancia(filiais: readonly FilialRoleta[]): string[] {
  const porZona = new Map<string, string[]>();
  for (const f of filiais) {
    for (const z of f.zonas) porZona.set(z, [...(porZona.get(z) ?? []), f.nome]);
  }
  return ordenarZonas([...porZona.keys()]).flatMap((z) => {
    const nomes = porZona.get(z) ?? [];
    return nomes.length > 1 ? [`A ${z} alterna entre ${listarNomes(nomes)}.`] : [];
  });
}

// ---------------------------------------------------------------------------
// As quatro roletas (decisão do dono, 13/10/2026: "precisamos apenas dessas
// roletas no sistema"). Toda roleta do banco cai numa família pelo tipo; o
// que não cai (Plantão, Landing e Base, desligadas) é "antiga" e some das
// telas de operação — fica só no histórico.
// ---------------------------------------------------------------------------
export type FamiliaRoleta = "campanha" | "filial" | "sdr" | "marquinhos";

/** Na ordem do pedido do dono. */
export const FAMILIAS_ROLETA: readonly FamiliaRoleta[] = [
  "campanha",
  "filial",
  "sdr",
  "marquinhos",
];

export const FAMILIA_ROLETA_LABEL: Record<FamiliaRoleta, string> = {
  campanha: "Campanhas Facebook Ads",
  filial: "Filiais",
  sdr: "SDR",
  marquinhos: "Marquinhos",
};

/** A família da roleta; null = roleta antiga (fora das quatro). A roleta de
 *  filial é a de tipo 'zona' COM filial (as zona-* antigas não têm). */
export function familiaDaRoleta(r: {
  slug: string;
  tipo: string;
  filial_id?: string | null;
}): FamiliaRoleta | null {
  if (r.slug === "marquinhos") return "marquinhos";
  if (r.tipo === "campanha") return "campanha";
  if (r.tipo === "sdr") return "sdr";
  if (r.tipo === "zona" && (r.filial_id === undefined || r.filial_id !== null)) return "filial";
  return null;
}

/** A descrição da roleta de filial na Central: as zonas e quem alterna. */
export function descricaoRoletaFilial(f: FilialRoleta, todas: readonly FilialRoleta[]): string {
  const zonas =
    f.zonas.length === 1 ? `da zona ${f.zonas[0]}` : `das zonas ${listarNomes(f.zonas)}`;
  const base = `Time fixo da ${f.nome}: recebe os leads ${zonas}.`;
  const alterna = filiaisQueAlternam(f, todas).map(
    (x) =>
      `A ${x.zona} alterna com ${listarNomes(
        x.com.map((n) => `${femininoNaFrase(n) ? "a" : "o"} ${n}`),
      )}.`,
  );
  return [base, ...alterna].join(" ");
}

// ---------------------------------------------------------------------------
// Motivos de inaptidão (mesmos códigos emitidos por _elegibilidade_roleta)
// ---------------------------------------------------------------------------
export type MotivoInaptidao =
  | "nao_participante"
  | "participacao_inativa"
  | "pausado"
  | "perfil_inativo"
  | "sem_role_corretor"
  | "sem_telefone"
  | "ausente_hoje"
  | "cota_diaria_atingida"
  | "pct_trabalhado_abaixo_minimo"
  | "sem_modelo_contrato"
  | "onboarding_pendente"
  | "conflito_agenda"
  | "regra_65_sem_vaga"
  | "roleta_desativada"
  | "fora_da_regiao"
  | "sem_zona_no_perfil"
  | "vez_em_outra_zona";

export const MOTIVO_INAPTIDAO_LABEL: Record<MotivoInaptidao, string> = {
  nao_participante: "Não participa da roleta",
  participacao_inativa: "Desativado na roleta",
  pausado: "Pausado temporariamente",
  perfil_inativo: "Perfil inativo no CRM",
  sem_role_corretor: "Sem papel de corretor",
  sem_telefone: "Sem telefone cadastrado",
  // Desde a presença por filial (2026-10-13), "presente" = check-in que libera
  // a roleta: filial, ou em casa com o mínimo de vendas do mês anterior.
  ausente_hoje: "Sem check-in que libere a roleta hoje",
  cota_diaria_atingida: "Cota diária de leads atingida",
  pct_trabalhado_abaixo_minimo: "% de leads trabalhados abaixo do mínimo",
  sem_modelo_contrato: "Sem modelo de contrato definido",
  onboarding_pendente: "Onboarding não concluído",
  conflito_agenda: "Conflito de agenda no horário da visita",
  regra_65_sem_vaga: "Em atendimento no teto (regra dos 65)",
  roleta_desativada: "Roleta desligada",
  // Fila por zona (2026-10-15): a roleta só sorteia quem atende a zona.
  fora_da_regiao: "Não atende esta zona",
  sem_zona_no_perfil: "Sem zona no perfil (a gestão define a filial)",
  // A vez é uma só (2026-10-17): é o 1º da fila de outra zona — ou, desde as
  // roletas por filial (12/10), de outra filial.
  vez_em_outra_zona: "A vez agora é em outra zona ou filial",
};

export function motivoInaptidaoLabel(motivo: string): string {
  // Código dinâmico do disjuntor do v2: disjuntor_wip_<N leads ativos>.
  if (motivo.startsWith("disjuntor_wip_")) {
    const n = motivo.slice("disjuntor_wip_".length);
    return `Teto de leads ativos atingido (${n} no funil)`;
  }
  return MOTIVO_INAPTIDAO_LABEL[motivo as MotivoInaptidao] ?? motivo;
}

// ---------------------------------------------------------------------------
// Motivos de exceção (mesmos códigos de distribuicao_excecoes.motivo)
// ---------------------------------------------------------------------------
export type MotivoExcecao =
  | "sem_corretor_ativo"
  | "sem_corretor_elegivel"
  | "duplicado_incerto"
  | "origem_nao_mapeada"
  | "falha_tecnica"
  | "corretor_anterior_inativo"
  | "dados_incompletos"
  | "sem_corretor_na_zona"
  | "zona_sem_time"
  | "zona_sem_roleta";

export const MOTIVO_EXCECAO_LABEL: Record<MotivoExcecao, string> = {
  sem_corretor_ativo: "Nenhum corretor ativo na roleta",
  sem_corretor_elegivel: "Nenhum corretor apto no momento",
  duplicado_incerto: "Lead duplicado sem regra clara",
  origem_nao_mapeada: "Origem sem roleta vinculada",
  falha_tecnica: "Falha técnica na distribuição",
  corretor_anterior_inativo: "Corretor anterior inativo",
  dados_incompletos: "Lead sem dados mínimos",
  // Roletas por filial (12/10/2026): o time da zona é a(s) filial(is) que a atendem.
  sem_corretor_na_zona: "Esperando a filial da zona (ninguém da filial apto agora)",
  zona_sem_time: "Zona sem time na filial",
  zona_sem_roleta: "Zona sem roleta de filial",
};

export function motivoExcecaoLabel(motivo: string): string {
  return MOTIVO_EXCECAO_LABEL[motivo as MotivoExcecao] ?? motivo;
}

export const EXCECAO_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_analise: "Em análise",
  resolvida: "Resolvida",
  arquivada: "Arquivada",
};

// ---------------------------------------------------------------------------
// Auditoria de participação
// ---------------------------------------------------------------------------
export const ACAO_PARTICIPANTE_LABEL: Record<string, string> = {
  incluido: "Incluído",
  removido: "Removido",
  pausado: "Pausado",
  reativado: "Reativado",
  limite_alterado: "Limite alterado",
};

// ---------------------------------------------------------------------------
// Log de decisão
// ---------------------------------------------------------------------------
export const RESULTADO_LABEL: Record<string, string> = {
  sucesso: "Distribuído",
  sem_corretor: "Sem corretor",
  erro: "Erro",
  excecao: "Exceção",
};

export const GATILHO_LABEL: Record<string, string> = {
  webhook: "Webhook (chatbot)",
  campanha_zona: "Campanha → roleta da filial da zona",
  webhook_landing: "Webhook (landing page)",
  edge_facebook: "Facebook Ads",
  cron: "Rotina automática",
  manual: "Manual",
  sla_webhook: "Repasse por SLA",
  sla_webhook_imediato: "Repasse por SLA (imediato)",
  lead_parado: "Redistribuição de parado",
  lead_perdido: "Repasse após perda",
  excecao_reprocesso: "Reprocessamento de exceção",
  excecao_manual: "Exceção — atribuição manual",
  excecao_roleta_forcada: "Exceção — roleta escolhida",
  excecao_corrigir_origem: "Exceção — origem corrigida",
  manual_roleta: "Roleta manual (lista de leads)",
  manual_criacao: "Criação manual de lead",
  reprocesso: "Reprocessamento",
  // Roletas simples (13/10/2026).
  estoque: "Estoque (pelas filiais)",
  campanha_equipe_sem_apto: "Campanha sem ninguém apto → rodízio das filiais",
  campanha_equipe_fixa_sem_zona: "Campanha sem ninguém apto → filial da zona",
  fallback_velocidade: "Fallback por velocidade",
  teste: "Teste",
};

export function gatilhoLabel(gatilho: string | null | undefined): string {
  if (!gatilho) return "—";
  return GATILHO_LABEL[gatilho] ?? gatilho;
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

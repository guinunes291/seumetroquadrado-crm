// Roleta "Agendados do SDR" — permanência semanal por produção. Regras PURAS,
// espelho testável do que vive no banco (migration 20261011120000): a decisão
// real é sempre do Postgres (`roleta_sdr_apurar_semana` no sábado 08:00). Aqui
// é a mesma régua para a tela mostrar o placar, o "falta" e o status previsto
// ANTES de a apuração rodar — nunca uma segunda fonte de verdade.
//
// Política em docs/politica-roleta-sdr-semanal.md:
//   semana ........ sábado 00:00 → sexta 23:59, relógio de São Paulo (o mesmo
//                   calendário da folha do SDR, semana-sdr.ts)
//   visita ........ presença validada, NÃO auto-gerada, no DIA da visita;
//                   1 por lead por semana .......................... 1 ponto
//   pasta ......... entrada em análise de crédito; não conta se o mesmo lead
//                   já tinha entrado nos 30 dias anteriores ...... 1,5 ponto
//   meta .......... 3 pontos ("3 visitas OU 2 pastas", combinações valem)
//   cascata ....... meta batida (sem teto) → venda nos últimos 15 dias (sem
//                   teto) → mais pontos (> 0), só até o mínimo de 3 aptos
//   peso .......... no rodízio da semana seguinte: meta = 2; 1 venda ou
//                   complemento = 1; 2+ vendas = 2 (migration 20261011120100)

import { z } from "zod";
import { inicioSemanaSdr } from "@/features/dashboard/semana-sdr";
import { agoraSaoPaulo, dateKey } from "@/lib/periodo";

// ---------------------------------------------------------------------------
// Configuração (distribuicao_settings → roleta_sdr_config())
// ---------------------------------------------------------------------------

export type ConfigRoletaSdr = {
  regra_ativa: boolean;
  modo_sombra: boolean;
  peso_visita: number;
  peso_pasta: number;
  meta_pontos: number;
  minimo_aptos: number;
  venda_janela_dias: number;
  /** Peso no rodízio de quem bateu a meta (ou tem vendas_peso_cheio vendas). */
  peso_rodizio_meta: number;
  /** Peso no rodízio de quem entrou por 1 venda ou pelo complemento. */
  peso_rodizio_reduzido: number;
  /** Vendas na janela que dão peso cheio sem a meta (0 = nunca). */
  vendas_peso_cheio: number;
};

/** Padrões da migration — os mesmos que o banco assume sem a chave. */
export const CONFIG_ROLETA_SDR_PADRAO: ConfigRoletaSdr = {
  regra_ativa: false,
  modo_sombra: true,
  peso_visita: 1,
  peso_pasta: 1.5,
  meta_pontos: 3,
  minimo_aptos: 3,
  venda_janela_dias: 15,
  peso_rodizio_meta: 2,
  peso_rodizio_reduzido: 1,
  vendas_peso_cheio: 2,
};

/** Chaves editáveis na Central → Política (ordem da tela). */
export { CHAVES_ROLETA_SDR } from "@/lib/roleta-sdr-chaves";

const numero = (v: unknown, padrao: number, min = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(n, min) : padrao;
};

/** Lê o jsonb de `roleta_sdr_config()` com a mesma tolerância do banco. */
export function lerConfigRoletaSdr(raw: unknown): ConfigRoletaSdr {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p = CONFIG_ROLETA_SDR_PADRAO;
  return {
    regra_ativa: typeof o.regra_ativa === "boolean" ? o.regra_ativa : p.regra_ativa,
    modo_sombra: typeof o.modo_sombra === "boolean" ? o.modo_sombra : p.modo_sombra,
    peso_visita: numero(o.peso_visita, p.peso_visita),
    peso_pasta: numero(o.peso_pasta, p.peso_pasta),
    meta_pontos: numero(o.meta_pontos, p.meta_pontos),
    minimo_aptos: Math.floor(numero(o.minimo_aptos, p.minimo_aptos)),
    venda_janela_dias: Math.floor(numero(o.venda_janela_dias, p.venda_janela_dias)),
    // Pesos do rodízio: inteiros >= 1, como no banco.
    peso_rodizio_meta: Math.floor(numero(o.peso_rodizio_meta, p.peso_rodizio_meta, 1)),
    peso_rodizio_reduzido: Math.floor(numero(o.peso_rodizio_reduzido, p.peso_rodizio_reduzido, 1)),
    vendas_peso_cheio: Math.floor(numero(o.vendas_peso_cheio, p.vendas_peso_cheio)),
  };
}

// ---------------------------------------------------------------------------
// Calendário — reaproveita inicioSemanaSdr (semana da folha do SDR)
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" do dia em São Paulo em que o instante cai. */
export function diaSaoPauloDe(instante: string | Date): string {
  return dateKey(agoraSaoPaulo(new Date(instante)));
}

/** "YYYY-MM-DD" do sábado que abre a semana do instante (relógio de São Paulo). */
export function semanaDoInstante(instante: string | Date): string {
  return dateKey(inicioSemanaSdr(agoraSaoPaulo(new Date(instante))));
}

const deChave = (chave: string): Date => {
  const [y, m, d] = chave.split("-").map(Number);
  return new Date(y, m - 1, d, 12); // meio-dia: imune a virada de horário de verão do aparelho
};

/** Soma dias a uma data "YYYY-MM-DD". */
export function somarDias(chave: string, dias: number): string {
  const d = deChave(chave);
  d.setDate(d.getDate() + dias);
  return dateKey(d);
}

/** Diferença em dias de calendário (b - a) entre duas datas "YYYY-MM-DD". */
export function diasEntre(a: string, b: string): number {
  return Math.round((deChave(b).getTime() - deChave(a).getTime()) / 86_400_000);
}

/** Sexta que fecha a semana. */
export function fimDaSemana(semanaInicio: string): string {
  return somarDias(semanaInicio, 6);
}

/** Semana em curso (a do aviso de quarta e do placar ao vivo). */
export function semanaEmCurso(agora: Date = new Date()): string {
  return semanaDoInstante(agora);
}

/** Última semana já fechada — a que a apuração de sábado aplica. */
export function ultimaSemanaFechada(agora: Date = new Date()): string {
  return somarDias(semanaEmCurso(agora), -7);
}

/**
 * Fim da pausa de quem não bateu a meta: o SÁBADO SEGUINTE à apuração, 09:00
 * em São Paulo — 1h depois da próxima apuração (08:00), para a pausa nunca
 * expirar antes de a régua da semana seguinte rodar. São Paulo não tem horário
 * de verão desde 2019: o offset é fixo em -03:00.
 */
export function pausaAte(semanaInicio: string): string {
  return `${somarDias(semanaInicio, 14)}T09:00:00-03:00`;
}

/** "03/10 a 09/10". */
export function rotuloSemana(semanaInicio: string): string {
  const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
  return `${dm(semanaInicio)} a ${dm(fimDaSemana(semanaInicio))}`;
}

// ---------------------------------------------------------------------------
// O que conta
// ---------------------------------------------------------------------------

export type VisitaBruta = {
  corretor_id: string;
  lead_id: string | null;
  tipo: string;
  status: string;
  auto_gerado: boolean;
  deleted_at: string | null;
  /** Dia da visita — a mesma coluna que a folha do SDR usa. */
  data_inicio: string;
};

/**
 * Visitas realizadas por corretor na semana: presença VALIDADA
 * (`status = realizado`), não auto-gerada, não apagada, com o dia dentro da
 * semana. No-show e visita "sem desfecho" (ainda agendada/confirmada) não
 * contam. 1 por lead por semana — duas visitas do mesmo cliente valem uma.
 */
export function contarVisitas(
  visitas: ReadonlyArray<VisitaBruta>,
  semanaInicio: string,
): Map<string, number> {
  const leads = new Map<string, Set<string>>();
  for (const v of visitas) {
    if (v.tipo !== "visita" || v.status !== "realizado") continue;
    if (v.auto_gerado || v.deleted_at || !v.lead_id) continue;
    if (semanaDoInstante(v.data_inicio) !== semanaInicio) continue;
    const s = leads.get(v.corretor_id) ?? new Set<string>();
    s.add(v.lead_id);
    leads.set(v.corretor_id, s);
  }
  return new Map(Array.from(leads, ([id, s]) => [id, s.size]));
}

export type TransicaoBruta = {
  lead_id: string;
  corretor_id: string | null;
  para_status: string;
  created_at: string;
};

const TRINTA_DIAS_MS = 30 * 86_400_000;

/**
 * Pastas por corretor na semana: lead que ENTROU em análise de crédito. Não
 * conta se o mesmo lead já tinha entrado em análise nos 30 dias anteriores
 * (por qualquer corretor) — sai, volta e reentra não vira pasta nova. Passe o
 * histórico que cobre os 30 dias antes da semana.
 */
export function contarPastas(
  transicoes: ReadonlyArray<TransicaoBruta>,
  semanaInicio: string,
): Map<string, number> {
  const entradas = transicoes
    .filter((t) => t.para_status === "analise_credito")
    .map((t) => ({ ...t, ms: new Date(t.created_at).getTime() }));
  const porLead = new Map<string, number[]>();
  for (const t of entradas) {
    const lista = porLead.get(t.lead_id) ?? [];
    lista.push(t.ms);
    porLead.set(t.lead_id, lista);
  }

  const leads = new Map<string, Set<string>>();
  for (const t of entradas) {
    if (!t.corretor_id) continue;
    if (semanaDoInstante(t.created_at) !== semanaInicio) continue;
    const repetida = (porLead.get(t.lead_id) ?? []).some(
      (ms) => ms < t.ms && ms >= t.ms - TRINTA_DIAS_MS,
    );
    if (repetida) continue;
    const s = leads.get(t.corretor_id) ?? new Set<string>();
    s.add(t.lead_id);
    leads.set(t.corretor_id, s);
  }
  return new Map(Array.from(leads, ([id, s]) => [id, s.size]));
}

/**
 * Venda que abre a exceção: assinada no máximo `janelaDias` antes da sexta do
 * fechamento (há 15 dias entra; há 16 não), nunca depois da sexta.
 */
export function vendaNaJanela(
  dataAssinatura: string,
  semanaInicio: string,
  janelaDias: number,
): boolean {
  const atras = diasEntre(dataAssinatura, fimDaSemana(semanaInicio));
  return atras >= 0 && atras <= janelaDias;
}

// ---------------------------------------------------------------------------
// Pontuação e "quanto falta"
// ---------------------------------------------------------------------------

/** Arredonda a 2 casas como o numeric(8,2) do histórico. */
const r2 = (n: number) => Math.round(n * 100) / 100;

export function pontuar(
  producao: { visitas: number; pastas: number },
  cfg: Pick<ConfigRoletaSdr, "peso_visita" | "peso_pasta">,
): number {
  return r2(producao.visitas * cfg.peso_visita + producao.pastas * cfg.peso_pasta);
}

export function bateuMeta(pontos: number, cfg: Pick<ConfigRoletaSdr, "meta_pontos">): boolean {
  return pontos >= cfg.meta_pontos;
}

export type Falta = {
  /** Pontos que faltam (0 = meta batida). */
  pontos: number;
  /** Visitas que bastam sozinhas (null = peso zerado, caminho impossível). */
  visitas: number | null;
  /** Pastas que bastam sozinhas. */
  pastas: number | null;
};

/**
 * O caminho mais curto de CADA lado até ≥ meta: só visitas ou só pastas.
 * 2,5 pts → falta 1 visita ou 1 pasta; 0 pts → 3 visitas ou 2 pastas.
 */
export function faltaParaMeta(
  pontos: number,
  cfg: Pick<ConfigRoletaSdr, "peso_visita" | "peso_pasta" | "meta_pontos">,
): Falta {
  const resto = r2(Math.max(cfg.meta_pontos - pontos, 0));
  if (resto <= 0) return { pontos: 0, visitas: 0, pastas: 0 };
  // Folga de ponto flutuante: 3 / 1,5 é 2, não 2,0000000001 → 3.
  const quantos = (peso: number) => (peso > 0 ? Math.ceil(resto / peso - 1e-9) : null);
  return { pontos: resto, visitas: quantos(cfg.peso_visita), pastas: quantos(cfg.peso_pasta) };
}

// ---------------------------------------------------------------------------
// Textos (iguais aos do banco: _roleta_sdr_fmt_pts / _motivo_pausa / _texto_aviso)
// ---------------------------------------------------------------------------

/** "2,5 pts", "3 pts", "1 pt". */
export function formatarPontos(n: number): string {
  const v = r2(n);
  return `${String(v).replace(".", ",")} ${v === 1 ? "pt" : "pts"}`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Motivo gravado em `roleta_participantes.motivo_pausa` de quem não bateu. */
export function motivoPausa(
  linha: { pontos: number; visitas: number; pastas: number },
  semanaInicio: string,
  cfg: Pick<ConfigRoletaSdr, "meta_pontos">,
): string {
  return (
    `Regra semanal: ${formatarPontos(linha.pontos)} ` +
    `(${plural(linha.visitas, "visita", "visitas")}, ${plural(linha.pastas, "pasta", "pastas")}) ` +
    `na semana ${rotuloSemana(semanaInicio)}. Meta ${formatarPontos(cfg.meta_pontos)}.`
  );
}

/** Pausa da própria regra — o resto (admin, SLA do quente) é "alheia". */
export function ehPausaDaRegra(motivo: string | null | undefined): boolean {
  return (motivo ?? "").startsWith("Regra semanal");
}

/** Onde o corretor está hoje — muda o verbo do aviso. */
export type SituacaoRoleta = "recebendo" | "pausado" | "fora";

export function situacaoNaRoleta(
  p: { na_roleta: boolean; participante_ativo: boolean; pausado_ate: string | null },
  agora: Date = new Date(),
): SituacaoRoleta {
  if (!p.na_roleta || !p.participante_ativo) return "fora";
  if (p.pausado_ate && new Date(p.pausado_ate).getTime() > agora.getTime()) return "pausado";
  return "recebendo";
}

const PARA: Record<SituacaoRoleta, string> = {
  recebendo: "Para continuar recebendo agendados a partir de sábado",
  pausado: "Para voltar a receber agendados a partir de sábado",
  fora: "Para entrar na roleta e receber agendados a partir de sábado",
};

/**
 * Aviso de quarta: placar + o que falta pelos dois caminhos.
 * "Sua semana na roleta do SDR: 1 visita realizada e 1 pasta (2,5 pts). Para
 * continuar recebendo agendados a partir de sábado, falta 1 visita ou 1 pasta
 * até sexta."
 */
export function textoAviso(
  linha: { visitas: number; pastas: number; pontos: number },
  situacao: SituacaoRoleta,
  cfg: Pick<ConfigRoletaSdr, "peso_visita" | "peso_pasta" | "meta_pontos">,
): string {
  const vis =
    linha.visitas === 0
      ? "nenhuma visita realizada"
      : plural(linha.visitas, "visita realizada", "visitas realizadas");
  const pas = linha.pastas === 0 ? "nenhuma pasta" : plural(linha.pastas, "pasta", "pastas");
  const placar = `Sua semana na roleta do SDR: ${vis} e ${pas} (${formatarPontos(linha.pontos)}).`;

  const falta = faltaParaMeta(linha.pontos, cfg);
  if (falta.pontos <= 0) return `${placar} Meta da semana batida.`;
  const resto = resumoFalta(falta);
  if (!resto) return placar;
  return `${placar} ${PARA[situacao]}, ${resto} até sexta.`;
}

/** "falta 1 visita ou 1 pasta" / "faltam 3 visitas ou 2 pastas" (null = meta batida ou sem caminho). */
export function resumoFalta(falta: Falta): string | null {
  if (falta.pontos <= 0) return null;
  const caminhos = [
    falta.visitas !== null ? plural(falta.visitas, "visita", "visitas") : null,
    falta.pastas !== null ? plural(falta.pastas, "pasta", "pastas") : null,
  ].filter((c): c is string => c !== null);
  if (caminhos.length === 0) return null;
  const primeiro = falta.visitas ?? falta.pastas;
  return `${primeiro === 1 ? "falta" : "faltam"} ${caminhos.join(" ou ")}`;
}

// ---------------------------------------------------------------------------
// Bloqueio manual
// ---------------------------------------------------------------------------

export type LogParticipante = {
  acao: string;
  feito_por: string | null;
  created_at: string;
};

/**
 * Removido por uma PESSOA (admin; gestor no escopo da equipe): a regra nunca
 * reinclui. Só a ação "remover" deixa `ativo = false`; a última remoção diz
 * quem foi — `feito_por` nulo é processo automático, e esse a regra desfaz.
 */
export function bloqueadoManualmente(
  participante: { ativo: boolean } | null | undefined,
  logs: ReadonlyArray<LogParticipante>,
): boolean {
  if (!participante || participante.ativo) return false;
  const ultima = logs
    .filter((l) => l.acao === "removido")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return !!ultima && ultima.feito_por !== null;
}

// ---------------------------------------------------------------------------
// Cascata
// ---------------------------------------------------------------------------

export type ResultadoApuracao =
  "apto_meta" | "apto_venda" | "apto_complemento" | "pausado" | "bloqueado_admin";

export const RESULTADO_LABEL: Record<ResultadoApuracao, string> = {
  apto_meta: "Meta batida",
  apto_venda: "Exceção: venda",
  apto_complemento: "Exceção: complemento",
  pausado: "Pausado",
  bloqueado_admin: "Removido pelo admin",
};

export const ehApto = (r: ResultadoApuracao) => r.startsWith("apto");

/** Linha de `roleta_sdr_placar` (o que a cascata precisa). */
export type LinhaPlacar = {
  corretor_id: string;
  nome: string;
  visitas: number;
  pastas: number;
  pontos: number;
  vendas_janela: number;
  /** Assinatura mais recente na janela ("YYYY-MM-DD"), ou null. */
  ultima_venda: string | null;
  bloqueado_admin: boolean;
};

export type LinhaApurada<T extends LinhaPlacar = LinhaPlacar> = T & {
  resultado: ResultadoApuracao;
  /** Peso no rodízio da semana seguinte (null para pausado / removido). */
  peso_rodizio: number | null;
};

type CfgCascata = Pick<
  ConfigRoletaSdr,
  | "meta_pontos"
  | "minimo_aptos"
  | "peso_rodizio_meta"
  | "peso_rodizio_reduzido"
  | "vendas_peso_cheio"
>;

/**
 * Peso no rodízio ponderado: meta = cheio; venda = menor, salvo quem tem
 * vendas_peso_cheio vendas ou mais na janela; complemento = menor.
 */
export function pesoRodizio(
  resultado: ResultadoApuracao,
  vendasJanela: number,
  cfg: Pick<ConfigRoletaSdr, "peso_rodizio_meta" | "peso_rodizio_reduzido" | "vendas_peso_cheio">,
): number | null {
  if (resultado === "apto_meta") return cfg.peso_rodizio_meta;
  if (resultado === "apto_venda")
    return cfg.vendas_peso_cheio > 0 && vendasJanela >= cfg.vendas_peso_cheio
      ? cfg.peso_rodizio_meta
      : cfg.peso_rodizio_reduzido;
  if (resultado === "apto_complemento") return cfg.peso_rodizio_reduzido;
  return null;
}

const porNome = (a: LinhaPlacar, b: LinhaPlacar) =>
  a.nome.localeCompare(b.nome, "pt-BR") || a.corretor_id.localeCompare(b.corretor_id);

/**
 * Monta os aptos da semana seguinte, na ordem da política:
 *  1. meta batida — sem teto: se 10 baterem, entram os 10;
 *  2. venda na janela — também sem teto (decisão de 05/10/2026): todo mundo
 *     com venda entra, mesmo passando do mínimo, mas com peso menor no
 *     rodízio (salvo 2+ vendas);
 *  3. só se ainda faltar gente para o mínimo: mais pontos na semana (> 0),
 *     com peso menor.
 * Ninguém se qualificou → todo mundo "pausado" (roleta vazia).
 * Empate final por nome — determinístico, para a apuração ser idempotente.
 */
export function montarCascata<T extends LinhaPlacar>(
  placar: ReadonlyArray<T>,
  cfg: CfgCascata,
): Array<LinhaApurada<T>> {
  const resultado = new Map<string, ResultadoApuracao>();
  const elegiveis = placar.filter((l) => !l.bloqueado_admin);

  const faixa1 = elegiveis.filter((l) => bateuMeta(l.pontos, cfg));
  faixa1.forEach((l) => resultado.set(l.corretor_id, "apto_meta"));

  const faixa2 = elegiveis.filter((l) => !resultado.has(l.corretor_id) && l.vendas_janela > 0);
  faixa2.forEach((l) => resultado.set(l.corretor_id, "apto_venda"));

  const vagas = Math.max(cfg.minimo_aptos - faixa1.length - faixa2.length, 0);
  elegiveis
    .filter((l) => !resultado.has(l.corretor_id) && l.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || b.pastas - a.pastas || porNome(a, b))
    .slice(0, vagas)
    .forEach((l) => resultado.set(l.corretor_id, "apto_complemento"));

  return placar.map((l) => {
    const r: ResultadoApuracao = l.bloqueado_admin
      ? "bloqueado_admin"
      : (resultado.get(l.corretor_id) ?? "pausado");
    return { ...l, resultado: r, peso_rodizio: pesoRodizio(r, l.vendas_janela, cfg) };
  });
}

// ---------------------------------------------------------------------------
// Efeito na roleta (plano puro — o banco aplica o mesmo)
// ---------------------------------------------------------------------------

export type ParticipanteRoleta = {
  corretor_id: string;
  ativo: boolean;
  pausado_ate: string | null;
  motivo_pausa: string | null;
};

export type AcaoRoleta =
  | { tipo: "incluir"; corretor_id: string; log: "incluido" }
  | { tipo: "reativar"; corretor_id: string; log: "reativado"; mantemPausa: boolean }
  | { tipo: "despausar"; corretor_id: string; log: "reativado" | null }
  | { tipo: "pausar"; corretor_id: string; log: "pausado"; pausado_ate: string; motivo: string };

/**
 * O que a apuração faz em `roleta_participantes`. Em sombra, nada. Só muda o
 * que precisa mudar — rodar de novo sobre o resultado aplicado dá plano vazio
 * (idempotência). Bloqueado manualmente nunca é tocado; pausa de outra origem
 * em vigor (admin, SLA) nunca é encurtada nem apagada.
 */
export function planejarEfeitos(entrada: {
  apuracao: ReadonlyArray<LinhaApurada>;
  participantes: ReadonlyArray<ParticipanteRoleta>;
  semanaInicio: string;
  cfg: Pick<ConfigRoletaSdr, "meta_pontos">;
  sombra: boolean;
  agora?: Date;
}): AcaoRoleta[] {
  if (entrada.sombra) return [];
  const agora = (entrada.agora ?? new Date()).getTime();
  const fim = pausaAte(entrada.semanaInicio);
  const fimMs = new Date(fim).getTime();
  const porId = new Map(entrada.participantes.map((p) => [p.corretor_id, p]));
  const acoes: AcaoRoleta[] = [];

  for (const l of entrada.apuracao) {
    if (l.resultado === "bloqueado_admin") continue;
    const p = porId.get(l.corretor_id);
    const pausaMs = p?.pausado_ate ? new Date(p.pausado_ate).getTime() : null;
    const alheia = !!p && pausaMs !== null && pausaMs > agora && !ehPausaDaRegra(p.motivo_pausa);

    if (ehApto(l.resultado)) {
      if (!p) acoes.push({ tipo: "incluir", corretor_id: l.corretor_id, log: "incluido" });
      else if (!p.ativo)
        acoes.push({
          tipo: "reativar",
          corretor_id: l.corretor_id,
          log: "reativado",
          mantemPausa: alheia,
        });
      else if (pausaMs !== null && !alheia)
        acoes.push({
          tipo: "despausar",
          corretor_id: l.corretor_id,
          log: pausaMs > agora ? "reativado" : null,
        });
      continue;
    }

    // Não apto.
    if (!p || !p.ativo) continue; // fora da roleta: nada a pausar
    if (alheia && pausaMs! >= fimMs) continue; // pausa manual mais longa vale mais
    const motivo = motivoPausa(l, entrada.semanaInicio, entrada.cfg);
    const jaAplicada = pausaMs === fimMs && p.motivo_pausa === motivo;
    if (jaAplicada) continue;
    acoes.push({
      tipo: "pausar",
      corretor_id: l.corretor_id,
      log: "pausado",
      pausado_ate: fim,
      motivo,
    });
  }
  return acoes;
}

/** Aplica o plano a um retrato da roleta (para conferir idempotência e a tela). */
export function aplicarEfeitos(
  participantes: ReadonlyArray<ParticipanteRoleta>,
  acoes: ReadonlyArray<AcaoRoleta>,
): ParticipanteRoleta[] {
  const estado = new Map(participantes.map((p) => [p.corretor_id, { ...p }]));
  for (const a of acoes) {
    const p = estado.get(a.corretor_id);
    if (a.tipo === "incluir") {
      estado.set(a.corretor_id, {
        corretor_id: a.corretor_id,
        ativo: true,
        pausado_ate: null,
        motivo_pausa: null,
      });
    } else if (p && a.tipo === "reativar") {
      p.ativo = true;
      if (!a.mantemPausa) {
        p.pausado_ate = null;
        p.motivo_pausa = null;
      }
    } else if (p && a.tipo === "despausar") {
      p.pausado_ate = null;
      p.motivo_pausa = null;
    } else if (p && a.tipo === "pausar") {
      p.pausado_ate = a.pausado_ate;
      p.motivo_pausa = a.motivo;
    }
  }
  return Array.from(estado.values());
}

// ---------------------------------------------------------------------------
// Status previsto (tela)
// ---------------------------------------------------------------------------

export type StatusPrevisto = "fica" | "entra" | "volta" | "pausa" | "fora" | "bloqueado";

export const STATUS_PREVISTO_LABEL: Record<StatusPrevisto, string> = {
  fica: "Vai ficar",
  entra: "Vai entrar",
  volta: "Vai voltar",
  pausa: "Vai pausar",
  fora: "Fica fora",
  bloqueado: "Removido pelo admin",
};

/** Como o resultado da cascata se traduz para quem está (ou não) na roleta hoje. */
export function statusPrevisto(
  resultado: ResultadoApuracao,
  situacao: SituacaoRoleta,
): StatusPrevisto {
  if (resultado === "bloqueado_admin") return "bloqueado";
  if (ehApto(resultado)) {
    if (situacao === "recebendo") return "fica";
    return situacao === "pausado" ? "volta" : "entra";
  }
  return situacao === "fora" ? "fora" : "pausa";
}

// ---------------------------------------------------------------------------
// Respostas das RPCs (fail-closed: forma inesperada é erro, não tela torta)
// ---------------------------------------------------------------------------

const RESULTADOS = [
  "apto_meta",
  "apto_venda",
  "apto_complemento",
  "pausado",
  "bloqueado_admin",
] as const satisfies readonly ResultadoApuracao[];

const linhaPlacarSchema = z.object({
  corretor_id: z.string(),
  nome: z.string().nullable(),
  visitas: z.coerce.number(),
  pastas: z.coerce.number(),
  pontos: z.coerce.number(),
  vendas_janela: z.coerce.number(),
  ultima_venda: z.string().nullable(),
  na_roleta: z.boolean(),
  participante_ativo: z.boolean(),
  pausado_ate: z.string().nullable(),
  motivo_pausa: z.string().nullable(),
  bloqueado_admin: z.boolean(),
});

/** Linha de `roleta_sdr_placar` com a situação de hoje na roleta. */
export type LinhaPlacarTela = LinhaPlacar & {
  na_roleta: boolean;
  participante_ativo: boolean;
  pausado_ate: string | null;
  motivo_pausa: string | null;
};

export function parsePlacar(input: unknown): LinhaPlacarTela[] {
  if (input == null) return [];
  return z
    .array(linhaPlacarSchema)
    .parse(input)
    .map((l) => ({ ...l, nome: l.nome ?? "Corretor sem nome" }));
}

const linhaApuracaoSchema = z.object({
  semana_inicio: z.string(),
  corretor_id: z.string(),
  nome: z.string().nullable(),
  visitas: z.coerce.number(),
  pastas: z.coerce.number(),
  pontos: z.coerce.number(),
  vendas_janela: z.coerce.number(),
  resultado: z.enum(RESULTADOS),
  // Coluna nova (migration 20261011120100): banco sem ela devolve sem a chave.
  peso_rodizio: z.coerce.number().nullable().optional(),
  sombra: z.boolean(),
  aplicado_em: z.string().nullable(),
  apurado_em: z.string(),
});

export type ApuracaoLinha = z.infer<typeof linhaApuracaoSchema> & { nome: string };

export type ApuracaoSemana = {
  semana_inicio: string;
  sombra: boolean;
  aplicado_em: string | null;
  apurado_em: string;
  linhas: ApuracaoLinha[];
};

/** `roleta_sdr_apuracoes_recentes` agrupado por semana, da mais recente à mais antiga. */
export function parseApuracoes(input: unknown): ApuracaoSemana[] {
  if (input == null) return [];
  const porSemana = new Map<string, ApuracaoSemana>();
  for (const bruta of z.array(linhaApuracaoSchema).parse(input)) {
    const l: ApuracaoLinha = { ...bruta, nome: bruta.nome ?? "Corretor sem nome" };
    const s = porSemana.get(l.semana_inicio);
    if (s) s.linhas.push(l);
    else
      porSemana.set(l.semana_inicio, {
        semana_inicio: l.semana_inicio,
        sombra: l.sombra,
        aplicado_em: l.aplicado_em,
        apurado_em: l.apurado_em,
        linhas: [l],
      });
  }
  return Array.from(porSemana.values()).sort((a, b) =>
    b.semana_inicio.localeCompare(a.semana_inicio),
  );
}

// ---------------------------------------------------------------------------
// Aviso de quarta DENTRO do CRM (migration 20261011120400): pop-up com o card
// do placar. O aviso é o mesmo alerta do sino; o card lê o placar ao vivo.
// ---------------------------------------------------------------------------

/** Hash do link do sino que (re)abre o pop-up em qualquer tela do CRM. */
export const HASH_AVISO_ROLETA_SDR = "#aviso-roleta-sdr";

const meuAvisoSchema = z.object({
  alerta_id: z.string(),
  lida: z.boolean(),
  criado_em: z.string(),
  semana_inicio: z.string(),
  sombra: z.boolean(),
});

export type MeuAvisoRoletaSdr = z.infer<typeof meuAvisoSchema>;

/** `roleta_sdr_meu_aviso()`: o alerta da semana em curso do próprio corretor (null = não há). */
export function parseMeuAviso(input: unknown): MeuAvisoRoletaSdr | null {
  if (input == null) return null;
  return meuAvisoSchema.parse(input);
}

/** "10/10, 09:00" no relógio de São Paulo. */
export function dataHoraCurta(instante: string | Date): string {
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(instante));
  const v = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("day")}/${v("month")}, ${v("hour")}:${v("minute")}`;
}

export type TileAviso = {
  qtd: number;
  /** "visita realizada" / "visitas realizadas" / "pasta" / "pastas". */
  rotulo: string;
  /** Quanto essa produção vale: "1 pt", "3 pts". */
  vale: string;
};

/** Tudo o que o card do pop-up mostra, já em texto — a tela só desenha. */
export type CardAvisoRoletaSdr = {
  /** Primeiro nome para o "Olá, Ana!" (null = sem nome no cadastro). */
  primeiroNome: string | null;
  /** "03/10 a 09/10". */
  semana: string;
  /** Pontos da semana sem a unidade: "2,5". */
  pontos: string;
  /** Meta com a unidade: "3 pts". */
  meta: string;
  /** Progresso até a meta, 0 a 100. */
  pct: number;
  batida: boolean;
  visitas: TileAviso;
  pastas: TileAviso;
  /** "Falta 1 visita ou 1 pasta até sexta (09/10)" — null com a meta batida. */
  falta: string | null;
  /** Para que serve bater a meta (ou o que a meta batida garante). */
  objetivo: string | null;
  situacao: SituacaoRoleta;
  situacaoTexto: string;
};

const SITUACAO_TEXTO: Record<SituacaoRoleta, string> = {
  recebendo: "Você está recebendo agendados do SDR",
  pausado: "Você está pausado na roleta do SDR",
  fora: "Você ainda não está na roleta do SDR",
};

const primeiraMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function cardAvisoRoletaSdr(
  linha: Pick<
    LinhaPlacarTela,
    "nome" | "visitas" | "pastas" | "pontos" | "na_roleta" | "participante_ativo" | "pausado_ate"
  >,
  semanaInicio: string,
  cfg: Pick<ConfigRoletaSdr, "peso_visita" | "peso_pasta" | "meta_pontos">,
  agora: Date = new Date(),
): CardAvisoRoletaSdr {
  const nome = linha.nome.trim();
  const primeiroNome = nome && nome !== "Corretor sem nome" ? nome.split(/\s+/)[0] : null;
  const sexta = rotuloSemana(semanaInicio).slice(-5);
  const batida = bateuMeta(linha.pontos, cfg);
  const pct =
    cfg.meta_pontos > 0
      ? Math.max(0, Math.min(100, Math.round((100 * linha.pontos) / cfg.meta_pontos)))
      : 100;
  const situacao = situacaoNaRoleta(linha, agora);
  const resto = resumoFalta(faltaParaMeta(linha.pontos, cfg));

  let situacaoTexto = SITUACAO_TEXTO[situacao];
  if (situacao === "pausado" && linha.pausado_ate) {
    situacaoTexto += ` até ${dataHoraCurta(linha.pausado_ate)}`;
  }

  return {
    primeiroNome,
    semana: rotuloSemana(semanaInicio),
    pontos: formatarPontos(linha.pontos).replace(/ pts?$/, ""),
    meta: formatarPontos(cfg.meta_pontos),
    pct,
    batida,
    visitas: {
      qtd: linha.visitas,
      rotulo: linha.visitas === 1 ? "visita realizada" : "visitas realizadas",
      vale: formatarPontos(linha.visitas * cfg.peso_visita),
    },
    pastas: {
      qtd: linha.pastas,
      rotulo: linha.pastas === 1 ? "pasta" : "pastas",
      vale: formatarPontos(linha.pastas * cfg.peso_pasta),
    },
    falta: batida || !resto ? null : `${primeiraMaiuscula(resto)} até sexta (${sexta})`,
    objetivo: batida
      ? "Meta da semana batida: você recebe agendados do SDR a partir de sábado."
      : resto
        ? `${PARA[situacao]}.`
        : null,
    situacao,
    situacaoTexto,
  };
}

// Regra dos 65 em "Em atendimento" — a parte pura da simulação (modo sombra).
// Desenho: docs/ops/em-atendimento-teto-65.md. A regra mora no banco
// (`_em_atendimento_classificar`); aqui só se valida o que ele devolve e se
// somam os totais da casa para o topo do cartão.

import { z } from "zod";

export const linhaRegra65Schema = z.object({
  corretor_id: z.string().uuid(),
  nome: z.string(),
  teto: z.number().int(),
  trava_roleta: z.number().int(),
  teto_base: z.number().int(),
  em_atendimento: z.number().int(),
  ficam: z.number().int(),
  excedente: z.number().int(),
  perde_vaga: z.number().int(),
  porta_cadencia: z.number().int(),
  base: z.number().int(),
  base_cadencia: z.number().int(),
  retorno_protegido: z.number().int(),
  qualificacao_vencida: z.number().int(),
  sai_roleta: z.number().int(),
  sai_bolsao: z.number().int(),
  sai_reativacao: z.number().int(),
  alerta_proprio: z.number().int(),
  base_depois: z.number().int(),
  fundo: z.number().int(),
  fundo_gestor: z.number().int(),
  fundo_desfecho: z.number().int(),
  recebe_lead: z.boolean(),
  trava: z.string().nullable(),
});

export type LinhaRegra65 = z.infer<typeof linhaRegra65Schema>;

export const portasRegra65Schema = z.object({
  em_atendimento_sem_dono: z.number().int(),
  em_atendimento_dono_inativo: z.number().int(),
  em_atendimento_em_cadencia: z.number().int(),
  clientes_duplicados: z.number().int(),
  registros_encerrariam: z.number().int(),
  registros_em_conflito: z.number().int(),
});

export type PortasRegra65 = z.infer<typeof portasRegra65Schema>;

/** FAIL-CLOSED: uma linha malformada derruba a leitura com erro claro, em vez
 *  de a tela mostrar uma simulação silenciosamente errada. */
export function parseRegra65(input: unknown): LinhaRegra65[] {
  return z.array(linhaRegra65Schema).parse(input ?? []);
}

/** A RPC devolve uma linha só (agregado da casa). */
export function parsePortasRegra65(input: unknown): PortasRegra65 | null {
  const linhas = z.array(portasRegra65Schema).parse(input ?? []);
  return linhas[0] ?? null;
}

/** Quantos saem dos 65 — pelos três caminhos que a regra conhece. */
export function descemDos65(l: LinhaRegra65): number {
  return l.excedente + l.perde_vaga + l.porta_cadencia;
}

/** Quantos saem da Minha base para fora do corretor. */
export function saemDaBase(l: LinhaRegra65): number {
  return l.sai_roleta + l.sai_bolsao + l.sai_reativacao;
}

export type TotaisRegra65 = {
  corretores: number;
  emAtendimento: number;
  ficam: number;
  descem: number;
  saiRoleta: number;
  saiBolsao: number;
  fundoDesfecho: number;
  travados: number;
};

export function totaisRegra65(linhas: LinhaRegra65[]): TotaisRegra65 {
  return linhas.reduce<TotaisRegra65>(
    (t, l) => ({
      corretores: t.corretores + 1,
      emAtendimento: t.emAtendimento + l.em_atendimento,
      ficam: t.ficam + l.ficam,
      descem: t.descem + descemDos65(l),
      saiRoleta: t.saiRoleta + l.sai_roleta,
      saiBolsao: t.saiBolsao + l.sai_bolsao,
      fundoDesfecho: t.fundoDesfecho + l.fundo_desfecho,
      travados: t.travados + (l.recebe_lead ? 0 : 1),
    }),
    {
      corretores: 0,
      emAtendimento: 0,
      ficam: 0,
      descem: 0,
      saiRoleta: 0,
      saiBolsao: 0,
      fundoDesfecho: 0,
      travados: 0,
    },
  );
}

/** Só quem tem algo para mostrar entra na tabela: corretor sem nenhum lead
 *  vivo é ruído numa simulação de carteira. */
export function linhasComCarteira(linhas: LinhaRegra65[]): LinhaRegra65[] {
  return linhas.filter((l) => l.em_atendimento + l.base + l.fundo > 0);
}

// ---------------------------------------------------------------------------
// Fatia 3b: o estado da regra (sombra / agendada / ligada) e as rodadas
// ---------------------------------------------------------------------------

export const configRegra65Schema = z
  .object({
    modo: z.enum(["sombra", "ligado"]),
    virada_em: z.string().nullable().optional(),
    teto: z.number().int(),
    trava_roleta: z.number().int(),
    teto_base: z.number().int(),
  })
  .passthrough();

export type ConfigRegra65 = z.infer<typeof configRegra65Schema>;

export function parseConfigRegra65(input: unknown): ConfigRegra65 {
  return configRegra65Schema.parse(input);
}

export type EstadoRegra65 = "sombra" | "agendada" | "ligada";

/** O mesmo juízo de `em_atendimento_ligada()` no banco: ligado E virada passada. */
export function estadoDaRegra(cfg: ConfigRegra65, agora: Date = new Date()): EstadoRegra65 {
  if (cfg.modo !== "ligado") return "sombra";
  if (cfg.virada_em && new Date(cfg.virada_em).getTime() > agora.getTime()) return "agendada";
  return "ligada";
}

export const execucaoRegra65Schema = z.object({
  id: z.string().uuid(),
  modo: z.enum(["sombra", "ligado"]),
  gatilho: z.string(),
  iniciado_em: z.string(),
  terminado_em: z.string().nullable(),
  avaliados: z.number().int(),
  aplicados: z.number().int(),
  alertas: z.number().int(),
  erros: z.number().int(),
  resumo: z.record(z.string(), z.number().int()),
});

export type ExecucaoRegra65 = z.infer<typeof execucaoRegra65Schema>;

export function parseExecucoesRegra65(input: unknown): ExecucaoRegra65[] {
  return z.array(execucaoRegra65Schema).parse(input ?? []);
}

const ROTULO_ACAO: Record<string, string> = {
  perde_vaga: "perdem a vaga",
  excedente: "acima do teto",
  porta_cadencia: "voltam à cadência",
  sem_toque: "saem por 5 dias sem toque",
  retorno_vencido: "retorno vencido",
  qualificacao_vencida: "qualificação vencida",
  retorno_acima_maximo: "retorno além de 30 dias",
  fundo_gestor: "fundo parado 5+ dias",
  fundo_desfecho: "fundo parado 10+ dias",
};

/** "ontem 06:41 · sombra: 120 teriam saído (73 perdem a vaga, …)". */
export function descreverExecucao(e: ExecucaoRegra65): string {
  const partes = Object.entries(e.resumo)
    .sort((a, b) => b[1] - a[1])
    .map(([acao, n]) => `${n.toLocaleString("pt-BR")} ${ROTULO_ACAO[acao] ?? acao}`);
  const detalhe = partes.length ? ` (${partes.join(", ")})` : "";
  if (e.modo === "sombra") {
    return `sombra: ${e.avaliados.toLocaleString("pt-BR")} lead(s) seriam movidos ou avisados${detalhe}`;
  }
  const erros = e.erros > 0 ? ` · ${e.erros} erro(s)` : "";
  return `ligada: ${e.aplicados.toLocaleString("pt-BR")} de ${e.avaliados.toLocaleString("pt-BR")} aplicados${detalhe} · ${e.alertas} aviso(s) ao gestor${erros}`;
}

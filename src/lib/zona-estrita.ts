// Zona estrita (migrations 20261009120000/20261009120100): um corretor só
// recebe lead da própria região de atuação, de qualquer origem. O banco é quem
// decide — motores filtram pela região e uma guarda em leads.corretor_id
// recusa o resto com SQLSTATE SMQZ1 e mensagem pronta para a tela.
//
// A única porta para furar a zona é a EXCEÇÃO DA GESTÃO (política v1 §6:
// indicação, cliente que pede corretor específico): pedida explicitamente e
// com motivo escrito, que vai para o distribution_log. Este módulo é a mesma
// régua do lado da tela.

/** SQLSTATE da guarda de região (tg_leads_guarda_zona e RPCs). */
export const ERRO_FORA_DA_REGIAO = "SMQZ1";

/** Mínimo de caracteres do motivo — o mesmo que o banco exige. */
export const MOTIVO_EXCECAO_MINIMO = 5;

export interface ExcecaoForaDaRegiao {
  ativa: boolean;
  motivo: string;
}

export const EXCECAO_ZONA_VAZIA: ExcecaoForaDaRegiao = { ativa: false, motivo: "" };

/** Sem exceção marcada, ou marcada com motivo suficiente. */
export function excecaoZonaValida(e: ExcecaoForaDaRegiao): boolean {
  return !e.ativa || e.motivo.trim().length >= MOTIVO_EXCECAO_MINIMO;
}

/**
 * Argumentos extras de `transferir_leads`. Sem exceção, NADA é enviado — a
 * chamada continua idêntica à antiga (funciona mesmo num banco em que a
 * migration ainda não rodou).
 */
export function argsExcecaoTransferencia(
  e: ExcecaoForaDaRegiao,
): { _forcar_fora_da_zona: true; _motivo_fora_da_zona: string } | Record<string, never> {
  if (!e.ativa) return {};
  return { _forcar_fora_da_zona: true, _motivo_fora_da_zona: e.motivo.trim() };
}

/** Campos da exceção no `_params` de `resolver_excecao('atribuir_manual')`. */
export function paramsExcecaoAtribuicao(
  e: ExcecaoForaDaRegiao,
): { forcar_fora_da_zona: true; motivo_fora_da_zona: string } | Record<string, never> {
  if (!e.ativa) return {};
  return { forcar_fora_da_zona: true, motivo_fora_da_zona: e.motivo.trim() };
}

/** O erro veio da regra de região? (código SMQZ1 ou a mensagem do banco). */
export function ehErroForaDaRegiao(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return e.code === ERRO_FORA_DA_REGIAO || (e.message ?? "").startsWith("Fora da região");
}

/** Motivos de recusa do lote de prospecção ligados à região. */
export const MOTIVO_LOTE_REGIAO: Record<string, string> = {
  sem_regiao:
    "Você ainda não tem região de atuação. Peça à gestão para incluir você no time de uma zona.",
  zona_fora_da_regiao: "Essa zona não é da sua região de atuação.",
};

/** Motivo de recusa do Discador ao assumir lead de outra região. */
export const MOTIVO_DISCADOR_FORA_DA_REGIAO =
  "Lead de zona fora da sua região de atuação — fica no Bolsão para quem atende a zona.";

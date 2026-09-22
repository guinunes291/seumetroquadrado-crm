// Camada de dados do painel da cadência (gestão).
//
// Todo número vem de RPC — nenhuma soma acontece aqui. A tela e o SQL
// respondem a mesma pergunta com o mesmo número porque só existe uma conta,
// e ela mora no banco (migration 20260924120000).
//
// Validação zod FAIL-CLOSED, como em `client.ts`: linha malformada derruba a
// query com erro claro em vez de pintar um indicador errado. Num painel que
// decide cobrança de time, um número errado é pior que um erro visível.

import { z } from "zod";
import { rpc } from "@/features/dashboard/queries";

const num = z.number().nullable();

const corretorSchema = z.object({
  corretor_id: z.string().uuid(),
  corretor_nome: z.string().nullable(),
  fazer_hoje: z.number().int(),
  atrasados: z.number().int(),
  saidas_sem_resposta: z.number().int(),
  /** Cumpriu 100% sem retorno. Cinza na tela: NÃO é perda do corretor. */
  encerrados_no_processo: z.number().int(),
  cumprimento_pct: num,
  /** Só o job `vencidos` (D1/D2 vencido) — a única saída que é falha. */
  perdas_por_falha: z.number().int(),
  entraram_d1: z.number().int(),
  responderam: z.number().int(),
  taxa_resposta_pct: num,
  minutos_1a_tentativa: num,
});

export type LinhaCorretor = z.infer<typeof corretorSchema>;

const etapaSchema = z.object({
  semana: z.string(),
  etapa: z.string(),
  empreendimento: z.string(),
  alcancaram: z.number().int(),
  responderam: z.number().int(),
  taxa_resposta_pct: num,
});

export type LinhaEtapa = z.infer<typeof etapaSchema>;

const reativacaoSchema = z.object({
  em_descanso: z.number().int(),
  elegiveis_hoje: z.number().int(),
  em_trabalho: z.number().int(),
  reativados: z.number().int(),
  sem_retorno: z.number().int(),
  taxa_reativacao_pct: num,
  convertidos: z.number().int(),
  conversao_pct: num,
});

export type ResumoReativacao = z.infer<typeof reativacaoSchema>;

const motorSchema = z.object({
  lote_id: z.string().uuid(),
  job: z.string(),
  modo: z.string(),
  executado_em: z.string(),
  avaliados: z.number().int(),
  aplicados: z.number().int(),
  motivos: z.record(z.string(), z.number()).nullable(),
});

export type LinhaMotor = z.infer<typeof motorSchema>;

const pendenteSchema = z.object({
  corretor_id: z.string().uuid().nullable(),
  corretor_nome: z.string(),
  pendentes: z.number().int(),
  dias_medio: num,
});

export type PendenteFase0 = z.infer<typeof pendenteSchema>;

const loteSchema = z.object({
  lote_id: z.string().uuid(),
  executado_em: z.string(),
  modo: z.string(),
  avaliados: z.number().int(),
  aplicados: z.number().int(),
  desfeito: z.boolean().nullable(),
});

export type LoteFase0 = z.infer<typeof loteSchema>;

async function chamar<T>(nome: string, args: Record<string, unknown>, schema: z.ZodType<T>) {
  const { data, error } = await rpc(nome, args);
  if (error) throw error;
  return z.array(schema).parse(data ?? []);
}

export function fetchPainelCorretores(de?: string, ate?: string): Promise<LinhaCorretor[]> {
  return chamar(
    "cadencia_painel_corretores",
    { _de: de ?? null, _ate: ate ?? null },
    corretorSchema,
  );
}

export function fetchPainelEtapas(de?: string, ate?: string): Promise<LinhaEtapa[]> {
  return chamar("cadencia_painel_etapas", { _de: de ?? null, _ate: ate ?? null }, etapaSchema);
}

export async function fetchPainelReativacao(de?: string, ate?: string): Promise<ResumoReativacao> {
  const linhas = await chamar(
    "cadencia_painel_reativacao",
    { _de: de ?? null, _ate: ate ?? null },
    reativacaoSchema,
  );
  // A RPC devolve sempre uma linha; ausência é erro de contrato, não estado.
  if (linhas.length === 0) throw new Error("cadencia_painel_reativacao não devolveu resultado");
  return linhas[0]!;
}

export function fetchPainelMotor(limite = 20): Promise<LinhaMotor[]> {
  return chamar("cadencia_painel_motor", { _limite: limite }, motorSchema);
}

export function fetchFase0Pendentes(): Promise<PendenteFase0[]> {
  return chamar("cadencia_painel_fase0_pendentes", {}, pendenteSchema);
}

export function fetchFase0Lotes(limite = 20): Promise<LoteFase0[]> {
  return chamar("cadencia_painel_fase0_lotes", { _limite: limite }, loteSchema);
}

const admissaoSchema = z.object({
  lote_id: z.string().uuid(),
  modo: z.string(),
  corretores: z.number().int(),
  admitidos: z.number().int(),
});

export type ResultadoAdmissao = z.infer<typeof admissaoSchema>;

/** Admite estoque na cadência. `modo` sombra ensaia sem mover ninguém. */
export async function admitirEstoque(
  modo: "sombra" | "ativo",
  porCorretor: number,
): Promise<ResultadoAdmissao> {
  const { data, error } = await rpc("cadencia_fase0_admitir", {
    _modo: modo,
    _por_corretor: porCorretor,
  });
  if (error) throw error;
  const linhas = z.array(admissaoSchema).parse(data ?? []);
  if (linhas.length === 0) throw new Error("a admissão não devolveu resultado");
  return linhas[0]!;
}

export async function desfazerLote(loteId: string): Promise<number> {
  const { data, error } = await rpc("cadencia_fase0_desfazer", { _lote: loteId });
  if (error) throw error;
  return z
    .number()
    .int()
    .parse(data ?? 0);
}

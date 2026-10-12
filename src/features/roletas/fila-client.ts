// Fronteira das filas por zona (migration 20261015120000; roletas por filial
// na 20261018120000). As RPCs não estão nos types gerados: passam pela
// fronteira `rpc` de features/dashboard/queries e a resposta é validada aqui
// (fail-closed), sem escape de tipo.
//
// roletas_filas_zona_v1: SDR e gestão — todas as roletas da zona, com nomes.
//   Numa zona vêm TODAS as roletas de filial que a atendem (Leste → duas), a
//   da vez primeiro, cada uma com `da_vez`, `filial` e `zonas`.
// minhas_posicoes_roletas_v1: o corretor — só a própria posição; a roleta de
//   filial é UMA fila (zona null, `filial` e `zonas` no objeto) e a campanha
//   também (a campanha manda, de qualquer zona).

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { rpc } from "@/features/dashboard/queries";

const PAPEIS = ["sdr", "zona", "marquinhos", "campanha"] as const;
export type PapelRoleta = (typeof PAPEIS)[number];

const MECANICAS = ["rodizio", "ponderado_semana", "ponderado_faixa"] as const;
export type MecanicaRoleta = (typeof MECANICAS)[number];

const pessoaSchema = z.object({
  posicao: z.number().int().optional(),
  corretor_id: z.string(),
  nome: z.string().catch("Corretor"),
  motivos: z.array(z.string()).catch([]).optional(),
  /** Vez única (20261017120000): fora desta fila porque é o 1º nesta zona. */
  vez_em: z.string().nullable().optional(),
});
export type PessoaNaFila = z.infer<typeof pessoaSchema>;

const filaRoletaSchema = z.object({
  slug: z.string(),
  nome: z.string(),
  papel: z.enum(PAPEIS),
  mecanica: z.enum(MECANICAS).catch("rodizio"),
  equipe_fixa: z.boolean().catch(false),
  exige_presenca: z.boolean().catch(false),
  fora_do_horario: z.boolean().catch(false),
  segue_zona: z.boolean().catch(false),
  /** A regra "a vez é uma só" vale nesta fila (Agendados do SDR e roleta de filial). */
  vez_unica: z.boolean().catch(false),
  /** Roleta de filial: é a que recebe o próximo lead desta zona (rodízio da Leste). */
  da_vez: z.boolean().optional().catch(undefined),
  /** A filial dona (roleta de filial sempre; campanha quando a gestão definiu). */
  filial: z.object({ slug: z.string(), nome: z.string() }).optional().catch(undefined),
  /** Roleta de filial: as zonas que ela atende. */
  zonas: z.array(z.string()).optional().catch(undefined),
  fila: z.array(pessoaSchema),
  fora: z.array(pessoaSchema).catch([]),
  reserva: z
    .object({ slug: z.string(), fila: z.array(pessoaSchema) })
    .nullable()
    .optional()
    .catch(null),
});
export type FilaRoleta = z.infer<typeof filaRoletaSchema>;

const filasZonaSchema = z.object({
  zona: z.string().nullable(),
  zona_estrita: z.boolean().catch(true),
  zonas: z.array(z.string()),
  roletas: z.array(filaRoletaSchema),
});
export type FilasZona = z.infer<typeof filasZonaSchema>;

const minhaPosicaoSchema = z.object({
  slug: z.string(),
  nome: z.string(),
  papel: z.enum(PAPEIS),
  zona: z.string().nullable(),
  mecanica: z.enum(MECANICAS).catch("rodizio"),
  posicao: z.number().int().nullable(),
  total: z.number().int().catch(0),
  apto: z.boolean(),
  motivos: z.array(z.string()).catch([]),
  /** Onde a vez dele está: a zona (SDR, "Sul") ou o NOME da filial ("Belém"). */
  vez_em: z.string().nullable().catch(null),
  /** Roleta de filial: o nome da filial ("Belém"). */
  filial: z.string().optional().catch(undefined),
  /** Roleta de filial: as zonas que ela atende. */
  zonas: z.array(z.string()).optional().catch(undefined),
});
export type MinhaPosicao = z.infer<typeof minhaPosicaoSchema>;

export const FILAS_KEY = ["roletas", "filas"] as const;

export async function carregarFilasZona(zona: string | null): Promise<FilasZona> {
  const { data, error } = await rpc("roletas_filas_zona_v1", { _zona: zona });
  if (error) throw new Error(error.message || "Não foi possível ler as roletas.");
  return filasZonaSchema.parse(data);
}

/** Todas as roletas de uma zona (null = lead sem zona). SDR e gestão. */
export function useFilasZona(zona: string | null, enabled = true) {
  return useQuery({
    queryKey: [...FILAS_KEY, "zona", zona],
    enabled,
    // A vez muda a cada lead entregue e a cada check-in: 30 s de folga.
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: () => carregarFilasZona(zona),
  });
}

export async function carregarMinhasPosicoes(): Promise<MinhaPosicao[]> {
  const { data, error } = await rpc("minhas_posicoes_roletas_v1", {});
  if (error) throw new Error(error.message || "Não foi possível ler as suas roletas.");
  return z.array(minhaPosicaoSchema).parse(data ?? []);
}

/** A posição do corretor logado em cada roleta de que participa. */
export function useMinhasPosicoes(enabled = true) {
  return useQuery({
    queryKey: [...FILAS_KEY, "minhas"],
    enabled,
    // Cada corretor na Central lê todas as filas dele: 2 min de folga (e o
    // foco da janela atualiza antes, se ele voltar à aba).
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: carregarMinhasPosicoes,
  });
}

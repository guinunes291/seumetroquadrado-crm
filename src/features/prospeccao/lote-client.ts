// Lote de prospecção: pedir até 30 clientes do Bolsão numa zona.
//
// As regras moram no banco (migration 20261005120000): quem pode vir, as
// travas, a entrada direto na cadência e o "fora da base ativa". Aqui ficam a
// validação do que o banco devolve (zod, fail-closed: um placar errado é um
// corretor achando que pode pedir quando não pode) e os textos que a tela
// mostra — puros, para o teste cobrir sem montar componente.
//
// As chaves novas do status (`em_cadencia_total`, `tamanho`,
// `portas_legadas`) são opcionais de propósito: o banco de produção pode estar
// na versão de 28/09 até a migration subir, e a tela não pode quebrar nesse
// intervalo.

import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/features/dashboard/queries";
import { GRANDE_SP, ZONAS_PROJETO_ORDEM, type ZonaProjeto } from "@/lib/zonas";
import { MOTIVO_LOTE_REGIAO } from "@/lib/zona-estrita";

export const TAMANHO_LOTE = 30;

/** As cinco zonas da capital e a Grande SP (migration 20261007120000), na
 *  ordem dos chips da vitrine. A zona de cada cliente segue a mesma regra da
 *  vitrine (`zonaDoProjeto`) — o teste de paridade no banco garante. */
export const ZONAS_LOTE: readonly ZonaProjeto[] = ZONAS_PROJETO_ORDEM;

/** "Zona Leste", "Centro", "Grande SP" — o rótulo da vitrine (`rotuloZona`),
 *  para o texto de zona como o banco devolve. */
export function rotuloDaZona(zona: string | null | undefined): string {
  if (!zona) return "";
  return zona === GRANDE_SP || zona === "Centro" ? zona : `Zona ${zona}`;
}

/** O rótulo com a preposição: "da Zona Leste", "do Centro", "da Grande SP". */
export function daZona(zona: string | null | undefined): string {
  if (!zona) return "";
  return zona === "Centro" ? "do Centro" : `da ${rotuloDaZona(zona)}`;
}

const statusSchema = z.object({
  lote_id: z.string().uuid().nullable(),
  zona: z.string().nullable(),
  criado_em: z.string().nullable(),
  entregues: z.number().int().nonnegative(),
  em_cadencia: z.number().int().nonnegative(),
  ficaram: z.number().int().nonnegative(),
  sairam: z.number().int().nonnegative(),
  em_cadencia_total: z.number().int().nonnegative().optional(),
  vagas: z.number().int(),
  teto: z.number().int().positive(),
  tamanho: z.number().int().positive().optional(),
  pode_pedir: z.boolean(),
  motivo: z.string().nullable(),
  portas_legadas: z.boolean().optional(),
  // Zona estrita (20261009120100): as zonas da região do corretor — só elas
  // podem ser pedidas. null/ausente = regra desligada ou banco antigo: todas.
  regiao: z.array(z.string()).nullable().optional(),
});

export type StatusLote = z.infer<typeof statusSchema>;

export function parseStatusLote(input: unknown): StatusLote {
  return statusSchema.parse(input);
}

/**
 * O banco já tem a versão corrigida do lote (20261005120000)? A de 28/09 não
 * manda `em_cadencia_total`. Ela existe em produção e entrega o lote com os
 * defeitos que a migration corrige (zona, SLA de 15 minutos tomando os
 * clientes, vencido furando a fila da roleta) — então, se o app for publicado
 * antes da migration, o botão fica travado em vez de usar a versão velha.
 */
export function bancoDoLoteAtualizado(s: Pick<StatusLote, "em_cadencia_total">): boolean {
  return s.em_cadencia_total !== undefined;
}

const pedidoSchema = z.object({
  ok: z.boolean(),
  motivo: z.string().nullable().optional(),
  lote_id: z.string().uuid().optional(),
  entregues: z.number().int().nonnegative().optional(),
  zona: z.string().optional(),
});

export type ResultadoPedido = z.infer<typeof pedidoSchema>;

export function parseResultadoPedido(input: unknown): ResultadoPedido {
  return pedidoSchema.parse(input);
}

export async function fetchStatusLote(): Promise<StatusLote> {
  const { data, error } = await supabase.rpc("prospeccao_lote_status_v1");
  if (error) throw error;
  return parseStatusLote(data);
}

export async function pedirLote(zona: ZonaProjeto): Promise<ResultadoPedido> {
  const { data, error } = await supabase.rpc("prospeccao_pedir_lote", { _zona: zona });
  if (error) throw error;
  return parseResultadoPedido(data);
}

/** As zonas que o corretor pode pedir: as da região dele, na ordem dos chips.
 *  Sem a informação (regra desligada ou banco antigo), as seis. */
export function zonasDoLote(s: Pick<StatusLote, "regiao"> | undefined): readonly ZonaProjeto[] {
  const regiao = s?.regiao;
  if (!regiao) return ZONAS_LOTE;
  return ZONAS_LOTE.filter((z) => regiao.includes(z));
}

/** Por que o botão está travado — texto para o corretor, ou null se pode pedir. */
export function motivoBloqueio(
  s: Pick<StatusLote, "motivo" | "em_cadencia" | "em_cadencia_total" | "teto">,
): string | null {
  switch (s.motivo) {
    case null:
      return null;
    case "lote_em_andamento": {
      const n = s.em_cadencia_total ?? s.em_cadencia;
      return `Seu lote ainda tem ${n} ${n === 1 ? "cliente" : "clientes"} na cadência. Termine a cadência deles para pedir outro.`;
    }
    case "carteira_cheia":
      return `Sua carteira ativa está no teto (${s.teto}). Abra vagas para pedir um lote — quem responde no lote sobe para a carteira.`;
    case "so_corretor":
      return "Só corretores ativos pedem lote.";
    case "sem_regiao":
    case "zona_fora_da_regiao":
      return MOTIVO_LOTE_REGIAO[s.motivo];
    default:
      return "Não é possível pedir um lote agora.";
  }
}

/** A mensagem depois do clique em "Pedir lote". */
export function mensagemDoPedido(
  r: ResultadoPedido,
  s?: Pick<StatusLote, "teto">,
): { tipo: "sucesso" | "info" | "erro"; titulo: string; descricao?: string } {
  if (r.ok) {
    const n = r.entregues ?? 0;
    return {
      tipo: "sucesso",
      titulo: `${n} ${n === 1 ? "cliente chegou" : "clientes chegaram"} ${daZona(r.zona)}`.trim(),
      descricao:
        n < TAMANHO_LOTE
          ? `A zona tinha só ${n} disponíveis agora. Eles já estão na sua Fila do Dia da cadência.`
          : "Eles já estão na sua Fila do Dia da cadência.",
    };
  }
  if (r.motivo === "zona_vazia") {
    return {
      tipo: "info",
      titulo: "Nenhum cliente disponível nessa zona agora",
      descricao: "Tente outra zona.",
    };
  }
  return {
    tipo: "erro",
    titulo:
      motivoBloqueio({ motivo: r.motivo ?? "", em_cadencia: 0, teto: s?.teto ?? 65 }) ??
      "Não foi possível pedir o lote.",
  };
}

/** A linha do andamento do último lote, ou null se o corretor nunca pediu. */
export function resumoDoLote(
  s: Pick<
    StatusLote,
    "lote_id" | "zona" | "criado_em" | "entregues" | "em_cadencia" | "ficaram" | "sairam"
  >,
): string | null {
  if (!s.lote_id || !s.criado_em) return null;
  const data = new Date(s.criado_em).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return (
    `Lote de ${data} (${rotuloDaZona(s.zona)}): ${s.entregues} ${s.entregues === 1 ? "cliente" : "clientes"} — ` +
    `${s.em_cadencia} na cadência, ${s.ficaram} ${s.ficaram === 1 ? "ficou" : "ficaram"} com você, ` +
    `${s.sairam} ${s.sairam === 1 ? "saiu" : "saíram"}`
  );
}

// ---------------------------------------------------------------------------
// Painel da cadência (gestão)
// ---------------------------------------------------------------------------

const linhaPainelSchema = z.object({
  lote_id: z.string().uuid(),
  corretor_id: z.string().uuid(),
  corretor_nome: z.string().nullable(),
  zona: z.string(),
  criado_em: z.string(),
  entregues: z.number().int().nonnegative(),
  em_cadencia: z.number().int().nonnegative(),
  ficaram: z.number().int().nonnegative(),
  sairam: z.number().int().nonnegative(),
});

export type LinhaPainelLote = z.infer<typeof linhaPainelSchema>;

/** Lotes recentes no escopo do gestor. A RPC ainda não está nos types
 *  gerados — passa pela fronteira `rpc`, como as outras do Painel. */
export async function fetchLotesPainel(limite = 30): Promise<LinhaPainelLote[]> {
  const { data, error } = await rpc("prospeccao_lotes_painel_v1", { _limite: limite });
  if (error) throw error;
  return z.array(linhaPainelSchema).parse(data ?? []);
}

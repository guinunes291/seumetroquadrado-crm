// Cliente da cadência D1/D2/D3.
//
// As RPCs (cadencia_fila_v1, cadencia_registrar_tentativa,
// cadencia_marcar_respondeu) ainda não existem nos types gerados do Supabase;
// passam pela fronteira `rpc` de features/dashboard/queries para não gastar o
// budget de escapes de tipo checado no CI — mesmo caminho do módulo
// Follow-Up.
//
// O retorno é validado com zod FAIL-CLOSED: item malformado derruba a query
// com erro claro em vez de renderizar uma fila silenciosamente errada. Numa
// tela que decide para quem o corretor liga hoje, uma linha errada é uma
// ligação errada.

import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/features/dashboard/queries";
import { CONTEXTO_POR_ETAPA, type EtapaCadencia } from "@/features/cadencia/templates";

const etapaSchema = z.enum(["D1", "D2", "D3"]);

const filaItemSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string(),
  email: z.string().nullable(),
  status: z.string(),
  etapa: etapaSchema,
  ciclo: z.number().int().positive(),
  reativado: z.boolean(),
  projeto_nome: z.string().nullable(),
  faixa_mcmv: z.string().nullable(),
  renda_estimada: z.number().nullable(),
  prazo: z.string(),
  atrasado: z.boolean(),
  proxima_acao: z.string().nullable(),
  telefone_suspeito: z.boolean(),
  ligacoes_validas: z.number().int().nonnegative(),
  whatsapp_enviado: z.boolean(),
  etapa_completa: z.boolean(),
});

const filaSchema = z.object({
  gerado_em: z.string(),
  corretor_id: z.string().uuid(),
  itens: z.array(filaItemSchema),
});

export type CadenciaItem = z.infer<typeof filaItemSchema>;
export type FilaCadencia = z.infer<typeof filaSchema>;

export function parseFilaCadencia(input: unknown): FilaCadencia {
  return filaSchema.parse(input);
}

/** Fila do Dia do corretor autenticado — ou de um corretor do time, quando o
 *  caller é gestão (o guard de escopo é da própria RPC, não daqui). */
export async function fetchFilaCadencia(corretorId?: string): Promise<FilaCadencia> {
  const { data, error } = await rpc("cadencia_fila_v1", {
    _corretor: corretorId ?? null,
    _take: 200,
  });
  if (error) throw error;
  return parseFilaCadencia(data);
}

export type ResultadoLigacao =
  | "nao_atendeu"
  | "caixa_postal"
  | "ocupado"
  | "atendeu"
  | "numero_invalido";

const registroSchema = z.object({
  tentativa_id: z.string().uuid(),
  etapa: etapaSchema,
  etapa_completa: z.boolean(),
  /** Etapa para a qual o lead JÁ avançou nesta mesma chamada (20260922120000).
   *  null quando a etapa não fechou — ou quando o motor está em sombra, que é
   *  o caso em que a tentativa é gravada mas nada se move. */
  etapa_nova: etapaSchema.nullable(),
  encerrado: z.boolean(),
});

export type RegistroTentativa = z.infer<typeof registroSchema>;

/** Botão "Liguei". O horário é do SERVIDOR — a tela não manda data, e é isso
 *  que faz "cumpriu 100%" significar alguma coisa. */
export async function registrarLigacao(
  leadId: string,
  resultado: ResultadoLigacao,
): Promise<RegistroTentativa> {
  const { data, error } = await rpc("cadencia_registrar_tentativa", {
    _lead_id: leadId,
    _canal: "ligacao",
    _resultado: resultado,
  });
  if (error) throw error;
  return registroSchema.parse(data);
}

/** Botão "Mandar WhatsApp". Grava a tentativa com o template usado, para o
 *  teste A/B de texto ter de onde sair depois. */
export async function registrarWhatsApp(
  leadId: string,
  templateId: string | null,
): Promise<RegistroTentativa> {
  const { data, error } = await rpc("cadencia_registrar_tentativa", {
    _lead_id: leadId,
    _canal: "whatsapp",
    _resultado: "enviada",
    _template_id: templateId,
  });
  if (error) throw error;
  return registroSchema.parse(data);
}

/** Botão "Cliente respondeu". Exige o passo combinado COM DATA: é o que
 *  impede o lead de sair da cadência e cair no limbo. */
export async function marcarRespondeu(
  leadId: string,
  proximaAcao: string,
  proximoFollowup: Date,
): Promise<void> {
  const { error } = await rpc("cadencia_marcar_respondeu", {
    _lead_id: leadId,
    _proxima_acao: proximaAcao,
    _proximo_followup: proximoFollowup.toISOString(),
  });
  if (error) throw error;
}

const templateSchema = z.object({
  id: z.string().uuid(),
  conteudo: z.string(),
  contexto: z.string(),
});

export type TemplateCadencia = z.infer<typeof templateSchema>;

/**
 * Os três textos da cadência, por etapa.
 *
 * Lidos do banco (e não embutidos no bundle) porque versionar o texto ali é o
 * que deixa o teste A/B pronto sem deploy — trocar a mensagem do D3 passa a
 * ser um UPDATE. Só os ATIVOS entram, e o índice único por contexto garante
 * que existe no máximo um ativo por etapa.
 */
export async function carregarTemplates(): Promise<
  Partial<Record<EtapaCadencia, TemplateCadencia>>
> {
  const { data, error } = await supabase
    .from("templates_mensagem")
    .select("id, conteudo, contexto")
    .in("contexto", Object.values(CONTEXTO_POR_ETAPA))
    .eq("ativo", true);
  if (error) throw error;

  const porEtapa: Partial<Record<EtapaCadencia, TemplateCadencia>> = {};
  for (const linha of data ?? []) {
    const t = templateSchema.safeParse(linha);
    if (!t.success) continue;
    const etapa = (Object.keys(CONTEXTO_POR_ETAPA) as EtapaCadencia[]).find(
      (e) => CONTEXTO_POR_ETAPA[e] === t.data.contexto,
    );
    if (etapa) porEtapa[etapa] = t.data;
  }
  return porEtapa;
}

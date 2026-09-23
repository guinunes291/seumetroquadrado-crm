// Fluxo da análise de crédito (item 3.1, forma segura): a tabela
// `analises_credito` — órfã desde jun/2026 — vira o registro de cada
// análise. A ÚLTIMA linha por lead é o estado atual; toda decisão ecoa na
// timeline como interação (autor + momento ficam lá, padrão da casa).
// Tudo tipado pelos types gerados — a tabela sempre existiu no schema.

import { supabase } from "@/integrations/supabase/client";
import {
  supabaseAprovacao,
  type ColunasAprovacao,
} from "@/integrations/supabase/aprovacao-pendente";
import type { Json } from "@/integrations/supabase/types";
import { isMissingColumn } from "@/lib/supabase-errors";
import { resumoAprovacao, type DadosAprovacao } from "@/features/leads/aprovacao-credito";

export type AnaliseStatus =
  | "enviada"
  | "pendente"
  | "aprovada"
  | "aprovada_condicionada"
  | "reprovada";
export type AnaliseResultado = Extract<
  AnaliseStatus,
  "aprovada" | "aprovada_condicionada" | "reprovada"
>;

/** Desfechos que encerram a análise (a condicionada TAMBÉM libera o negócio). */
export const ANALISE_DECIDIDA: readonly AnaliseResultado[] = [
  "aprovada",
  "aprovada_condicionada",
  "reprovada",
] as const;

export type AnaliseCredito = {
  id: string;
  lead_id: string | null;
  corretor_id: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
} & Partial<ColunasAprovacao> & { poder_compra?: number | null };

/** Dados da aprovação + comprovante, gravados junto com a decisão. */
export type AprovacaoPayload = {
  dados: DadosAprovacao;
  comprovanteDocId: string | null;
  /** manual | ia | ia_revisado (IA leu e o corretor mexeu). */
  origem: "manual" | "ia" | "ia_revisado";
  /** O JSON cru que a IA devolveu — trilha de auditoria da leitura. */
  extraido: Json | null;
};

function colunasDaAprovacao(a: AprovacaoPayload): Partial<ColunasAprovacao> {
  return {
    ...a.dados,
    comprovante_doc_id: a.comprovanteDocId,
    dados_origem: a.origem,
    dados_extraidos: a.extraido,
  };
}

export const ANALISE_STATUS_LABEL: Record<AnaliseStatus, string> = {
  enviada: "Enviada ao banco",
  pendente: "Pendente (aguardando docs)",
  aprovada: "Aprovada",
  aprovada_condicionada: "Aprovada com condição",
  reprovada: "Reprovada",
};

/** Última análise registrada do lead (estado atual); null = sem registro. */
export async function fetchAnaliseAtual(leadId: string): Promise<AnaliseCredito | null> {
  // `*` e não a lista de colunas: antes da migration 20260927120000 as
  // colunas da aprovação não existem, e o select continua válido (elas só
  // chegam ausentes).
  const { data, error } = await supabaseAprovacao
    .from("analises_credito")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Grava uma escrita em analises_credito com os campos da aprovação; se o
 * banco ainda não tem as colunas (migration não aplicada — desacoplamento
 * deploy×banco), refaz SEM elas e devolve `false`: a decisão não se perde, e
 * o resumo dos valores fica nas observações e na timeline.
 */
async function escreverComAprovacao(
  escrever: (extra: Partial<ColunasAprovacao>) => PromiseLike<{ error: unknown }>,
  aprovacao: AprovacaoPayload | undefined,
): Promise<boolean> {
  if (!aprovacao) {
    const { error } = await escrever({});
    if (error) throw error;
    return false;
  }
  const { error } = await escrever(colunasDaAprovacao(aprovacao));
  if (!error) return true;
  if (!isMissingColumn(error)) throw error;
  const retry = await escrever({});
  if (retry.error) throw retry.error;
  return false;
}

/**
 * Atualiza os dados da aprovação de uma análise JÁ decidida (corrigir um
 * valor, anexar o comprovante depois). Não mexe no status; ecoa na timeline.
 */
export async function atualizarDadosAprovacao(args: {
  analiseId: string;
  leadId: string;
  aprovacao: AprovacaoPayload;
}): Promise<void> {
  const { error } = await supabaseAprovacao
    .from("analises_credito")
    .update(colunasDaAprovacao(args.aprovacao))
    .eq("id", args.analiseId);
  if (error) {
    if (isMissingColumn(error)) {
      throw new Error(
        "O banco ainda não tem os campos da aprovação (migration pendente). Avise o administrador.",
      );
    }
    throw error;
  }
  const { data: u } = await supabase.auth.getUser();
  const { error: ecoErr } = await supabase.from("interacoes").insert({
    lead_id: args.leadId,
    autor_id: u.user?.id ?? null,
    tipo: "nota",
    direcao: "interna",
    titulo: "Dados da aprovação de crédito atualizados",
    conteudo: resumoAprovacao(args.aprovacao.dados),
    metadata: { fonte: "aprovacao_credito", analise_id: args.analiseId },
  });
  if (ecoErr) throw ecoErr;
}

/** Abre um registro de análise (chamado pelo modal de etapa). */
export async function registrarAnalise(args: {
  leadId: string;
  corretorId: string | null;
  status: AnaliseStatus;
  observacoes?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("analises_credito").insert({
    lead_id: args.leadId,
    corretor_id: args.corretorId,
    status: args.status,
    observacoes: args.observacoes?.trim() || null,
  });
  if (error) throw error;
}

/**
 * Decide a análise atual do lead: aprova, aprova com condição (crédito menor
 * que o pretendido, exigência do banco…) ou reprova (com motivo). Sem
 * registro aberto (lead que entrou em análise antes deste fluxo), cria a
 * linha já decidida — o legado não bloqueia a decisão. Eco na timeline
 * incluído: é a trilha de autor/momento que o resto do CRM já usa.
 */
export async function decidirAnalise(args: {
  leadId: string;
  leadNome: string;
  resultado: AnaliseResultado;
  /** Reprovada: motivo. Condicionada: a condição imposta pelo banco. */
  motivo?: string | null;
  /** Aprovada/condicionada: valores da carta de aprovação + comprovante. */
  aprovacao?: AprovacaoPayload;
}): Promise<void> {
  const aprovacao = args.resultado === "reprovada" ? undefined : args.aprovacao;
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id ?? null;
  const motivo = args.motivo?.trim() || null;
  const rotuloMotivo = args.resultado === "aprovada_condicionada" ? "Condição" : "Reprovação";

  const atual = await fetchAnaliseAtual(args.leadId);
  const atualDecidida = ANALISE_DECIDIDA.some((s) => s === atual?.status);
  if (atual && !atualDecidida) {
    const observacoes = motivo
      ? `${atual.observacoes ? `${atual.observacoes}\n` : ""}${rotuloMotivo}: ${motivo}`
      : atual.observacoes;
    await escreverComAprovacao(
      (extra) =>
        supabaseAprovacao
          .from("analises_credito")
          .update({ status: args.resultado, observacoes, ...extra })
          .eq("id", atual.id),
      aprovacao,
    );
  } else {
    // Sem análise aberta (ou a última já decidida — nova rodada): registra
    // uma linha nova já com o desfecho.
    await escreverComAprovacao(
      (extra) =>
        supabaseAprovacao.from("analises_credito").insert({
          lead_id: args.leadId,
          corretor_id: uid,
          status: args.resultado,
          observacoes: motivo ? `${rotuloMotivo}: ${motivo}` : null,
          ...extra,
        }),
      aprovacao,
    );
  }

  const titulo =
    args.resultado === "aprovada"
      ? "Análise de crédito APROVADA"
      : args.resultado === "aprovada_condicionada"
        ? "Análise de crédito APROVADA COM CONDIÇÃO"
        : "Análise de crédito REPROVADA";
  const conteudo =
    args.resultado === "aprovada"
      ? "Crédito aprovado — negócio liberado para fechamento."
      : args.resultado === "aprovada_condicionada"
        ? motivo
          ? `Crédito aprovado com condição: ${motivo}`
          : "Crédito aprovado com condição — ajustar produto/valor antes de fechar."
        : motivo || "Crédito reprovado.";
  // Os valores aprovados vão junto no eco: a timeline é lida por quem não abre
  // o card (e é o registro que sobra se a migration ainda não chegou).
  const conteudoComValores = aprovacao
    ? `${conteudo}\n${resumoAprovacao(aprovacao.dados)}`
    : conteudo;
  const { error: ecoErr } = await supabase.from("interacoes").insert({
    lead_id: args.leadId,
    autor_id: uid,
    tipo: "nota",
    direcao: "interna",
    titulo,
    conteudo: conteudoComValores,
    metadata: {
      status_analise: args.resultado,
      fonte: "fluxo_analise",
      ...(aprovacao
        ? {
            valor_financiamento: aprovacao.dados.valor_financiamento,
            valor_parcela: aprovacao.dados.valor_parcela,
          }
        : {}),
    },
  });
  if (ecoErr) throw ecoErr;
}

// Skills da Sami ligadas ao banco (Onda S5, D16). Cada ferramenta LÊ com o
// `supabase` DO USUÁRIO (RLS) e entrega o resultado à regra pura de
// samiq-skills.ts. Nada aqui grava: qualificação e visita viram propostas
// (propor_*) que o corretor confirma; a pré-análise é só cálculo.

import { tool, type ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SAMIQ_TOOL_DESCRIPTIONS, termoBuscaSamiQ } from "@/lib/samiq-tools";
import { minimizeSamiQContext } from "@/lib/samiq-governance";
import {
  AvaliarQualificacaoInput,
  CurarEstoqueInput,
  PreAnaliseMcmvInput,
  PrepararVisitaInput,
  avaliarQualificacao7D,
  curarEstoque,
  montarChecklistVisita,
  preAnaliseMcmv,
  type ProjetoCuradoriaRow,
} from "@/lib/samiq-skills";

type Db = SupabaseClient<Database>;

const LEAD_QUALIFICACAO_COLS =
  "id, nome, status, renda_informada, entrada_disponivel, usa_fgts, tem_fgts, fgts_valor, tipo_renda, faixa_mcmv, bairro, zona, projeto_nome, objecoes, observacoes, proxima_acao, temperatura, proximo_followup, resumo_qualificacao, motivo_handoff";

const PROJETO_CURADORIA_COLS =
  "id, nome, bairro, cidade, regiao, zona_smq, tipologia, dorms_min, dorms_max, preco_a_partir, renda_minima, status_entrega, ano_entrega, argumentos_venda, diferenciais, perfil_ideal, disponibilidade_resumo, construtora";

function falhaSkill(ferramenta: string, error: unknown): never {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  console.error(JSON.stringify({ event: "samiq_tool_failed", ferramenta, code }));
  throw new Error("consulta_indisponivel");
}

const minimizar = (v: unknown) => minimizeSamiQContext(v, { maxArray: 20, maxString: 300 });

async function projetoPorNome(supabase: Db, nome: string | null | undefined) {
  const termo = nome ? termoBuscaSamiQ(nome) : "";
  if (termo.length < 2) return null;
  const { data } = await supabase
    .from("projetos")
    .select(PROJETO_CURADORIA_COLS)
    .eq("ativo", true)
    .is("deleted_at", null)
    .ilike("nome", `%${termo}%`)
    .limit(1)
    .maybeSingle();
  return (data as ProjetoCuradoriaRow | null) ?? null;
}

export function criarFerramentasDeSkillsSamiQ(args: {
  supabase: Db;
  userId: string;
  agora?: Date;
}): ToolSet {
  const { supabase } = args;
  const agora = args.agora ?? new Date();

  return {
    pre_analise_mcmv: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.pre_analise_mcmv,
      inputSchema: PreAnaliseMcmvInput,
      execute: async (input) => preAnaliseMcmv(input),
    }),

    avaliar_qualificacao: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.avaliar_qualificacao,
      inputSchema: AvaliarQualificacaoInput,
      execute: async (input) => {
        const { data, error } = await supabase
          .from("leads")
          .select(LEAD_QUALIFICACAO_COLS)
          .eq("id", input.leadId)
          .is("deleted_at", null)
          .maybeSingle();
        if (error) falhaSkill("avaliar_qualificacao", error);
        if (!data) return { erro: "cliente_nao_encontrado" };
        return minimizar(avaliarQualificacao7D(data));
      },
    }),

    curar_estoque: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.curar_estoque,
      inputSchema: CurarEstoqueInput,
      execute: async (input) => {
        const [projetos, unidades, focos] = await Promise.all([
          supabase
            .from("projetos")
            .select(PROJETO_CURADORIA_COLS)
            .eq("ativo", true)
            .is("deleted_at", null)
            .limit(60),
          supabase
            .from("unidades")
            .select("projeto_id, status, valor, dormitorios, tipologia, vagas")
            .eq("status", "disponivel")
            .is("deleted_at", null)
            .limit(2000),
          supabase
            .from("projeto_foco")
            .select("id, projeto_id, motivo, inicio, fim, ativo, arte_url")
            .eq("ativo", true)
            .limit(50),
        ]);
        if (projetos.error) falhaSkill("curar_estoque", projetos.error);
        // Estoque e campanhas são opcionais: sem eles a curadoria segue só pelo catálogo.
        return minimizar(
          curarEstoque({
            projetos: (projetos.data ?? []) as ProjetoCuradoriaRow[],
            unidades: unidades.data ?? [],
            focos: focos.data ?? [],
            criterios: input,
            agora: agora.getTime(),
          }),
        );
      },
    }),

    preparar_visita: tool({
      description: SAMIQ_TOOL_DESCRIPTIONS.preparar_visita,
      inputSchema: PrepararVisitaInput,
      execute: async (input) => {
        const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const [lead, visita, docs, interacoes] = await Promise.all([
          supabase
            .from("leads")
            .select(LEAD_QUALIFICACAO_COLS)
            .eq("id", input.leadId)
            .is("deleted_at", null)
            .maybeSingle(),
          supabase
            .from("agendamentos")
            .select("id, tipo, status, titulo, local, data_inicio")
            .eq("lead_id", input.leadId)
            .eq("tipo", "visita")
            .is("deleted_at", null)
            .in("status", ["agendado", "confirmado"])
            .gte("data_inicio", ontem)
            .order("data_inicio", { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("documentacoes")
            .select("tipo, status")
            .eq("lead_id", input.leadId)
            .eq("status", "pendente")
            .limit(20),
          supabase
            .from("interacoes")
            .select("tipo, ocorreu_em")
            .eq("lead_id", input.leadId)
            .is("deleted_at", null)
            .order("ocorreu_em", { ascending: false })
            .limit(3),
        ]);
        if (lead.error) falhaSkill("preparar_visita", lead.error);
        if (!lead.data) return { erro: "cliente_nao_encontrado" };
        const projeto =
          (await projetoPorNome(supabase, lead.data.projeto_nome)) ??
          (await projetoPorNome(supabase, visita.data?.local));
        const kit = montarChecklistVisita({
          lead: lead.data,
          visita: visita.data
            ? {
                quando: visita.data.data_inicio,
                local: visita.data.local,
                status: visita.data.status,
                titulo: visita.data.titulo,
              }
            : null,
          projeto,
          documentosPendentes: (docs.data ?? []).map((d) => d.tipo),
          objecoes: lead.data.objecoes ?? [],
          ultimasInteracoes: (interacoes.data ?? []).map((i) => ({
            tipo: i.tipo,
            em: i.ocorreu_em,
          })),
        });
        return minimizar({
          cliente: kit.qualificacao.cliente,
          visita: visita.data
            ? {
                quando: visita.data.data_inicio,
                local: visita.data.local,
                status: visita.data.status,
              }
            : null,
          empreendimento: projeto
            ? {
                id: projeto.id,
                nome: projeto.nome,
                localizacao: [projeto.bairro, projeto.regiao ?? projeto.zona_smq, projeto.cidade]
                  .filter(Boolean)
                  .join(" · "),
                preco_a_partir: projeto.preco_a_partir,
                disponibilidade: projeto.disponibilidade_resumo,
              }
            : null,
          documentos_pendentes: (docs.data ?? []).map((d) => d.tipo),
          alertas: kit.alertas,
          checklist: kit.checklist,
          qualificacao: {
            pontuacao: `${kit.qualificacao.pontuacao}/${kit.qualificacao.total}`,
            faltam: kit.qualificacao.proximas_perguntas,
          },
        });
      },
    }),
  };
}

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const optStr = (max = 2000) => z.string().trim().max(max).optional().nullable();

const payloadSchema = z.object({
  nome: z.string().trim().min(1).max(255),
  telefone: z
    .string()
    .trim()
    .min(5)
    .max(30)
    .refine((v) => {
      const d = v.replace(/\D/g, "");
      return d.length >= 10 && d.length <= 13;
    }, "telefone inválido"),
  email: z.string().trim().email().max(320).optional().nullable(),
  origem: z
    .enum([
      "facebook",
      "google_sheets",
      "site",
      "indicacao",
      "captacao_corretor",
      "whatsapp",
      "telefone",
      "plantao",
      "agendamento_self_service",
      "chatbot",
      "outro",
    ])
    .optional()
    .default("outro"),
  campanha: optStr(255),
  empreendimento: optStr(255),
  observacoes: optStr(),
  observacao: optStr(),
  resumo: optStr(4000),
  utm_source: optStr(255),
  utm_medium: optStr(255),
  utm_campaign: optStr(255),
  utm_content: optStr(255),
  distribuir: z.boolean().optional().default(true),
  // Qualificação IA (handoff)
  faixaRenda: optStr(120),
  finalidadeImovel: optStr(120),
  empreendimentoInteresse: optStr(255),
  regiao: optStr(255),
  fgts: optStr(255),
  decisor: optStr(255),
  temperatura: z
    .union([
      z.enum(["FRIO", "MORNO", "QUENTE", "PRONTO", "frio", "morno", "quente", "pronto"]),
      z.literal(""),
    ])
    .optional()
    .nullable(),
  motivoHandoff: z.enum(["analise", "visita", "humano"]).optional().nullable(),
  aceitouAnalise: z.boolean().optional().nullable(),
  aceitouVisita: z.boolean().optional().nullable(),
});

function mapTemperatura(t: string | null | undefined): "quente" | "morno" | "frio" | null {
  if (!t) return null;
  const v = t.toLowerCase();
  if (v === "quente" || v === "pronto") return "quente";
  if (v === "morno") return "morno";
  if (v === "frio") return "frio";
  return null;
}

function montarBlocoQualificacao(d: {
  faixaRenda?: string | null;
  finalidadeImovel?: string | null;
  empreendimentoInteresse?: string | null;
  regiao?: string | null;
  fgts?: string | null;
  decisor?: string | null;
  temperatura?: string | null;
  motivoHandoff?: string | null;
  aceitouAnalise?: boolean | null;
  aceitouVisita?: boolean | null;
}): string {
  const linhas: string[] = [];
  if (d.faixaRenda) linhas.push(`• Renda: ${d.faixaRenda}`);
  if (d.fgts) linhas.push(`• FGTS: ${d.fgts}`);
  if (d.finalidadeImovel) linhas.push(`• Finalidade: ${d.finalidadeImovel}`);
  if (d.empreendimentoInteresse) linhas.push(`• Empreendimento: ${d.empreendimentoInteresse}`);
  if (d.regiao) linhas.push(`• Região: ${d.regiao}`);
  if (d.decisor) linhas.push(`• Decisor: ${d.decisor}`);
  if (d.temperatura) linhas.push(`• Temperatura: ${d.temperatura}`);
  if (d.motivoHandoff) linhas.push(`• Motivo do handoff: ${d.motivoHandoff}`);
  if (d.aceitouAnalise) linhas.push(`• Aceitou análise de crédito: sim`);
  if (d.aceitouVisita) linhas.push(`• Aceitou agendar visita: sim`);
  return linhas.join("\n");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/webhooks/lead/$token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request, params }) => {
        const token = params.token?.trim();
        if (!token || token.length < 16) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) Tenta resolver como TOKEN DE CAMPANHA (roleta.webhook_token).
        //    Uma campanha pode ter projeto vinculado (opcional). Se vinculado,
        //    o lead sai amarrado a esse projeto; se não, sai só com o
        //    empreendimento informado no payload (ou o nome da campanha).
        const { data: campanha } = await supabaseAdmin
          .from("roletas")
          .select("id, slug, nome, ativo, tipo, projeto_id")
          .eq("webhook_token", token)
          .maybeSingle();

        // 2) Fallback: token de projeto (fluxo antigo, produção atual).
        const { data: projetoDoToken, error: projErr } = campanha
          ? { data: null as null | { id: string; nome: string; ativo: boolean }, error: null }
          : await supabaseAdmin
              .from("projetos")
              .select("id, nome, ativo")
              .eq("webhook_token", token)
              .maybeSingle();

        if (campanha && (!campanha.ativo || campanha.tipo !== "campanha")) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        let projeto: { id: string | null; nome: string; ativo: boolean } | null = null;
        if (campanha) {
          if (campanha.projeto_id) {
            const { data: p } = await supabaseAdmin
              .from("projetos")
              .select("id, nome, ativo")
              .eq("id", campanha.projeto_id)
              .maybeSingle();
            projeto = p?.ativo ? { id: p.id, nome: p.nome, ativo: true } : null;
          }
          if (!projeto) projeto = { id: null, nome: campanha.nome, ativo: true };
        } else if (!projErr && projetoDoToken && projetoDoToken.ativo) {
          projeto = { id: projetoDoToken.id, nome: projetoDoToken.nome, ativo: true };
        }

        if (!projeto) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }


        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
        }

        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Validation failed", details: parsed.error.flatten() },
            { status: 400, headers: corsHeaders },
          );
        }
        const data = parsed.data;

        // Nome do projeto: campo "empreendimento" (novo) tem prioridade,
        // depois "empreendimentoInteresse" (legado), senão o nome do projeto do token.
        // Precisa ser calculado antes do dedup para registrar o interesse
        // correto na interação de duplicata cross-project.
        const projetoNomeInteresse =
          (data.empreendimento?.trim() || null) ??
          (data.empreendimentoInteresse?.trim() || null) ??
          projeto.nome;

        // Deduplicação global por telefone (qualquer projeto, status <> perdido).
        // Regra: pessoa com interesse em 2 empreendimentos é 1 lead com 2
        // interesses — NÃO sobrescrevemos o projeto original; o novo interesse
        // vira interação na timeline do lead existente.
        const { data: dupGlobal } = await supabaseAdmin.rpc(
          "buscar_lead_ativo_por_telefone_global",
          { _telefone: data.telefone },
        );
        if (dupGlobal) {
          const { data: leadExistente } = await supabaseAdmin
            .from("leads")
            .select("id, projeto_id, projeto_nome")
            .eq("id", dupGlobal)
            .maybeSingle();

          const mesmoProjeto = leadExistente?.projeto_id === projeto.id;
          const conteudo = mesmoProjeto
            ? `Nova entrada pelo webhook (${data.origem}) — mesmo empreendimento.`
            : `Novo interesse registrado: ${projetoNomeInteresse}. ` +
              `Lead já em atendimento no projeto "${leadExistente?.projeto_nome ?? "?"}" — ` +
              `mantido o corretor atual, apenas registrado o novo interesse.`;

          await supabaseAdmin.from("interacoes").insert({
            lead_id: dupGlobal,
            tipo: "nota",
            direcao: "interna",
            titulo: mesmoProjeto ? "Nova entrada (dedup)" : "Novo interesse (cross-project)",
            conteudo,
            metadata: {
              fonte: "webhook_lead",
              evento: "duplicata",
              cross_project: !mesmoProjeto,
              projeto_id_novo: projeto.id,
              projeto_nome_novo: projetoNomeInteresse,
              origem: data.origem,
              campanha: data.campanha ?? null,
              utm_source: data.utm_source ?? null,
              utm_campaign: data.utm_campaign ?? null,
              faixaRenda: data.faixaRenda ?? null,
            },
          });

          return Response.json(
            { ok: true, duplicate: true, projeto: projeto.nome, lead_id: dupGlobal },
            { headers: corsHeaders },
          );
        }

        const resumo = (data.resumo ?? data.observacao ?? "").trim() || null;
        const blocoQualif = montarBlocoQualificacao(data);
        const obsPartes = [
          data.observacoes?.trim() || null,
          resumo ? `📝 Resumo da qualificação (IA):\n${resumo}` : null,
          blocoQualif ? `📋 Dados de qualificação:\n${blocoQualif}` : null,
        ].filter(Boolean) as string[];
        const observacoesFinais = obsPartes.length ? obsPartes.join("\n\n") : null;

        const temperatura = mapTemperatura(data.temperatura ?? null);
        const fgtsTxt = (data.fgts ?? "").toLowerCase();
        const usaFgts = data.fgts ? !/^(nao|não|sem|n\/a|0)/i.test(fgtsTxt.trim()) : false;

        const projetoNomeFinal = projetoNomeInteresse;

        // --- INSERT-THEN-TRIAGE (distribuição v3) ---
        // O lead nasce SEM corretor e passa pela triagem única
        // (triar_e_distribuir_lead): origem → roleta (chatbot → Marquinhos) →
        // corretor apto (presente, dentro da cota, não pausado). Se a roleta
        // não tiver ninguém apto, o lead vai para a FILA DE EXCEÇÕES com
        // alerta ao gestor — nunca some e nunca cai num gestor às cegas.
        // Falha no RPC também não perde o lead: o cron re-triará em 1 min.
        const { data: lead, error } = await supabaseAdmin
          .from("leads")
          .insert({
            nome: data.nome,
            telefone: data.telefone,
            email: data.email ?? null,
            origem: data.origem,
            projeto_id: projeto.id,
            projeto_nome: projetoNomeFinal,
            campanha: data.campanha ?? null,
            observacoes: observacoesFinais,
            renda_informada: data.faixaRenda ?? null,
            usa_fgts: usaFgts,
            entrada_disponivel: data.fgts ?? null,
            temperatura: temperatura,
            utm_source: data.utm_source ?? null,
            utm_medium: data.utm_medium ?? null,
            utm_campaign: data.utm_campaign ?? null,
            utm_content: data.utm_content ?? null,
            // Amarra o lead à campanha para que o SLA redistribua na MESMA
            // equipe se o corretor não atender a tempo.
            roleta_slug: campanha ? campanha.slug : null,
            // Canal de chegada: só leads via_webhook entram no SLA de minutos.
            via_webhook: true,
            canal_entrada: "webhook_chatbot",
          })

          .select("id")
          .single();

        if (error) {
          // Corrida: o índice único (projeto, telefone) barrou um insert
          // concorrente. Trata como duplicado — devolve o lead já existente.
          if ((error as { code?: string }).code === "23505" && projeto.id) {
            const { data: dupId2 } = await supabaseAdmin.rpc("buscar_lead_duplicado", {
              _projeto_id: projeto.id,
              _telefone: data.telefone,
            });
            if (dupId2) {
              return Response.json(
                { ok: true, duplicate: true, projeto: projeto.nome, lead_id: dupId2 },
                { headers: corsHeaders },
              );
            }
          }
          return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
        }

        let corretorId: string | null = null;
        let motivo: string | null = null;
        let excecaoMotivo: string | null = null;

        if (data.distribuir) {
          if (campanha) {
            // Distribuição da CAMPANHA: só a equipe da roleta, ponderada por
            // tier (A=3/B=2/C=1). Se não houver ninguém apto, mantém o
            // contrato antigo (motivo: sem_corretor_disponivel) e o lead vai
            // para o cron de redistribuição, agora amarrado à mesma campanha.
            const { data: dist, error: distErr } = await supabaseAdmin.rpc(
              "distribuir_lead_ponderado",
              { _lead_id: lead.id, _roleta_slug: campanha.slug },
            );
            if (distErr) {
              console.error("[webhooks/lead] distribuicao ponderada falhou:", distErr);
              motivo = "sem_corretor_disponivel";
              excecaoMotivo = "falha_distribuicao_ponderada";
            } else {
              const res = dist as {
                ok?: boolean;
                corretor_id?: string;
                motivo?: string;
                tier?: string;
              } | null;
              if (res?.ok && res.corretor_id) {
                corretorId = res.corretor_id;
              } else {
                motivo = "sem_corretor_disponivel";
                excecaoMotivo = res?.motivo ?? "sem_apto_na_campanha";
              }
            }
          } else {
            const { data: triagem, error: triagemErr } = await supabaseAdmin.rpc(
              "triar_e_distribuir_lead",
              { _lead_id: lead.id, _gatilho: "webhook" },
            );
            if (triagemErr) {
              console.error("[webhooks/lead] triagem falhou:", triagemErr);
              motivo = "sem_corretor_disponivel";
              excecaoMotivo = "falha_triagem_reprocesso_automatico";
            } else {
              const res = triagem as {
                ok?: boolean;
                corretor_id?: string;
                motivo?: string;
              } | null;
              if (res?.ok && res.corretor_id) {
                corretorId = res.corretor_id;
              } else {
                motivo = "sem_corretor_disponivel";
                excecaoMotivo = res?.motivo ?? null;
              }
            }
          }
        }


        // Registra interação com o resumo da IA para aparecer no histórico do lead.
        if (resumo || blocoQualif) {
          const conteudo = [resumo ? resumo : null, blocoQualif ? `\n${blocoQualif}` : null]
            .filter(Boolean)
            .join("\n");
          await supabaseAdmin.from("interacoes").insert({
            lead_id: lead.id,
            tipo: "nota",
            direcao: "interna",
            titulo: "Qualificação automática (IA)",
            conteudo,
            metadata: {
              fonte: "webhook_ia",
              motivoHandoff: data.motivoHandoff ?? null,
              aceitouAnalise: data.aceitouAnalise ?? null,
              aceitouVisita: data.aceitouVisita ?? null,
              faixaRenda: data.faixaRenda ?? null,
              fgts: data.fgts ?? null,
              decisor: data.decisor ?? null,
              finalidadeImovel: data.finalidadeImovel ?? null,
              empreendimentoInteresse: data.empreendimentoInteresse ?? null,
              empreendimento: data.empreendimento ?? null,
              regiao: data.regiao ?? null,
              temperatura: data.temperatura ?? null,
            },
          });
        }

        // Enriquecimento de contato do corretor para a resposta (formato preservado).
        let corretorNome: string | null = null;
        let corretorTelefone: string | null = null;
        let corretorEmail: string | null = null;
        let distributed = false;

        if (corretorId) {
          const { data: cor } = await supabaseAdmin
            .from("profiles")
            .select("nome, email, telefone")
            .eq("id", corretorId)
            .maybeSingle();
          corretorNome = cor?.nome ?? null;
          corretorEmail = cor?.email ?? null;
          const tel = (cor?.telefone ?? "").replace(/\D/g, "");
          if (!tel) {
            corretorTelefone = null;
            if (!motivo) motivo = "corretor_sem_telefone";
            distributed = false;
          } else {
            let norm = tel;
            if (!norm.startsWith("55") && (norm.length === 10 || norm.length === 11)) {
              norm = `55${norm}`;
            }
            corretorTelefone = norm;
            distributed = true;
          }
        }

        // Sincroniza com Banco Operacional externo (idempotente por telefone_e164).
        // Falha aqui NÃO bloqueia a resposta — intake e roleta seguem intactos.
        try {
          const { syncLeadToExternal, logEventoFunilExternal } =
            await import("@/lib/external-supabase.server");
          await syncLeadToExternal({
            crmLeadId: lead.id,
            telefone: data.telefone,
            nome: data.nome,
            origem: data.origem,
            campanha: data.campanha ?? null,
            corretorId: corretorId,
            estado: corretorId ? "com_corretor" : "novo",
          });
          if (corretorId) {
            await logEventoFunilExternal({
              crmLeadId: lead.id,
              telefone: data.telefone,
              para_estado: "com_corretor",
              agente: "crm",
              motivo: `roleta->corretor ${corretorId}`,
            });
          }
        } catch (e) {
          console.warn("[lead-intake] sync externo falhou:", e);
        }

        return Response.json(
          {
            ok: true,
            projeto: projeto.nome,
            lead_id: lead.id,
            corretor_id: corretorId,
            corretor_nome: corretorNome,
            corretor_telefone: corretorTelefone,
            corretor_email: corretorEmail,
            distributed,
            motivo,
            excecao_motivo: excecaoMotivo,
          },
          { headers: corsHeaders },
        );
      },
    },
  },
});

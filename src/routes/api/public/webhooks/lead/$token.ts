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
    .union([z.enum(["FRIO", "MORNO", "QUENTE", "PRONTO", "frio", "morno", "quente", "pronto"]), z.literal("")])
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

        // Lookup do projeto pelo token
        const { data: projeto, error: projErr } = await supabaseAdmin
          .from("projetos")
          .select("id, nome, ativo")
          .eq("webhook_token", token)
          .maybeSingle();

        if (projErr || !projeto || !projeto.ativo) {
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

        // Deduplicação: mesmo telefone (só dígitos) dentro do mesmo projeto.
        const { data: dupId } = await supabaseAdmin.rpc("buscar_lead_duplicado", {
          _projeto_id: projeto.id,
          _telefone: data.telefone,
        });
        if (dupId) {
          return Response.json(
            { ok: true, duplicate: true, projeto: projeto.nome, lead_id: dupId },
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

        const { data: lead, error } = await supabaseAdmin
          .from("leads")
          .insert({
            nome: data.nome,
            telefone: data.telefone,
            email: data.email ?? null,
            origem: data.origem,
            projeto_id: projeto.id,
            projeto_nome: data.empreendimentoInteresse ?? projeto.nome,
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
          })
          .select("id")
          .single();

        if (error) {
          return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
        }

        // Registra interação com o resumo da IA para aparecer no histórico do lead.
        if (resumo || blocoQualif) {
          const conteudo = [
            resumo ? resumo : null,
            blocoQualif ? `\n${blocoQualif}` : null,
          ]
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
              regiao: data.regiao ?? null,
              temperatura: data.temperatura ?? null,
            },
          });
        }

        let corretorId: string | null = null;
        let motivo: string | null = null;
        let corretorNome: string | null = null;
        let corretorTelefone: string | null = null;
        let corretorEmail: string | null = null;
        let distributed = false;

        if (data.distribuir) {
          const { data: c } = await supabaseAdmin.rpc("distribuir_lead", {
            _lead_id: lead.id,
            _tipo: "automatica",
          });
          corretorId = (c as string | null) ?? null;
          if (!corretorId) {
            motivo = "sem_corretor_disponivel";
          } else {
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
              motivo = "corretor_sem_telefone";
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
        }

        // Sincroniza com Banco Operacional externo (idempotente por telefone_e164).
        // Falha aqui NÃO bloqueia a resposta — intake e roleta seguem intactos.
        try {
          const { syncLeadToExternal, logEventoFunilExternal } = await import(
            "@/lib/external-supabase.server"
          );
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
          },
          { headers: corsHeaders },
        );
      },
    },
  },
});

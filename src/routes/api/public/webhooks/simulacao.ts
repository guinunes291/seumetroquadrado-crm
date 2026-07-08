// POST /api/public/webhooks/simulacao
// Recebe simulações do Simulador Aluguel vs. Parcela (ferramenta de visita).
// Auth: header X-API-Key = SIMULADOR_API_KEY (secret próprio; contrato §2.4 do
// DESIGN do simulador). Resposta de sucesso: 201 { ok, id, lead_id, lead_criado }.
//
// Comportamento:
//   1) grava a simulação em `simulacoes` (sempre — é o registro do evento);
//   2) com telefone: casa com lead ativo (buscar_lead_por_telefone, tolerante
//      ao DDI 55) → anexa nota na timeline (interacoes); telefone novo → cria
//      lead origem 'simulador' e distribui pela roleta de presença dos webhooks
//      (distribuir_lead_webhook, fallback gestor) — mesmo caminho do chatbot;
//   3) sem telefone: grava só o evento.
// Falha ao criar/casar o lead NÃO derruba a resposta: a simulação já está
// registrada e a visita nunca trava (princípio do DESIGN §2.2).
import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { corsPreflight, jsonResponse } from "@/lib/public-api-auth";
import {
  checkSimuladorApiKey,
  montarResumoSimulacao,
  validarPayloadSimulacao,
  type SimulacaoValidada,
} from "@/lib/simulacao-webhook";

/** Remove o DDI 55 para gravar no lead no formato mais comum da base (DDD+número). */
function telefoneSemDdi(tel: string): string {
  return tel.length >= 12 && tel.startsWith("55") ? tel.slice(2) : tel;
}

type SupabaseAdmin = typeof import("@/integrations/supabase/client.server").supabaseAdmin;

/** `simulacoes` ainda não está nos types gerados do Supabase (types.ts é
 *  regenerado no Lovable Cloud). O cast único aqui derruba a checagem de
 *  schema só para esta tabela. */
function tabelaSimulacoes(admin: SupabaseAdmin) {
  return (admin as unknown as SupabaseClient).from("simulacoes");
}

/** Casa a simulação com um lead existente ou cria um novo (roleta webhook).
 *  Nunca lança: qualquer falha aqui só loga — a simulação já foi gravada. */
async function vincularLead(
  supabaseAdmin: SupabaseAdmin,
  simulacaoId: string,
  d: SimulacaoValidada,
): Promise<{ lead_id: string | null; lead_criado: boolean }> {
  const telefone = d.cliente_telefone!;
  const resumo = montarResumoSimulacao(d);

  // 1) Telefone casa com lead ativo? (mais recente primeiro)
  const { data: existente, error: buscaErr } = await supabaseAdmin.rpc(
    "buscar_lead_por_telefone" as never,
    { _telefone: telefone } as never,
  );
  if (buscaErr) {
    console.error("[webhooks/simulacao] buscar_lead_por_telefone falhou:", buscaErr.message);
    return { lead_id: null, lead_criado: false };
  }

  let leadId = (existente as string | null) ?? null;
  let leadCriado = false;

  // 2) Telefone novo → cria lead origem 'simulador' e entra na roleta.
  if (!leadId) {
    let corretorId: string | null = null;
    let assignedToFallback = false;

    const { data: c } = await supabaseAdmin.rpc("distribuir_lead_webhook" as never);
    corretorId = (c as string | null) ?? null;
    if (!corretorId) {
      const { data: g } = await supabaseAdmin.rpc("gestor_fallback_webhook" as never);
      corretorId = (g as string | null) ?? null;
      assignedToFallback = corretorId !== null;
    }

    const statusInicial = corretorId
      ? assignedToFallback
        ? "aguardando_corretor"
        : "aguardando_atendimento"
      : null;

    const { data: lead, error: insErr } = await supabaseAdmin
      .from("leads")
      .insert({
        nome: "(sem nome)",
        telefone: telefoneSemDdi(telefone),
        origem: "simulador",
        projeto_nome: d.empreendimento,
        renda_informada: String(d.inputs.renda),
        entrada_disponivel: String(d.inputs.entrada),
        observacoes: `Simulação Aluguel vs. Parcela:\n${resumo}`,
        corretor_id: corretorId,
        timestamp_recebimento: new Date().toISOString(),
        // Canal webhook: entra no repasse por SLA de minutos (redistribuir_sla_webhook).
        via_webhook: true,
        ...(statusInicial ? { status: statusInicial } : {}),
        ...(corretorId ? { data_distribuicao: new Date().toISOString() } : {}),
      } as never)
      .select("id")
      .single();

    if (insErr || !lead) {
      console.error("[webhooks/simulacao] criação de lead falhou:", insErr?.message);
      return { lead_id: null, lead_criado: false };
    }
    leadId = (lead as { id: string }).id;
    leadCriado = true;

    // Alerta in-app ao corretor sorteado (o simulador não notifica por WhatsApp).
    if (corretorId) {
      const { error: alertaErr } = await supabaseAdmin.from("alertas").insert({
        user_id: corretorId,
        tipo: "lead_novo",
        titulo: "Novo lead do Simulador Aluguel vs. Parcela",
        mensagem: "Um cliente fez uma simulação e deixou o WhatsApp. Abra o lead para atender.",
        link: `/leads/${leadId}`,
        ref_id: leadId,
      } as never);
      if (alertaErr) {
        console.error("[webhooks/simulacao] alerta falhou:", alertaErr.message);
      }
    }
  }

  // 3) Anexa a simulação à timeline do lead (novo ou existente).
  const { error: notaErr } = await supabaseAdmin.from("interacoes").insert({
    lead_id: leadId,
    tipo: "nota",
    direcao: "interna",
    titulo: "Simulação Aluguel vs. Parcela",
    conteudo: resumo,
    metadata: {
      fonte: "webhook_simulacao",
      simulacao_id: simulacaoId,
      corretor_ref: d.corretor_ref,
      versao_calculo: d.versao_calculo,
      inputs: d.inputs,
      resultado: d.resultado,
      flags: d.flags,
    },
  } as never);
  if (notaErr) {
    console.error("[webhooks/simulacao] nota na timeline falhou:", notaErr.message);
  }

  // 4) Grava o vínculo na simulação.
  const { error: updErr } = await tabelaSimulacoes(supabaseAdmin)
    .update({ lead_id: leadId, lead_criado: leadCriado })
    .eq("id", simulacaoId);
  if (updErr) {
    console.error("[webhooks/simulacao] vínculo lead↔simulação falhou:", updErr.message);
  }

  return { lead_id: leadId, lead_criado: leadCriado };
}

export const Route = createFileRoute("/api/public/webhooks/simulacao")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),

      POST: async ({ request }) => {
        const authErr = checkSimuladorApiKey(request);
        if (authErr) return authErr;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, erro: "JSON inválido" }, 400);
        }

        const validacao = validarPayloadSimulacao(body);
        if (!validacao.ok) {
          return jsonResponse(
            { ok: false, erro: validacao.erro, detalhes: validacao.detalhes },
            validacao.status,
          );
        }
        const d = validacao.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: sim, error: simErr } = await tabelaSimulacoes(supabaseAdmin)
          .insert({
            origem: d.origem,
            versao_calculo: d.versao_calculo,
            corretor_ref: d.corretor_ref,
            cliente_telefone: d.cliente_telefone,
            empreendimento: d.empreendimento,
            aluguel: d.inputs.aluguel,
            renda: d.inputs.renda,
            entrada: d.inputs.entrada,
            faixa: d.resultado?.faixa ?? null,
            taxa_aa: d.resultado?.taxa_aa ?? null,
            parcela_estimada: d.resultado?.parcela_estimada ?? null,
            valor_imovel_max: d.resultado?.valor_imovel_max ?? null,
            aluguel_10anos: d.resultado?.aluguel_10anos ?? null,
            patrimonio_10anos: d.resultado?.patrimonio_10anos ?? null,
            mes_cruzamento: d.resultado?.mes_cruzamento ?? null,
            ts_origem: d.ts_origem,
            raw: body,
          })
          .select("id")
          .single();

        if (simErr || !sim) {
          console.error("[webhooks/simulacao] insert falhou:", simErr?.message);
          return jsonResponse({ ok: false, erro: simErr?.message ?? "insert falhou" }, 500);
        }
        const simulacaoId = (sim as { id: string }).id;

        // Sem telefone: grava só o evento (regra do contrato).
        let vinculo = { lead_id: null as string | null, lead_criado: false };
        if (d.cliente_telefone) {
          vinculo = await vincularLead(supabaseAdmin, simulacaoId, d);
        }

        return jsonResponse(
          { ok: true, id: simulacaoId, lead_id: vinculo.lead_id, lead_criado: vinculo.lead_criado },
          201,
        );
      },
    },
  },
});

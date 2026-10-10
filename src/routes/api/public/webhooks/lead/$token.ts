import { createFileRoute } from "@tanstack/react-router";
import type { TablesInsert } from "@/integrations/supabase/types";
import { comRpcsPendentes } from "@/integrations/supabase/webhook-lead-pendente";
import {
  blocoCamposExtras,
  blocoObservacoesCorretor,
  validarPayloadLead,
} from "@/lib/webhook-lead-payload";
import { lerAdiadoNoite, notaLeadNoite } from "@/lib/roleta-noite";
import {
  MOTIVO_VOLTA,
  lerVolta,
  textoRegistroFilho,
  textoVoltaSemRegistroNovo,
  type Volta,
  type VoltaSemRegistroNovo,
} from "@/lib/webhook-lead-volta";

/** Telefone do corretor no formato do WhatsApp (55 + DDD + número). */
function telefoneWhatsApp(t: string | null | undefined): string | null {
  let n = (t ?? "").replace(/\D/g, "");
  if (n && !n.startsWith("55") && (n.length === 10 || n.length === 11)) n = `55${n}`;
  return n || null;
}

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

        // 1) Tenta resolver como TOKEN DE ROLETA (roleta.webhook_token):
        //    campanha OU roleta de zona (zona-norte/sul/leste/oeste). Uma
        //    campanha pode ter projeto vinculado (opcional). Se vinculado,
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

        if (campanha && !["campanha", "zona"].includes(campanha.tipo)) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }
        // Roleta DESATIVADA não recusa lead: anúncio pausado entrega leads
        // residuais por dias, e um 401 aqui os perderia sem rastro. O token
        // continua válido; o lead entra e segue a triagem normal (zona
        // primeiro, origem depois) em vez da distribuição da roleta.
        const roletaAtiva = Boolean(campanha?.ativo);

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

        const parsed = validarPayloadLead(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Validation failed", details: parsed.error.flatten() },
            { status: 400, headers: corsHeaders },
          );
        }
        const data = parsed.data;
        // Respostas livres do formulário da campanha (perguntas próprias de
        // cada anúncio). Usadas nas observações, na timeline e no aviso ao
        // corretor — é o que muda a abordagem da primeira ligação.
        const blocoExtras = blocoCamposExtras(data.camposExtras);

        // Nome do projeto: campo "empreendimento" (novo) tem prioridade,
        // depois "empreendimentoInteresse" (legado), senão o nome do projeto do token.
        // Precisa ser calculado antes do dedup para registrar o interesse
        // correto na interação de duplicata cross-project.
        const projetoNomeInteresse =
          (data.empreendimento?.trim() || null) ??
          (data.empreendimentoInteresse?.trim() || null) ??
          projeto.nome;

        const resumo = (data.resumo ?? data.observacao ?? "").trim() || null;
        const blocoQualif = montarBlocoQualificacao(data);
        const obsPartes = [
          data.observacoes?.trim() || null,
          blocoExtras,
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
        const novoLead = {
          nome: data.nome,
          telefone: data.telefone,
          email: data.email ?? null,
          origem: data.origem,
          projeto_id: projeto.id,
          projeto_nome: projetoNomeFinal,
          campanha: data.campanha ?? null,
          observacoes: observacoesFinais,
          renda_informada: data.faixaRenda ?? null,
          // Sem FGTS no formulário, o campo fica fora (o default da coluna é
          // false): no filho da campanha, "não informado" não pode apagar o
          // FGTS que a mãe já conhece.
          ...(data.fgts ? { usa_fgts: usaFgts } : {}),
          entrada_disponivel: data.fgts ?? null,
          temperatura: temperatura,
          // Zona do lead: campo explícito manda; sem ele, a "região de
          // interesse" da qualificação IA É a zona (trigger normaliza).
          // `?.trim() || null` de propósito: o n8n manda campo não
          // preenchido como "" — e "" ?? x devolve "" (não é nullish),
          // o que descartaria a regiao válida em silêncio.
          zona: (data.zona?.trim() || null) ?? (data.regiao?.trim() || null),
          bairro: data.bairro?.trim() || null,
          utm_source: data.utm_source ?? null,
          utm_medium: data.utm_medium ?? null,
          utm_campaign: data.utm_campaign ?? null,
          utm_content: data.utm_content ?? null,
          // Amarra o lead à roleta (campanha OU zona) para que o SLA
          // redistribua na MESMA equipe se o corretor não atender a tempo.
          // Roleta desativada não pina: o lead é triado como lead normal.
          roleta_slug: campanha && roletaAtiva ? campanha.slug : null,
          // Canal de chegada: só leads via_webhook entram no SLA de minutos.
          via_webhook: true,
          canal_entrada: "webhook_chatbot",
        } satisfies Omit<TablesInsert<"leads">, "cliente_id">;

        // Quem já passou pelo CRM (registro mãe, Fatia B — decisão do dono em
        // 03/10/2026: "sempre filho novo pela roleta"). O banco decide sob o
        // cadeado da pessoa: telefone novo segue o INSERT de sempre; reenvio
        // em até 10 min devolve o mesmo registro; negociação em Visita
        // realizada ou além fica com o dono; o resto ganha um registro filho
        // novo, já vinculado à mãe e sem os corretores que já têm a pessoa,
        // que segue daqui como lead novo (mesma roleta, exceções e aviso).
        // Substitui a regra de 01/10, que chamava duas RPCs que nunca
        // existiram: a volta por outro empreendimento virava erro 500.
        const adminPendente = comRpcsPendentes(supabaseAdmin);
        const decidirVolta = async (): Promise<Volta | null> => {
          const { data: decisao, error: decisaoErr } = await adminPendente.rpc(
            "registrar_volta_campanha",
            { _lead: novoLead },
          );
          if (decisaoErr) {
            console.error("[webhooks/lead] registrar_volta_campanha falhou:", decisaoErr);
            return null;
          }
          const volta = lerVolta(decisao);
          if (!volta) console.error("[webhooks/lead] decisão fora do contrato:", decisao);
          return volta;
        };

        const nomeCampanha = campanha?.nome ?? projeto.nome;
        const metaVolta = (v: Exclude<Volta, { acao: "cliente_novo" }>) => ({
          fonte: "webhook_lead",
          evento: "volta_campanha",
          acao: v.acao,
          cliente_id: v.cliente_id,
          roleta: campanha?.slug ?? `projeto:${projeto.id ?? "?"}`,
          origem: data.origem,
          campanha: data.campanha ?? null,
          projeto_nome: projetoNomeInteresse,
          camposExtras: data.camposExtras ?? null,
        });

        // Volta que não gera registro novo: a nota vai para o registro que a
        // recebeu e a resposta aponta o corretor dele.
        const responderVolta = async (v: VoltaSemRegistroNovo) => {
          const { data: dono } = v.corretor_id
            ? await supabaseAdmin
                .from("profiles")
                .select("nome, telefone")
                .eq("id", v.corretor_id)
                .maybeSingle()
            : { data: null };
          const telDono = telefoneWhatsApp(dono?.telefone);
          const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
          const texto = textoVoltaSemRegistroNovo(v.acao, { campanha: nomeCampanha, quando });

          await supabaseAdmin.from("interacoes").insert({
            lead_id: v.lead_id,
            tipo: "nota",
            direcao: "interna",
            titulo: "Sistema: cliente voltou pela campanha",
            conteudo: blocoExtras ? `${texto}\n\n${blocoExtras}` : texto,
            metadata: metaVolta(v),
          });
          if (v.acao === "negociacao_avancada" && v.corretor_id) {
            await supabaseAdmin.from("alertas").insert({
              user_id: v.corretor_id,
              tipo: "sistema",
              titulo: "Cliente em negociação voltou pela campanha",
              mensagem: `${data.nome} preencheu o formulário de ${projetoNomeInteresse}. Ele segue com você.`,
              link: `/leads/${v.lead_id}`,
              ref_id: v.lead_id,
            });
          }

          return Response.json(
            {
              ok: true,
              duplicate: true,
              projeto: projeto.nome,
              lead_id: v.lead_id,
              // "Está com um corretor": o Marquinhos lê só este campo e, com
              // false, abre alerta de roleta sem distribuição para o gestor.
              distributed: Boolean(v.corretor_id && telDono),
              corretor_id: v.corretor_id,
              corretor_nome: dono?.nome ?? null,
              corretor_telefone: telDono,
              motivo: MOTIVO_VOLTA[v.acao],
            },
            { headers: corsHeaders },
          );
        };

        let volta = await decidirVolta();
        if (volta?.acao === "reenvio" || volta?.acao === "negociacao_avancada") {
          return responderVolta(volta);
        }

        let lead: { id: string } | null =
          volta?.acao === "registro_filho" ? { id: volta.lead_id } : null;
        if (!lead) {
          const { data: inserido, error } = await supabaseAdmin
            .from("leads")
            // cliente_id é preenchido pelo gatilho trg_zz_cliente_vincular.
            .insert(novoLead as TablesInsert<"leads">)
            .select("id")
            .single();

          if (error) {
            if ((error as { code?: string }).code === "23505") {
              // Corrida: outra entrada da mesma pessoa gravou primeiro e o
              // índice único barrou esta. Pergunta de novo — agora ela existe.
              volta = await decidirVolta();
              if (volta?.acao === "reenvio" || volta?.acao === "negociacao_avancada") {
                return responderVolta(volta);
              }
              if (volta?.acao === "registro_filho") {
                lead = { id: volta.lead_id };
              } else if (projeto.id) {
                // Sem a decisão do banco (deploy em curso): o caminho antigo,
                // que só acha o repetido do MESMO empreendimento.
                const { data: dupId2 } = await supabaseAdmin.rpc("buscar_lead_duplicado", {
                  _projeto_id: projeto.id,
                  _telefone: data.telefone,
                });
                if (dupId2) {
                  return Response.json(
                    {
                      ok: true,
                      duplicate: true,
                      projeto: projeto.nome,
                      lead_id: dupId2,
                      distributed: false,
                    },
                    { headers: corsHeaders },
                  );
                }
              }
            }
            if (!lead) {
              return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
            }
          } else {
            lead = inserido;
          }
        }

        let corretorId: string | null = null;
        let motivo: string | null = null;
        let excecaoMotivo: string | null = null;
        // Roleta fechada à noite (20261014120000): o motor não sorteia e o lead
        // espera a reabertura. O contrato antigo fica (distributed: false,
        // motivo: sem_corretor_disponivel); roleta_fechada/reabre_as dizem ao
        // Marquinhos que não é "lead órfão".
        let adiadoNoite: { reabreAs: string | null } | null = null;

        if (data.distribuir) {
          if (campanha && roletaAtiva && campanha.tipo === "zona") {
            // Token de ROLETA DE ZONA: rodízio simples (menos recente) do
            // motor v3, direto no time da zona — sem tier/SWRR de campanha.
            const { data: dist, error: distErr } = await supabaseAdmin.rpc("distribuir_lead_v3", {
              _lead_id: lead.id,
              _tipo: "automatica",
              _roleta_slug: campanha.slug,
              _gatilho: "webhook",
            });
            if (distErr) {
              console.error("[webhooks/lead] distribuicao por zona falhou:", distErr);
              motivo = "sem_corretor_disponivel";
              excecaoMotivo = "falha_distribuicao_zona";
            } else {
              const res = dist as {
                ok?: boolean;
                corretor_id?: string;
                motivo?: string;
              } | null;
              if (res?.ok && res.corretor_id) {
                corretorId = res.corretor_id;
              } else {
                motivo = "sem_corretor_disponivel";
                excecaoMotivo = res?.motivo ?? "sem_apto_na_zona";
                adiadoNoite = lerAdiadoNoite(res);
              }
            }
          } else if (campanha && roletaAtiva) {
            // Distribuição da CAMPANHA: zona primeiro (o motor delega para a
            // roleta da zona do lead quando ela existe e está pronta); senão,
            // só a equipe da roleta, ponderada por tier (A=3/B=2/C=1). Se não
            // houver ninguém apto, mantém o contrato antigo (motivo:
            // sem_corretor_disponivel) e o lead vai para o cron de
            // redistribuição, amarrado à mesma campanha.
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
                adiadoNoite = lerAdiadoNoite(res);
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
                adiadoNoite = lerAdiadoNoite(res);
              }
            }
          }
        }

        // Quem receber às 9h sabe por que o lead chegou de madrugada e o que o
        // cliente já ouviu do robô.
        if (adiadoNoite) {
          await supabaseAdmin.from("interacoes").insert({
            lead_id: lead.id,
            tipo: "nota",
            direcao: "interna",
            titulo: "Sistema: chegou com a roleta fechada",
            conteudo: notaLeadNoite({
              reabreAs: adiadoNoite.reabreAs,
              chegouEm: new Date(),
              viaMarquinhos: data.origem === "chatbot",
            }),
            metadata: { fonte: "webhook_lead", evento: "roleta_fechada_noite" },
          });
        }

        // Filho da campanha: o corretor sabe que a pessoa já passou pelo CRM e
        // o que veio pronto da mãe — sem o histórico dos outros atendimentos.
        if (volta?.acao === "registro_filho") {
          await supabaseAdmin.from("interacoes").insert({
            lead_id: lead.id,
            tipo: "nota",
            direcao: "interna",
            titulo: "Sistema: cliente voltou pela campanha",
            conteudo: textoRegistroFilho(volta.campos_herdados, { campanha: nomeCampanha }),
            metadata: {
              ...metaVolta(volta),
              campos_herdados: volta.campos_herdados,
              corretores_excluidos: volta.corretores_excluidos,
            },
          });
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

        // Respostas livres do formulário na timeline, separadas da nota da IA:
        // é dado dito pelo cliente, não inferência do robô.
        if (blocoExtras) {
          await supabaseAdmin.from("interacoes").insert({
            lead_id: lead.id,
            tipo: "nota",
            direcao: "interna",
            titulo: "Respostas do formulário",
            conteudo: blocoExtras,
            metadata: { fonte: "webhook_lead", camposExtras: data.camposExtras ?? [] },
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

        // Notificação ao corretor no WhatsApp — com o EMPREENDIMENTO em
        // destaque. Leads de chatbot ficam de fora: o fluxo do Marquinhos
        // (n8n) já envia o dossiê completo, e avisar duas vezes confunde.
        // Nunca inclui o telefone do lead. Falha de envio não derruba o
        // intake: vira alerta in-app para o corretor.
        let notificacao = "nao_aplicavel";
        if (distributed && corretorId && data.origem !== "chatbot") {
          const { enviarWhatsAppZapi } = await import("@/lib/zapi.server");
          const appBase = new URL(request.url).origin;
          const blocoObs = blocoObservacoesCorretor(data.camposExtras, data.finalidadeImovel);
          const linhas = [
            "🔔 *Novo lead recebido!*",
            "",
            `👤 Nome: ${data.nome}`,
            `🏢 Empreendimento: ${projetoNomeFinal}`,
            ...(data.faixaRenda ? [`💰 Faixa de renda: ${data.faixaRenda}`] : []),
            ...(blocoObs ? ["", blocoObs] : []),
            "",
            `Acesse: ${appBase}/leads/${lead.id}`,
          ];
          notificacao = await enviarWhatsAppZapi(corretorTelefone, linhas.join("\n"));
          if (notificacao !== "enviada") {
            await supabaseAdmin.from("alertas").insert({
              user_id: corretorId,
              tipo: "lead_novo",
              titulo: "Novo lead atribuído (notificação WhatsApp falhou)",
              mensagem:
                `Lead ${data.nome} — ${projetoNomeFinal}. Abra o CRM para atender.` +
                (blocoObs ? `\n\n${blocoObs}` : ""),
              link: `/leads/${lead.id}`,
              ref_id: lead.id,
            });
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
            notificacao,
            motivo,
            excecao_motivo: excecaoMotivo,
            roleta_fechada: adiadoNoite !== null,
            reabre_as: adiadoNoite?.reabreAs ?? null,
            // Registro mãe: true quando a pessoa já existia e este é o filho
            // novo da campanha (para o corretor sorteado, é um lead novo).
            registro_adicional: volta?.acao === "registro_filho",
          },
          { headers: corsHeaders },
        );
      },
    },
  },
});

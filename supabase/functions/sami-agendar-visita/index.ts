// supabase/functions/sami-agendar-visita/index.ts
//
// Edge Function da Fase 2 da Sami — CRIA uma visita no CRM (tabela `agendamentos`).
// Chamada server-to-server pelo n8n (sem login de corretor), então SUBA COM verify_jwt = false.
// A fronteira de segurança é o header `x-sami-key` (secret SAMI_WRITE_KEY).
//
// Regras (ver Fase2-Arquitetura-Contrato-Deploy.md):
//  - resolve o corretor pela `profiles.telefone` (por dígitos);
//  - resolve o lead SÓ dentro do escopo do corretor (não agenda lead alheio);
//  - grava só campos da whitelist, com a service role;
//  - dry_run=true valida e devolve o que resolveu SEM gravar (a Sami usa p/ confirmar).
//
// Checklist de schema (§6 do doc): confirmar nomes reais de colunas/enum de `agendamentos`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sami-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---- ajustes que dependem do schema real do CRM (confirmar no Lovable) --------
const AGENDA_TABLE = "agendamentos";
const COL_DATA = "data_inicio";        // coluna timestamptz de início
const STATUS_NOVA = "agendado";        // valor de status para uma visita recém-criada
const TIPO_VISITA = "visita";          // valor de tipo
// -----------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // 1) Auth por key (comparação simples; a key é longa e aleatória)
  const key = req.headers.get("x-sami-key") ?? "";
  const esperado = Deno.env.get("SAMI_WRITE_KEY") ?? "";
  if (!esperado || key !== esperado) return json({ ok: false, erro: "auth", detalhe: "x-sami-key ausente ou inválida" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, erro: "body_invalido", detalhe: "JSON inválido" }); }

  const corretorTelefone = String(body.corretor_telefone ?? "").trim();
  const leadRef = String(body.lead ?? "").trim();
  const dataHora = String(body.data_hora ?? "").trim();
  const empreendimento = (body.empreendimento ?? "").toString().trim();
  const observacao = (body.observacao ?? "").toString().trim();
  const dryRun = body.dry_run === true;

  if (!corretorTelefone) return json({ ok: false, erro: "corretor_telefone_ausente" });
  if (!leadRef) return json({ ok: false, erro: "lead_ausente" });

  // 2) Valida data
  const quando = new Date(dataHora);
  if (!dataHora || isNaN(quando.getTime())) return json({ ok: false, erro: "data_invalida", detalhe: "use ISO 8601 com fuso, ex.: 2026-07-09T15:00:00-03:00" });
  if (quando.getTime() < Date.now() - 60_000) return json({ ok: false, erro: "data_no_passado", detalhe: "a data/hora já passou" });

  // 3) Cliente admin (service role) — a service role bypassa RLS; o escopo é feito no código
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 4) Resolve o corretor por telefone (dígitos, casa pelos últimos 8-9)
    const corretor = await resolverCorretor(supabase, corretorTelefone);
    if (!corretor) return json({ ok: false, erro: "corretor_nao_encontrado", detalhe: "telefone não bate com nenhum corretor ativo" });

    // 5) Resolve o lead DENTRO do escopo do corretor
    const r = await resolverLead(supabase, leadRef, corretor.id);
    if (r.erro) return json({ ok: false, ...r });          // lead_ambiguo (com opcoes) / lead_nao_encontrado
    const lead = r.lead!;

    const titulo = empreendimento ? `Visita - ${empreendimento}` : `Visita - ${lead.nome ?? "cliente"}`;
    const quandoHumano = fmtHumano(quando);

    // 6) dry_run: valida e devolve, sem gravar (a Sami confirma com o corretor)
    if (dryRun) {
      return json({
        ok: true, dry_run: true,
        quando: quando.toISOString(), quando_humano: quandoHumano,
        lead: { id: lead.id, nome: lead.nome, telefone: lead.telefone ?? lead.telefone_e164 },
        corretor: { id: corretor.id, nome: corretor.nome }, titulo,
      }, 200);
    }

    // 7) INSERT (whitelist de campos)
    const registro: Record<string, unknown> = {
      lead_id: lead.id,
      corretor_id: corretor.id,
      tipo: TIPO_VISITA,
      status: STATUS_NOVA,
      titulo,
      [COL_DATA]: quando.toISOString(),
    };
    if (observacao) registro["observacao"] = observacao;

    const { data, error } = await supabase.from(AGENDA_TABLE).insert(registro).select("id").single();
    if (error) return json({ ok: false, erro: "crm_erro", detalhe: error.message });

    return json({
      ok: true, dry_run: false,
      agendamento_id: data.id,
      quando: quando.toISOString(), quando_humano: quandoHumano,
      lead: { id: lead.id, nome: lead.nome, telefone: lead.telefone ?? lead.telefone_e164 },
      corretor: { id: corretor.id, nome: corretor.nome }, titulo,
    }, 201);
  } catch (e: any) {
    return json({ ok: false, erro: "crm_erro", detalhe: String(e?.message ?? e) });
  }
});

// ---------------- helpers ----------------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const soDigitos = (s: string) => (s || "").replace(/\D/g, "");

function fmtHumano(d: Date): string {
  // dd/mm às HHh (America/Sao_Paulo)
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return f.format(d).replace(",", "").replace(":", "h");
}

async function resolverCorretor(supabase: any, telefone: string) {
  const dig = soDigitos(telefone);
  const suf = dig.slice(-9).length >= 8 ? dig.slice(-9) : dig.slice(-8);
  const { data } = await supabase.from("profiles").select("id,nome,telefone,ativo").eq("ativo", true);
  const alvo = (data ?? []).find((p: any) => {
    const pd = soDigitos(p.telefone ?? "");
    return pd && (pd.endsWith(suf) || suf.endsWith(pd.slice(-8)));
  });
  return alvo ?? null;
}

async function resolverLead(supabase: any, ref: string, corretorId: string): Promise<{ lead?: any; erro?: string; detalhe?: string; opcoes?: any[] }> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const baseSel = "id,nome,telefone,telefone_e164,corretor_id";
  const naoLixeira = (q: any) => q.eq("corretor_id", corretorId).is("deleted_at", null);

  // por id
  if (UUID.test(ref)) {
    const { data } = await naoLixeira(supabase.from("leads").select(baseSel)).eq("id", ref.toLowerCase()).limit(1);
    if (data && data.length) return { lead: data[0] };
    return { erro: "lead_nao_encontrado", detalhe: "id não é um lead deste corretor" };
  }

  const dig = soDigitos(ref);
  // por telefone
  if (dig.length >= 8) {
    const suf = dig.slice(-9);
    const { data } = await naoLixeira(
      supabase.from("leads").select(baseSel).or(`telefone.ilike.%${suf}%,telefone_e164.ilike.%${suf}%`),
    ).limit(5);
    if (data && data.length === 1) return { lead: data[0] };
    if (data && data.length > 1) return { erro: "lead_ambiguo", detalhe: "mais de um lead com esse telefone", opcoes: data.map(op) };
  }

  // por nome (ilike)
  const termo = ref.replace(/[,()*"\\%]/g, " ").trim();
  const { data } = await naoLixeira(supabase.from("leads").select(baseSel).ilike("nome", `%${termo}%`)).limit(6);
  if (!data || data.length === 0) return { erro: "lead_nao_encontrado", detalhe: `nenhum lead do corretor casa com "${ref}"` };
  if (data.length === 1) return { lead: data[0] };
  return { erro: "lead_ambiguo", detalhe: "mais de um lead com esse nome", opcoes: data.map(op) };
}

const op = (l: any) => ({ id: l.id, nome: l.nome, telefone: l.telefone ?? l.telefone_e164 });

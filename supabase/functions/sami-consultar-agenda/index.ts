// supabase/functions/sami-consultar-agenda/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sami-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AGENDA_TABLE = "agendamentos";
const COL_DATA = "data_inicio";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const key = req.headers.get("x-sami-key") ?? "";
  const esperado = Deno.env.get("SAMI_WRITE_KEY") ?? "";
  if (!esperado || !(await timingSafeEqualStr(key, esperado)))
    return json({ ok: false, erro: "auth" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* corpo opcional */ }
  const corretorTelefone = String(body.corretor_telefone ?? "").trim();
  if (!corretorTelefone) return json({ ok: false, erro: "corretor_telefone_ausente" });

  const { de, ate } = semana(body.de, body.ate);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const corretor = await resolverCorretor(supabase, corretorTelefone);
    if (!corretor) return json({ ok: false, erro: "corretor_nao_encontrado" });

    const { data: ags, error } = await supabase
      .from(AGENDA_TABLE)
      .select(`id,tipo,status,titulo,${COL_DATA},lead_id`)
      .eq("corretor_id", corretor.id)
      .is("deleted_at", null)
      .gte(COL_DATA, `${de}T00:00:00-03:00`)
      .lte(COL_DATA, `${ate}T23:59:59-03:00`)
      .order(COL_DATA, { ascending: true });
    if (error) return json({ ok: false, erro: "crm_erro", detalhe: error.message });

    const ids = [...new Set((ags ?? []).map((a: any) => a.lead_id).filter(Boolean))];
    const nomes: Record<string, any> = {};
    if (ids.length) {
      const { data: leads } = await supabase.from("leads").select("id,nome,telefone,telefone_e164").in("id", ids);
      for (const l of leads ?? []) nomes[l.id] = l;
    }

    const agendamentos = (ags ?? []).map((a: any) => {
      const d = new Date(a[COL_DATA]); const l = nomes[a.lead_id] ?? {};
      return {
        id: a.id, quando: d.toISOString(), quando_humano: fmtHumano(d),
        lead_nome: l.nome ?? null, lead_telefone: l.telefone ?? l.telefone_e164 ?? null,
        tipo: a.tipo, status: a.status, titulo: a.titulo,
      };
    });
    return json({ ok: true, periodo: { de, ate }, corretor: { id: corretor.id, nome: corretor.nome }, total: agendamentos.length, agendamentos });
  } catch (e: any) {
    return json({ ok: false, erro: "crm_erro", detalhe: String(e?.message ?? e) });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
// Comparação de segredo em tempo constante (SHA-256 antes do XOR).
async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}
const soDigitos = (s: string) => (s || "").replace(/\D/g, "");
function fmtHumano(d: Date): string {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return f.format(d).replace(",", "").replace(":", "h");
}
function semana(deIn?: string, ateIn?: string): { de: string; ate: string } {
  if (deIn && ateIn) return { de: String(deIn), ate: String(ateIn) };
  const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dow = (agoraSP.getDay() + 6) % 7;
  const seg = new Date(agoraSP); seg.setDate(agoraSP.getDate() - dow);
  const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { de: deIn ? String(deIn) : iso(seg), ate: ateIn ? String(ateIn) : iso(dom) };
}
async function resolverCorretor(supabase: any, telefone: string) {
  const dig = soDigitos(telefone);
  const suf = dig.slice(-9).length >= 8 ? dig.slice(-9) : dig.slice(-8);
  const { data } = await supabase.from("profiles").select("id,nome,telefone,ativo").eq("ativo", true);
  return (data ?? []).find((p: any) => {
    const pd = soDigitos(p.telefone ?? "");
    return pd && (pd.endsWith(suf) || suf.endsWith(pd.slice(-8)));
  }) ?? null;
}

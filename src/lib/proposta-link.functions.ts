import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { primeiroNome, snapshotSchema, validadeMaxima } from "@/lib/proposta-link";

// Corretor: publicar e revogar links. A escrita em `propostas` só acontece por
// RPC SECURITY DEFINER com service role, depois que o servidor confere quem é
// o usuário (requireSupabaseAuth). O token bruto sai uma única vez na resposta.

async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function novoToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const publicarInput = z.object({
  leadId: z.string().uuid(),
  modelo: z.enum(["apresentacao", "proposta"]),
  projetoId: z.string().uuid().nullable(),
  expiraEm: z.string().datetime(),
  // O cliente manda o conteúdo; nome do cliente e dados do corretor o servidor preenche.
  conteudo: z.record(z.string(), z.unknown()),
});

export const publicarPropostaLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => publicarInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: lead, error: leadErr } = await context.supabase
      .from("leads")
      .select("id, nome, corretor_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr || !lead) throw new Error("Lead não encontrado ou sem acesso.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const corretorId = lead.corretor_id ?? context.userId;
    const { data: perfil } = await supabaseAdmin
      .from("profiles")
      .select("nome, foto_url, avatar_url, telefone, creci")
      .eq("id", corretorId)
      .maybeSingle();
    const tel = (perfil?.telefone ?? "").replace(/\D/g, "");
    const whatsapp = tel.length === 10 || tel.length === 11 ? `55${tel}` : tel.length >= 12 && tel.length <= 13 ? tel : null;

    const snapshot = snapshotSchema.parse({
      ...data.conteudo,
      modelo: data.modelo,
      cliente_primeiro_nome: primeiroNome(lead.nome),
      corretor: {
        nome: perfil?.nome?.trim() || "Seu corretor",
        foto_url: perfil?.foto_url || perfil?.avatar_url || null,
        whatsapp,
        creci: perfil?.creci?.trim() || null,
      },
    });

    const expira = new Date(data.expiraEm);
    const max = validadeMaxima(data.modelo);
    if (expira.getTime() > max.getTime() + 60_000) throw new Error("Validade acima do permitido.");
    if (expira.getTime() <= Date.now()) throw new Error("Validade precisa ser no futuro.");

    const token = novoToken();
    const [tokenHash, snapshotHash] = await Promise.all([
      sha256Hex(token),
      sha256Hex(JSON.stringify(snapshot)),
    ]);
    const { data: id, error } = await supabaseAdmin.rpc("criar_proposta_link", {
      _ator_id: context.userId,
      _lead_id: data.leadId,
      _modelo: data.modelo,
      _projeto_id: data.projetoId as string,
      _token_hash: tokenHash,
      _expira_em: expira.toISOString(),
      _snapshot: snapshot as never,
      _snapshot_hash: snapshotHash,
    });
    if (error) {
      if (error.message.includes("proposta_forbidden")) throw new Error("Sem permissão para este lead.");
      throw new Error("Não foi possível gerar o link.");
    }
    return { id: id as string, path: `/p/${token}`, expiraEm: expira.toISOString() };
  });

export const revogarPropostaLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ok, error } = await supabaseAdmin.rpc("revogar_proposta", {
      _ator_id: context.userId,
      _proposta_id: data.id,
    });
    if (error) {
      if (error.message.includes("proposta_forbidden")) throw new Error("Sem permissão para revogar.");
      throw new Error("Não foi possível revogar.");
    }
    return { revogado: ok === true };
  });

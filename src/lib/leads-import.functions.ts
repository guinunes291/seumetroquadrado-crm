import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ImportRow = {
  nome: string;
  telefone: string;
  email?: string | null;
  projeto_nome?: string | null;
};

export type ImportResult = {
  total: number;
  inseridos: number;
  duplicados: number;
  invalidos: number;
  erros: number;
  detalhes: Array<{ linha: number; motivo: string; nome?: string; telefone?: string }>;
};

function onlyDigits(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

export const importarLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { rows: ImportRow[]; projeto_id?: string | null }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // verifica role admin/gestor
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAllowed = (roles ?? []).some(
      (r) => r.role === "admin" || r.role === "gestor",
    );
    if (!isAllowed) throw new Error("Apenas admin ou gestor podem importar leads.");

    const result: ImportResult = {
      total: data.rows.length,
      inseridos: 0,
      duplicados: 0,
      invalidos: 0,
      erros: 0,
      detalhes: [],
    };

    // mapa de projetos (para auto-match por nome)
    const { data: projetos } = await supabase
      .from("projetos")
      .select("id, nome");
    const projetosMap = new Map<string, string>();
    (projetos ?? []).forEach((p) => projetosMap.set(p.nome.trim().toLowerCase(), p.id));

    // dedupe interno por telefone normalizado
    const vistosNoArquivo = new Set<string>();

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const linha = i + 2; // +2 = considera header como linha 1
      const nome = (r.nome ?? "").trim();
      const telefoneRaw = (r.telefone ?? "").trim();
      const telefoneDigits = onlyDigits(telefoneRaw);

      if (!nome || telefoneDigits.length < 8) {
        result.invalidos++;
        result.detalhes.push({
          linha,
          motivo: !nome ? "nome vazio" : "telefone inválido",
          nome,
          telefone: telefoneRaw,
        });
        continue;
      }

      if (vistosNoArquivo.has(telefoneDigits)) {
        result.duplicados++;
        result.detalhes.push({
          linha,
          motivo: "duplicado dentro do arquivo",
          nome,
          telefone: telefoneRaw,
        });
        continue;
      }
      vistosNoArquivo.add(telefoneDigits);

      // checa duplicata no banco (por telefone normalizado)
      const { data: existentes } = await supabase
        .from("leads")
        .select("id, telefone")
        .ilike("telefone", `%${telefoneDigits.slice(-8)}%`)
        .limit(20);

      const jaExiste = (existentes ?? []).some(
        (e) => onlyDigits(e.telefone) === telefoneDigits,
      );
      if (jaExiste) {
        result.duplicados++;
        result.detalhes.push({
          linha,
          motivo: "telefone já existe na base",
          nome,
          telefone: telefoneRaw,
        });
        continue;
      }

      // projeto
      const projetoNomeRaw = (r.projeto_nome ?? "").trim();
      let projetoId: string | null = data.projeto_id ?? null;
      if (!projetoId && projetoNomeRaw) {
        projetoId = projetosMap.get(projetoNomeRaw.toLowerCase()) ?? null;
      }

      const emailLimpo = (r.email ?? "").trim().toLowerCase() || null;

      const { error: insErr } = await supabase.from("leads").insert({
        nome,
        telefone: telefoneRaw,
        email: emailLimpo,
        projeto_id: projetoId,
        projeto_nome: projetoNomeRaw || null,
        origem: "importacao" as never,
        status: "novo" as never,
      });

      if (insErr) {
        result.erros++;
        result.detalhes.push({
          linha,
          motivo: insErr.message,
          nome,
          telefone: telefoneRaw,
        });
      } else {
        result.inseridos++;
      }
    }

    return result;
  });

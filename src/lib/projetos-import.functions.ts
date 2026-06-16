import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/projetos";

export type ImportProjetoRow = {
  nome: string;
  construtora?: string | null;
  regiao?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  endereco?: string | null;
  tipologia?: string | null;
  vagas?: string | null;
  preco_inicial?: string | null;
  entrega_status?: string | null;
};

export type ImportProjetosResult = {
  total: number;
  inseridos: number;
  atualizados: number;
  duplicados: number;
  invalidos: number;
  erros: number;
  detalhes: Array<{ linha: number; motivo: string; nome?: string }>;
};

export const importarProjetos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { rows: ImportProjetoRow[]; atualizarExistentes?: boolean }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAllowed = (roles ?? []).some(
      (r) => r.role === "admin" || r.role === "gestor",
    );
    if (!isAllowed) throw new Error("Apenas admin ou gestor podem importar projetos.");

    const result: ImportProjetosResult = {
      total: data.rows.length,
      inseridos: 0,
      atualizados: 0,
      duplicados: 0,
      invalidos: 0,
      erros: 0,
      detalhes: [],
    };

    const { data: existentes } = await supabase
      .from("projetos")
      .select("id, slug, nome");
    const slugSet = new Set<string>((existentes ?? []).map((p: any) => p.slug));
    const bySlug = new Map<string, string>(
      (existentes ?? []).map((p: any) => [p.slug, p.id]),
    );

    const vistos = new Set<string>();

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const linha = i + 2;
      const nome = (r.nome ?? "").trim();
      if (!nome) {
        result.invalidos++;
        result.detalhes.push({ linha, motivo: "nome vazio" });
        continue;
      }

      // slug único por construtora+nome
      const base = slugify(
        r.construtora ? `${r.construtora}-${nome}` : nome,
      );
      let slug = base || slugify(nome);
      if (vistos.has(slug)) {
        result.duplicados++;
        result.detalhes.push({ linha, motivo: "duplicado no arquivo", nome });
        continue;
      }
      vistos.add(slug);

      const existingId = bySlug.get(slug);
      const payload = {
        nome,
        slug,
        construtora: r.construtora?.trim() || null,
        regiao: r.regiao?.trim() || null,
        bairro: r.bairro?.trim() || null,
        cidade: r.cidade?.trim() || null,
        endereco: r.endereco?.trim() || null,
        tipologia: r.tipologia?.trim() || null,
        vagas: r.vagas?.trim() || null,
        preco_inicial: r.preco_inicial?.trim() || null,
        entrega_status: r.entrega_status?.trim() || null,
      };

      if (existingId) {
        if (!data.atualizarExistentes) {
          result.duplicados++;
          result.detalhes.push({ linha, motivo: "já existe (slug)", nome });
          continue;
        }
        const { error } = await supabase
          .from("projetos")
          .update(payload)
          .eq("id", existingId);
        if (error) {
          result.erros++;
          result.detalhes.push({ linha, motivo: error.message, nome });
        } else {
          result.atualizados++;
        }
      } else {
        // garantir unicidade do slug caso o banco já tenha um colidente
        let finalSlug = slug;
        let n = 2;
        while (slugSet.has(finalSlug)) {
          finalSlug = `${slug}-${n++}`;
        }
        const { error } = await supabase
          .from("projetos")
          .insert({ ...payload, slug: finalSlug, criado_por: userId });
        if (error) {
          result.erros++;
          result.detalhes.push({ linha, motivo: error.message, nome });
        } else {
          slugSet.add(finalSlug);
          result.inseridos++;
        }
      }
    }

    return result;
  });

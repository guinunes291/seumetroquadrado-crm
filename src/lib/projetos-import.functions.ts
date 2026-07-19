import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/projetos";

export type ImportProjetoRow = {
  nome: string;
  construtora?: string | null;
  regiao?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  metragem_min?: number | null;
  metragem_max?: number | null;
  dorms_min?: number | null;
  dorms_max?: number | null;
  suites?: number | null;
  tipo_extra?: string | null;
  vagas_min?: number | null;
  vagas_max?: number | null;
  vagas_observacao?: string | null;
  preco_a_partir?: number | null;
  sob_consulta?: boolean | null;
  status_entrega?: string | null;
  mes_entrega?: number | null;
  ano_entrega?: number | null;
  fonte?: string | null;
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

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export const importarProjetos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: ImportProjetoRow[]; atualizarExistentes?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAllowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "gestor");
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

    const { data: existentes } = await supabase.from("projetos").select("id, slug");
    const slugSet = new Set<string>((existentes ?? []).map((p: any) => p.slug));
    const bySlug = new Map<string, string>((existentes ?? []).map((p: any) => [p.slug, p.id]));

    const vistos = new Set<string>();

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const linha = i + 2;
      const nome = clean(r.nome);
      if (!nome) {
        result.invalidos++;
        result.detalhes.push({ linha, motivo: "nome vazio" });
        continue;
      }

      const construtora = clean(r.construtora);
      const base = slugify(construtora ? `${construtora}-${nome}` : nome);
      const slug = base || slugify(nome);
      if (vistos.has(slug)) {
        result.duplicados++;
        result.detalhes.push({ linha, motivo: "duplicado no arquivo", nome });
        continue;
      }
      vistos.add(slug);

      const payload = {
        nome,
        slug,
        construtora,
        regiao: clean(r.regiao),
        bairro: clean(r.bairro),
        cidade: clean(r.cidade),
        logradouro: clean(r.logradouro),
        numero: clean(r.numero),
        endereco: [clean(r.logradouro), clean(r.numero)].filter(Boolean).join(", ") || null,
        metragem_min: r.metragem_min ?? null,
        metragem_max: r.metragem_max ?? null,
        dorms_min: r.dorms_min ?? null,
        dorms_max: r.dorms_max ?? null,
        suites: r.suites ?? null,
        tipo_extra: clean(r.tipo_extra),
        vagas_min: r.vagas_min ?? null,
        vagas_max: r.vagas_max ?? null,
        vagas_observacao: clean(r.vagas_observacao),
        preco_a_partir: r.preco_a_partir ?? null,
        sob_consulta: !!r.sob_consulta,
        status_entrega: clean(r.status_entrega),
        mes_entrega: r.mes_entrega ?? null,
        ano_entrega: r.ano_entrega ?? null,
        fonte: clean(r.fonte),
      };

      const existingId = bySlug.get(slug);
      if (existingId) {
        if (!data.atualizarExistentes) {
          result.duplicados++;
          result.detalhes.push({ linha, motivo: "já existe (slug)", nome });
          continue;
        }
        const { error } = await supabase.from("projetos").update(payload).eq("id", existingId);
        if (error) {
          result.erros++;
          result.detalhes.push({ linha, motivo: error.message, nome });
        } else {
          result.atualizados++;
        }
      } else {
        let finalSlug = slug;
        let n = 2;
        while (slugSet.has(finalSlug)) finalSlug = `${slug}-${n++}`;
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

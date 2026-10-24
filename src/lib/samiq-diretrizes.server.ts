// Leitura e publicação das diretrizes aprendidas da Sami (ver samiq-diretrizes.ts).
// Falha de leitura nunca derruba a Sami: sem diretriz, segue o prompt versionado.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  SAMIQ_MAX_DIRETRIZES,
  montarBlocoDiretrizes,
  type DiretrizSami,
  type LinhaDiretriz,
} from "./samiq-diretrizes";

// A tabela é nova: o cliente sem tipos evita depender da regeração do types.ts.
const db = () => supabaseAdmin as unknown as SupabaseClient;

const TTL_MS = 60_000;
let cache: { em: number; bloco: string } | null = null;

export function limparCacheDiretrizesSamiQ() {
  cache = null;
}

export async function blocoDiretrizesSamiQ(agora = Date.now()): Promise<string> {
  if (cache && agora - cache.em < TTL_MS) return cache.bloco;
  try {
    const { data, error } = await db()
      .from("samiq_diretrizes")
      .select("texto, tipo")
      .eq("ativa", true)
      .order("criado_em", { ascending: false })
      .limit(SAMIQ_MAX_DIRETRIZES);
    if (error) throw error;
    const bloco = montarBlocoDiretrizes((data ?? []) as LinhaDiretriz[]);
    cache = { em: agora, bloco };
    return bloco;
  } catch {
    console.error(JSON.stringify({ event: "samiq_diretrizes_failed" }));
    return "";
  }
}

export async function publicarDiretrizSamiQ(input: DiretrizSami): Promise<{ id: string }> {
  const { data, error } = await db()
    .from("samiq_diretrizes")
    .upsert(
      {
        texto: input.texto,
        tipo: input.tipo ?? "comportamento",
        origem: input.origem ?? "revisor-sami",
        id_origem: input.id_origem,
        ativa: input.ativa ?? true,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "id_origem" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error("Não consegui gravar a diretriz.");
  limparCacheDiretrizesSamiQ();
  return { id: String((data as { id: string }).id) };
}
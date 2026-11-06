// Disparo da base do corretor ("Marquinhos do corretor"), Fase 1.
//
// A importação roda com service role chamando `importar_base_corretor_lote`
// (migration 20261102120000), como a importação CSV do admin: o banco insere
// linha a linha passando pelos gatilhos de leads, mas sem auth.uid() o
// gatilho da captação própria não força "aguardando atendimento" — a base
// nasce fria (aguardando_retorno, classe 'base'), sem cadência e sem alerta.
// Quem garante que o corretor só importa para ELE MESMO é esta função: o
// corretor vem do token (context.userId), nunca do corpo da requisição.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  LOTE_IMPORTACAO,
  lerResultadoImportacao,
  type LinhaBase,
  type ResultadoImportacao,
} from "@/features/disparo-base/importacao";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const importarBaseCorretorLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { disparoId: string; rows: LinhaBase[] }) => {
    if (!UUID.test(input?.disparoId ?? "")) throw new Error("Disparo inválido.");
    if (!Array.isArray(input?.rows) || input.rows.length > LOTE_IMPORTACAO)
      throw new Error(`Lote inválido (máx. ${LOTE_IMPORTACAO} linhas).`);
    return input;
  })
  .handler(async ({ data, context }): Promise<ResultadoImportacao> => {
    // Piloto conferido com a sessão do próprio corretor (RLS e auth.uid()).
    const { data: piloto, error: pilotoErr } = await context.supabase.rpc("disparo_base_e_piloto", {
      _corretor: context.userId,
    });
    if (pilotoErr) throw new Error(pilotoErr.message);
    if (!piloto)
      throw new Error("O disparo da base ainda está em piloto e não está liberado para você.");

    // O disparo precisa ser dele: a leitura passa pelo RLS do próprio corretor.
    const { data: disparo, error: dispErr } = await context.supabase
      .from("disparos_base")
      .select("id, corretor_id, status")
      .eq("id", data.disparoId)
      .maybeSingle();
    if (dispErr) throw new Error(dispErr.message);
    if (!disparo || disparo.corretor_id !== context.userId)
      throw new Error("Disparo não encontrado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("importar_base_corretor_lote", {
      _corretor: context.userId,
      _disparo: data.disparoId,
      _rows: data.rows,
    });
    if (error) throw new Error(error.message);
    const r = lerResultadoImportacao(res);
    if (!r) throw new Error("Resposta inesperada do banco na importação.");
    return r;
  });

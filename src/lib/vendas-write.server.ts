// Núcleo de escrita da API pública de vendas (escopo `sales:write`).
// Usado por PATCH /api/public/vendas/{id} e PATCH /api/public/vendas (lote).
//
// Objetivo único: corrigir o EMPREENDIMENTO de vendas sem produto identificado.
//
// Regras invioláveis:
//  - Só `projeto_id`, `empreendimento` (texto) e `observacao` podem ser tocados.
//  - Nada financeiro, nada de vínculo (corretor/lead) e nada de estado do negócio.
//  - Nunca existe DELETE.
//  - Nenhuma comissão é recalculada, regerada ou tocada.
//  - Toda alteração efetiva vira linha em `api_alteracao_auditoria`.
import type { ApiClientContext } from "@/lib/api-client-auth.server";

export const CAMPOS_PERMITIDOS = ["projeto_id", "empreendimento", "observacao"] as const;

/** Campos que movem dinheiro ou mudam o estado do negócio — bloqueados aqui. */
export const CAMPOS_BLOQUEADOS = [
  "valor_venda",
  "corretor_id",
  "lead_id",
  "data_assinatura",
  "status_recebimento",
  "data_recebimento",
  "distrato",
  "data_distrato",
  "percentual_comissao",
  "percentual_corretor",
  "percentual_gerente",
  "percentual_superintendente",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PatchErro = { status: number; body: Record<string, unknown> };

export type PatchVendaPayload = {
  projeto_id?: string;
  empreendimento?: string;
  observacao?: string;
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Valida o corpo (ou o item do lote). `camposExtra` cobre o `venda_id` do lote. */
export function validarPatchVenda(
  corpo: unknown,
  camposExtra: string[] = [],
): PatchVendaPayload | PatchErro {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return { status: 400, body: { error: "corpo_invalido" } };
  }
  const obj = corpo as Record<string, unknown>;
  const permitidos = new Set<string>([...CAMPOS_PERMITIDOS, ...camposExtra]);

  for (const campo of Object.keys(obj)) {
    if (!permitidos.has(campo)) {
      return { status: 400, body: { error: "campo_nao_permitido", campo } };
    }
  }

  if ("projeto_id" in obj && "empreendimento" in obj) {
    return {
      status: 400,
      body: {
        error: "campo_conflitante",
        detalhe: "envie projeto_id OU empreendimento, nunca os dois",
      },
    };
  }

  const payload: PatchVendaPayload = {};

  if ("projeto_id" in obj) {
    if (!isUuid(obj.projeto_id)) {
      return { status: 400, body: { error: "projeto_id_invalido" } };
    }
    payload.projeto_id = obj.projeto_id as string;
  }

  if ("empreendimento" in obj) {
    const nome = obj.empreendimento;
    if (typeof nome !== "string" || nome.trim().length < 2 || nome.length > 200) {
      return { status: 400, body: { error: "empreendimento_invalido" } };
    }
    payload.empreendimento = nome.trim();
  }

  if ("observacao" in obj) {
    const obs = obj.observacao;
    if (typeof obs !== "string" || obs.length > 500) {
      return { status: 400, body: { error: "observacao_invalida" } };
    }
    payload.observacao = obs;
  }

  if (Object.keys(payload).length === 0) {
    return {
      status: 400,
      body: { error: "nenhum_campo_para_atualizar", aceitos: [...CAMPOS_PERMITIDOS] },
    };
  }

  return payload;
}

const SELECT_VENDA =
  "id,lead_id,corretor_id,projeto_id,projeto_nome,valor_venda,data_assinatura," +
  "status_venda,status_recebimento,data_recebimento,distrato,observacoes,created_at,updated_at";

export type PatchVendaResultado =
  | {
      ok: true;
      venda: Record<string, unknown>;
      anterior: { projeto_id: string | null; empreendimento: string | null };
      vinculado_ao_catalogo: boolean;
      comissoes_afetadas: number;
    }
  | { ok: false; erro: PatchErro };

/** Aplica o patch em UMA venda, audita e devolve o antes/depois. */
export async function aplicarPatchVenda(
  vendaId: string,
  payload: PatchVendaPayload,
  contexto: ApiClientContext,
): Promise<PatchVendaResultado> {
  if (!isUuid(vendaId)) {
    return { ok: false, erro: { status: 404, body: { error: "venda_nao_encontrada" } } };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: atual, error: erroLeitura } = await db
    .from("vendas")
    .select(SELECT_VENDA)
    .eq("id", vendaId)
    .maybeSingle();

  if (erroLeitura) {
    return { ok: false, erro: { status: 500, body: { error: erroLeitura.message } } };
  }
  if (!atual) {
    return { ok: false, erro: { status: 404, body: { error: "venda_nao_encontrada" } } };
  }

  const patch: Record<string, unknown> = {};
  let vinculado = Boolean(atual.projeto_id);

  if (payload.projeto_id !== undefined) {
    // Projeto inativo é aceito: vendas antigas referenciam produtos encerrados.
    const { data: projeto, error: erroProjeto } = await db
      .from("projetos")
      .select("id,nome")
      .eq("id", payload.projeto_id)
      .maybeSingle();
    if (erroProjeto) {
      return { ok: false, erro: { status: 500, body: { error: erroProjeto.message } } };
    }
    if (!projeto) {
      return {
        ok: false,
        erro: {
          status: 400,
          body: { error: "projeto_inexistente", projeto_id: payload.projeto_id },
        },
      };
    }
    patch.projeto_id = projeto.id;
    // Nome SEMPRE derivado do catálogo, nunca do cliente.
    patch.projeto_nome = projeto.nome;
    vinculado = true;
  }

  if (payload.empreendimento !== undefined) {
    if (atual.projeto_id) {
      return {
        ok: false,
        erro: {
          status: 409,
          body: { error: "venda_ja_vinculada", detalhe: "use projeto_id para trocar o vinculo" },
        },
      };
    }
    patch.projeto_nome = payload.empreendimento;
    vinculado = false;
  }

  if (payload.observacao !== undefined) patch.observacoes = payload.observacao;

  // Contagem de comissões antes: a alteração não pode mexer em nenhuma delas.
  const { count: comissoesAntes } = await db
    .from("comissoes")
    .select("id", { count: "exact", head: true })
    .eq("venda_id", vendaId);

  const { data: novo, error: erroUpdate } = await db
    .from("vendas")
    .update(patch)
    .eq("id", vendaId)
    .select(SELECT_VENDA)
    .single();

  if (erroUpdate || !novo) {
    return {
      ok: false,
      erro: { status: 500, body: { error: erroUpdate?.message ?? "falha_ao_atualizar" } },
    };
  }

  await auditarAlteracaoVenda(
    vendaId,
    atual as Record<string, unknown>,
    novo as Record<string, unknown>,
    contexto,
  );

  return {
    ok: true,
    venda: novo as Record<string, unknown>,
    anterior: {
      projeto_id: (atual.projeto_id ?? null) as string | null,
      empreendimento: (atual.projeto_nome ?? null) as string | null,
    },
    vinculado_ao_catalogo: vinculado,
    // O UPDATE não toca em status_venda, então o trigger de efeitos comerciais
    // (único que gera/estorna comissão) nem chega a disparar.
    comissoes_afetadas: 0,
  };
}

/** Grava uma linha por campo efetivamente alterado. Nunca lança. */
async function auditarAlteracaoVenda(
  vendaId: string,
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  contexto: ApiClientContext,
): Promise<void> {
  try {
    const campos = ["projeto_id", "projeto_nome", "observacoes"];
    const linhas = campos
      .filter((campo) => String(antes[campo] ?? "") !== String(depois[campo] ?? ""))
      .map((campo) => ({
        entidade: "venda",
        entidade_id: vendaId,
        campo,
        valor_anterior: antes[campo] == null ? null : String(antes[campo]),
        valor_novo: depois[campo] == null ? null : String(depois[campo]),
        api_cliente_id: contexto.clientId,
        api_cliente_nome: contexto.clientName,
      }));
    if (!linhas.length) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("api_alteracao_auditoria").insert(linhas);
    if (error) console.error("[vendas-write] auditoria falhou", error.message);
  } catch (error) {
    console.error("[vendas-write] excecao na auditoria", error);
  }
}

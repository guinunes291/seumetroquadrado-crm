// Núcleo de escrita da API pública de comissões (escopo `commissions:write`).
// Usado pelas rotas PATCH /api/public/comissoes/{id} e PATCH /api/public/comissoes (lote).
//
// Regras invioláveis:
//  - Só `status`, `data_pagamento` e `observacao` podem ser alterados.
//  - Valores financeiros (valor_comissao, valor_liquido, percentual) e o
//    beneficiário NUNCA são recalculados aqui.
//  - Nada é apagado — não existe DELETE.
//  - Toda alteração efetiva vira linha em `api_alteracao_auditoria`.
import type { ApiClientContext, ApiClientScope } from "@/lib/api-client-auth.server";

export const STATUS_ACEITOS = ["paga", "pendente", "pendente_assinatura", "cancelada"] as const;
export type StatusComissao = (typeof STATUS_ACEITOS)[number];

export const CAMPOS_PERMITIDOS = [
  "status",
  "data_pagamento",
  "observacao",
  "beneficiario_id",
  "motivo",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PatchErro = { status: number; body: Record<string, unknown> };

export type PatchPayload = {
  status?: StatusComissao;
  data_pagamento?: string | null;
  observacao?: string;
  beneficiario_id?: string;
  motivo?: string;
};

/**
 * Escopos exigidos pelo corpo. Trocar quem recebe dinheiro é mais sensível que
 * mudar status: exige o escopo dedicado `commissions:write:beneficiary`.
 */
export function escoposNecessarios(payload: PatchPayload): ApiClientScope[] {
  const escopos: ApiClientScope[] = [];
  if (
    payload.status !== undefined ||
    payload.data_pagamento !== undefined ||
    payload.observacao !== undefined
  ) {
    escopos.push("commissions:write");
  }
  if (payload.beneficiario_id !== undefined) escopos.push("commissions:write:beneficiary");
  return escopos.length ? escopos : ["commissions:write"];
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Valida o corpo (ou o item do lote). `camposExtraPermitidos` cobre o
 * `comissao_id` que só existe no formato de lote.
 */
export function validarPatch(
  corpo: unknown,
  camposExtraPermitidos: string[] = [],
): PatchPayload | PatchErro {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return { status: 400, body: { error: "corpo_invalido" } };
  }
  const obj = corpo as Record<string, unknown>;
  const permitidos = new Set<string>([...CAMPOS_PERMITIDOS, ...camposExtraPermitidos]);

  // O nome do beneficiário é SEMPRE derivado do cadastro no servidor.
  if ("beneficiario_nome" in obj) {
    return { status: 400, body: { error: "campo_nao_permitido", campo: "beneficiario_nome" } };
  }

  for (const campo of Object.keys(obj)) {
    if (!permitidos.has(campo)) {
      return { status: 400, body: { error: "campo_nao_permitido", campo } };
    }
  }

  const payload: PatchPayload = {};

  if ("status" in obj) {
    const status = obj.status;
    if (typeof status !== "string" || !STATUS_ACEITOS.includes(status as StatusComissao)) {
      return { status: 400, body: { error: "status_invalido", aceitos: [...STATUS_ACEITOS] } };
    }
    payload.status = status as StatusComissao;
  }

  if ("data_pagamento" in obj) {
    const data = obj.data_pagamento;
    if (data === null) {
      payload.data_pagamento = null;
    } else if (typeof data === "string" && DATE_RE.test(data) && !Number.isNaN(Date.parse(data))) {
      if (data > hojeISO()) {
        return { status: 400, body: { error: "data_pagamento_no_futuro" } };
      }
      payload.data_pagamento = data;
    } else {
      return { status: 400, body: { error: "data_pagamento_invalida" } };
    }
  }

  if ("observacao" in obj) {
    const obs = obj.observacao;
    if (typeof obs !== "string" || obs.length > 500) {
      return { status: 400, body: { error: "observacao_invalida" } };
    }
    payload.observacao = obs;
  }

  if ("beneficiario_id" in obj) {
    if (!isUuid(obj.beneficiario_id)) {
      return { status: 400, body: { error: "beneficiario_id_invalido" } };
    }
    payload.beneficiario_id = obj.beneficiario_id as string;
  }

  if ("motivo" in obj) {
    const motivo = obj.motivo;
    if (payload.beneficiario_id === undefined) {
      // `motivo` só existe para justificar troca de beneficiário.
      return { status: 400, body: { error: "campo_nao_permitido", campo: "motivo" } };
    }
    if (typeof motivo !== "string" || motivo.trim().length < 10 || motivo.length > 500) {
      return { status: 400, body: { error: "motivo_invalido" } };
    }
    payload.motivo = motivo.trim();
  }

  if (Object.keys(payload).length === 0) {
    return {
      status: 400,
      body: { error: "nenhum_campo_para_atualizar", aceitos: [...CAMPOS_PERMITIDOS] },
    };
  }

  if (payload.status === "paga" && !payload.data_pagamento) {
    return { status: 400, body: { error: "data_pagamento_obrigatoria" } };
  }

  return payload;
}

const SELECT_COMISSAO =
  "id,venda_id,lead_id,beneficiario_id,beneficiario_nome,tipo,status,data_pagamento," +
  "valor_base,percentual,valor_comissao,percentual_desconto,valor_liquido,contrato_vgv," +
  "observacoes,created_at,updated_at";

export type PatchResultado =
  | {
      ok: true;
      comissao: Record<string, unknown>;
      anterior: {
        status: string | null;
        data_pagamento: string | null;
        beneficiario_id: string | null;
        beneficiario_nome: string | null;
      };
    }
  | { ok: false; erro: PatchErro };

/** Aplica o patch em UMA comissão, audita e devolve o antes/depois. */
export async function aplicarPatchComissao(
  comissaoId: string,
  payload: PatchPayload,
  contexto: ApiClientContext,
): Promise<PatchResultado> {
  if (!isUuid(comissaoId)) {
    return { ok: false, erro: { status: 404, body: { error: "comissao_nao_encontrada" } } };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: atual, error: erroLeitura } = await db
    .from("comissoes")
    .select(SELECT_COMISSAO)
    .eq("id", comissaoId)
    .maybeSingle();

  if (erroLeitura) {
    return { ok: false, erro: { status: 500, body: { error: erroLeitura.message } } };
  }
  if (!atual) {
    return { ok: false, erro: { status: 404, body: { error: "comissao_nao_encontrada" } } };
  }

  const patch: Record<string, unknown> = {};

  if (payload.beneficiario_id !== undefined) {
    const statusAtual = String((atual as Record<string, unknown>).status ?? "");
    if (statusAtual === "paga" && !payload.motivo) {
      return {
        ok: false,
        erro: { status: 409, body: { error: "motivo_obrigatorio_comissao_paga" } },
      };
    }
    const { data: perfil, error: erroPerfil } = await db
      .from("profiles")
      .select("id,nome,ativo")
      .eq("id", payload.beneficiario_id)
      .maybeSingle();
    if (erroPerfil) {
      return { ok: false, erro: { status: 500, body: { error: erroPerfil.message } } };
    }
    if (!perfil) {
      return {
        ok: false,
        erro: {
          status: 400,
          body: { error: "beneficiario_inexistente", beneficiario_id: payload.beneficiario_id },
        },
      };
    }
    // Pessoa inativa NÃO é impedimento: "ativo" governa roleta/atendimento, não
    // a titularidade de uma comissão que já aconteceu. Exigimos apenas motivo.
    if (!perfil.ativo && !payload.motivo) {
      return {
        ok: false,
        erro: { status: 409, body: { error: "motivo_obrigatorio_beneficiario_inativo" } },
      };
    }
    beneficiarioAtivo = Boolean(perfil.ativo);
    patch.beneficiario_id = perfil.id;
    patch.beneficiario_nome = perfil.nome;
  }

  if (payload.status !== undefined) patch.status = payload.status;
  if (payload.data_pagamento !== undefined) patch.data_pagamento = payload.data_pagamento;
  if (payload.observacao !== undefined) patch.observacoes = payload.observacao;

  // Coerência status × data quando só o status vem no corpo.
  if (payload.status === "paga" && payload.data_pagamento === undefined) {
    if (!atual.data_pagamento) {
      return { ok: false, erro: { status: 400, body: { error: "data_pagamento_obrigatoria" } } };
    }
  }
  if (payload.status === "pendente" && payload.data_pagamento === undefined) {
    patch.data_pagamento = null;
  }

  const { data: novo, error: erroUpdate } = await db
    .from("comissoes")
    .update(patch)
    .eq("id", comissaoId)
    .select(SELECT_COMISSAO)
    .single();

  if (erroUpdate || !novo) {
    return {
      ok: false,
      erro: { status: 500, body: { error: erroUpdate?.message ?? "falha_ao_atualizar" } },
    };
  }

  await auditarAlteracao(
    comissaoId,
    atual as Record<string, unknown>,
    novo as Record<string, unknown>,
    contexto,
    payload.motivo ?? null,
  );

  return {
    ok: true,
    comissao: novo as Record<string, unknown>,
    anterior: {
      status: (atual as Record<string, unknown>).status as string,
      data_pagamento: ((atual as Record<string, unknown>).data_pagamento ?? null) as string | null,
      beneficiario_id: ((atual as Record<string, unknown>).beneficiario_id ?? null) as
        | string
        | null,
      beneficiario_nome: ((atual as Record<string, unknown>).beneficiario_nome ?? null) as
        | string
        | null,
    },
  };
}

/** Grava uma linha por campo efetivamente alterado. Nunca lança. */
async function auditarAlteracao(
  comissaoId: string,
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  contexto: ApiClientContext,
  motivo: string | null = null,
): Promise<void> {
  try {
    const campos = [
      "status",
      "data_pagamento",
      "observacoes",
      "beneficiario_id",
      "beneficiario_nome",
    ];
    const linhas = campos
      .filter((campo) => String(antes[campo] ?? "") !== String(depois[campo] ?? ""))
      .map((campo) => ({
        entidade: "comissoes",
        entidade_id: comissaoId,
        campo,
        valor_anterior: antes[campo] == null ? null : String(antes[campo]),
        valor_novo: depois[campo] == null ? null : String(depois[campo]),
        api_cliente_id: contexto.clientId,
        api_cliente_nome: contexto.clientName,
        motivo,
      }));
    if (!linhas.length) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("api_alteracao_auditoria")
      .insert(linhas);
    if (error) console.error("[comissoes-write] auditoria falhou", error.message);
  } catch (error) {
    console.error("[comissoes-write] excecao na auditoria", error);
  }
}

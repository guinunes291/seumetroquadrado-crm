// Núcleo server-only da tela "Financeiro · Fechamento".
//
// Regra de ouro: a tela NÃO reimplementa validação. Toda escrita em comissão
// passa por `validarPatch` + `aplicarPatchComissao` (exatamente o mesmo núcleo
// das rotas públicas /api/public/comissoes) e toda alteração vira linha em
// `api_alteracao_auditoria` — a diferença é apenas `origem = tela_financeiro`
// com o usuário logado.
//
// Nunca recalcula percentuais, nunca apaga nada, nunca cria comissão.
import {
  validarPatch,
  aplicarPatchComissao,
  type PatchErro,
} from "@/lib/comissoes-write.server";
import type { ApiClientContext } from "@/lib/api-client-auth.server";
import type {
  ComissaoOrfaItem,
  FilaItem,
  PainelFinanceiro,
  PessoaItem,
  ResultadoAcao,
  VendaItem,
  LinhaAuditoria,
} from "@/lib/financeiro-types";

export type * from "@/lib/financeiro-types";

const ABERTOS = ["pendente", "pendente_assinatura"];

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Contexto de auditoria da tela — mesmo formato usado pelas rotas públicas. */
export function contextoTela(usuarioId: string, usuarioNome: string): ApiClientContext {
  return {
    clientId: null,
    clientName: "Financeiro · Fechamento",
    scope: "commissions:write",
    equipeId: null,
    projetoId: null,
    mode: "client",
    origem: "tela_financeiro",
    usuarioId,
    usuarioNome,
  };
}

/** Admin ou gestor. Superintendente e corretor não entram. */
export async function podeOperarFinanceiro(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  userId: string,
): Promise<boolean> {
  const [{ data: admin }, { data: gestor }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "gestor" }),
  ]);
  return Boolean(admin) || Boolean(gestor);
}

export type EscopoFinanceiro = { veTudo: boolean; corretorIds: string[] };

/**
 * Escopo do financeiro (a tela usa service role, que fura RLS — o recorte é
 * aplicado aqui): admin vê tudo; GESTOR só o financeiro dele e dos corretores
 * da equipe (mesma régua de ve_carteira_completa/corretores_do_gestor).
 */
export async function escopoFinanceiro(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  userId: string,
): Promise<EscopoFinanceiro> {
  const { data: veTudo } = await supabase.rpc("ve_carteira_completa", { _user_id: userId });
  if (veTudo) return { veTudo: true, corretorIds: [] };
  const { data } = await supabase.rpc("corretores_do_gestor", { _user_id: userId });
  // SETOF uuid chega como array de strings; normaliza defensivamente.
  const ids = (Array.isArray(data) ? data : [])
    .map((r) => (typeof r === "string" ? r : ((r as any)?.corretores_do_gestor ?? (r as any)?.id)))
    .filter((v): v is string => typeof v === "string");
  return { veTudo: false, corretorIds: Array.from(new Set([...ids, userId])) };
}

export async function carregarPainel(escopo?: EscopoFinanceiro): Promise<PainelFinanceiro> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const hoje = new Date();
  const inicioMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const inicioProximo = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);

  const [comissoesRes, vendasRes, pessoasRes] = await Promise.all([
    db
      .from("comissoes")
      .select(
        "id,status,tipo,valor_liquido,valor_comissao,data_pagamento,observacoes,beneficiario_id,beneficiario_nome,venda_id,lead_id,created_at",
      )
      .in("status", [...ABERTOS, "paga"])
      .limit(5000),
    db
      .from("vendas")
      .select(
        "id,projeto_nome,corretor_id,lead_id,valor_venda,data_assinatura,status_recebimento,data_recebimento,status_venda",
      )
      .neq("status_venda", "cancelada")
      .limit(5000),
    db.from("profiles").select("id,nome,ativo").order("nome").limit(2000),
  ]);

  // Recorte por equipe (gestor): vendas do time; comissões cujo beneficiário
  // é do time OU cuja venda é do time; pessoas restritas ao time (selects).
  // Vendas SEM corretor são tarefa de atribuição do admin — ficam fora.
  const restringe = !!escopo && !escopo.veTudo;
  const idsEquipe = new Set(escopo?.corretorIds ?? []);
  const vendas: any[] = (vendasRes.data ?? []).filter(
    (v: any) => !restringe || (v.corretor_id && idsEquipe.has(v.corretor_id)),
  );
  const vendasVisiveis = new Set(vendas.map((v: any) => v.id));
  const comissoes: any[] = (comissoesRes.data ?? []).filter(
    (c: any) =>
      !restringe ||
      (c.beneficiario_id && idsEquipe.has(c.beneficiario_id)) ||
      (c.venda_id && vendasVisiveis.has(c.venda_id)),
  );
  const pessoas: PessoaItem[] = (pessoasRes.data ?? [])
    .filter((p: any) => !restringe || idsEquipe.has(p.id))
    .map((p: any) => ({
      id: p.id,
      nome: p.nome ?? "Sem nome",
      ativo: Boolean(p.ativo),
    }));
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p]));
  const vendaPorId = new Map(vendas.map((v) => [v.id, v]));

  // Nomes de clientes só dos leads envolvidos.
  const leadIds = Array.from(
    new Set([...comissoes, ...vendas].map((r: any) => r.lead_id).filter(Boolean)),
  ).slice(0, 2000);
  const leadNome = new Map<string, string>();
  if (leadIds.length) {
    const { data: leads } = await db.from("leads").select("id,nome").in("id", leadIds);
    for (const l of leads ?? []) leadNome.set(l.id, l.nome ?? "");
  }

  const abertas = comissoes.filter((c) => ABERTOS.includes(c.status));
  const pagasMes = comissoes.filter(
    (c) =>
      c.status === "paga" &&
      c.data_pagamento &&
      c.data_pagamento >= inicioMes &&
      c.data_pagamento < inicioProximo,
  );

  // Comissões cujo venda_id não resolve (nulo ou órfão) NÃO entram na fila de
  // pagamento — viram bloco de integridade, decidido linha a linha.
  const semVendaBruto = abertas.filter((c) => !c.venda_id || !vendaPorId.get(c.venda_id));
  const comVenda = abertas.filter((c) => c.venda_id && vendaPorId.get(c.venda_id));

  const comissoesSemVenda: ComissaoOrfaItem[] = semVendaBruto
    .map((c) => ({
      id: c.id,
      venda_id: c.venda_id ?? null,
      beneficiario_nome_bruto: c.beneficiario_nome ?? null,
      tipo: c.tipo,
      valor_liquido: num(c.valor_liquido),
      created_at: c.created_at ?? null,
    }))
    .sort((a, b) => b.valor_liquido - a.valor_liquido);

  const fila: FilaItem[] = comVenda
    .map((c) => {
      const venda = vendaPorId.get(c.venda_id);
      const recebido = venda?.status_recebimento === "recebido";
      const benef = c.beneficiario_id ? pessoaPorId.get(c.beneficiario_id) : null;
      const motivo: string | null = recebido ? null : "Venda ainda não recebida";
      return {
        id: c.id,
        status: c.status,
        tipo: c.tipo,
        valor_liquido: num(c.valor_liquido),
        valor_comissao: num(c.valor_comissao),
        data_pagamento: c.data_pagamento ?? null,
        observacoes: c.observacoes ?? null,
        beneficiario_id: c.beneficiario_id ?? null,
        beneficiario_nome: c.beneficiario_nome ?? benef?.nome ?? null,
        beneficiario_ativo: benef ? benef.ativo : null,
        venda_id: c.venda_id ?? null,
        projeto_nome: venda?.projeto_nome ?? null,
        data_assinatura: venda?.data_assinatura ?? null,
        valor_venda: venda ? num(venda.valor_venda) : null,
        status_recebimento: venda?.status_recebimento ?? null,
        data_recebimento: venda?.data_recebimento ?? null,
        cliente_nome:
          (c.lead_id ? leadNome.get(c.lead_id) : null) ??
          (venda?.lead_id ? leadNome.get(venda.lead_id) : null) ??
          null,
        travado: Boolean(motivo),
        motivo_travamento: motivo,
        aguardando_beneficiario: !motivo && !c.beneficiario_id,
      } satisfies FilaItem;
    })
    .sort((a, b) => Number(a.travado) - Number(b.travado) || b.valor_liquido - a.valor_liquido);

  const soma = (itens: { valor_liquido: number }[]) =>
    itens.reduce((acc, i) => acc + i.valor_liquido, 0);
  const travados = fila.filter((f) => f.travado);
  const aptos = fila.filter((f) => !f.travado);
  const aptosSemBenef = aptos.filter((f) => f.aguardando_beneficiario);


  const abertasPorVenda = new Map<string, { qtd: number; valor: number }>();
  for (const c of abertas) {
    if (!c.venda_id) continue;
    const atual = abertasPorVenda.get(c.venda_id) ?? { qtd: 0, valor: 0 };
    atual.qtd += 1;
    atual.valor += num(c.valor_liquido);
    abertasPorVenda.set(c.venda_id, atual);
  }

  const mapVenda = (v: any): VendaItem => {
    const agg = abertasPorVenda.get(v.id) ?? { qtd: 0, valor: 0 };
    const corretor = v.corretor_id ? pessoaPorId.get(v.corretor_id) : null;
    return {
      id: v.id,
      projeto_nome: v.projeto_nome ?? null,
      cliente_nome: v.lead_id ? (leadNome.get(v.lead_id) ?? null) : null,
      corretor_id: v.corretor_id ?? null,
      corretor_nome: corretor?.nome ?? null,
      valor_venda: num(v.valor_venda),
      data_assinatura: v.data_assinatura ?? null,
      status_recebimento: v.status_recebimento ?? null,
      data_recebimento: v.data_recebimento ?? null,
      status_venda: v.status_venda ?? null,
      comissoes_abertas: agg.qtd,
      valor_comissoes_abertas: agg.valor,
    };
  };

  const recebiveis = vendas
    .filter((v) => v.status_recebimento !== "recebido")
    .map(mapVenda)
    .sort((a, b) => (b.data_assinatura ?? "").localeCompare(a.data_assinatura ?? ""));

  const semCorretor = vendas
    .filter((v) => !v.corretor_id)
    .map(mapVenda)
    .sort((a, b) => (b.data_assinatura ?? "").localeCompare(a.data_assinatura ?? ""));

  const comissoesSemBenef = fila.filter((f) => !f.beneficiario_id);
  const comissoesBenefInativo = abertas.filter(
    (c) => c.beneficiario_id && pessoaPorId.get(c.beneficiario_id)?.ativo === false,
  );
  const pagasSemData = comissoes.filter((c) => c.status === "paga" && !c.data_pagamento);
  const abertasVendaRecebidaAntiga = fila.filter(
    (f) =>
      !f.travado &&
      f.data_recebimento &&
      Date.now() - new Date(f.data_recebimento).getTime() > 30 * 86400000,
  );

  return {
    cabecalho: {
      em_aberto: { valor: soma(fila), qtd: fila.length },
      sem_venda: { valor: soma(comissoesSemVenda), qtd: comissoesSemVenda.length },
      travado: { valor: soma(travados), qtd: travados.length },
      apto: { valor: soma(aptos), qtd: aptos.length },
      apto_sem_beneficiario: { valor: soma(aptosSemBenef), qtd: aptosSemBenef.length },
      pago_mes: {
        valor: pagasMes.reduce((acc, c) => acc + num(c.valor_liquido), 0),
        qtd: pagasMes.length,
      },
      referencia_mes: inicioMes.slice(0, 7),
    },
    fila,
    comissoes_sem_venda: comissoesSemVenda,
    recebiveis,
    vendas_sem_corretor: semCorretor,
    integridade: [
      {
        chave: "comissao_sem_venda",
        titulo: "Comissões abertas sem venda vinculada",
        descricao:
          "Fora da fila de pagamento: o venda_id não resolve para venda nenhuma. Decida linha a linha.",
        qtd: comissoesSemVenda.length,
        ids: comissoesSemVenda.map((c) => c.id),
      },

      {
        chave: "comissao_sem_beneficiario",
        titulo: "Comissões abertas sem beneficiário",
        descricao: "Defina o beneficiário na fila antes de pagar.",
        qtd: comissoesSemBenef.length,
        ids: comissoesSemBenef.map((c) => c.id),
      },
      {
        chave: "beneficiario_inativo",
        titulo: "Comissões abertas com beneficiário inativo",
        descricao: "Permitido pagar, mas confira se o beneficiário está correto.",
        qtd: comissoesBenefInativo.length,
        ids: comissoesBenefInativo.map((c) => c.id),
      },
      {
        chave: "venda_sem_corretor",
        titulo: "Vendas sem corretor",
        descricao: "Sem corretor, a comissão não tem titular claro.",
        qtd: semCorretor.length,
        ids: semCorretor.map((v) => v.id),
      },
      {
        chave: "paga_sem_data",
        titulo: "Comissões pagas sem data de pagamento",
        descricao: "Registre a data para o fechamento do mês bater.",
        qtd: pagasSemData.length,
        ids: pagasSemData.map((c) => c.id),
      },
      {
        chave: "apto_parado",
        titulo: "Aptos há mais de 30 dias do recebimento",
        descricao: "Venda recebida e comissão ainda em aberto.",
        qtd: abertasVendaRecebidaAntiga.length,
        ids: abertasVendaRecebidaAntiga.map((c) => c.id),
      },
    ],
    pessoas,
  };
}


export async function carregarHistorico(
  entidade: string | null,
  entidadeId: string | null,
  limite = 100,
): Promise<LinhaAuditoria[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  let q = db
    .from("api_alteracao_auditoria")
    .select(
      "id,created_at,entidade,entidade_id,campo,valor_anterior,valor_novo,motivo,origem,usuario_nome,api_cliente_nome",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(limite, 300));
  if (entidade) q = q.eq("entidade", entidade);
  if (entidadeId) q = q.eq("entidade_id", entidadeId);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    criado_em: r.created_at ?? null,
    entidade: r.entidade,
    entidade_id: r.entidade_id,
    campo: r.campo,
    valor_anterior: r.valor_anterior ?? null,
    valor_novo: r.valor_novo ?? null,
    motivo: r.motivo ?? null,
    origem: r.origem ?? "api",
    autor: r.usuario_nome ?? r.api_cliente_nome ?? "—",
  }));
}

function erroDe(e: PatchErro): ResultadoAcao {
  const body = e.body as Record<string, unknown>;
  return { ok: false, erro: String(body.error ?? "erro"), detalhe: JSON.stringify(body) };
}

/**
 * Escrita unitária da tela. Usa o mesmo validador das rotas públicas, com uma
 * regra adicional da tela: cancelar comissão exige motivo.
 */
/**
 * Ids de comissões FORA do escopo do chamador (a UI não as mostra, mas o
 * guard impede escrita cega por id). Ids inexistentes contam como fora.
 */
export async function comissoesForaDoEscopo(
  ids: string[],
  escopo: EscopoFinanceiro,
): Promise<string[]> {
  if (escopo.veTudo || ids.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data } = await db.from("comissoes").select("id,beneficiario_id,venda_id").in("id", ids);
  const rows: any[] = data ?? [];
  const vendaIds = rows.map((r) => r.venda_id).filter(Boolean);
  const vendaCorretor = new Map<string, string | null>();
  if (vendaIds.length) {
    const { data: vs } = await db.from("vendas").select("id,corretor_id").in("id", vendaIds);
    for (const v of vs ?? []) vendaCorretor.set(v.id, v.corretor_id);
  }
  const dentro = (r: any) =>
    (r.beneficiario_id && escopo.corretorIds.includes(r.beneficiario_id)) ||
    (r.venda_id && escopo.corretorIds.includes(vendaCorretor.get(r.venda_id) ?? ""));
  const encontrados = new Set(rows.map((r) => r.id));
  const fora = rows.filter((r) => !dentro(r)).map((r) => r.id as string);
  for (const id of ids) if (!encontrados.has(id)) fora.push(id);
  return fora;
}

/** True se a venda está fora do escopo (venda sem corretor = tarefa do admin). */
export async function vendaForaDoEscopo(
  vendaId: string,
  escopo: EscopoFinanceiro,
): Promise<boolean> {
  if (escopo.veTudo) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("vendas")
    .select("corretor_id")
    .eq("id", vendaId)
    .maybeSingle();
  return !data?.corretor_id || !escopo.corretorIds.includes(data.corretor_id);
}

export async function patchComissaoTela(
  corpo: Record<string, unknown>,
  contexto: ApiClientContext,
): Promise<ResultadoAcao> {
  const comissaoId = String(corpo.comissao_id ?? "");
  if (!comissaoId) return { ok: false, erro: "comissao_id_obrigatorio" };
  const { comissao_id: _ignorado, ...payloadBruto } = corpo;

  const validado = validarPatch(payloadBruto, [], { permitirMotivoLivre: true });
  if ("status" in validado && "body" in validado) return erroDe(validado as PatchErro);
  const payload = validado as Exclude<typeof validado, PatchErro>;

  if (payload.status === "cancelada" && !payload.motivo) {
    return { ok: false, erro: "motivo_obrigatorio_cancelamento" };
  }

  const resultado = await aplicarPatchComissao(comissaoId, payload, contexto);
  if (!resultado.ok) return erroDe(resultado.erro);
  return { ok: true };
}

/** Lote: aplica o mesmo patch a vários ids, item a item, sem parar no primeiro erro. */
export async function patchComissoesLoteTela(
  ids: string[],
  patch: Record<string, unknown>,
  contexto: ApiClientContext,
): Promise<{ processados: number; sucesso: number; falhas: { id: string; erro: string }[] }> {
  const falhas: { id: string; erro: string }[] = [];
  let sucesso = 0;
  for (const id of ids.slice(0, 200)) {
    const r = await patchComissaoTela({ ...patch, comissao_id: id }, contexto);
    if (r.ok) sucesso += 1;
    else falhas.push({ id, erro: r.erro });
  }
  return { processados: Math.min(ids.length, 200), sucesso, falhas };
}

/**
 * Define o corretor de uma venda órfã. Não altera valores nem percentuais e
 * não recalcula comissão — apenas vincula o titular e audita.
 */
export async function definirCorretorVendaTela(
  vendaId: string,
  corretorId: string,
  motivo: string,
  contexto: ApiClientContext,
): Promise<ResultadoAcao> {
  if (!vendaId || !corretorId) return { ok: false, erro: "parametros_invalidos" };
  if (motivo.trim().length < 10 || motivo.length > 500) return { ok: false, erro: "motivo_invalido" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: venda } = await db
    .from("vendas")
    .select("id,corretor_id")
    .eq("id", vendaId)
    .maybeSingle();
  if (!venda) return { ok: false, erro: "venda_nao_encontrada" };

  const { data: perfil } = await db
    .from("profiles")
    .select("id,nome")
    .eq("id", corretorId)
    .maybeSingle();
  if (!perfil) return { ok: false, erro: "corretor_inexistente" };

  const { error } = await db.from("vendas").update({ corretor_id: corretorId }).eq("id", vendaId);
  if (error) return { ok: false, erro: error.message };

  await db.from("api_alteracao_auditoria").insert({
    entidade: "venda",
    entidade_id: vendaId,
    campo: "corretor_id",
    valor_anterior: venda.corretor_id ? String(venda.corretor_id) : null,
    valor_novo: corretorId,
    api_cliente_id: null,
    api_cliente_nome: contexto.clientName,
    origem: contexto.origem ?? "tela_financeiro",
    usuario_id: contexto.usuarioId ?? null,
    usuario_nome: contexto.usuarioNome ?? null,
    motivo: motivo.trim(),
  });

  return { ok: true, mensagem: `Corretor definido: ${perfil.nome ?? corretorId}` };
}

// Núcleo server-only da aba "Financeiro · Conciliação" (Etapa 2).
//
// Regras: nada concilia sozinho (toda confirmação é clique humano), transação
// nunca é editada nem apagada, valor de comissão nunca muda, comissão nunca é
// criada a partir do extrato. A data real vira `data_pagamento` pelo MESMO
// núcleo de escrita das rotas públicas (`aplicarPatchComissao`), com motivo
// automático — o que satisfaz a exigência de motivo em comissão paga.
import { aplicarPatchComissao } from "@/lib/comissoes-write.server";
import type { ApiClientContext } from "@/lib/api-client-auth.server";
import { parseOfx } from "@/lib/ofx";
import type {
  ContaBancaria,
  PainelConciliacao,
  ResultadoConciliacao,
  ResultadoImportacao,
  SugestaoComissao,
  SugestaoVenda,
  TransacaoItem,
} from "@/lib/conciliacao-types";

export type * from "@/lib/conciliacao-types";

const CONTAS_VALIDAS: ContaBancaria[] = ["itau_ltda", "c6_ei"];
const BANCO_LABEL: Record<ContaBancaria, string> = {
  itau_ltda: "Itau",
  c6_ei: "C6",
};

const num = (v: unknown) => Number(v ?? 0) || 0;
const cents = (v: number) => Math.round(v * 100);

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/* ------------------------------------------------------------------ import */

export async function importarExtrato(
  conta: string,
  arquivo: string,
  conteudo: string,
  usuarioId: string,
): Promise<ResultadoImportacao> {
  if (!CONTAS_VALIDAS.includes(conta as ContaBancaria)) {
    return { ok: false, erro: "conta_invalida" };
  }
  if (typeof conteudo !== "string" || conteudo.length > 8_000_000) {
    return { ok: false, erro: "arquivo_invalido" };
  }

  const lido = parseOfx(conteudo);
  if (!lido.ok) {
    const detalhe =
      lido.erro === "arquivo_nao_e_ofx"
        ? "Este arquivo não é um OFX. Exporte o extrato em OFX no Itaú ou no C6 e importe de novo."
        : lido.erro === "ofx_sem_transacoes"
          ? "O OFX foi lido, mas não tem nenhum lançamento."
          : "Arquivo vazio.";
    return { ok: false, erro: lido.erro, detalhe };
  }

  const sb = await db();
  const linhas = lido.transacoes.map((t) => ({
    conta,
    data: t.data,
    valor: t.valor,
    descricao: t.descricao,
    contraparte: t.contraparte,
    fitid: t.fitid,
    arquivo: arquivo.slice(0, 200),
    importado_por: usuarioId,
  }));

  // Idempotente: (conta, fitid) é único; o que já existe é simplesmente ignorado.
  const { data, error } = await sb
    .from("extrato_transacoes")
    .upsert(linhas, { onConflict: "conta,fitid", ignoreDuplicates: true })
    .select("id");

  if (error) return { ok: false, erro: "falha_ao_importar", detalhe: error.message };

  const inseridas = (data ?? []).length;
  return {
    ok: true,
    lidas: linhas.length,
    inseridas,
    duplicadas: linhas.length - inseridas,
  };
}

/* ------------------------------------------------------------------ painel */

export async function carregarPainelConciliacao(): Promise<PainelConciliacao> {
  const sb = await db();

  const [transRes, concRes, comissoesRes, vendasRes] = await Promise.all([
    sb
      .from("extrato_transacoes")
      .select(
        "id,conta,data,valor,descricao,contraparte,fitid,arquivo,status,motivo_ignorada",
      )
      .order("data", { ascending: false })
      .limit(3000),
    sb
      .from("conciliacoes")
      .select(
        "id,transacao_id,tipo,comissao_id,venda_id,data_anterior,confirmado_por_nome,created_at,desfeito_em",
      )
      .is("desfeito_em", null)
      .limit(5000),
    sb
      .from("comissoes")
      .select("id,status,valor_liquido,data_pagamento,beneficiario_id,beneficiario_nome,venda_id")
      .eq("status", "paga")
      .limit(5000),
    sb
      .from("vendas")
      .select(
        "id,projeto_nome,lead_id,valor_venda,data_assinatura,status_recebimento,data_recebimento,status_venda",
      )
      .neq("status_venda", "cancelada")
      .limit(5000),
  ]);

  const transacoes: any[] = transRes.data ?? [];
  const conciliacoes: any[] = concRes.data ?? [];
  const comissoes: any[] = comissoesRes.data ?? [];
  const vendas: any[] = vendasRes.data ?? [];

  const vendaPorId = new Map(vendas.map((v) => [v.id, v]));

  const leadIds = Array.from(new Set(vendas.map((v) => v.lead_id).filter(Boolean))).slice(0, 2000);
  const leadNome = new Map<string, string>();
  if (leadIds.length) {
    const { data: leads } = await sb.from("leads").select("id,nome").in("id", leadIds);
    for (const l of leads ?? []) leadNome.set(l.id, l.nome ?? "");
  }

  const comissoesConciliadas = new Set(
    conciliacoes.filter((c) => c.tipo === "comissao").map((c) => c.comissao_id),
  );

  const rotuloComissao = (c: any) =>
    `${c.beneficiario_nome ?? "Sem beneficiário"} · ${(num(c.valor_liquido)).toFixed(2)}`;
  const comissaoPorId = new Map(comissoes.map((c) => [c.id, c]));

  const vinculosPorTransacao = new Map<string, TransacaoItem["vinculos"]>();
  for (const c of conciliacoes) {
    const lista = vinculosPorTransacao.get(c.transacao_id) ?? [];
    const alvoId = c.tipo === "comissao" ? c.comissao_id : c.venda_id;
    const venda = c.venda_id ? vendaPorId.get(c.venda_id) : null;
    lista.push({
      id: c.id,
      tipo: c.tipo,
      alvo_id: alvoId,
      rotulo:
        c.tipo === "comissao"
          ? comissaoPorId.get(c.comissao_id)
            ? rotuloComissao(comissaoPorId.get(c.comissao_id))
            : "Comissão"
          : `${venda?.projeto_nome ?? "Venda"}${
              venda?.lead_id ? ` · ${leadNome.get(venda.lead_id) ?? ""}` : ""
            }`,
      data_anterior: c.data_anterior ?? null,
      confirmado_por_nome: c.confirmado_por_nome ?? null,
      created_at: c.created_at ?? null,
    });
    vinculosPorTransacao.set(c.transacao_id, lista);
  }

  const itens: TransacaoItem[] = transacoes.map((t) => ({
    id: t.id,
    conta: t.conta,
    data: t.data,
    valor: num(t.valor),
    descricao: t.descricao ?? "",
    contraparte: t.contraparte ?? null,
    fitid: t.fitid,
    arquivo: t.arquivo ?? null,
    status: t.status,
    motivo_ignorada: t.motivo_ignorada ?? null,
    vinculos: vinculosPorTransacao.get(t.id) ?? [],
  }));

  // Sugestões só para o que está pendente.
  const abertasParaMatch = comissoes.filter((c) => !comissoesConciliadas.has(c.id));
  const sugestoes: PainelConciliacao["sugestoes"] = {};
  for (const t of itens) {
    if (t.status !== "pendente") continue;
    sugestoes[t.id] =
      t.valor < 0
        ? { debito: sugerirComissoes(t, abertasParaMatch, vendaPorId), credito: [] }
        : { debito: [], credito: sugerirVendas(t, vendas, leadNome) };
  }

  const valorTotal = comissoes.reduce((acc, c) => acc + num(c.valor_liquido), 0);
  const valorConciliado = comissoes
    .filter((c) => comissoesConciliadas.has(c.id))
    .reduce((acc, c) => acc + num(c.valor_liquido), 0);

  // Caixa conciliado: só transações conciliadas ou classificadas como ignoradas
  // entram como fato de caixa? Não — apenas as conciliadas contam.
  const caixaMap = new Map<string, { conta: ContaBancaria; mes: string; entradas: number; saidas: number }>();
  for (const t of itens) {
    if (t.status !== "conciliada") continue;
    const mes = t.data.slice(0, 7);
    const chave = `${t.conta}|${mes}`;
    const atual = caixaMap.get(chave) ?? { conta: t.conta, mes, entradas: 0, saidas: 0 };
    if (t.valor >= 0) atual.entradas += t.valor;
    else atual.saidas += Math.abs(t.valor);
    caixaMap.set(chave, atual);
  }

  return {
    progresso: {
      comissoes_pagas: comissoes.length,
      comissoes_conciliadas: comissoesConciliadas.size,
      valor_total: valorTotal,
      valor_conciliado: valorConciliado,
    },
    transacoes: itens,
    sugestoes,
    caixa: Array.from(caixaMap.values()).sort(
      (a, b) => b.mes.localeCompare(a.mes) || a.conta.localeCompare(b.conta),
    ),
  };
}

/* --------------------------------------------------------------- sugestões */

const TOLERANCIA = 1; // centavos

/** Débito ↔ comissões pagas: match exato e match de lote por beneficiário. */
function sugerirComissoes(
  transacao: TransacaoItem,
  comissoes: any[],
  vendaPorId: Map<string, any>,
): SugestaoComissao[] {
  const alvo = cents(Math.abs(transacao.valor));
  const descricao = normalizar(`${transacao.descricao} ${transacao.contraparte ?? ""}`);
  const sugestoes: SugestaoComissao[] = [];

  const pontuar = (nome: string, datas: (string | null)[]) => {
    let score = 0;
    const nomeNorm = normalizar(nome);
    const primeiroNome = nomeNorm.split(/\s+/)[0] ?? "";
    if (nomeNorm && descricao.includes(nomeNorm)) score += 60;
    else if (primeiroNome.length > 3 && descricao.includes(primeiroNome)) score += 30;
    const diffs = datas
      .filter(Boolean)
      .map((d) =>
        Math.abs(
          (new Date(`${transacao.data}T12:00:00`).getTime() -
            new Date(`${d}T12:00:00`).getTime()) /
            86400000,
        ),
      );
    if (diffs.length) score += Math.max(0, 30 - Math.min(...diffs));
    return Math.round(score);
  };

  const mapear = (c: any) => ({
    id: c.id,
    valor_liquido: num(c.valor_liquido),
    data_pagamento: c.data_pagamento ?? null,
    projeto_nome: c.venda_id ? (vendaPorId.get(c.venda_id)?.projeto_nome ?? null) : null,
  });

  // 1) Exato.
  for (const c of comissoes) {
    if (Math.abs(cents(num(c.valor_liquido)) - alvo) <= TOLERANCIA) {
      const nome = c.beneficiario_nome ?? "Sem beneficiário";
      sugestoes.push({
        tipo: "exato",
        beneficiario_nome: nome,
        comissoes: [mapear(c)],
        total: num(c.valor_liquido),
        score: 100 + pontuar(nome, [c.data_pagamento]),
      });
    }
  }

  // 2) Lote por beneficiário (rodada de quarta): subconjunto de até 10 comissões
  //    do mesmo beneficiário cuja soma bate com o débito.
  const porBeneficiario = new Map<string, any[]>();
  for (const c of comissoes) {
    if (!c.beneficiario_id) continue;
    const lista = porBeneficiario.get(c.beneficiario_id) ?? [];
    lista.push(c);
    porBeneficiario.set(c.beneficiario_id, lista);
  }

  for (const [, lista] of porBeneficiario) {
    if (lista.length < 2) continue;
    const candidatos = [...lista]
      .sort((a, b) => cents(num(b.valor_liquido)) - cents(num(a.valor_liquido)))
      .slice(0, 14);
    const conjunto = subconjuntoQueSoma(candidatos, alvo);
    if (!conjunto || conjunto.length < 2 || conjunto.length > 10) continue;
    const nome = conjunto[0].beneficiario_nome ?? "Sem beneficiário";
    sugestoes.push({
      tipo: "lote",
      beneficiario_nome: nome,
      comissoes: conjunto.map(mapear),
      total: conjunto.reduce((acc, c) => acc + num(c.valor_liquido), 0),
      score: 90 + pontuar(nome, conjunto.map((c) => c.data_pagamento)),
    });
  }

  return sugestoes.sort((a, b) => b.score - a.score).slice(0, 8);
}

/** Busca em profundidade limitada por um subconjunto que soma exatamente o alvo. */
function subconjuntoQueSoma(itens: any[], alvo: number): any[] | null {
  const valores = itens.map((c) => cents(num(c.valor_liquido)));
  const resultado: number[] = [];
  let passos = 0;

  const buscar = (i: number, restante: number, usados: number): boolean => {
    if (Math.abs(restante) <= TOLERANCIA && usados > 0) return true;
    if (i >= valores.length || usados >= 10 || restante < -TOLERANCIA) return false;
    if ((passos += 1) > 20000) return false;
    resultado.push(i);
    if (buscar(i + 1, restante - valores[i], usados + 1)) return true;
    resultado.pop();
    return buscar(i + 1, restante, usados);
  };

  return buscar(0, alvo, 0) ? resultado.map((i) => itens[i]) : null;
}

/** Crédito ↔ venda: casa por contraparte (construtora). Valor é sinal fraco. */
function sugerirVendas(
  transacao: TransacaoItem,
  vendas: any[],
  leadNome: Map<string, string>,
): SugestaoVenda[] {
  const descricao = normalizar(`${transacao.descricao} ${transacao.contraparte ?? ""}`);
  return vendas
    .map((v) => {
      let score = 0;
      const projeto = normalizar(v.projeto_nome ?? "");
      const primeiro = projeto.split(/\s+/)[0] ?? "";
      if (projeto && descricao.includes(projeto)) score += 60;
      else if (primeiro.length > 3 && descricao.includes(primeiro)) score += 35;
      if (v.status_recebimento !== "recebido") score += 15;
      if (v.data_assinatura && v.data_assinatura <= transacao.data) score += 10;
      return {
        venda_id: v.id,
        projeto_nome: v.projeto_nome ?? null,
        cliente_nome: v.lead_id ? (leadNome.get(v.lead_id) ?? null) : null,
        valor_venda: num(v.valor_venda),
        data_assinatura: v.data_assinatura ?? null,
        status_recebimento: v.status_recebimento ?? null,
        score,
      } satisfies SugestaoVenda;
    })
    .filter((s) => s.score >= 35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

/* ------------------------------------------------------------------- ações */

async function buscarTransacao(id: string) {
  const sb = await db();
  const { data } = await sb
    .from("extrato_transacoes")
    .select("id,conta,data,valor,descricao,fitid,status")
    .eq("id", id)
    .maybeSingle();
  return data;
}

function motivoAutomatico(t: any): string {
  const banco = BANCO_LABEL[(t.conta as ContaBancaria)] ?? t.conta;
  const fitidCurto = String(t.fitid ?? "").slice(-8);
  return `conciliacao bancaria ${banco} ${t.data} ${fitidCurto}`;
}

/** Confirma o vínculo débito ↔ comissões pagas e grava a data real. */
export async function conciliarComissoes(
  transacaoId: string,
  comissaoIds: string[],
  contexto: ApiClientContext,
): Promise<ResultadoConciliacao> {
  if (!transacaoId || !comissaoIds?.length) return { ok: false, erro: "parametros_invalidos" };
  if (comissaoIds.length > 10) return { ok: false, erro: "lote_muito_grande" };

  const sb = await db();
  const t = await buscarTransacao(transacaoId);
  if (!t) return { ok: false, erro: "transacao_nao_encontrada" };
  if (t.status === "ignorada") return { ok: false, erro: "transacao_ignorada" };
  if (num(t.valor) >= 0) return { ok: false, erro: "transacao_nao_e_debito" };

  const { data: jaVinculadas } = await sb
    .from("conciliacoes")
    .select("comissao_id")
    .in("comissao_id", comissaoIds)
    .is("desfeito_em", null);
  if ((jaVinculadas ?? []).length) {
    return { ok: false, erro: "comissao_ja_conciliada" };
  }

  const motivo = motivoAutomatico(t);
  const aplicadas: string[] = [];

  for (const comissaoId of comissaoIds) {
    const { data: atual } = await sb
      .from("comissoes")
      .select("id,status,data_pagamento")
      .eq("id", comissaoId)
      .maybeSingle();
    if (!atual) return { ok: false, erro: "comissao_nao_encontrada", detalhe: comissaoId };
    if (atual.status !== "paga") return { ok: false, erro: "comissao_nao_paga", detalhe: comissaoId };

    const anterior = atual.data_pagamento ?? null;
    if (anterior !== t.data) {
      const r = await aplicarPatchComissao(
        comissaoId,
        { data_pagamento: t.data, motivo },
        contexto,
      );
      if (!r.ok) {
        return {
          ok: false,
          erro: String((r.erro.body as Record<string, unknown>).error ?? "falha"),
          detalhe: comissaoId,
        };
      }
    }

    await sb.from("conciliacoes").insert({
      transacao_id: transacaoId,
      tipo: "comissao",
      comissao_id: comissaoId,
      data_anterior: anterior,
      data_aplicada: t.data,
      confirmado_por: contexto.usuarioId ?? null,
      confirmado_por_nome: contexto.usuarioNome ?? null,
    });
    aplicadas.push(comissaoId);
  }

  await sb
    .from("extrato_transacoes")
    .update({ status: "conciliada", motivo_ignorada: null })
    .eq("id", transacaoId);

  return { ok: true, mensagem: `${aplicadas.length} comissão(ões) conciliada(s) em ${t.data}` };
}

/** Confirma crédito ↔ venda: marca recebido com a data real do extrato. */
export async function conciliarVendas(
  transacaoId: string,
  vendaIds: string[],
  contexto: ApiClientContext,
): Promise<ResultadoConciliacao> {
  if (!transacaoId || !vendaIds?.length) return { ok: false, erro: "parametros_invalidos" };

  const sb = await db();
  const t = await buscarTransacao(transacaoId);
  if (!t) return { ok: false, erro: "transacao_nao_encontrada" };
  if (t.status === "ignorada") return { ok: false, erro: "transacao_ignorada" };
  if (num(t.valor) <= 0) return { ok: false, erro: "transacao_nao_e_credito" };

  for (const vendaId of vendaIds.slice(0, 20)) {
    const { data: venda } = await sb
      .from("vendas")
      .select("id,status_recebimento,data_recebimento")
      .eq("id", vendaId)
      .maybeSingle();
    if (!venda) return { ok: false, erro: "venda_nao_encontrada", detalhe: vendaId };

    const anterior = venda.data_recebimento ?? null;
    // Mesmo caminho de escrita de sempre: o trigger de efeitos de status roda.
    const { error } = await sb
      .from("vendas")
      .update({ status_recebimento: "recebido", data_recebimento: t.data })
      .eq("id", vendaId);
    if (error) return { ok: false, erro: "falha_ao_atualizar_venda", detalhe: error.message };

    await sb.from("conciliacoes").insert({
      transacao_id: transacaoId,
      tipo: "venda",
      venda_id: vendaId,
      data_anterior: anterior,
      data_aplicada: t.data,
      confirmado_por: contexto.usuarioId ?? null,
      confirmado_por_nome: contexto.usuarioNome ?? null,
    });

    await sb.from("api_alteracao_auditoria").insert([
      {
        entidade: "vendas",
        entidade_id: vendaId,
        campo: "data_recebimento",
        valor_anterior: anterior,
        valor_novo: t.data,
        api_cliente_id: null,
        api_cliente_nome: contexto.clientName,
        origem: contexto.origem ?? "tela_financeiro",
        usuario_id: contexto.usuarioId ?? null,
        usuario_nome: contexto.usuarioNome ?? null,
        motivo: motivoAutomatico(t),
      },
      {
        entidade: "vendas",
        entidade_id: vendaId,
        campo: "status_recebimento",
        valor_anterior: venda.status_recebimento ?? null,
        valor_novo: "recebido",
        api_cliente_id: null,
        api_cliente_nome: contexto.clientName,
        origem: contexto.origem ?? "tela_financeiro",
        usuario_id: contexto.usuarioId ?? null,
        usuario_nome: contexto.usuarioNome ?? null,
        motivo: motivoAutomatico(t),
      },
    ]);
  }

  await sb
    .from("extrato_transacoes")
    .update({ status: "conciliada", motivo_ignorada: null })
    .eq("id", transacaoId);

  return { ok: true, mensagem: `Recebimento registrado em ${t.data}` };
}

/** Desfaz a conciliação da transação: restaura datas anteriores e audita. */
export async function desconciliarTransacao(
  transacaoId: string,
  contexto: ApiClientContext,
): Promise<ResultadoConciliacao> {
  const sb = await db();
  const t = await buscarTransacao(transacaoId);
  if (!t) return { ok: false, erro: "transacao_nao_encontrada" };

  const { data: vinculos } = await sb
    .from("conciliacoes")
    .select("id,tipo,comissao_id,venda_id,data_anterior")
    .eq("transacao_id", transacaoId)
    .is("desfeito_em", null);

  if (!(vinculos ?? []).length) return { ok: false, erro: "sem_vinculos" };

  const motivo = `desfazimento de ${motivoAutomatico(t)}`;

  for (const v of vinculos ?? []) {
    if (v.tipo === "comissao") {
      const r = await aplicarPatchComissao(
        v.comissao_id,
        { data_pagamento: v.data_anterior ?? null, motivo },
        contexto,
      );
      if (!r.ok && v.data_anterior) {
        return {
          ok: false,
          erro: String((r.erro.body as Record<string, unknown>).error ?? "falha_ao_desfazer"),
        };
      }
    } else if (v.venda_id) {
      const { data: venda } = await sb
        .from("vendas")
        .select("data_recebimento")
        .eq("id", v.venda_id)
        .maybeSingle();
      await sb
        .from("vendas")
        .update({ data_recebimento: v.data_anterior ?? null })
        .eq("id", v.venda_id);
      await sb.from("api_alteracao_auditoria").insert({
        entidade: "vendas",
        entidade_id: v.venda_id,
        campo: "data_recebimento",
        valor_anterior: venda?.data_recebimento ?? null,
        valor_novo: v.data_anterior ?? null,
        api_cliente_id: null,
        api_cliente_nome: contexto.clientName,
        origem: contexto.origem ?? "tela_financeiro",
        usuario_id: contexto.usuarioId ?? null,
        usuario_nome: contexto.usuarioNome ?? null,
        motivo,
      });
    }

    await sb
      .from("conciliacoes")
      .update({
        desfeito_em: new Date().toISOString(),
        desfeito_por: contexto.usuarioId ?? null,
        desfeito_por_nome: contexto.usuarioNome ?? null,
      })
      .eq("id", v.id);
  }

  await sb.from("extrato_transacoes").update({ status: "pendente" }).eq("id", transacaoId);
  return { ok: true, mensagem: "Conciliação desfeita e datas restauradas" };
}

/** Ignora uma transação (tarifa, despesa, transferência entre contas). */
export async function ignorarTransacao(
  transacaoId: string,
  motivo: string,
  contexto: ApiClientContext,
): Promise<ResultadoConciliacao> {
  const texto = (motivo ?? "").trim();
  if (!transacaoId) return { ok: false, erro: "parametros_invalidos" };
  if (texto.length < 4 || texto.length > 300) return { ok: false, erro: "motivo_invalido" };

  const sb = await db();
  const t = await buscarTransacao(transacaoId);
  if (!t) return { ok: false, erro: "transacao_nao_encontrada" };
  if (t.status === "conciliada") return { ok: false, erro: "transacao_conciliada" };

  const { error } = await sb
    .from("extrato_transacoes")
    .update({ status: "ignorada", motivo_ignorada: texto })
    .eq("id", transacaoId);
  if (error) return { ok: false, erro: error.message };

  await sb.from("api_alteracao_auditoria").insert({
    entidade: "extrato_transacoes",
    entidade_id: transacaoId,
    campo: "status",
    valor_anterior: t.status,
    valor_novo: "ignorada",
    api_cliente_id: null,
    api_cliente_nome: contexto.clientName,
    origem: contexto.origem ?? "tela_financeiro",
    usuario_id: contexto.usuarioId ?? null,
    usuario_nome: contexto.usuarioNome ?? null,
    motivo: texto,
  });

  return { ok: true, mensagem: "Transação ignorada" };
}

/** Volta uma transação ignorada para a fila de pendentes. */
export async function reativarTransacao(
  transacaoId: string,
  contexto: ApiClientContext,
): Promise<ResultadoConciliacao> {
  const sb = await db();
  const t = await buscarTransacao(transacaoId);
  if (!t) return { ok: false, erro: "transacao_nao_encontrada" };
  if (t.status !== "ignorada") return { ok: false, erro: "transacao_nao_ignorada" };

  await sb
    .from("extrato_transacoes")
    .update({ status: "pendente", motivo_ignorada: null })
    .eq("id", transacaoId);

  await sb.from("api_alteracao_auditoria").insert({
    entidade: "extrato_transacoes",
    entidade_id: transacaoId,
    campo: "status",
    valor_anterior: "ignorada",
    valor_novo: "pendente",
    api_cliente_id: null,
    api_cliente_nome: contexto.clientName,
    origem: contexto.origem ?? "tela_financeiro",
    usuario_id: contexto.usuarioId ?? null,
    usuario_nome: contexto.usuarioNome ?? null,
    motivo: "reativada para conciliação",
  });

  return { ok: true, mensagem: "Transação de volta na fila" };
}

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

  // Gêmeos de transferência entre contas próprias: crédito de MESMO valor e
  // MESMA data em outra conta importada.
  const creditosPorChave = new Map<string, Set<string>>();
  for (const t of transacoes) {
    if (num(t.valor) <= 0) continue;
    const chave = `${t.data}|${cents(Math.abs(num(t.valor)))}`;
    const contas = creditosPorChave.get(chave) ?? new Set<string>();
    contas.add(t.conta);
    creditosPorChave.set(chave, contas);
  }
  const temGemeo = (t: any) => {
    if (num(t.valor) >= 0) return false;
    const contas = creditosPorChave.get(`${t.data}|${cents(Math.abs(num(t.valor)))}`);
    if (!contas) return false;
    return Array.from(contas).some((c) => c !== t.conta);
  };

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
    gemeo_transferencia: temGemeo(t),
    vinculos: vinculosPorTransacao.get(t.id) ?? [],
  }));

  // Sugestões só para o que está pendente.
  const abertasParaMatch = comissoes.filter((c) => !comissoesConciliadas.has(c.id));
  const sugestoes: PainelConciliacao["sugestoes"] = {};
  for (const t of itens) {
    if (t.status !== "pendente") continue;
    sugestoes[t.id] =
      t.valor < 0
        ? { debito: sugerirComissoes(t, abertasParaMatch, vendaPorId, leadNome), credito: [] }
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

const TOL_EXATO = 5; // centavos
const TOL_LOTE = 10; // centavos
const QUASE_PCT = 0.01; // 1% do valor do débito

/**
 * Débito ↔ comissões pagas. Testa 4 modos: exato integral, exato ×0,94 (NF),
 * lote integral e lote ×0,94; além disso marca como "quase" o que fica dentro
 * de 1% de diferença. Nada é aplicado aqui — só sugerido.
 */
function sugerirComissoes(
  transacao: TransacaoItem,
  comissoes: any[],
  vendaPorId: Map<string, any>,
  leadNome: Map<string, string>,
): SugestaoComissao[] {
  const alvo = cents(Math.abs(transacao.valor));
  const quaseTol = Math.max(TOL_EXATO, Math.round(alvo * QUASE_PCT));
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

  /** MEMO do PIX cita o cliente ou o empreendimento da venda da comissão. */
  const citaVenda = (conjunto: any[]) =>
    conjunto.some((c) => {
      const venda = c.venda_id ? vendaPorId.get(c.venda_id) : null;
      if (!venda) return false;
      const alvos = [venda.projeto_nome ?? "", venda.lead_id ? (leadNome.get(venda.lead_id) ?? "") : ""];
      return alvos.some((texto) => {
        const norm = normalizar(texto).trim();
        if (norm.length > 5 && descricao.includes(norm)) return true;
        // Também aceita a combinação de duas palavras significativas do nome.
        const partes = norm.split(/\s+/).filter((p) => p.length > 3);
        return partes.length >= 2 && partes.filter((p) => descricao.includes(p)).length >= 2;
      });
    });

  const adicionar = (
    tipo: "exato" | "lote",
    modo: "integral" | "liquido_nf",
    conjunto: any[],
    diffCents: number,
    forte: boolean,
  ) => {
    const nome = conjunto[0].beneficiario_nome ?? "Sem beneficiário";
    const cita = citaVenda(conjunto);
    const base = tipo === "exato" ? 100 : 90;
    sugestoes.push({
      tipo,
      modo,
      forca: forte ? "forte" : "quase",
      diferenca: diffCents / 100,
      cita_venda: cita,
      beneficiario_nome: nome,
      comissoes: conjunto.map(mapear),
      total: conjunto.reduce((acc, c) => acc + num(c.valor_liquido), 0),
      score:
        base +
        pontuar(nome, conjunto.map((c) => c.data_pagamento)) +
        (forte ? 0 : -60) +
        (cita ? 250 : 0),
    });
  };

  // 1 e 2) Exato integral e exato ×0,94.
  for (const c of comissoes) {
    const valor = cents(num(c.valor_liquido));
    const modos: [("integral" | "liquido_nf"), number][] = [
      ["integral", valor],
      ["liquido_nf", Math.round(num(c.valor_liquido) * FATOR_NF * 100)],
    ];
    let jaForte = false;
    for (const [modo, esperado] of modos) {
      const diff = Math.abs(esperado - alvo);
      if (diff <= TOL_EXATO) {
        adicionar("exato", modo, [c], diff, true);
        jaForte = true;
      } else if (!jaForte && diff <= quaseTol) {
        adicionar("exato", modo, [c], diff, false);
      }
    }
  }

  // 3 e 4) Lote por beneficiário — nunca para débito com gêmeo de transferência
  //        entre contas próprias (evita o falso positivo perigoso).
  if (!transacao.gemeo_transferencia) {
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

      const modos: [("integral" | "liquido_nf"), number][] = [
        ["integral", alvo],
        ["liquido_nf", Math.round(alvo / FATOR_NF)],
      ];
      for (const [modo, somaAlvo] of modos) {
        const tolBusca = Math.max(TOL_LOTE, Math.round(somaAlvo * QUASE_PCT));
        const conjunto = subconjuntoQueSoma(candidatos, somaAlvo, tolBusca);
        if (!conjunto || conjunto.length < 2 || conjunto.length > 10) continue;
        const soma = conjunto.reduce((acc, c) => acc + num(c.valor_liquido), 0);
        const esperado = Math.round(soma * (modo === "integral" ? 1 : FATOR_NF) * 100);
        const diff = Math.abs(esperado - alvo);
        if (diff <= TOL_LOTE) adicionar("lote", modo, conjunto, diff, true);
        else if (diff <= quaseTol) adicionar("lote", modo, conjunto, diff, false);
      }
    }
  }

  // Uma sugestão por conjunto de comissões: fica a de maior score.
  const melhores = new Map<string, SugestaoComissao>();
  for (const s of sugestoes) {
    const chave = s.comissoes
      .map((c) => c.id)
      .sort()
      .join("|");
    const atual = melhores.get(chave);
    if (!atual || s.score > atual.score) melhores.set(chave, s);
  }

  return Array.from(melhores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

/** Busca em profundidade limitada por um subconjunto que soma o alvo (± tolerância). */
function subconjuntoQueSoma(itens: any[], alvo: number, tolerancia: number): any[] | null {
  const valores = itens.map((c) => cents(num(c.valor_liquido)));
  const resultado: number[] = [];
  let passos = 0;

  const buscar = (i: number, restante: number, usados: number): boolean => {
    if (Math.abs(restante) <= tolerancia && usados > 0) return true;
    if (i >= valores.length || usados >= 10 || restante < -tolerancia) return false;
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

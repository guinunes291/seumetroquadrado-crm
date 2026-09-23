// Aprovação de crédito com DADOS (migration 20260927120000): encaixe da
// aprovação em produtos, saneamento da leitura por IA e contratos de
// migration/IA/relatório.
//
// Caso-âncora: um retorno REAL da Caixa ("Simulador – Detalhamento", SIRIC)
// enviado pelo dono — imóvel R$ 275.000, financiamento R$ 210.222,91,
// prestação máxima R$ 1.404,79, renda R$ 4.682,64, 2 participantes, sem FGTS
// há 3 anos. Os números abaixo são dele (sem dado pessoal).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  avaliarEncaixe,
  DADOS_APROVACAO_VAZIOS,
  dadosParaForm,
  encaixarProduto,
  faixaPelaRenda,
  formParaDados,
  mesclarExtracao,
  poderDeCompra,
  rankearProdutos,
  sanearEntradaDoSimulador,
  tetoDeImovel,
  validarDadosAprovacao,
  type DadosAprovacao,
  type ProdutoCandidato,
} from "@/features/leads/aprovacao-credito";
import { montarCsvAprovacoes } from "@/features/dashboard/relatorios-aprovacoes-tab";
import type { AprovacaoVigenteRow } from "@/integrations/supabase/aprovacao-pendente";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** O retorno SIRIC real, como a IA o leria SE caísse na armadilha da "entrada". */
const SIRIC_LIDO: DadosAprovacao = {
  ...DADOS_APROVACAO_VAZIOS,
  banco: "Caixa",
  modalidade: "mcmv",
  sistema_amortizacao: "price",
  valor_financiamento: 210222.91,
  valor_parcela: 1404.79,
  prazo_meses: 420,
  taxa_juros_anual: 7,
  valor_imovel_max: 275000,
  renda_familiar: 4682.64,
  qtd_participantes: 2,
  cotista_fgts: false,
  // No simulador, "Valor de entrada" = imóvel − financiamento. NÃO é recurso.
  valor_entrada: 64777.09,
};
const SIRIC = sanearEntradaDoSimulador(SIRIC_LIDO);

const produto = (p: Partial<ProdutoCandidato> & { id: string }): ProdutoCandidato => ({
  nome: p.id,
  construtora: null,
  bairro: null,
  cidade: null,
  preco_a_partir: null,
  renda_minima: null,
  ...p,
});

describe("retorno real da Caixa (SIRIC)", () => {
  it("descarta a 'entrada' do simulador — ela é a diferença imóvel − financiamento", () => {
    expect(SIRIC.valor_entrada).toBeNull();
    expect(poderDeCompra(SIRIC)).toBeCloseTo(210222.91, 2);
    // Entrada que NÃO bate com a diferença é recurso de verdade: fica.
    const real = sanearEntradaDoSimulador({ ...SIRIC_LIDO, valor_entrada: 15000 });
    expect(real.valor_entrada).toBe(15000);
  });

  it("sem o saneamento, o imóvel de R$ 275 mil 'caberia' com construtora 0% — o bug evitado", () => {
    expect(avaliarEncaixe(275000, SIRIC_LIDO).nivel).toBe("cabe");
    expect(avaliarEncaixe(275000, SIRIC_LIDO).saldoConstrutora).toBe(0);
  });

  it("com o saneamento, R$ 275 mil exige 23,6% com a construtora → cabe com esforço", () => {
    const e = avaliarEncaixe(275000, SIRIC);
    expect(e.nivel).toBe("esforco");
    expect(e.saldoConstrutora).toBe(64777);
    expect(e.percentualConstrutora).toBe(23.6);
  });

  it("FGTS de R$ 10 mil derruba o saldo abaixo de 20% → cabe", () => {
    expect(avaliarEncaixe(275000, { ...SIRIC, valor_fgts: 10000 }).nivel).toBe("cabe");
  });

  it("teto de imóvel = poder de compra / 0,8, limitado ao valor máximo aprovado", () => {
    expect(tetoDeImovel(SIRIC)).toBe(262779);
    expect(tetoDeImovel({ ...SIRIC, valor_fgts: 30000 })).toBe(275000);
    // No teto, cabe; um real acima já não cabe limpo.
    expect(avaliarEncaixe(262779, SIRIC).nivel).toBe("cabe");
  });

  it("imóvel acima do valor máximo aprovado nunca cabe", () => {
    const e = avaliarEncaixe(290000, { ...SIRIC, valor_fgts: 100000 });
    expect(e.nivel).toBe("nao_cabe");
    expect(e.alertas.join(" ")).toContain("valor máximo de imóvel aprovado");
  });

  it("faixa pela renda: R$ 4.682,64 → Faixa 2 (o simulador não traz a faixa)", () => {
    expect(faixaPelaRenda(4682.64)).toBe("2");
    expect(faixaPelaRenda(null)).toBeNull();
    expect(faixaPelaRenda(100)).toBeNull(); // abaixo da tabela
  });
});

describe("ranking de produtos para a aprovação", () => {
  const catalogo = [
    produto({ id: "A", preco_a_partir: 250000 }), // cabe
    produto({ id: "B", preco_a_partir: 270000 }), // 22,1% → esforço
    produto({ id: "C", preco_a_partir: 400000 }), // acima do máximo → fora
    produto({ id: "D", preco_a_partir: null }), // sob consulta → ignorado
    produto({ id: "E", valores_unidades: [240000, 262000, 300000] }), // 2 unidades cabem
    produto({ id: "F", preco_a_partir: 200000, renda_minima: 5000 }), // renda abaixo → esforço
  ];

  it("cabe primeiro, depois esforço; dentro do grupo o mais caro primeiro", () => {
    const r = rankearProdutos(catalogo, SIRIC);
    expect(r.sugestoes.map((s) => s.produto.id)).toEqual(["E", "A", "B", "F"]);
    expect(r.totalCabe).toBe(2);
    expect(r.totalEsforco).toBe(2);
    expect(r.totalAvaliados).toBe(5); // D (sob consulta) não entra na conta
  });

  it("com estoque, conta as unidades que cabem e usa a MAIS CARA delas", () => {
    const e = encaixarProduto(catalogo[4], SIRIC)!;
    expect(e.unidadesQueCabem).toBe(2);
    expect(e.precoReferencia).toBe(262000);
    expect(e.encaixe.nivel).toBe("cabe");
  });

  it("renda abaixo da mínima do empreendimento rebaixa para esforço, com o motivo", () => {
    const e = encaixarProduto(catalogo[5], SIRIC)!;
    expect(e.encaixe.nivel).toBe("esforco");
    expect(e.encaixe.alertas.join(" ")).toContain("renda mínima");
  });

  it("respeita o limite de sugestões", () => {
    expect(rankearProdutos(catalogo, SIRIC, 2).sugestoes).toHaveLength(2);
  });
});

describe("formulário da aprovação", () => {
  it("financiamento e parcela são obrigatórios; parcela > financiamento é erro", () => {
    expect(validarDadosAprovacao(DADOS_APROVACAO_VAZIOS)).toHaveLength(2);
    expect(validarDadosAprovacao(SIRIC)).toEqual([]);
    expect(validarDadosAprovacao({ ...SIRIC, valor_parcela: 300000 }).join(" ")).toContain(
      "parcela não pode ser maior",
    );
    expect(
      validarDadosAprovacao({ ...SIRIC, data_aprovacao: "2026-09-20", validade_ate: "2026-09-01" }),
    ).toHaveLength(1);
  });

  it("ida e volta form ⇄ dados preserva os valores em formato pt-BR", () => {
    const form = dadosParaForm(SIRIC);
    expect(form.valor_financiamento).toBe("210.222,91");
    expect(form.taxa_juros_anual).toBe("7");
    expect(formParaDados(form).valor_financiamento).toBeCloseTo(210222.91, 2);
    expect(formParaDados(form).prazo_meses).toBe(420);
  });

  it("a leitura da IA só preenche campo vazio — o que o corretor digitou fica", () => {
    const atual = { ...dadosParaForm({}), valor_parcela: "1.500,00" };
    const out = mesclarExtracao(atual, SIRIC);
    expect(out.valor_parcela).toBe("1.500,00");
    expect(out.valor_financiamento).toBe("210.222,91");
    expect(out.banco).toBe("Caixa");
  });
});

describe("CSV do relatório", () => {
  it("separador ';', BOM para o Excel e decimal com vírgula", () => {
    const r = {
      lead_nome: 'Cliente "Teste"; Silva',
      lead_telefone: "11999990000",
      lead_status: "analise_credito",
      banco: "Caixa",
      valor_financiamento: 210222.91,
      valor_parcela: 1404.79,
      poder_compra: 210222.91,
    } as unknown as AprovacaoVigenteRow;
    const csv = montarCsvAprovacoes([{ r, corretor: "Ana" }]);
    expect(csv.startsWith("﻿Cliente;Telefone")).toBe(true);
    expect(csv).toContain('"Cliente ""Teste""; Silva"');
    expect(csv).toContain("210222,91");
  });
});

describe("contratos", () => {
  const sql = read("supabase/migrations/20260927120000_aprovacao_credito_dados.sql");
  const codigo = sql.replace(/--[^\n]*/g, "");
  const ia = read("src/lib/aprovacao-ia.functions.ts");

  it("migration: colunas aditivas, CHECKs NOT VALID e poder de compra gerado", () => {
    expect(codigo).toContain("ADD COLUMN IF NOT EXISTS valor_financiamento numeric(12,2)");
    expect(codigo).toContain("ADD COLUMN IF NOT EXISTS valor_parcela numeric(12,2)");
    expect(codigo).toContain("REFERENCES public.documentacoes(id) ON DELETE SET NULL");
    expect(codigo).toMatch(/poder_compra numeric\(12,2\)\s+GENERATED ALWAYS AS/);
    expect(codigo.match(/NOT VALID/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("migration: view de aprovação vigente pela ÚLTIMA análise, com RLS de quem consulta", () => {
    expect(codigo).toContain("WITH (security_invoker = true)");
    expect(codigo).toContain("SELECT DISTINCT ON (ac.lead_id) ac.*");
    expect(codigo).toContain("WHERE ult.status IN ('aprovada', 'aprovada_condicionada')");
  });

  it("migration: prompt versionado NOVO que ensina a armadilha da 'entrada' da Caixa", () => {
    expect(codigo).toContain("'samiq-2026-09-v6'");
    expect(codigo).toContain("_ativa.action_prompts || jsonb_build_object(");
    expect(sql).toContain("NUNCA o coloque em valor_entrada");
    expect(sql).toContain("Prestação Máxima - SIRIC");
  });

  it("IA: governada, modelo da reserva, saída minimizada e saneada", () => {
    expect(ia).toContain("reserveGovernedAIExecution");
    expect(ia).toContain("finishSamiQExecution");
    expect(ia).toContain("gateway(reservation.modelId)");
    expect(ia).not.toContain('gateway("google/gemini');
    expect(ia).toContain("maxOutputTokens: reservation.maxOutputTokens");
    expect(ia).toContain("redactSamiQFreeText");
    expect(ia).toContain("sanearEntradaDoSimulador(lidos)");
    // Só lê o tipo certo e a versão ATIVA do arquivo (anti confused-deputy).
    expect(ia).toContain('doc.tipo !== "aprovacao_credito"');
    expect(ia).toContain('.eq("ativa", true)');
  });

  it("card: botão de anexar abre o seletor no gesto do clique", () => {
    const card = read("src/components/lead-stage/analise-resultado.tsx");
    expect(card).toContain("Anexar aprovação");
    expect(card).toContain("fileRef.current?.click()");
    expect(card).toContain("<ProdutosAprovacao dados={dados} />");
  });
});

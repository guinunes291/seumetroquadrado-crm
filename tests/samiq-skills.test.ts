// Skills da Sami como ferramentas (Onda S5, D16) — regra pura: a pré-análise
// MCMV é determinística (tabela APROVE 2026 + estimativa PRICE), a
// qualificação em 7 dimensões lê o CRM e devolve a pergunta certa, a curadoria
// ordena o estoque real com motivo, e o preparador monta o checklist.
import { describe, expect, it } from "vitest";
import {
  avaliarQualificacao7D,
  curarEstoque,
  montarChecklistVisita,
  preAnaliseMcmv,
  rendaNumerica,
  type ProjetoCuradoriaRow,
  type QualificacaoLead,
} from "@/lib/samiq-skills";
import { SAMIQ_TOOL_DESCRIPTIONS, SAMIQ_TOOL_LABELS, SAMIQ_TOOL_NAMES } from "@/lib/samiq-tools";
import { calcularOrcamento } from "@/lib/orcamento";

describe("catálogo", () => {
  it("as quatro skills entram no catálogo com rótulo e descrição que manda usar a ferramenta para números", () => {
    for (const nome of [
      "pre_analise_mcmv",
      "avaliar_qualificacao",
      "curar_estoque",
      "preparar_visita",
    ] as const) {
      expect(SAMIQ_TOOL_NAMES).toContain(nome);
      expect(SAMIQ_TOOL_LABELS[nome].length).toBeGreaterThan(3);
      expect(SAMIQ_TOOL_DESCRIPTIONS[nome].length).toBeGreaterThan(60);
    }
    expect(SAMIQ_TOOL_DESCRIPTIONS.pre_analise_mcmv).toMatch(/nunca calcule/i);
  });
});

describe("preAnaliseMcmv", () => {
  it("bate com a tabela APROVE 2026 e nunca inventa: os números vêm de calcularOrcamento", () => {
    const r = preAnaliseMcmv({ renda: 3000, tem_dependente: true, fgts: 10_000 });
    const orc = calcularOrcamento({
      renda: 3000,
      tem36MesesRegistro: false,
      temDependente: true,
      fgts: 10_000,
    });
    expect(r.enquadra).toBe(true);
    expect(r.faixa).toBe(`Faixa ${orc.faixa}`);
    expect(r.financiamento_maximo).toBe(Math.round(orc.financiamento));
    expect(r.subsidio).toBe(Math.round(orc.subsidio));
    expect(r.teto_do_imovel).toBe(Math.round(orc.tetoImovel));
    expect(r.usou_redutor_36_meses).toBe(false);
    expect(String(r.aviso)).toMatch(/não é aprovação/i);
    // parcela arredondada para múltiplo de 10 (nunca ao centavo para o cliente)
    expect(Number(r.parcela_estimada) % 10).toBe(0);
  });

  it("com 36 meses de carteira financia mais; com preço responde 'cabe' e quanto parcelar", () => {
    const sem = preAnaliseMcmv({ renda: 4000 });
    const com = preAnaliseMcmv({ renda: 4000, tem_36_meses_registro: true });
    expect(Number(com.financiamento_maximo)).toBeGreaterThan(Number(sem.financiamento_maximo));

    const cabe = preAnaliseMcmv({ renda: 4000, entrada: 20_000, preco_imovel: 200_000 });
    const imovel = cabe.imovel as Record<string, unknown>;
    expect(imovel.preco).toBe(200_000);
    expect(typeof imovel.cabe).toBe("boolean");
    expect(typeof imovel.parcelar_com_construtora).toBe("number");
    expect(Number(imovel.comprometimento_da_renda_pct)).toBeGreaterThan(0);
    expect(Number(imovel.renda_minima_estimada_para_este_preco)).toBeGreaterThan(0);

    const naoCabe = preAnaliseMcmv({ renda: 2500, preco_imovel: 900_000 });
    expect((naoCabe.imovel as Record<string, unknown>).cabe).toBe(false);
  });

  it("renda abaixo da tabela não enquadra e diz o porquê", () => {
    const r = preAnaliseMcmv({ renda: 1200 });
    expect(r.enquadra).toBe(false);
    expect(String(r.motivo)).toMatch(/abaixo do mínimo/);
  });
});

const leadVazio: QualificacaoLead = {
  nome: "Maria da Silva",
  renda_informada: null,
  entrada_disponivel: null,
  usa_fgts: false,
  tem_fgts: null,
  fgts_valor: null,
  tipo_renda: null,
  faixa_mcmv: null,
  bairro: null,
  zona: null,
  projeto_nome: null,
  objecoes: [],
  observacoes: null,
  proxima_acao: null,
  temperatura: null,
  proximo_followup: null,
};

describe("qualificação em 7 dimensões", () => {
  it("rendaNumerica entende os formatos que o corretor digita", () => {
    expect(rendaNumerica("R$ 3.500,00")).toBe(3500);
    expect(rendaNumerica("3500")).toBe(3500);
    expect(rendaNumerica("4,5 mil")).toBe(4500);
    expect(rendaNumerica("3.5k")).toBe(3500);
    expect(rendaNumerica("2.800")).toBe(2800);
    expect(rendaNumerica("sem renda")).toBeNull();
    expect(rendaNumerica(null)).toBeNull();
  });

  it("cliente sem nada: 0/7, sete perguntas e sem pré-análise possível", () => {
    const q = avaliarQualificacao7D(leadVazio);
    expect(q.cliente).toBe("Maria da Silva");
    expect(q.pontuacao).toBe(0);
    expect(q.total).toBe(7);
    expect(q.proximas_perguntas).toHaveLength(7);
    expect(q.pre_analise_possivel).toBe(false);
    expect(q.dimensoes.map((d) => d.chave)).toEqual([
      "renda",
      "entrada_fgts",
      "credito",
      "regiao",
      "necessidade",
      "urgencia",
      "motivacao",
    ]);
  });

  it("lê os campos do CRM e as anotações; telefone nas anotações sai redigido", () => {
    const q = avaliarQualificacao7D({
      ...leadVazio,
      renda_informada: "R$ 4.200",
      tipo_renda: "CLT",
      tem_fgts: true,
      fgts_valor: 12000,
      bairro: "Guaianases",
      zona: "Leste",
      objecoes: ["parcela alta"],
      observacoes: "Paga aluguel, quer mudar até dezembro. Casal com 1 filho. Tel 11 91234-5678",
    });
    expect(q.pontuacao).toBe(7);
    expect(q.pre_analise_possivel).toBe(true);
    expect(q.proximas_perguntas).toEqual([]);
    const renda = q.dimensoes.find((d) => d.chave === "renda")!;
    expect(renda.sabemos).toContain("R$ 4200");
    expect(renda.sabemos).toContain("CLT");
    const urg = q.dimensoes.find((d) => d.chave === "urgencia")!;
    expect(urg.sabemos).toMatch(/prazo\/aluguel/);
    for (const d of q.dimensoes) expect(d.sabemos ?? "").not.toMatch(/91234/);
  });
});

const projetos: ProjetoCuradoriaRow[] = [
  {
    id: "p1",
    nome: "Reserva Leste",
    bairro: "Itaquera",
    cidade: "São Paulo",
    regiao: "Zona Leste",
    zona_smq: null,
    tipologia: "apartamento",
    dorms_min: 2,
    dorms_max: 2,
    preco_a_partir: 230_000,
    renda_minima: 3000,
    status_entrega: "lançamento",
    ano_entrega: 2028,
    argumentos_venda: ["Perto do metrô", "Lazer completo"],
    diferenciais: ["Varanda"],
    perfil_ideal: "Casal jovem com 1 filho",
    disponibilidade_resumo: null,
    construtora: "Construtora A",
  },
  {
    id: "p2",
    nome: "Vila Norte",
    bairro: "Tucuruvi",
    cidade: "São Paulo",
    regiao: "Zona Norte",
    zona_smq: null,
    tipologia: "apartamento",
    dorms_min: 1,
    dorms_max: 3,
    preco_a_partir: 320_000,
    renda_minima: 6000,
    status_entrega: "pronto",
    ano_entrega: 2026,
    argumentos_venda: null,
    diferenciais: null,
    perfil_ideal: null,
    disponibilidade_resumo: "últimas unidades",
    construtora: null,
  },
  {
    id: "p3",
    nome: "Parque Sul",
    bairro: "Grajaú",
    cidade: "São Paulo",
    regiao: "Zona Sul",
    zona_smq: null,
    tipologia: "apartamento",
    dorms_min: 2,
    dorms_max: 2,
    preco_a_partir: 210_000,
    renda_minima: 2800,
    status_entrega: null,
    ano_entrega: null,
    argumentos_venda: [],
    diferenciais: "Área verde",
    perfil_ideal: null,
    disponibilidade_resumo: null,
    construtora: "Construtora B",
  },
];

describe("curarEstoque", () => {
  const agora = new Date("2026-09-10T12:00:00Z").getTime();

  it("ordena por aderência (cabe na renda, estoque, campanha, região) e explica cada posição; nada some", () => {
    const r = curarEstoque({
      projetos,
      unidades: [
        {
          projeto_id: "p1",
          status: "disponivel",
          valor: 225_000,
          dormitorios: 2,
          tipologia: null,
          vagas: 1,
        },
        {
          projeto_id: "p1",
          status: "vendida",
          valor: 220_000,
          dormitorios: 2,
          tipologia: null,
          vagas: 1,
        },
        {
          projeto_id: "p3",
          status: "disponivel",
          valor: 205_000,
          dormitorios: 2,
          tipologia: null,
          vagas: 0,
        },
      ],
      focos: [
        {
          id: "f1",
          projeto_id: "p3",
          motivo: "Feirão de setembro",
          inicio: "2026-09-01T00:00:00Z",
          fim: "2026-09-30T00:00:00Z",
          ativo: true,
        },
        {
          id: "f2",
          projeto_id: "p2",
          motivo: "antiga",
          inicio: "2026-01-01T00:00:00Z",
          fim: "2026-02-01T00:00:00Z",
          ativo: true,
        },
      ],
      // renda 6000 (Faixa 3): 225k e 205k cabem nos 30%; 320k não.
      criterios: { renda: 6000, dorms: 2, regiao: "leste" },
      agora,
    });
    expect(r.projetos).toHaveLength(3);
    const [primeiro, segundo, terceiro] = r.projetos;
    expect(primeiro.id).toBe("p1");
    expect(primeiro.unidades_disponiveis).toBe(1);
    expect(primeiro.menor_unidade_disponivel).toBe(225_000);
    expect(primeiro.cabe_na_renda).toBe(true);
    expect(primeiro.por_que).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/cabe na renda/),
        "1 unidade(s) disponível(is) no estoque",
        "na região pedida",
      ]),
    );
    expect(primeiro.argumentos).toEqual(["Perto do metrô", "Lazer completo", "Varanda"]);
    expect(segundo.id).toBe("p3");
    expect(segundo.campanha).toBe("Feirão de setembro");
    expect(segundo.por_que).toContain("fora da região pedida");
    expect(terceiro.id).toBe("p2");
    expect(terceiro.campanha).toBeNull();
    expect(terceiro.por_que).toEqual(
      expect.arrayContaining([expect.stringMatching(/passa de 30%|acima do teto/)]),
    );
    expect(r.aviso).toMatch(/estimativa/i);
  });

  it("sem renda e sem estoque cadastrado, usa renda mínima e o resumo de disponibilidade; respeita limite", () => {
    const r = curarEstoque({
      projetos,
      unidades: [],
      focos: [],
      criterios: { preco_max: 250_000, limite: 2 },
      agora,
    });
    expect(r.projetos).toHaveLength(2);
    expect(r.projetos.map((p) => p.id)).toEqual(["p3", "p1"]);
    expect(r.projetos.every((p) => p.cabe_na_renda === null)).toBe(true);
  });
});

describe("montarChecklistVisita", () => {
  it("avisa visita não confirmada, pede documentos, simula parcela e sugere as perguntas que faltam", () => {
    const kit = montarChecklistVisita({
      lead: {
        ...leadVazio,
        id: "l1",
        status: "agendado",
        renda_informada: "3500",
        entrada_disponivel: "10000",
      },
      visita: {
        quando: "2026-09-11T13:00:00Z",
        local: "Reserva Leste",
        status: "agendado",
        titulo: "Visita",
      },
      projeto: projetos[0],
      documentosPendentes: ["cpf", "holerites"],
      objecoes: ["parcela alta"],
      ultimasInteracoes: [{ tipo: "ligacao", em: "2026-09-09T10:00:00Z" }],
    });
    expect(kit.alertas).toEqual([
      "A visita ainda não foi confirmada com o cliente — confirme antes.",
    ]);
    expect(kit.checklist[0]).toMatch(/^Simulação rápida|^Atenção/);
    expect(kit.checklist).toEqual(
      expect.arrayContaining([
        "Peça para levar: cpf, holerites.",
        "Prepare resposta para: parcela alta.",
        "Argumentos do Reserva Leste: Perto do metrô; Lazer completo.",
      ]),
    );
    expect(kit.checklist.filter((c) => c.startsWith("Perguntar:"))).toHaveLength(3);
    // renda + entrada conhecidas; as objeções do kit vêm do lead (aqui vazio)
    expect(kit.qualificacao.pontuacao).toBe(2);
  });

  it("sem visita no CRM e sem interações: alerta, e sem renda pede para perguntar antes de simular", () => {
    const kit = montarChecklistVisita({
      lead: { ...leadVazio, id: "l1", status: "em_atendimento" },
      visita: null,
      projeto: null,
      documentosPendentes: [],
      objecoes: [],
      ultimasInteracoes: [],
    });
    expect(kit.alertas).toEqual([
      "Não há visita agendada aberta para este cliente no CRM.",
      "Nenhuma interação registrada: é o primeiro contato real com este cliente.",
    ]);
    expect(kit.checklist[0]).toBe("Renda não está no CRM: pergunte antes de simular na visita.");
  });
});

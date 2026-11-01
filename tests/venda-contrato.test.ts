// Venda por contrato (IA) — a parte pura: seleção de páginas, validação do que
// o modelo devolve, "atual → novo" e sugestão de construtora/empreendimento.
// Dados 100% fictícios (CPF de teste público 529.982.247-25).

import { describe, expect, it } from "vitest";
import {
  CLIENTE_VAZIO,
  ExtracaoContratoSchema,
  diferencasCliente,
  errosCliente,
  montarTextoContrato,
  normalizarLeituraContrato,
  parseDataContrato,
  parseValorContrato,
  payloadDadosCliente,
  pontuarPaginaContrato,
  selecionarPaginasContrato,
  sugerirConstrutora,
  sugerirProjeto,
  type DadosClienteContrato,
} from "@/features/vendas/contrato-venda";

const HOJE = "2026-11-01";
const CPF_OK = "52998224725";
const CPF_OK_2 = "11144477735";

const clausula = (n: number) =>
  `CLÁUSULA ${n} - O COMPRADOR pagará o preço da unidade autônoma conforme o quadro. `.repeat(40);

describe("parseValorContrato", () => {
  it("entende os formatos de reais do contrato e do modelo", () => {
    expect(parseValorContrato("R$ 351.100,00")).toBe(351100);
    expect(parseValorContrato("293.000")).toBe(293000);
    expect(parseValorContrato("8.307,34")).toBe(8307.34);
    expect(parseValorContrato(351100)).toBe(351100);
    expect(parseValorContrato("185000.5")).toBe(185000.5);
  });
  it("lixo, zero e negativo viram null", () => {
    expect(parseValorContrato("XXXXXXXX")).toBeNull();
    expect(parseValorContrato(0)).toBeNull();
    expect(parseValorContrato(-10)).toBeNull();
    expect(parseValorContrato(null)).toBeNull();
  });
});

describe("parseDataContrato", () => {
  it("ISO, dd/mm/aaaa e por extenso", () => {
    expect(parseDataContrato("2026-10-27")).toBe("2026-10-27");
    expect(parseDataContrato("27/10/2026")).toBe("2026-10-27");
    expect(parseDataContrato("30 de Outubro de 2026")).toBe("2026-10-30");
    expect(parseDataContrato("1 de março de 2026")).toBe("2026-03-01");
  });
  it("data impossível não passa", () => {
    expect(parseDataContrato("31/02/2026")).toBeNull();
    expect(parseDataContrato("amanhã")).toBeNull();
  });
});

describe("seleção de páginas", () => {
  const contrato = Array.from({ length: 99 }, (_, i) => ({
    pagina: i + 1,
    texto: clausula(i + 1),
  }));
  contrato[6].texto = "3 - DO PREÇO\nO preço certo e ajustado é de R$ 300.000,00";
  contrato[96].texto =
    "FICHA CADASTRO\nComprador 1\nNome completo\nMARIA EXEMPLO\nCPF 529.982.247-25\nData de Nascimento 01/01/1990\nE-mail maria@exemplo.com";
  contrato[98].texto = "São Paulo, 30 de outubro de 2026.\nTESTEMUNHAS";

  it("leva o quadro-resumo do começo, a ficha cadastral do fim e a página da assinatura", () => {
    const sel = selecionarPaginasContrato(contrato).map((p) => p.pagina);
    expect(sel.slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sel).toContain(97);
    expect(sel).toContain(99);
    // cláusula genérica do meio não entra
    expect(sel).not.toContain(50);
  });

  it("respeita o teto de caracteres e devolve na ordem do documento", () => {
    const sel = selecionarPaginasContrato(contrato, 12_000);
    const total = sel.reduce((s, p) => s + p.texto.length, 0);
    expect(total).toBeLessThanOrEqual(12_000);
    expect([...sel].sort((a, b) => a.pagina - b.pagina)).toEqual(sel);
  });

  it("ficha cadastral pesa mais que cláusula com 'preço' e 'CPF'", () => {
    expect(pontuarPaginaContrato(contrato[96].texto)).toBeGreaterThan(
      pontuarPaginaContrato(clausula(1) + " CPF unidade autônoma"),
    );
  });

  it("tira marcadores de rubrica e numera as páginas para o modelo", () => {
    const sel = selecionarPaginasContrato([
      { pagina: 1, texto: "QUADRO RESUMO <<ProponenteRubrica1>> <<FiadorRubrica2>>" },
    ]);
    const texto = montarTextoContrato(sel);
    expect(texto).toBe("=== Página 1 ===\nQUADRO RESUMO");
  });
});

describe("normalizarLeituraContrato", () => {
  const bruta = (extra: Record<string, unknown> = {}) =>
    ExtracaoContratoSchema.parse({
      comprador: {
        nome: "MARIA DA SILVA EXEMPLO",
        cpf: "529.982.247-25",
        rg: "12.345.678-9",
        data_nascimento: "01/01/1990",
        estado_civil: "SOLTEIRO(A)",
        email: "MARIA@EXEMPLO.COM",
        telefone: "(11) 91234-5678",
        renda_familiar: "R$ 8.307,34",
        endereco: {
          logradouro: "RUA DAS FLORES,",
          numero: "100",
          complemento: "XXXXXXXXXX",
          cidade: "SAO PAULO / SP",
          uf: "sp",
          cep: "04809-180",
        },
      },
      segundo_comprador: null,
      venda: {
        construtora: "Vibra Residencial",
        empreendimento: "Vibra Exemplo",
        unidade: "B0101",
        valor_venda: "R$ 351.100,00",
        data_assinatura: "27/10/2026",
      },
      confianca: 0.9,
      observacoes: null,
      ...extra,
    });

  it("normaliza documentos, nomes e endereço; placeholder vira vazio", () => {
    const r = normalizarLeituraContrato(bruta(), HOJE);
    expect(r.cliente).toMatchObject({
      nome: "Maria da Silva Exemplo",
      cpf: CPF_OK,
      telefone: "11912345678",
      email: "maria@exemplo.com",
      data_nascimento: "1990-01-01",
      estado_civil: "Solteiro(a)",
      renda_estimada: "8307.34",
      endereco_logradouro: "Rua das Flores",
      endereco_complemento: "",
      endereco_cidade: "Sao Paulo",
      endereco_uf: "SP",
      endereco_cep: "04809180",
    });
    expect(r.venda).toEqual({
      construtora: "Vibra Residencial",
      empreendimento: "Vibra Exemplo",
      unidade: "B0101",
      valorVenda: 351100,
      dataAssinatura: "2026-10-27",
    });
    expect(r.camposLidos).toContain("cpf");
    expect(r.camposLidos).not.toContain("endereco_complemento");
    expect(r.avisos).toEqual([]);
  });

  it("CPF e telefone inválidos não são pré-preenchidos e geram aviso", () => {
    const r = normalizarLeituraContrato(
      bruta({ comprador: { nome: "Ana", cpf: "123.456.789-00", telefone: "1234" } }),
      HOJE,
    );
    expect(r.cliente.cpf).toBe("");
    expect(r.cliente.telefone).toBe("");
    expect(r.avisos).toHaveLength(2);
  });

  it("telefone com DDI 55 vira nacional", () => {
    const r = normalizarLeituraContrato(
      bruta({ comprador: { nome: "Ana", telefone: "5511912345678" } }),
      HOJE,
    );
    expect(r.cliente.telefone).toBe("11912345678");
  });

  it("segundo comprador com o mesmo CPF do comprador é descartado", () => {
    const r = normalizarLeituraContrato(
      bruta({ segundo_comprador: { nome: "JOSE EXEMPLO", cpf: CPF_OK } }),
      HOJE,
    );
    expect(r.cliente.conjuge_nome).toBe("Jose Exemplo");
    expect(r.cliente.conjuge_cpf).toBe("");
    expect(r.avisos.some((a) => a.includes("mesmo CPF"))).toBe(true);
  });

  it("data de assinatura no futuro não entra", () => {
    const r = normalizarLeituraContrato(
      bruta({ venda: { data_assinatura: "2027-01-25", valor_venda: 1000 } }),
      HOJE,
    );
    expect(r.venda.dataAssinatura).toBeNull();
    expect(r.avisos.some((a) => a.includes("futuro"))).toBe(true);
  });

  it("resposta torta do modelo não derruba a leitura", () => {
    const r = normalizarLeituraContrato(
      ExtracaoContratoSchema.parse({ comprador: "???", venda: 42, confianca: "alta" }),
      HOJE,
    );
    expect(r.cliente).toEqual(CLIENTE_VAZIO);
    expect(r.confianca).toBe(0.5);
  });
});

describe("atual → novo", () => {
  const novo: DadosClienteContrato = {
    ...CLIENTE_VAZIO,
    nome: "Maria Exemplo",
    telefone: "11912345678",
    email: "maria@exemplo.com",
    cpf: CPF_OK,
    profissao: "Vendedora",
  };

  it("só mostra o que muda; campo vazio no CRM vem marcado, valor diferente não", () => {
    const d = diferencasCliente(
      {
        nome: "MARIA EXEMPLO", // igual sem caixa
        telefone: "(11) 91234-5678", // igual sem máscara
        email: "outra@exemplo.com", // diferente
        cpf: null, // vazio
      },
      novo,
    );
    expect(d.map((x) => [x.campo, x.marcado])).toEqual([
      ["email", false],
      ["cpf", true],
      ["profissao", true],
    ]);
  });

  it("o contrato nunca apaga o que o CRM sabe", () => {
    const d = diferencasCliente({ rg: "12.345.678-9" }, { ...novo, rg: "" });
    expect(d.find((x) => x.campo === "rg")).toBeUndefined();
  });

  it("payload só com os campos escolhidos, CPF formatado e renda numérica", () => {
    const p = payloadDadosCliente(
      { ...novo, renda_estimada: "8307.34", endereco_uf: "sp", rg: "" },
      ["cpf", "renda_estimada", "endereco_uf", "rg", "profissao"],
      (c) => `fmt:${c}`,
    );
    expect(p).toEqual({
      cpf: `fmt:${CPF_OK}`,
      renda_estimada: 8307.34,
      endereco_uf: "SP",
      profissao: "Vendedora",
    });
  });
});

describe("errosCliente", () => {
  it("cliente novo exige telefone; documentos são validados", () => {
    const base = { ...CLIENTE_VAZIO, nome: "Maria" };
    expect(errosCliente(base, true)).toContain("Informe o telefone do cliente (DDD + número).");
    expect(errosCliente(base, false)).toEqual([]);
    expect(errosCliente({ ...base, cpf: "11111111111", conjuge_cpf: CPF_OK_2 }, false)).toEqual([
      "CPF inválido.",
    ]);
  });
});

describe("sugestão de construtora e empreendimento", () => {
  const projetos = [
    { id: "1", nome: "Parque Aruá", construtora: "Plano & Plano" },
    { id: "2", nome: "Jardim", construtora: "Outra" },
    { id: "3", nome: "Vibra Sabará", construtora: "Vibra" },
    { id: "4", nome: "Vibra Campo Limpo", construtora: "Vibra" },
  ];

  it("marca comercial casa com a parceira do CRM", () => {
    expect(sugerirConstrutora("Vibra Residencial", ["Cury", "Vibra"])).toBe("Vibra");
    expect(sugerirConstrutora("Plano&Plano", ["Plano & Plano"])).toBe("Plano & Plano");
    expect(sugerirConstrutora("Desconhecida SPE", ["Cury"])).toBeNull();
  });

  it("nome longo do condomínio acha o produto pelo nome comercial", () => {
    expect(
      sugerirProjeto("Condomínio Jardim das Origens - Parque Aruá", "Plano&Plano", projetos)?.id,
    ).toBe("1");
    expect(sugerirProjeto("VIBRA SABARÁ", "Vibra Residencial", projetos)?.id).toBe("3");
  });

  it("palavra solta não vira sugestão errada", () => {
    // "Jardim" (projeto de uma palavra, outra construtora) não casa com o Parque Aruá
    expect(sugerirProjeto("Jardim das Origens", "Plano&Plano", projetos)).toBeNull();
    expect(sugerirProjeto("Residencial Inexistente", null, projetos)).toBeNull();
  });
});

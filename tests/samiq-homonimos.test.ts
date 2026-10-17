import { describe, expect, it } from "vitest";
import {
  avaliarDesambiguacao,
  candidatosParaPergunta,
  filtrarHomonimos,
  finalTelefone,
  primeiroNomeNormalizado,
  type ClienteParaDesambiguar,
} from "@/lib/samiq-homonimos";
import { modelarClientes, separarTermoBuscaSamiQ } from "@/lib/samiq-tools";

const lucasFerreira: ClienteParaDesambiguar = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Lucas Ferreira",
  projeto_nome: "Vibra Sabará",
  status: "em_atendimento",
  telefone: "(11) 98765-4321",
  telefone_e164: "5511987654321",
};
const lucasAndrade: ClienteParaDesambiguar = {
  id: "22222222-2222-4222-8222-222222222222",
  nome: "Lucas Andrade",
  projeto_nome: "Parque das Perdizes",
  status: "aguardando_retorno",
  telefone: null,
  telefone_e164: "5511912340000",
};
const lucasFerreiraSantos: ClienteParaDesambiguar = {
  id: "33333333-3333-4333-8333-333333333333",
  nome: "Lucas Ferreira Santos",
  projeto_nome: "Vibra Marajoara",
  status: "novo",
  telefone_e164: "5511955557777",
};

describe("trava de homônimos da Sami", () => {
  it("sem homônimo na carteira, segue sem perguntar", () => {
    expect(
      avaliarDesambiguacao({ alvo: lucasFerreira, homonimos: [], texto: "liguei pro Lucas" }),
    ).toEqual({ ok: true, motivo: "sem_homonimo" });
  });

  it("só o primeiro nome com dois Lucas na carteira bloqueia", () => {
    const r = avaliarDesambiguacao({
      alvo: lucasFerreira,
      homonimos: [lucasAndrade],
      texto: "Liguei pro Lucas agora, ele quer visitar sábado 10h",
    });
    expect(r.ok).toBe(false);
  });

  it("sobrenome exclusivo libera (com ou sem acento e maiúscula)", () => {
    expect(
      avaliarDesambiguacao({
        alvo: lucasFerreira,
        homonimos: [lucasAndrade],
        texto: "liguei pro lucas ferreira",
      }),
    ).toEqual({ ok: true, motivo: "sobrenome" });
  });

  it("empreendimento exclusivo libera: 'o do Sabará'", () => {
    expect(
      avaliarDesambiguacao({
        alvo: lucasFerreira,
        homonimos: [lucasAndrade],
        texto: "o do Sabará",
      }),
    ).toEqual({ ok: true, motivo: "empreendimento" });
  });

  it("final do telefone libera, inclusive no número inteiro formatado", () => {
    expect(
      avaliarDesambiguacao({
        alvo: lucasFerreira,
        homonimos: [lucasAndrade],
        texto: "o Lucas final 4321",
      }).ok,
    ).toBe(true);
    expect(
      avaliarDesambiguacao({
        alvo: lucasFerreira,
        homonimos: [lucasAndrade],
        texto: "o de número 98765-4321",
      }).ok,
    ).toBe(true);
  });

  it("o que os dois têm em comum não distingue (Ferreira e Vibra nos dois)", () => {
    const r = avaliarDesambiguacao({
      alvo: lucasFerreira,
      homonimos: [lucasFerreiraSantos],
      texto: "Lucas Ferreira do Vibra",
    });
    expect(r.ok).toBe(false);
    expect(
      avaliarDesambiguacao({
        alvo: lucasFerreira,
        homonimos: [lucasFerreiraSantos],
        texto: "Lucas Ferreira do Vibra Sabará",
      }).ok,
    ).toBe(true);
  });

  it("modelo escolheu o Lucas errado: o texto aponta para o outro e bloqueia", () => {
    const r = avaliarDesambiguacao({
      alvo: lucasAndrade,
      homonimos: [lucasFerreira],
      texto: "liguei pro Lucas do Sabará",
    });
    expect(r.ok).toBe(false);
  });

  it("filtra homônimos pelo primeiro nome exato, sem acento e sem o próprio alvo", () => {
    const lista = [
      lucasFerreira,
      lucasAndrade,
      { id: "x", nome: "Lucca Souza", projeto_nome: null },
      { id: "y", nome: "LÚCAS silva", projeto_nome: null },
    ];
    expect(filtrarHomonimos(lucasFerreira, lista).map((c) => c.id)).toEqual([lucasAndrade.id, "y"]);
    expect(primeiroNomeNormalizado("  Lúcas  Ferreira")).toBe("lucas");
  });

  it("candidatos para a pergunta não levam telefone ao modelo", () => {
    const c = candidatosParaPergunta([lucasFerreira, lucasAndrade], (n) => n);
    expect(c[0]).toEqual({
      id: lucasFerreira.id,
      nome: "Lucas Ferreira",
      empreendimento: "Vibra Sabará",
      etapa: "em_atendimento",
    });
    expect(JSON.stringify(c)).not.toMatch(/4321|98765|0000/);
    expect(finalTelefone(lucasFerreira)).toBe("4321");
    expect(finalTelefone({ telefone: "1234" })).toBeNull();
  });
});

describe("buscar_clientes por final de telefone", () => {
  it("separa nome e dígitos", () => {
    expect(separarTermoBuscaSamiQ("Lucas 4321")).toEqual({ texto: "Lucas", finalTelefone: "4321" });
    expect(separarTermoBuscaSamiQ("lucas final 98765-4321")).toEqual({
      texto: "lucas",
      finalTelefone: "987654321",
    });
    expect(separarTermoBuscaSamiQ("final 4321")).toEqual({ texto: "", finalTelefone: "4321" });
    expect(separarTermoBuscaSamiQ("Maria")).toEqual({ texto: "Maria", finalTelefone: null });
    expect(separarTermoBuscaSamiQ("Torre 2")).toEqual({ texto: "Torre 2", finalTelefone: null });
  });

  it("o resultado nunca mostra telefone, nem o final", () => {
    const out = modelarClientes(
      [
        {
          id: lucasFerreira.id,
          nome: "Lucas Ferreira",
          status: "em_atendimento",
          temperatura: "quente",
          projeto_nome: "Vibra Sabará",
          proximo_followup: null,
          ultima_interacao: null,
          origem: "facebook",
          created_at: "2026-10-01T00:00:00Z",
        },
      ],
      8,
    ) as Array<Record<string, unknown>>;
    expect(out[0]).not.toHaveProperty("final_telefone");
    expect(out[0].nome).toBe("Lucas Ferreira");
  });
});

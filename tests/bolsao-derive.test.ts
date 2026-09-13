/**
 * Lógica pura do Bolsão (src/features/bolsao/derive).
 *
 * O que está em jogo:
 *  - O SINAL do histórico é agregado e sem autor. Se um dia alguém precisar
 *    do nome de quem tocou o lead para montar esta linha, a anonimização da
 *    tela morreu — e ela é o que impede a briga por lead (§5.2 do documento).
 *  - ESTOQUE é só o que ninguém conquistou nem pagou. `impulso_smq` é
 *    custeado pela empresa e NÃO é estoque; achar um solto no Bolsão é sinal
 *    de que algo o soltou, e a tela precisa marcá-lo.
 *  - A frieza usa os mesmos 7 dias da régua de posse (§5.1), para a tela e o
 *    banco não contarem tempo de formas diferentes.
 */
import { describe, expect, it } from "vitest";
import {
  PUXAR_FRIO_DIAS,
  ehEstoque,
  frasePlacar,
  friezaDoLead,
  resumoBolsao,
  sinalDoLead,
  type LinhaBolsao,
} from "@/features/bolsao/derive";

function linha(p: Partial<LinhaBolsao> = {}): LinhaBolsao {
  return {
    lead_id: "00000000-0000-4000-8000-000000000001",
    nome: "Fulano",
    telefone_mascarado: "(11) •••••0001",
    status: "novo",
    origem: "importacao",
    projeto_nome: null,
    bairro: null,
    zona: null,
    parado_desde: "2026-01-01T00:00:00Z",
    dias_parado: 90,
    tem_interacao: false,
    tem_contato: false,
    em_triagem_sdr: false,
    ...p,
  };
}

describe("friezaDoLead", () => {
  it("usa os mesmos 7 dias da régua de posse", () => {
    expect(PUXAR_FRIO_DIAS).toBe(7);
    expect(friezaDoLead(PUXAR_FRIO_DIAS - 1)).toBe("recente");
    expect(friezaDoLead(PUXAR_FRIO_DIAS)).toBe("morno");
  });

  it("separa meses de mais de meio ano", () => {
    expect(friezaDoLead(29)).toBe("morno");
    expect(friezaDoLead(30)).toBe("frio");
    expect(friezaDoLead(179)).toBe("frio");
    expect(friezaDoLead(180)).toBe("esquecido");
  });
});

describe("sinalDoLead", () => {
  it("interação vale mais que tentativa de contato", () => {
    expect(sinalDoLead({ tem_interacao: true, tem_contato: true })).toBe("houve_conversa");
    expect(sinalDoLead({ tem_interacao: false, tem_contato: true })).toBe("so_tentativa");
    expect(sinalDoLead({ tem_interacao: false, tem_contato: false })).toBe("nunca_tocado");
  });
});

describe("ehEstoque", () => {
  it("só os três despejos de dados são estoque", () => {
    expect(ehEstoque("importacao")).toBe(true);
    expect(ehEstoque("google_sheets")).toBe(true);
    expect(ehEstoque("outro")).toBe(true);
  });

  it("lead pago ou conquistado NÃO é estoque", () => {
    // impulso_smq é custeado pela empresa — a regra da diretoria.
    expect(ehEstoque("impulso_smq")).toBe(false);
    expect(ehEstoque("facebook")).toBe(false);
    expect(ehEstoque("chatbot")).toBe(false);
    expect(ehEstoque("captacao_corretor")).toBe(false);
    expect(ehEstoque("indicacao")).toBe(false);
  });

  it("origem ausente cai no estoque — o desconhecido não vira privilégio", () => {
    expect(ehEstoque(null)).toBe(true);
  });
});

describe("resumoBolsao", () => {
  it("conta os sinais que a tela precisa mostrar", () => {
    const r = resumoBolsao([
      linha({ tem_interacao: true }),
      linha({ tem_contato: true }),
      linha(),
      linha({ em_triagem_sdr: true }),
      linha({ origem: "impulso_smq" }),
    ]);
    expect(r.total).toBe(5);
    expect(r.jaHouveConversa).toBe(1);
    expect(r.nuncaTocados).toBe(3);
    expect(r.emTriagemSdr).toBe(1);
    expect(r.naoEstoque).toBe(1);
  });
});

describe("frasePlacar", () => {
  it("fala do que está à vista, não da base inteira", () => {
    const r = resumoBolsao([linha({ tem_interacao: true }), linha()]);
    expect(frasePlacar(r, "")).toBe("2 leads sem dono · 1 já tiveram conversa · 1 nunca tocados.");
  });

  it("busca vazia e base vazia dizem coisas diferentes", () => {
    const vazio = resumoBolsao([]);
    expect(frasePlacar(vazio, "joão")).toContain("bate com essa busca");
    expect(frasePlacar(vazio, "")).toBe("Nenhum lead sem dono para mostrar.");
  });
});

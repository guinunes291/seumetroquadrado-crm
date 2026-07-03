import { describe, it, expect } from "vitest";
import {
  AVANCADO_STATUSES,
  isLeadAvancado,
  resolveAvancado,
  computeOfertaStats,
  filterOfertaLeads,
  normalizeOfertaFiltros,
  buildMensagemOferta,
  statusLabel,
  statusVariant,
  type OfertaLeadRow,
} from "@/lib/oferta-ativa";
import type { LeadStatus } from "@/lib/leads";

function vinculo(over: Partial<OfertaLeadRow> & { status?: LeadStatus } = {}): OfertaLeadRow {
  const { status, ...resto } = over;
  return {
    id: "v1",
    contatado: false,
    contatado_em: null,
    avancado: false,
    lead: {
      id: "l1",
      nome: "João da Silva",
      telefone: "(11) 98765-4321",
      projeto_nome: "Residencial Aurora",
      status: status ?? "novo",
    },
    ...resto,
  };
}

describe("isLeadAvancado", () => {
  it("considera avançados os status do funil a partir de agendado (incluindo legados)", () => {
    for (const s of AVANCADO_STATUSES) expect(isLeadAvancado(s)).toBe(true);
    expect(isLeadAvancado("qualificado")).toBe(true);
    expect(isLeadAvancado("proposta_enviada")).toBe(true);
    expect(isLeadAvancado("pos_venda")).toBe(true);
  });

  it("não considera avançados os status iniciais, perdido ou valores nulos", () => {
    for (const s of [
      "novo",
      "aguardando_atendimento",
      "aguardando_retorno",
      "em_atendimento",
      "perdido",
    ])
      expect(isLeadAvancado(s)).toBe(false);
    expect(isLeadAvancado(null)).toBe(false);
    expect(isLeadAvancado(undefined)).toBe(false);
    expect(isLeadAvancado("")).toBe(false);
  });
});

describe("resolveAvancado", () => {
  it("deriva do status atual do lead quando ele está visível (ignora a flag congelada)", () => {
    expect(resolveAvancado(vinculo({ avancado: false, status: "agendado" }))).toBe(true);
    expect(resolveAvancado(vinculo({ avancado: true, status: "novo" }))).toBe(false);
  });

  it("cai para a flag do snapshot quando o lead saiu do escopo", () => {
    expect(resolveAvancado({ avancado: true, lead: null })).toBe(true);
    expect(resolveAvancado({ avancado: false, lead: null })).toBe(false);
    expect(resolveAvancado({ avancado: true })).toBe(true);
  });
});

describe("computeOfertaStats", () => {
  it("retorna zeros para lista vazia (sem divisão por zero)", () => {
    expect(computeOfertaStats([])).toEqual({
      total: 0,
      contatados: 0,
      avancados: 0,
      pctContatados: 0,
      pctAvancados: 0,
    });
  });

  it("conta e arredonda percentuais", () => {
    const rows = [
      vinculo({ id: "a", contatado: true, status: "agendado" }),
      vinculo({ id: "b", contatado: false, status: "novo" }),
      vinculo({ id: "c", contatado: false, status: "perdido" }),
    ];
    const s = computeOfertaStats(rows);
    expect(s.total).toBe(3);
    expect(s.contatados).toBe(1);
    expect(s.avancados).toBe(1);
    expect(s.pctContatados).toBe(33); // 1/3 arredondado
    expect(s.pctAvancados).toBe(33);
  });

  it("chega a 100% quando todos contatados", () => {
    const rows = [vinculo({ id: "a", contatado: true }), vinculo({ id: "b", contatado: true })];
    expect(computeOfertaStats(rows).pctContatados).toBe(100);
  });

  it("usa a flag congelada para vínculos sem lead visível", () => {
    const rows = [{ contatado: true, avancado: true, lead: null }, vinculo({ status: "novo" })];
    const s = computeOfertaStats(rows);
    expect(s.total).toBe(2);
    expect(s.avancados).toBe(1);
  });
});

describe("filterOfertaLeads", () => {
  const rows = [
    vinculo({ id: "a", status: "novo" }),
    vinculo({
      id: "b",
      contatado: true,
      status: "agendado",
      lead: {
        id: "l2",
        nome: "Maria José",
        telefone: "(21) 91234-5678",
        projeto_nome: null,
        status: "agendado",
      },
    }),
    { id: "c", contatado: false, contatado_em: null, avancado: true, lead: null },
  ];

  it("sem filtros retorna tudo", () => {
    expect(filterOfertaLeads(rows, {})).toHaveLength(3);
  });

  it("busca por nome ignora acentos e caixa", () => {
    expect(filterOfertaLeads(rows, { busca: "maria jose" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterOfertaLeads(rows, { busca: "JOÃO" }).map((r) => r.id)).toEqual(["a"]);
  });

  it("busca por projeto", () => {
    expect(filterOfertaLeads(rows, { busca: "aurora" }).map((r) => r.id)).toEqual(["a"]);
  });

  it("busca por telefone casa pelos dígitos", () => {
    expect(filterOfertaLeads(rows, { busca: "21912" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterOfertaLeads(rows, { busca: "98765-43" }).map((r) => r.id)).toEqual(["a"]);
  });

  it("busca exclui vínculos sem lead", () => {
    expect(filterOfertaLeads(rows, { busca: "x" })).toHaveLength(0);
  });

  it("filtra por status (multi) e exclui vínculos sem lead", () => {
    expect(filterOfertaLeads(rows, { status: ["agendado"] }).map((r) => r.id)).toEqual(["b"]);
    expect(filterOfertaLeads(rows, { status: ["novo", "agendado"] })).toHaveLength(2);
  });

  it("filtra por situação de contato", () => {
    expect(filterOfertaLeads(rows, { contato: "contatados" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterOfertaLeads(rows, { contato: "nao_contatados" }).map((r) => r.id)).toEqual([
      "a",
      "c",
    ]);
    expect(filterOfertaLeads(rows, { contato: "todos" })).toHaveLength(3);
  });

  it("combina busca + status + contato", () => {
    expect(
      filterOfertaLeads(rows, { busca: "maria", status: ["agendado"], contato: "contatados" }),
    ).toHaveLength(1);
    expect(
      filterOfertaLeads(rows, { busca: "maria", status: ["agendado"], contato: "nao_contatados" }),
    ).toHaveLength(0);
  });
});

describe("normalizeOfertaFiltros", () => {
  it("preenche defaults para jsonb vazio ou inválido", () => {
    const vazio = {
      status: [],
      temperatura: [],
      projetoId: [],
      origem: [],
      zona: [],
      semInteracaoHaDias: undefined,
    };
    expect(normalizeOfertaFiltros(null)).toEqual(vazio);
    expect(normalizeOfertaFiltros(undefined)).toEqual(vazio);
    expect(normalizeOfertaFiltros("lixo")).toEqual(vazio);
    expect(normalizeOfertaFiltros([1, 2])).toEqual(vazio);
    expect(normalizeOfertaFiltros({})).toEqual(vazio);
  });

  it("mantém arrays válidos e descarta valores não-string", () => {
    const f = normalizeOfertaFiltros({ status: ["novo", 7, null], zona: ["Centro"] });
    expect(f.status).toEqual(["novo"]);
    expect(f.zona).toEqual(["Centro"]);
    expect(f.projetoId).toEqual([]);
  });

  it("aceita semInteracaoHaDias como número ou string numérica", () => {
    expect(normalizeOfertaFiltros({ semInteracaoHaDias: 7 }).semInteracaoHaDias).toBe(7);
    expect(normalizeOfertaFiltros({ semInteracaoHaDias: "14" }).semInteracaoHaDias).toBe(14);
    expect(normalizeOfertaFiltros({ semInteracaoHaDias: 3.9 }).semInteracaoHaDias).toBe(3);
  });

  it("descarta semInteracaoHaDias inválido ou não-positivo", () => {
    expect(normalizeOfertaFiltros({ semInteracaoHaDias: 0 }).semInteracaoHaDias).toBeUndefined();
    expect(normalizeOfertaFiltros({ semInteracaoHaDias: -2 }).semInteracaoHaDias).toBeUndefined();
    expect(
      normalizeOfertaFiltros({ semInteracaoHaDias: "abc" }).semInteracaoHaDias,
    ).toBeUndefined();
    expect(normalizeOfertaFiltros({ semInteracaoHaDias: "" }).semInteracaoHaDias).toBeUndefined();
  });
});

describe("buildMensagemOferta", () => {
  const lead = { nome: "João da Silva", projeto_nome: "Residencial Aurora" };

  it("mensagem padrão usa o primeiro nome e cita o projeto quando houver", () => {
    const msg = buildMensagemOferta(lead);
    expect(msg).toContain("Olá, João!");
    expect(msg).toContain("sobre o Residencial Aurora");
  });

  it("mensagem padrão omite o projeto quando não houver", () => {
    const msg = buildMensagemOferta({ nome: "Maria", projeto_nome: null });
    expect(msg).toContain("Olá, Maria!");
    expect(msg).not.toContain("sobre o");
  });

  it("renderiza template custom com nome, primeiro_nome e projeto", () => {
    const msg = buildMensagemOferta(lead, "Oi {{primeiro_nome}} ({{nome}}), viu o {{projeto}}?");
    expect(msg).toBe("Oi João (João da Silva), viu o Residencial Aurora?");
  });

  it("conteúdo vazio ou em branco cai na mensagem padrão", () => {
    expect(buildMensagemOferta(lead, "")).toContain("Olá, João!");
    expect(buildMensagemOferta(lead, "   ")).toContain("Olá, João!");
  });

  it("nome com espaços extras ainda extrai o primeiro nome", () => {
    expect(buildMensagemOferta({ nome: "  Ana  Paula ", projeto_nome: null })).toContain(
      "Olá, Ana!",
    );
  });
});

describe("statusLabel / statusVariant", () => {
  it("rotula todos os status do ciclo de vida", () => {
    expect(statusLabel("ativa")).toBe("Ativa");
    expect(statusLabel("concluida")).toBe("Concluída");
    expect(statusLabel("arquivada")).toBe("Arquivada");
    expect(statusLabel("rascunho")).toBe("Rascunho");
    expect(statusLabel("outro")).toBe("outro");
  });

  it("variantes de badge por status", () => {
    expect(statusVariant("ativa")).toBe("default");
    expect(statusVariant("concluida")).toBe("secondary");
    expect(statusVariant("arquivada")).toBe("outline");
  });
});

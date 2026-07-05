import { describe, it, expect } from "vitest";
import {
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
      projeto_id: "p1",
      corretor_id: "u1",
      observacoes: null,
      status: status ?? "novo",
    },
    ...resto,
  };
}

describe("computeOfertaStats", () => {
  // Semântica delta: `contatado`/`avancado` medem o progresso feito depois que
  // o lead entrou na lista e são mantidos pelo banco (trg_oferta_sync_status),
  // independentes do status atual visível no embed.
  it("retorna zeros para lista vazia (sem divisão por zero)", () => {
    expect(computeOfertaStats([])).toEqual({
      total: 0,
      contatados: 0,
      avancados: 0,
      pctContatados: 0,
      pctAvancados: 0,
    });
  });

  it("conta pelas flags mantidas pelo banco e arredonda percentuais", () => {
    const rows = [
      vinculo({ id: "a", contatado: true, avancado: true, status: "agendado" }),
      vinculo({ id: "b", contatado: false, avancado: false, status: "novo" }),
      vinculo({ id: "c", contatado: true, avancado: false, status: "perdido" }),
    ];
    const s = computeOfertaStats(rows);
    expect(s.total).toBe(3);
    expect(s.contatados).toBe(2);
    expect(s.avancados).toBe(1);
    expect(s.pctContatados).toBe(67); // 2/3 arredondado
    expect(s.pctAvancados).toBe(33); // 1/3 arredondado
  });

  it("não deriva do status atual do lead — a flag é a verdade", () => {
    // Lead atualmente em status avançado, mas que já estava assim ao entrar na
    // lista (flag false) → não conta como avanço da campanha.
    const rows = [
      vinculo({ id: "a", avancado: false, status: "agendado" }),
      // Lead fora do escopo RLS (embed null) com avanço registrado pelo banco.
      { id: "b", contatado: true, contatado_em: null, avancado: true, lead: null },
    ];
    const s = computeOfertaStats(rows);
    expect(s.avancados).toBe(1);
  });

  it("chega a 100% quando todos contatados", () => {
    const rows = [vinculo({ id: "a", contatado: true }), vinculo({ id: "b", contatado: true })];
    expect(computeOfertaStats(rows).pctContatados).toBe(100);
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
        projeto_id: null,
        corretor_id: null,
        observacoes: null,
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

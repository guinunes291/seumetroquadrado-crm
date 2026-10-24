// Ferramentas de ESCRITA da Sami (v8, "CRM no WhatsApp").
//
// Regressão de origem: o zod 4.4+ proíbe .omit() em objeto com refine e as
// ferramentas quebravam ANTES de chamar o gateway (set/2026). Aqui também
// travamos o que a v8 promete ao corretor: nada grava sem validar, ação leve
// grava na hora só no modo por risco, pesada espera o OK, homônimo pergunta,
// data no passado volta e o cadastro nunca vê o telefone.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolSet } from "ai";
import {
  SAMIQ_MAX_PROPOSTAS_POR_TURNO,
  criarFerramentasDePropostaSamiQ,
  type ExecutorImediato,
  type PropostaColetada,
} from "@/lib/samiq-propostas.server";
import { compatibilizarFerramentasSamiQ } from "@/lib/samiq-ferramentas-compat";
import {
  AtualizarQualificacaoPayload,
  MudarEtapaPayload,
  SAMIQ_PROPOSTA_TIPOS,
} from "@/lib/samiq-propostas";

const mocks = vi.hoisted(() => ({ telefoneEhDeCorretor: vi.fn(async (_t: string) => false) }));
vi.mock("@/lib/telefone-corretor.server", () => ({
  telefoneEhDeCorretor: mocks.telefoneEhDeCorretor,
}));

const LEAD = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const LEAD_HOMONIMO = "7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const AGORA = new Date("2026-10-24T13:00:00.000Z"); // sáb 24/10 10:00 em SP

type Op = { m: string; a: unknown[] };
type Linha = Record<string, unknown>;

/** supabase-js de mentira: encadeia qualquer método e responde por tabela + operações. */
function fakeSupabase(responder: (tabela: string, ops: Op[]) => { data: unknown; error: unknown }) {
  return {
    from(tabela: string) {
      const ops: Op[] = [];
      const q: Record<string, unknown> = new Proxy(
        {},
        {
          get(_alvo, prop) {
            if (prop === "then") {
              return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
                Promise.resolve(responder(tabela, ops)).then(ok, erro);
            }
            if (prop === "maybeSingle" || prop === "single") {
              return () => Promise.resolve(responder(tabela, [...ops, { m: String(prop), a: [] }]));
            }
            return (...a: unknown[]) => {
              ops.push({ m: String(prop), a });
              return q;
            };
          },
        },
      );
      return q;
    },
  } as never;
}

const temOp = (ops: Op[], m: string, ...a: unknown[]) =>
  ops.some((o) => o.m === m && a.every((v, i) => o.a[i] === v));

/** Carteira de teste: Lucas Ferreira (em atendimento) e, se pedido, um homônimo. */
function carteira(opts: { status?: string; homonimo?: boolean; duplicado?: boolean } = {}) {
  const lucas: Linha = {
    id: LEAD,
    nome: "Lucas Ferreira",
    status: opts.status ?? "em_atendimento",
    corretor_id: "u1",
    projeto_nome: "Vibra Sabará",
    telefone: "(11) 98765-4321",
    telefone_e164: "5511987654321",
  };
  const andrade: Linha = {
    id: LEAD_HOMONIMO,
    nome: "Lucas Andrade",
    status: "aguardando_retorno",
    projeto_nome: "Parque das Perdizes",
    telefone: null,
    telefone_e164: "5511912340000",
  };
  return fakeSupabase((tabela, ops) => {
    if (tabela === "leads") {
      if (temOp(ops, "maybeSingle")) {
        const id = ops.find((o) => o.m === "eq" && o.a[0] === "id")?.a[1];
        return { data: id === LEAD ? lucas : id === LEAD_HOMONIMO ? andrade : null, error: null };
      }
      if (ops.some((o) => o.m === "ilike"))
        return { data: opts.homonimo ? [andrade] : [], error: null };
      if (ops.some((o) => o.m === "or")) {
        return {
          data: opts.duplicado
            ? [{ id: LEAD, nome: "Lucas Ferreira", status: "em_atendimento" }]
            : [],
          error: null,
        };
      }
    }
    if (tabela === "agendamentos") return { data: [], error: null };
    return { data: null, error: null };
  });
}

async function rodar(tools: ToolSet, nome: string, input: Linha): Promise<Linha> {
  const ferramenta = tools[nome] as unknown as {
    execute: (i: Linha, o: unknown) => Promise<Linha>;
  };
  return ferramenta.execute(input, { toolCallId: "t1", messages: [] });
}

function schemaDe(tools: ToolSet, nome: string) {
  return tools[nome].inputSchema as unknown as { safeParse: (v: unknown) => { success: boolean } };
}

beforeEach(() => {
  mocks.telefoneEhDeCorretor.mockReset();
  mocks.telefoneEhDeCorretor.mockResolvedValue(false);
});

describe("catálogo de escrita", () => {
  it("uma ferramenta por tipo de ação, todas com schema compatível com o gateway", () => {
    const tools = criarFerramentasDePropostaSamiQ({
      supabase: carteira(),
      userId: "u1",
      coletor: [],
    });
    expect(Object.keys(tools).sort()).toEqual([...SAMIQ_PROPOSTA_TIPOS].sort());
    expect(Object.keys(tools)).toHaveLength(25);
    expect(() => compatibilizarFerramentasSamiQ(tools)).not.toThrow();
  });

  it("as regras de cada formulário continuam no input das ferramentas", () => {
    const tools = criarFerramentasDePropostaSamiQ({
      supabase: carteira(),
      userId: "u1",
      coletor: [],
    });
    expect(schemaDe(tools, "atualizar_qualificacao").safeParse({ leadId: LEAD }).success).toBe(
      false,
    );
    expect(
      schemaDe(tools, "atualizar_qualificacao").safeParse({ leadId: LEAD, usaFgts: true }).success,
    ).toBe(true);
    expect(
      schemaDe(tools, "marcar_perdido").safeParse({ leadId: LEAD, categoria: "outro" }).success,
    ).toBe(false);
    expect(
      schemaDe(tools, "marcar_perdido").safeParse({
        leadId: LEAD,
        categoria: "outro",
        detalhe: "mudou de cidade",
      }).success,
    ).toBe(true);
    expect(
      schemaDe(tools, "trocar_vaga").safeParse({
        entraLeadId: LEAD,
        saiLeadId: LEAD_HOMONIMO,
        desfecho: "pediu_retorno",
      }).success,
    ).toBe(false);
    expect(
      schemaDe(tools, "registrar_venda").safeParse({
        leadId: LEAD,
        valorVenda: 250000,
        dataAssinatura: "2026-10-24",
        previsaoRecebimento: "2026-12",
      }).success,
    ).toBe(false);
    expect(schemaDe(tools, "fazer_checkin").safeParse({ modo: "loja" }).success).toBe(false);
    expect(
      schemaDe(tools, "fazer_checkin").safeParse({ modo: "loja", filial: "barra-funda" }).success,
    ).toBe(true);
    // Etapa avulsa só para Qualificação Corretor; o resto é pelo desfecho.
    expect(
      schemaDe(tools, "mudar_etapa").safeParse({ leadId: LEAD, novoStatus: "perdido" }).success,
    ).toBe(false);
    expect(
      schemaDe(tools, "mudar_etapa").safeParse({
        leadId: LEAD,
        novoStatus: "qualificacao_corretor",
      }).success,
    ).toBe(true);
  });

  it("os payloads completos continuam refinados", () => {
    expect(
      AtualizarQualificacaoPayload.safeParse({ tipo: "atualizar_qualificacao", leadId: LEAD })
        .success,
    ).toBe(false);
    expect(
      MudarEtapaPayload.safeParse({ tipo: "mudar_etapa", leadId: LEAD, novoStatus: "perdido" })
        .success,
    ).toBe(false);
  });
});

describe("autonomia por risco", () => {
  const contato = { leadId: LEAD, canal: "ligacao", resultado: "atendeu", resumo: "topou visitar" };

  it("painel (confirmar tudo): nada grava, tudo vira pendente com aviso honesto", async () => {
    const coletor: PropostaColetada[] = [];
    const executar = vi.fn<ExecutorImediato>();
    const tools = criarFerramentasDePropostaSamiQ({
      supabase: carteira(),
      userId: "u1",
      coletor,
      executarAgora: executar,
      agora: AGORA,
    });
    const r = await rodar(tools, "registrar_contato", contato);
    expect(r.status).toBe("aguardando_confirmacao");
    expect(String(r.aviso)).toContain("Nada foi gravado");
    expect(coletor).toHaveLength(1);
    expect(executar).not.toHaveBeenCalled();
  });

  it("WhatsApp: leve grava na hora pelo executor; pesada espera o OK", async () => {
    const coletor: PropostaColetada[] = [];
    const executar = vi.fn<ExecutorImediato>(async () => ({
      ok: true,
      id: "p1",
      efeito: "entrou em Em atendimento",
      desfazivel: true,
    }));
    const tools = criarFerramentasDePropostaSamiQ({
      supabase: carteira(),
      userId: "u1",
      coletor,
      modo: "por_risco",
      executarAgora: executar,
      agora: AGORA,
    });
    const leve = await rodar(tools, "registrar_contato", contato);
    expect(leve).toMatchObject({ status: "gravado", efeito: "entrou em Em atendimento" });
    expect(String(leve.desfazer)).toContain("DESFAZER");
    expect(executar).toHaveBeenCalledTimes(1);
    expect(executar.mock.calls[0][0].payload).toMatchObject({
      tipo: "registrar_contato",
      leadId: LEAD,
    });

    const pesada = await rodar(tools, "agendar_visita", {
      leadId: LEAD,
      inicioEm: "2026-10-25T10:00",
    });
    expect(pesada.status).toBe("aguardando_confirmacao");
    expect(coletor).toHaveLength(1);
    // Data sem fuso vira horário de São Paulo antes de validar.
    expect(coletor[0].payload).toMatchObject({
      tipo: "agendar_visita",
      inicioEm: "2026-10-25T10:00:00-03:00",
    });
  });

  it("falha do executor volta ao modelo como 'nada foi gravado' com o motivo", async () => {
    const tools = criarFerramentasDePropostaSamiQ({
      supabase: carteira(),
      userId: "u1",
      coletor: [],
      modo: "por_risco",
      executarAgora: async () => ({ ok: false, erro: "O CRM recusou o registro do contato" }),
      agora: AGORA,
    });
    const r = await rodar(tools, "registrar_contato", contato);
    expect(r).toMatchObject({ status: "falhou", erro: "O CRM recusou o registro do contato" });
    expect(String(r.aviso)).toContain("Nada foi gravado");
  });
});

describe("travas antes de gravar", () => {
  it("visita para cliente ainda em prospecção: pede o contato antes", async () => {
    const coletor: PropostaColetada[] = [];
    const tools = criarFerramentasDePropostaSamiQ({
      supabase: carteira({ status: "novo" }),
      userId: "u1",
      coletor,
      agora: AGORA,
    });
    const r = await rodar(tools, "agendar_visita", {
      leadId: LEAD,
      inicioEm: "2026-10-25T10:00:00-03:00",
    });
    expect(r.erro).toBe("etapa_nao_permite");
    expect(String(r.detalhe)).toContain("Registre primeiro o contato");
    expect(coletor).toHaveLength(0);
  });

  it("data no passado volta com o 'agora' de São Paulo para o modelo refazer", async () => {
    const tools = criarFerramentasDePropostaSamiQ({
      supabase: carteira(),
      userId: "u1",
      coletor: [],
      agora: AGORA,
    });
    const r = await rodar(tools, "criar_tarefa", {
      leadId: LEAD,
      titulo: "Ligar",
      tipoTarefa: "ligacao",
      vencimentoEm: "2026-10-23T10:00",
    });
    expect(r.erro).toBe("data_no_passado");
    expect(String(r.detalhe)).toContain("24/10/2026");
  });

  it("homônimo: só o primeiro nome pergunta; sobrenome ou a escolha 'a 2' liberam", async () => {
    const ambiguos: string[][] = [];
    const base = { supabase: carteira({ homonimo: true }), userId: "u1", agora: AGORA };
    const nota = { leadId: LEAD, nota: "quer 2 dorms" };

    const bloqueada = await rodar(
      criarFerramentasDePropostaSamiQ({
        ...base,
        coletor: [],
        textoDoCorretor: "falei com o Lucas agora",
        aoAmbiguo: (candidatos) => ambiguos.push(candidatos.map((c) => c.id)),
      }),
      "anotar",
      nota,
    );
    expect(bloqueada.erro).toBe("cliente_ambiguo");
    expect(String(bloqueada.detalhe)).toContain("Numere a lista");
    expect(ambiguos[0]).toEqual([LEAD, LEAD_HOMONIMO]);

    const peloSobrenome = criarFerramentasDePropostaSamiQ({
      ...base,
      coletor: [],
      textoDoCorretor: "falei com o Lucas Ferreira agora",
    });
    expect((await rodar(peloSobrenome, "anotar", nota)).status).toBe("aguardando_confirmacao");

    const pelaEscolha = criarFerramentasDePropostaSamiQ({
      ...base,
      coletor: [],
      textoDoCorretor: "a 1",
      liberados: new Set([LEAD, LEAD_HOMONIMO]),
    });
    expect((await rodar(pelaEscolha, "anotar", nota)).status).toBe("aguardando_confirmacao");
  });

  it("no máximo 20 ações por resposta", async () => {
    const coletor: PropostaColetada[] = [];
    const tools = criarFerramentasDePropostaSamiQ({
      supabase: carteira(),
      userId: "u1",
      coletor,
      leadIdEmContexto: LEAD,
      agora: AGORA,
    });
    for (let i = 0; i < SAMIQ_MAX_PROPOSTAS_POR_TURNO; i++) {
      expect((await rodar(tools, "anotar", { leadId: LEAD, nota: `nota ${i}` })).status).toBe(
        "aguardando_confirmacao",
      );
    }
    expect((await rodar(tools, "anotar", { leadId: LEAD, nota: "uma a mais" })).erro).toBe(
      "limite_de_acoes",
    );
    expect(coletor).toHaveLength(SAMIQ_MAX_PROPOSTAS_POR_TURNO);
  });
});

describe("cadastro de cliente novo (o modelo nunca vê o telefone)", () => {
  const mapaPii = { "[TELEFONE_1]": "(11) 99999-8888", "[EMAIL_1]": "maria@exemplo.com" };

  it("o marcador vira o número só com dígitos no servidor", async () => {
    const coletor: PropostaColetada[] = [];
    const tools = criarFerramentasDePropostaSamiQ({
      supabase: carteira(),
      userId: "u1",
      coletor,
      mapaPii,
      agora: AGORA,
    });
    const r = await rodar(tools, "criar_lead", {
      nome: "Maria Souza",
      telefone: "[TELEFONE_1]",
      email: "[EMAIL_1]",
      origem: "indicacao",
    });
    expect(r.status).toBe("aguardando_confirmacao");
    expect(coletor[0].payload).toMatchObject({
      tipo: "criar_lead",
      nome: "Maria Souza",
      telefone: "11999998888",
      email: "maria@exemplo.com",
    });
    // O que volta ao modelo não tem o número.
    expect(JSON.stringify(r)).not.toContain("99999");
  });

  it("marcador de outra mensagem (sem número) pede o telefone de novo", async () => {
    const tools = criarFerramentasDePropostaSamiQ({
      supabase: carteira(),
      userId: "u1",
      coletor: [],
      agora: AGORA,
    });
    const r = await rodar(tools, "criar_lead", { nome: "Maria Souza", telefone: "[TELEFONE_1]" });
    expect(r.erro).toBe("telefone_invalido");
  });

  it("telefone de corretor não vira cliente; telefone da carteira aponta o cliente que já existe", async () => {
    mocks.telefoneEhDeCorretor.mockResolvedValueOnce(true);
    const tools = criarFerramentasDePropostaSamiQ({
      supabase: carteira(),
      userId: "u1",
      coletor: [],
      mapaPii,
      agora: AGORA,
    });
    expect(
      (await rodar(tools, "criar_lead", { nome: "Maria Souza", telefone: "[TELEFONE_1]" })).erro,
    ).toBe("telefone_de_corretor");
    const dup = criarFerramentasDePropostaSamiQ({
      supabase: carteira({ duplicado: true }),
      userId: "u1",
      coletor: [],
      mapaPii,
      agora: AGORA,
    });
    const r = await rodar(dup, "criar_lead", { nome: "Maria Souza", telefone: "[TELEFONE_1]" });
    expect(r.erro).toBe("cliente_ja_existe");
    expect(r.cliente).toMatchObject({ id: LEAD, nome: "Lucas Ferreira" });
  });
});

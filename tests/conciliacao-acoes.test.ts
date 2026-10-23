import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClientContext } from "@/lib/api-client-auth.server";

// Banco em memória com o encadeamento do supabase-js que o núcleo de
// conciliação usa. Escrita que falha devolve `{ error }` sem lançar, como o
// cliente real — é justamente o caso que este arquivo cobre.
type Linha = Record<string, unknown>;

const banco = vi.hoisted(() => {
  const estado = {
    tabelas: {} as Record<string, Record<string, unknown>[]>,
    falhas: new Set<string>(),
    seq: 0,
  };
  function from(nome: string) {
    estado.tabelas[nome] ??= [];
    const filtros: ((r: Record<string, unknown>) => boolean)[] = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: unknown;
    let ordem: { coluna: string; asc: boolean } | null = null;
    let limite: number | null = null;
    async function executar() {
      if (estado.falhas.has(`${op}:${nome}`)) {
        return { data: null, error: { message: `falha simulada: ${op} em ${nome}` } };
      }
      const linhas = estado.tabelas[nome];
      if (op === "insert") {
        const novas = (Array.isArray(payload) ? payload : [payload]).map((p) => ({
          id: `${nome}-${++estado.seq}`,
          criado_em: new Date(Date.UTC(2026, 9, 1, 0, 0, estado.seq)).toISOString(),
          ...(p as Record<string, unknown>),
        }));
        linhas.push(...novas);
        return { data: novas, error: null };
      }
      const alvo = linhas.filter((r) => filtros.every((f) => f(r)));
      if (op === "update") {
        alvo.forEach((r) => Object.assign(r, payload));
        return { data: alvo, error: null };
      }
      let saida = [...alvo];
      if (ordem) {
        const { coluna, asc } = ordem;
        saida.sort((a, b) => String(a[coluna]).localeCompare(String(b[coluna])) * (asc ? 1 : -1));
      }
      if (limite !== null) saida = saida.slice(0, limite);
      // Cópias, como o cliente real: quem leu não vê escritas posteriores.
      return { data: structuredClone(saida), error: null };
    }
    const builder = {
      select: () => builder,
      eq: (c: string, v: unknown) => (filtros.push((r) => r[c] === v), builder),
      is: (c: string, v: unknown) => (filtros.push((r) => (r[c] ?? null) === v), builder),
      in: (c: string, vs: unknown[]) => (filtros.push((r) => vs.includes(r[c])), builder),
      order: (c: string, o?: { ascending?: boolean }) => (
        (ordem = { coluna: c, asc: o?.ascending ?? true }),
        builder
      ),
      limit: (n: number) => ((limite = n), builder),
      insert: (p: unknown) => ((op = "insert"), (payload = p), builder),
      update: (p: unknown) => ((op = "update"), (payload = p), builder),
      maybeSingle: () =>
        executar().then((r) => ({ ...r, data: (r.data as unknown[] | null)?.[0] ?? null })),
      then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
        executar().then(ok, erro),
    };
    return builder;
  }
  return { estado, cliente: { from } };
});

const capturado = vi.hoisted(() => vi.fn());
const patchComissao = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: banco.cliente }));
vi.mock("@/lib/error-tracking.server", () => ({ captureServerError: capturado }));
vi.mock("@/lib/comissoes-write.server", () => ({ aplicarPatchComissao: patchComissao }));

const {
  conciliarComissoes,
  conciliarVendas,
  desconciliarTransacao,
  reativarTransacao,
  statusRecebimentoAoDesfazer,
} = await import("@/lib/conciliacao.server");

const ctx: ApiClientContext = {
  clientId: null,
  clientName: "Tela Financeiro",
  scope: "write",
  equipeId: null,
  projetoId: null,
  mode: "session",
  origem: "tela_financeiro",
  usuarioId: "u-gestor",
  usuarioNome: "Gestora",
} as unknown as ApiClientContext;

const tabela = (nome: string) => banco.estado.tabelas[nome] ?? [];
const venda = (id: string) => tabela("vendas").find((v) => v.id === id) as Linha;
const transacao = (id: string) => tabela("extrato_transacoes").find((t) => t.id === id) as Linha;

function semear(tabelas: Record<string, Linha[]>) {
  banco.estado.tabelas = structuredClone(tabelas);
  banco.estado.falhas.clear();
  banco.estado.seq = 0;
}

const CREDITO = {
  id: "tx-1",
  conta: "itau_ltda",
  data: "2026-10-10",
  valor: 25000,
  descricao: "TED CONSTRUTORA",
  fitid: "FITID0001234",
  status: "pendente",
};

beforeEach(() => {
  vi.resetAllMocks();
  semear({
    extrato_transacoes: [CREDITO],
    vendas: [
      { id: "v-pendente", status_recebimento: "pendente", data_recebimento: null },
      { id: "v-recebida", status_recebimento: "recebido", data_recebimento: "2026-09-30" },
    ],
  });
});

describe("desfazer conciliação de venda", () => {
  it("devolve a venda pendente para pendente, sem data, e audita as duas mudanças", async () => {
    expect(await conciliarVendas("tx-1", ["v-pendente"], ctx)).toMatchObject({ ok: true });
    expect(venda("v-pendente")).toMatchObject({
      status_recebimento: "recebido",
      data_recebimento: "2026-10-10",
    });

    expect(await desconciliarTransacao("tx-1", ctx)).toMatchObject({ ok: true });

    expect(venda("v-pendente")).toMatchObject({
      status_recebimento: "pendente",
      data_recebimento: null,
    });
    expect(transacao("tx-1").status).toBe("pendente");
    expect(tabela("conciliacoes").every((c) => c.desfeito_em)).toBe(true);
    const desfazimento = tabela("api_alteracao_auditoria").filter((a) =>
      String(a.motivo).startsWith("desfazimento"),
    );
    expect(desfazimento).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campo: "status_recebimento",
          valor_anterior: "recebido",
          valor_novo: "pendente",
        }),
        expect.objectContaining({
          campo: "data_recebimento",
          valor_anterior: "2026-10-10",
          valor_novo: null,
        }),
      ]),
    );
  });

  it("devolve a venda que já estava recebida para a data anterior, ainda recebida", async () => {
    await conciliarVendas("tx-1", ["v-recebida"], ctx);
    expect(await desconciliarTransacao("tx-1", ctx)).toMatchObject({ ok: true });
    expect(venda("v-recebida")).toMatchObject({
      status_recebimento: "recebido",
      data_recebimento: "2026-09-30",
    });
  });

  it("sem auditoria da conciliação, deriva o status da data restaurada", async () => {
    semear({
      extrato_transacoes: [{ ...CREDITO, status: "conciliada" }],
      vendas: [{ id: "v-antiga", status_recebimento: "recebido", data_recebimento: "2026-10-10" }],
      conciliacoes: [
        {
          id: "c-antiga",
          transacao_id: "tx-1",
          tipo: "venda",
          venda_id: "v-antiga",
          data_anterior: null,
          data_aplicada: "2026-10-10",
          desfeito_em: null,
        },
      ],
    });
    expect(await desconciliarTransacao("tx-1", ctx)).toMatchObject({ ok: true });
    expect(venda("v-antiga")).toMatchObject({
      status_recebimento: "pendente",
      data_recebimento: null,
    });
  });

  it("se a venda não puder ser restaurada, avisa e mantém vínculo e transação como estavam", async () => {
    await conciliarVendas("tx-1", ["v-pendente"], ctx);
    banco.estado.falhas.add("update:vendas");

    const r = await desconciliarTransacao("tx-1", ctx);

    expect(r.ok).toBe(false);
    expect(tabela("conciliacoes").every((c) => !c.desfeito_em)).toBe(true);
    expect(transacao("tx-1").status).toBe("conciliada");
  });

  it("se a transação não voltar para pendente, não diz que deu certo", async () => {
    await conciliarVendas("tx-1", ["v-pendente"], ctx);
    banco.estado.falhas.add("update:extrato_transacoes");

    const r = await desconciliarTransacao("tx-1", ctx);

    expect(r.ok).toBe(false);
    expect(venda("v-pendente").status_recebimento).toBe("pendente");

    // O segundo Desfazer conclui o que o primeiro deixou pela metade.
    banco.estado.falhas.clear();
    expect(await desconciliarTransacao("tx-1", ctx)).toMatchObject({ ok: true });
    expect(transacao("tx-1").status).toBe("pendente");
  });

  it("transação de outro status sem vínculo ativo continua recusando o Desfazer", async () => {
    expect(await desconciliarTransacao("tx-1", ctx)).toEqual({ ok: false, erro: "sem_vinculos" });
  });
});

describe("conciliar venda", () => {
  it("se o vínculo não for gravado, devolve a venda ao estado anterior e avisa", async () => {
    banco.estado.falhas.add("insert:conciliacoes");

    const r = await conciliarVendas("tx-1", ["v-pendente"], ctx);

    expect(r.ok).toBe(false);
    expect(venda("v-pendente")).toMatchObject({
      status_recebimento: "pendente",
      data_recebimento: null,
    });
    expect(transacao("tx-1").status).toBe("pendente");
  });

  it("se a transação não for marcada como conciliada, para antes de tocar nas vendas", async () => {
    banco.estado.falhas.add("update:extrato_transacoes");

    const r = await conciliarVendas("tx-1", ["v-pendente"], ctx);

    expect(r.ok).toBe(false);
    expect(venda("v-pendente").status_recebimento).toBe("pendente");
    expect(tabela("conciliacoes")).toHaveLength(0);
  });

  it("lote que falha no meio deixa a transação conciliada para o Desfazer reverter", async () => {
    const r = await conciliarVendas("tx-1", ["v-pendente", "v-inexistente"], ctx);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detalhe).toMatch(/1 item\(ns\) anterior.*Desfazer/);
    expect(transacao("tx-1").status).toBe("conciliada");

    expect(await desconciliarTransacao("tx-1", ctx)).toMatchObject({ ok: true });
    expect(venda("v-pendente")).toMatchObject({
      status_recebimento: "pendente",
      data_recebimento: null,
    });
  });

  it("se a auditoria falhar, conclui, avisa na mensagem e registra o erro", async () => {
    banco.estado.falhas.add("insert:api_alteracao_auditoria");

    const r = await conciliarVendas("tx-1", ["v-pendente"], ctx);

    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.mensagem).toMatch(/auditoria não registrada/);
    expect(transacao("tx-1").status).toBe("conciliada");
    expect(capturado).toHaveBeenCalled();
  });
});

describe("conciliar comissão", () => {
  const DEBITO = { ...CREDITO, id: "tx-2", valor: -1500, status: "pendente" };

  beforeEach(() => {
    semear({
      extrato_transacoes: [DEBITO],
      comissoes: [{ id: "com-1", status: "paga", data_pagamento: "2026-10-01" }],
    });
    patchComissao.mockResolvedValue({ ok: true });
  });

  it("se o vínculo não for gravado, devolve a data de pagamento anterior e avisa", async () => {
    banco.estado.falhas.add("insert:conciliacoes");

    const r = await conciliarComissoes("tx-2", ["com-1"], ctx);

    expect(r.ok).toBe(false);
    expect(patchComissao).toHaveBeenLastCalledWith(
      "com-1",
      expect.objectContaining({ data_pagamento: "2026-10-01" }),
      ctx,
    );
    expect(transacao("tx-2").status).toBe("pendente");
  });
});

describe("reativar transação ignorada", () => {
  it("se a transação não voltar para a fila, não diz que deu certo", async () => {
    semear({ extrato_transacoes: [{ ...CREDITO, status: "ignorada" }] });
    banco.estado.falhas.add("update:extrato_transacoes");

    expect((await reativarTransacao("tx-1", ctx)).ok).toBe(false);
  });
});

describe("statusRecebimentoAoDesfazer", () => {
  it("usa o status auditado quando existe", () => {
    expect(statusRecebimentoAoDesfazer("pendente", "2026-09-30")).toBe("pendente");
  });
  it("sem auditoria, segue a regra da tela de vendas: com data é recebido", () => {
    expect(statusRecebimentoAoDesfazer(null, "2026-09-30")).toBe("recebido");
    expect(statusRecebimentoAoDesfazer(null, null)).toBe("pendente");
  });
});

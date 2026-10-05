// A escrita do desfecho: a ordem dos quatro passos, o que vai em cada um e
// a inversa (soft-delete + objeções de volta). O banco é um stub encadeável
// que registra cada chamada; a interação vai pela RPC registrar_contato_lead
// (regra dos 65, Fatia 3a.2); garantirFollowUpAberto e transicionarLead são
// as peças da casa, mockadas na fronteira.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Chamada = { tabela: string; op: string; args: unknown[] };
const chamadas = vi.hoisted(() => [] as Chamada[]);
const respostas = vi.hoisted(() => new Map<string, unknown>());
// A RPC do contato: registra a chamada como "rpc:<nome>" e devolve o retorno
// cadastrado em `respostas` (o contrato jsonb de registrar_contato_lead).
const rpc = vi.hoisted(() =>
  vi.fn(async (nome: string, args: Record<string, unknown>) => {
    chamadas.push({ tabela: `rpc:${nome}`, op: "rpc", args: [args] });
    return (
      (respostas.get(`rpc:${nome}`) as { data: unknown; error: unknown }) ?? {
        data: null,
        error: null,
      }
    );
  }),
);
vi.mock("@/features/dashboard/queries", () => ({ rpc }));
const contatoOk = (extra: Record<string, unknown> = {}) => ({
  data: {
    ok: true,
    interacao_id: "int-1",
    tarefa_id: null,
    respondeu: true,
    entrou: false,
    via: null,
    status: "analise_credito",
    lotado: null,
    ...extra,
  },
  error: null,
});

vi.mock("@/integrations/supabase/client", () => {
  function builder(tabela: string) {
    const ops: Chamada[] = [];
    const b: Record<string, unknown> = {};
    const chain =
      (op: string) =>
      (...args: unknown[]) => {
        ops.push({ tabela, op, args });
        chamadas.push({ tabela, op, args });
        return b;
      };
    for (const op of [
      "insert",
      "update",
      "select",
      "eq",
      "in",
      "not",
      "lte",
      "order",
      "limit",
      "single",
      "maybeSingle",
    ]) {
      b[op] = chain(op);
    }
    // thenable: resolve com a resposta cadastrada para (tabela, 1ª operação).
    b.then = (resolve: (v: unknown) => void) => {
      const chave = `${tabela}:${ops[0]?.op ?? ""}`;
      resolve(respostas.get(chave) ?? { data: null, error: null });
    };
    return b;
  }
  return { supabase: { from: (t: string) => builder(t) } };
});
const garantirFollowUpAberto = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/follow-up", () => ({ garantirFollowUpAberto }));
const transicionarLead = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/lib/lead-transitions", () => ({ transicionarLead }));

import {
  desfazerDesfecho,
  executarDesfecho,
  unirObjecoes,
} from "@/features/fila-unica/use-desfecho";
import { desfechoPara } from "@/features/fila-unica/desfecho";
import type { FilaUnicaItem } from "@/features/fila-unica/derive";

const item = (status: string, bucket: FilaUnicaItem["bucket"] = "fundo"): FilaUnicaItem => ({
  lead: {
    id: "11111111-1111-4111-8111-111111111111",
    nome: "Josivana Batista",
    telefone: "11999990000",
    email: null,
    status,
    temperatura: "quente",
    ultima_interacao: null,
    proximo_followup: null,
    projeto_nome: null,
    created_at: "2026-06-01T12:00:00Z",
    corretor_id: "c1",
    origem: "facebook",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
  },
  bucket,
  fonte: "inbox",
  filaInbox: "esfriando",
  motivo: "parado",
  score: 80,
  tier: "alta",
  diasParado: 79,
  proximoPasso: null,
  prazo: null,
  vencidoMin: 0,
  venceHoje: false,
  docsPendentes: 0,
  agendamentoId: null,
  visitaEm: null,
  valorEmJogo: null,
});

const agora = new Date("2026-09-12T10:00:00-03:00");

beforeEach(() => {
  chamadas.length = 0;
  respostas.clear();
  respostas.set("rpc:registrar_contato_lead", contatoOk());
  respostas.set("tarefas:select", { data: { id: "tar-1" }, error: null });
  rpc.mockClear();
  respostas.set("leads:select", { data: { objecoes: ["Distância"] }, error: null });
  garantirFollowUpAberto.mockClear();
  transicionarLead.mockClear();
});

describe("executarDesfecho", () => {
  it("grava a interação no vocabulário da timeline e o próximo passo como tarefa", async () => {
    const it0 = item("analise_credito");
    const opcao = desfechoPara(it0).opcoes[1]; // aguardando Caixa
    const r = await executarDesfecho({ item: it0, opcao, agora }, "u1");

    // A interação nunca é gravada pela tela: vai pela RPC, com o passo junto
    // (o banco decide a etapa) e sem criar a tarefa — a Fila cria a sua abaixo.
    expect(chamadas.some((c) => c.tabela === "interacoes")).toBe(false);
    const chamada = chamadas.find((c) => c.tabela === "rpc:registrar_contato_lead");
    expect(chamada?.args[0]).toEqual({
      _lead_id: it0.lead.id,
      _tipo: "ligacao",
      _resultado: "atendeu",
      _conteudo: "Falei · aguardando Caixa",
      _titulo: "Contato — atendeu",
      _proxima_acao: "Cobrar o correspondente",
      _proximo_followup: (() => {
        const v = new Date(agora);
        v.setDate(v.getDate() + 3);
        v.setHours(9, 0, 0, 0);
        return v.toISOString();
      })(),
      _criar_tarefa: false,
    });
    expect(garantirFollowUpAberto).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: it0.lead.id,
        tipo: "follow_up",
        titulo: "Cobrar o correspondente",
        prioridade: "media",
        vencimento: (() => {
          const v = new Date(agora);
          v.setDate(v.getDate() + 3);
          v.setHours(9, 0, 0, 0);
          return v.toISOString();
        })(),
        corretorId: "c1",
        criadoPorId: "u1",
      }),
    );
    expect(transicionarLead).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      interacaoId: "int-1",
      tarefaId: "tar-1",
      etapaMudou: false,
      lotado: false,
      objecoesAntes: null,
    });
    expect(r.proximoTexto).toMatch(/^cobrar o correspondente · /);
    // Nunca escreve proximo_followup/proxima_acao direto no lead.
    expect(chamadas.some((c) => c.tabela === "leads" && c.op === "update")).toBe(false);
  });

  it("conclui os toques vencidos ANTES de criar o próximo (sem duplicata)", async () => {
    const it0 = item("analise_credito");
    const opcao = desfechoPara(it0).opcoes[1];
    await executarDesfecho({ item: it0, opcao, agora }, "u1");

    const conclui = chamadas.find(
      (c) =>
        c.tabela === "tarefas" &&
        c.op === "update" &&
        (c.args[0] as { status?: string })?.status === "concluida",
    );
    expect(conclui).toBeTruthy();
    const iConclui = chamadas.indexOf(conclui!);
    const iCria = chamadas.findIndex((c) => c.tabela === "tarefas" && c.op === "select");
    expect(iConclui).toBeGreaterThanOrEqual(0);
    expect(iConclui).toBeLessThan(iCria);
  });

  it("a objeção vai para o corpo da interação e para leads.objecoes, sem repetir", async () => {
    const it0 = item("visita_realizada");
    const opcao = desfechoPara(it0).opcoes[1]; // objeção
    const r = await executarDesfecho({ item: it0, opcao, texto: "parcela alta", agora }, "u1");
    const chamada = chamadas.find((c) => c.tabela === "rpc:registrar_contato_lead");
    expect(chamada?.args[0]).toMatchObject({ _conteudo: "Objeção: parcela alta" });
    const upd = chamadas.find((c) => c.tabela === "leads" && c.op === "update");
    expect(upd?.args[0]).toEqual({ objecoes: ["Distância", "parcela alta"] });
    expect(r.objecoesAntes).toEqual(["Distância"]);
  });

  it("'Falei' antes de Em atendimento: o banco põe o lead lá (consequência), a tela não transiciona", async () => {
    const it0 = item("aguardando_atendimento", "sla");
    const opcao = desfechoPara(it0).opcoes[0]; // qualificar (atendeu + passo em 2 h)
    respostas.set(
      "rpc:registrar_contato_lead",
      contatoOk({ entrou: true, via: "resposta", status: "em_atendimento" }),
    );
    const r = await executarDesfecho({ item: it0, opcao, agora }, "u1");
    expect(rpc).toHaveBeenCalledWith(
      "registrar_contato_lead",
      expect.objectContaining({
        _resultado: "atendeu",
        _proxima_acao: "Qualificar: renda, FGTS, urgência",
        _proximo_followup: new Date("2026-09-12T12:00:00-03:00").toISOString(),
      }),
    );
    // Nenhum transicionar_lead(em_atendimento) pela tela: a matriz do banco
    // recusa o corretor (22023); a entrada é consequência dentro da RPC.
    expect(transicionarLead).not.toHaveBeenCalled();
    expect(r.etapaMudou).toBe(true);
    expect(r.lotado).toBe(false);
  });

  it("teto cheio: o contato fica gravado, a etapa não, e o registro avisa `lotado`", async () => {
    const it0 = item("novo", "sla");
    const opcao = desfechoPara(it0).opcoes[0];
    respostas.set(
      "rpc:registrar_contato_lead",
      contatoOk({ entrou: false, lotado: { em_atendimento: 65, teto: 65 }, status: "novo" }),
    );
    const r = await executarDesfecho({ item: it0, opcao, agora }, "u1");
    expect(r.interacaoId).toBe("int-1");
    expect(r.etapaMudou).toBe(false);
    expect(r.lotado).toBe(true);
    // A tarefa do passo ainda é criada: o corretor combinou algo com o cliente.
    expect(garantirFollowUpAberto).toHaveBeenCalled();
  });

  it("retorno fora do contrato derruba (fail-closed) antes de criar tarefa", async () => {
    const it0 = item("analise_credito");
    const opcao = desfechoPara(it0).opcoes[1];
    respostas.set("rpc:registrar_contato_lead", { data: { ok: false }, error: null });
    await expect(executarDesfecho({ item: it0, opcao, agora }, "u1")).rejects.toThrow();
    expect(garantirFollowUpAberto).not.toHaveBeenCalled();
  });

  it("a inversa apaga por soft-delete e devolve as objeções", async () => {
    await desfazerDesfecho({
      leadId: "L",
      interacaoId: "int-1",
      tarefaId: "tar-1",
      objecoesAntes: ["Distância"],
      etapaMudou: false,
      lotado: false,
      proximoTexto: null,
    });
    const upds = chamadas.filter((c) => c.op === "update");
    expect(upds.map((c) => c.tabela)).toEqual(["interacoes", "tarefas", "leads"]);
    expect(upds[0].args[0]).toMatchObject({ deleted_at: expect.any(String) });
    expect(upds[1].args[0]).toMatchObject({ deleted_at: expect.any(String), status: "cancelada" });
    expect(upds[2].args[0]).toEqual({ objecoes: ["Distância"] });
  });
});

describe("unirObjecoes", () => {
  it("não repete (sem diferenciar caixa) e respeita o teto de 30", () => {
    expect(unirObjecoes(["Parcela alta"], ["parcela alta", " Distância "])).toEqual([
      "Parcela alta",
      "Distância",
    ]);
    const muitas = Array.from({ length: 30 }, (_, i) => `o${i}`);
    expect(unirObjecoes(muitas, ["nova"])).toHaveLength(30);
  });
});

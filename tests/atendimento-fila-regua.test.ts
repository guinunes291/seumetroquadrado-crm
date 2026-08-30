// Fonte única da fila "followups" (auditoria das abas 2026-08-27): o modo
// Prioridade de /atendimento passa a alimentar a fila com followup_fila_v1 —
// a MESMA RPC do hub Follow-Up — em vez de leads.proximo_followup da inbox.
// Aqui: o mapeamento puro FilaItem→QueueItem, a substituição com dedupe e
// os guards de fonte (fallback para banco antigo, links das portas donas).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FilaFollowUp, FilaItem } from "@/features/followup/fila-client";
import type { AtendimentoQueues, QueueItem, QueueKey } from "@/features/atendimento/derive";
import {
  aplicarFilaRegua,
  filaItemParaQueueItem,
  motivoDoToque,
} from "@/features/atendimento/fila-regua";

const AGORA = new Date("2026-08-29T12:00:00Z");

function filaItem(partial: Partial<FilaItem> & { id: string; nome: string }): FilaItem {
  return {
    telefone: "11999990000",
    email: null,
    status: "em_atendimento",
    temperatura: "morno",
    origem: "facebook",
    projeto_id: null,
    projeto_nome: null,
    corretor_id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-08-20T12:00:00Z",
    ultima_interacao: "2026-08-25T12:00:00Z",
    proxima_acao: null,
    proximo_followup: "2026-08-28T12:00:00Z",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
    observacoes: null,
    minutos_vencido: 90,
    tentativas: 2,
    respondeu: false,
    ...partial,
  };
}

function fila(itens: FilaItem[]): FilaFollowUp {
  return {
    gerado_em: AGORA.toISOString(),
    corretor_id: "11111111-1111-4111-8111-111111111111",
    itens,
  };
}

const FILAS_VAZIAS: AtendimentoQueues = {
  novos: [],
  responder: [],
  followups: [],
  esfriando: [],
  confirmar_visita: [],
  docs: [],
};
const COUNTS_ZERO: Record<QueueKey, number> = {
  novos: 0,
  responder: 0,
  followups: 0,
  esfriando: 0,
  confirmar_visita: 0,
  docs: 0,
};

function queueItemDe(id: string): QueueItem {
  return filaItemParaQueueItem(filaItem({ id, nome: "Ocupante" }), AGORA);
}

describe("filaItemParaQueueItem — FilaItem (hub) → QueueItem (QueueSection)", () => {
  it("mapeia todos os campos do lead sem inventar nada", () => {
    const item = filaItem({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      nome: "Ana Souza",
      telefone: "11988887777",
      email: "ana@ex.com",
      status: "aguardando_retorno",
      temperatura: "quente",
      projeto_nome: "Residencial Aurora",
      renda_informada: "4500",
      usa_fgts: true,
    });
    const q = filaItemParaQueueItem(item, AGORA);
    expect(q.lead).toEqual({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      nome: "Ana Souza",
      telefone: "11988887777",
      email: "ana@ex.com",
      status: "aguardando_retorno",
      temperatura: "quente",
      ultima_interacao: "2026-08-25T12:00:00Z",
      proximo_followup: "2026-08-28T12:00:00Z",
      projeto_nome: "Residencial Aurora",
      created_at: "2026-08-20T12:00:00Z",
      corretor_id: "11111111-1111-4111-8111-111111111111",
      origem: "facebook",
      renda_informada: "4500",
      entrada_disponivel: null,
      usa_fgts: true,
    });
    // Score na mesma régua das outras filas (lib/priority) — tier coerente.
    expect(q.score).toBeGreaterThan(0);
    expect(q.score).toBeLessThanOrEqual(100);
    expect(["alta", "media", "baixa"]).toContain(q.tier);
    // A fila da régua não sabe de docs — o dono desse número é a fila "docs".
    expect(q.docsPendentes).toBe(0);
  });

  it("motivo fala a língua da régua: toque N (tentativas+1) e atraso hh:mm", () => {
    expect(motivoDoToque({ tentativas: 2, minutos_vencido: 90 })).toBe(
      "toque 3 da régua — vencido há 01:30",
    );
    // ≥24h usa o formato canônico de duração do app ("1d 02:15").
    expect(motivoDoToque({ tentativas: 0, minutos_vencido: 1575 })).toBe(
      "toque 1 da régua — vencido há 1d 02:15",
    );
    // 0 minutos = toque de hoje/entrada na régua — nunca "vencido há 00:00".
    expect(motivoDoToque({ tentativas: 4, minutos_vencido: 0 })).toBe(
      "toque 5 da régua — vence hoje",
    );
    const q = filaItemParaQueueItem(filaItem({ id: "x", nome: "X" }), AGORA);
    expect(q.motivo).toBe("toque 3 da régua — vencido há 01:30");
  });
});

describe("aplicarFilaRegua — substituição da fila 'followups' pela fonte do hub", () => {
  it("troca itens e contagem: total = itens da fila_v1, cards limitados a 15", () => {
    const muitos = Array.from({ length: 40 }, (_, i) =>
      filaItem({ id: `id-${i}`, nome: `Lead ${i}` }),
    );
    const { filas, counts } = aplicarFilaRegua({
      filas: { ...FILAS_VAZIAS, followups: [queueItemDe("da-inbox")] },
      counts: { ...COUNTS_ZERO, followups: 7 },
      filaRegua: fila(muitos),
      agora: AGORA,
    });
    // A resposta da inbox para a fila é IGNORADA — nem itens, nem contagem.
    expect(filas.followups.some((i) => i.lead.id === "da-inbox")).toBe(false);
    expect(filas.followups).toHaveLength(15);
    expect(counts.followups).toBe(40);
  });

  it("preserva a ORDEM do hub (mais vencido primeiro) — sem reordenar por score", () => {
    const itens = [
      filaItem({ id: "primeiro", nome: "P", temperatura: null, minutos_vencido: 500 }),
      filaItem({ id: "segundo", nome: "S", temperatura: "quente", minutos_vencido: 10 }),
    ];
    const { filas } = aplicarFilaRegua({
      filas: FILAS_VAZIAS,
      counts: COUNTS_ZERO,
      filaRegua: fila(itens),
      agora: AGORA,
    });
    // "segundo" tem score maior (quente), mas a fila mantém a ordem do hub.
    expect(filas.followups.map((i) => i.lead.id)).toEqual(["primeiro", "segundo"]);
  });

  it("nunca duplica gente: lead já em outra fila da inbox sai dos cards, não do total", () => {
    const { filas, counts } = aplicarFilaRegua({
      filas: { ...FILAS_VAZIAS, responder: [queueItemDe("repetido")] },
      counts: { ...COUNTS_ZERO, responder: 1 },
      filaRegua: fila([
        filaItem({ id: "repetido", nome: "R" }),
        filaItem({ id: "so-na-regua", nome: "S" }),
      ]),
      agora: AGORA,
    });
    expect(filas.followups.map((i) => i.lead.id)).toEqual(["so-na-regua"]);
    // O total continua o do hub — o badge "n de total" comunica o corte.
    expect(counts.followups).toBe(2);
    // As demais filas não são tocadas.
    expect(filas.responder.map((i) => i.lead.id)).toEqual(["repetido"]);
    expect(counts.responder).toBe(1);
  });
});

// Guards de fonte (mesmo estilo de atendimento-modos): a rota consome a fila
// do hub por IMPORT, degrada para a inbox em banco antigo e aponta as portas
// dos hubs donos em vez de duplicar contadores.
describe("fonte única na rota /atendimento (modo Prioridade)", () => {
  const atendimento = readFileSync(
    join(process.cwd(), "src/routes/_authenticated/atendimento.tsx"),
    "utf8",
  );
  const filaRegua = readFileSync(
    join(process.cwd(), "src/features/atendimento/fila-regua.ts"),
    "utf8",
  );

  it("importa fetchFilaFollowUp do módulo do hub — nunca duplica o client", () => {
    expect(atendimento).toContain('from "@/features/followup/fila-client"');
    expect(atendimento).toContain("fetchFilaFollowUp");
    expect(filaRegua).not.toContain("supabase");
    // O mapeamento importa apenas os TIPOS do hub — lógica de fetch fica lá.
    expect(filaRegua).toContain("import type { FilaFollowUp, FilaItem }");
  });

  it("banco antigo sem followup_fila_v1 degrada para a fila da inbox", () => {
    // rpcWithFallback devolve null quando a RPC não existe; null mantém a
    // resposta da inbox valendo (aplicarFilaRegua só roda com dados do hub).
    expect(atendimento).toMatch(/rpcWithFallback<FilaFollowUp \| null>\(/);
    expect(atendimento).toMatch(/\(\) => fetchFilaFollowUp\(\),\s*\(\) => null,/);
    expect(atendimento).toMatch(/filaReguaQ\.data\s*\?\s*aplicarFilaRegua\(/);
  });

  it("a chave da query usa o prefixo do hub — invalidação alcança as duas telas", () => {
    expect(atendimento).toContain('queryKey: ["followup:fila", "atendimento", user?.id]');
    // Realtime assina "tarefas" (a fila da régua nasce delas), "mensagens" e
    // "conversas_tratadas" (a fila Responder lê a fonte única do Lote 3) e
    // refaz o inbox, a fila da régua e o badge da sidebar juntos.
    expect(atendimento).toMatch(
      /useRealtimeInvalidate\(\s*\["leads", "interacoes", "documentacoes", "tarefas", "mensagens", "conversas_tratadas"\],\s*\[\["atendimento:inbox"\], \["followup:fila"\], \["nav-badges"\]\],\s*\)/,
    );
  });

  it("cabeçalho da fila aponta o hub dono: 'Abrir fila da régua' → /follow-up", () => {
    expect(atendimento).toMatch(/<Link to="\/follow-up">Abrir fila da régua<\/Link>/);
  });

  it("placar sem contagem própria de 'novos': aponta 'ver na Prospecção'", () => {
    expect(atendimento).toMatch(/to="\/prospeccao"/);
    expect(atendimento).toContain("ver na Prospecção");
    // O ramo com número continua para as demais filas.
    expect(atendimento).toContain("{QUEUE_LABEL[key]}: {counts[key]}");
  });
});

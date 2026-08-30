/**
 * CONVERSA "AGUARDANDO RESPOSTA" — fonte única + marcador tratada
 * (migration 20260830150000_conversa_aguardando_resposta).
 *
 * O contrato testado:
 * 1. Predicado (conversa_aguardando_resposta, via conversa_estado): pendente
 *    ⇔ última ENTRADA (interacoes sem nota/mudança de status OU mensagens) é
 *    mais recente que a última SAÍDA (interacoes com autor, mensagens sem
 *    falha) e que o marcador tratada. Eco perdido não cega: entrada SÓ em
 *    `mensagens` acende; entrada SÓ em `interacoes` também.
 * 2. Zerar a luz: responder (INSERT de saída, o fluxo real do corretor) OU
 *    marcar_conversa_tratada; entrada NOVA depois da marca reabre sozinha.
 * 3. nav_pendencias v5: chave `mensagens_aguardando` conta LEADS pendentes,
 *    excluindo novo/aguardando_atendimento (dono: badge da Prospecção) e
 *    incluindo etapas terminais (a Central é o lugar de apagar essa luz).
 * 4. atendimento_inbox_v4 (v4.1): a fila `responder` lê a MESMA fonte —
 *    marcar tratada na Central tira o lead da fila do /atendimento.
 * 5. Guardas: RPCs negam sem login e sem acesso ao lead (42501); o predicado
 *    cru não é executável por authenticated; RLS de conversas_tratadas
 *    recorta a leitura por acesso ao lead.
 *
 * Timestamps sempre explícitos e relativos a now() — nada de sleep.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let ana: UsuarioTeste; // corretora dona do lead
let bia: UsuarioTeste; // corretora SEM acesso ao lead da Ana
let lead: string;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  ana = await criarUsuario(c, { nome: "Ana", papel: "corretor" });
  bia = await criarUsuario(c, { nome: "Bia", papel: "corretor" });
  lead = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

/** Mensagem histórica (criado_em = now() - minutosAtras), fora do RLS. */
async function inserirMensagem(opts: {
  leadId?: string;
  direcao: "entrada" | "saida";
  minutosAtras: number;
  corretorId?: string | null;
  status?: string;
}): Promise<void> {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.mensagens (lead_id, corretor_id, direcao, status, conteudo, criado_em)
     VALUES ($1, $2, $3, $4, 'msg de teste', now() - make_interval(mins => $5))`,
    [
      opts.leadId ?? lead,
      opts.corretorId ?? null,
      opts.direcao,
      opts.status ?? (opts.direcao === "entrada" ? "recebida" : "enviada"),
      opts.minutosAtras,
    ],
  );
}

async function inserirInteracao(opts: {
  leadId?: string;
  direcao: "entrada" | "saida";
  minutosAtras: number;
  tipo?: string;
  autorId?: string | null;
}): Promise<void> {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, conteudo, ocorreu_em)
     VALUES ($1, $2, $3, $4, 'interacao de teste', now() - make_interval(mins => $5))`,
    [
      opts.leadId ?? lead,
      opts.autorId ?? null,
      opts.tipo ?? "whatsapp",
      opts.direcao,
      opts.minutosAtras,
    ],
  );
}

async function estadoComo(userId: string, leadId = lead): Promise<Record<string, unknown>> {
  await comoUsuario(c, userId);
  const r = await c.query(`SELECT public.conversa_estado($1) AS e`, [leadId]);
  return r.rows[0].e as Record<string, unknown>;
}

async function navComo(userId: string): Promise<Record<string, number>> {
  await comoUsuario(c, userId);
  const r = await c.query(`SELECT public.nav_pendencias() AS n`);
  return r.rows[0].n as Record<string, number>;
}

async function filaResponderComo(userId: string): Promise<{ total: number; ids: string[] }> {
  await comoUsuario(c, userId);
  const r = await c.query(
    `SELECT total_count::int AS total, items
       FROM public.atendimento_inbox_v4()
      WHERE fila = 'responder'`,
  );
  const items = (r.rows[0]?.items ?? []) as Array<{ lead: { id: string }; motivo: string }>;
  return { total: r.rows[0]?.total ?? 0, ids: items.map((i) => i.lead.id) };
}

async function limparConversa(): Promise<void> {
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.mensagens WHERE lead_id = $1`, [lead]);
  await c.query(`DELETE FROM public.interacoes WHERE lead_id = $1`, [lead]);
  await c.query(`DELETE FROM public.conversas_tratadas WHERE lead_id = $1`, [lead]);
}

// ---------------------------------------------------------------------------
// 1. Predicado — entrada/saída pelas DUAS tabelas
// ---------------------------------------------------------------------------

describe("predicado da fonte única", () => {
  it("sem histórico nenhum: nada aguardando", async () => {
    await limparConversa();
    expect(await estadoComo(ana.id)).toMatchObject({ aguardando: false });
  });

  it("entrada SÓ em mensagens (eco do webhook perdido) acende", async () => {
    await limparConversa();
    await inserirMensagem({ direcao: "entrada", minutosAtras: 30 });
    expect(await estadoComo(ana.id)).toMatchObject({ aguardando: true });
  });

  it("entrada SÓ em interacoes (contato registrado à mão) também acende", async () => {
    await limparConversa();
    await inserirInteracao({ direcao: "entrada", minutosAtras: 30 });
    expect(await estadoComo(ana.id)).toMatchObject({ aguardando: true });
  });

  it("nota e mudança de status NÃO contam como entrada", async () => {
    await limparConversa();
    await inserirInteracao({ direcao: "entrada", minutosAtras: 30, tipo: "nota" });
    await inserirInteracao({ direcao: "entrada", minutosAtras: 25, tipo: "mudanca_status" });
    expect(await estadoComo(ana.id)).toMatchObject({ aguardando: false });
  });

  it("resposta pelo fluxo real (INSERT de saída como corretora) apaga a luz", async () => {
    await limparConversa();
    await inserirMensagem({ direcao: "entrada", minutosAtras: 30 });
    await comoUsuario(c, ana.id);
    // O mesmo INSERT que a Central/ficha fazem (RLS: só direcao=saida).
    await c.query(
      `INSERT INTO public.mensagens (lead_id, corretor_id, direcao, canal, provider, status, conteudo)
       VALUES ($1, $2, 'saida', 'whatsapp', 'simulado', 'enviada', 'respondi!')`,
      [lead, ana.id],
    );
    expect(await estadoComo(ana.id)).toMatchObject({ aguardando: false });
  });

  it("saída com status 'falha' não vale como resposta", async () => {
    await limparConversa();
    await inserirMensagem({ direcao: "entrada", minutosAtras: 30 });
    await inserirMensagem({
      direcao: "saida",
      minutosAtras: 10,
      corretorId: ana.id,
      status: "falha",
    });
    expect(await estadoComo(ana.id)).toMatchObject({ aguardando: true });
  });

  it("saída registrada em interacoes (botão wa.me existente) também apaga", async () => {
    await limparConversa();
    await inserirMensagem({ direcao: "entrada", minutosAtras: 30 });
    await inserirInteracao({ direcao: "saida", minutosAtras: 10, autorId: ana.id });
    expect(await estadoComo(ana.id)).toMatchObject({ aguardando: false });
  });

  it("entrada NOVA depois da resposta reabre a pendência", async () => {
    await limparConversa();
    await inserirMensagem({ direcao: "entrada", minutosAtras: 30 });
    await inserirInteracao({ direcao: "saida", minutosAtras: 20, autorId: ana.id });
    await inserirMensagem({ direcao: "entrada", minutosAtras: 5 });
    expect(await estadoComo(ana.id)).toMatchObject({ aguardando: true });
  });
});

// ---------------------------------------------------------------------------
// 2. Marcar tratada — a luz que zera sem responder
// ---------------------------------------------------------------------------

describe("marcar_conversa_tratada", () => {
  it("apaga a pendência, devolve o estado novo e entrada nova reabre", async () => {
    await limparConversa();
    await inserirMensagem({ direcao: "entrada", minutosAtras: 30 });
    expect(await estadoComo(ana.id)).toMatchObject({ aguardando: true });

    await comoUsuario(c, ana.id);
    const r = await c.query(`SELECT public.marcar_conversa_tratada($1) AS e`, [lead]);
    expect(r.rows[0].e).toMatchObject({ aguardando: false });
    expect(r.rows[0].e.tratada_em).toBeTruthy();

    // Entrada nova DEPOIS da marca reabre sozinha (nada de flag que gruda).
    await inserirMensagem({ direcao: "entrada", minutosAtras: 0 });
    expect(await estadoComo(ana.id)).toMatchObject({ aguardando: true });
  });

  it("RLS de conversas_tratadas: dona vê a marca, corretora alheia não", async () => {
    await comoUsuario(c, ana.id);
    const daAna = await c.query(
      `SELECT lead_id FROM public.conversas_tratadas WHERE lead_id = $1`,
      [lead],
    );
    expect(daAna.rowCount).toBe(1);
    await comoUsuario(c, bia.id);
    const daBia = await c.query(
      `SELECT lead_id FROM public.conversas_tratadas WHERE lead_id = $1`,
      [lead],
    );
    expect(daBia.rowCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. nav_pendencias v5 — dono único e disjunção com a Prospecção
// ---------------------------------------------------------------------------

describe("nav_pendencias v5 (mensagens_aguardando)", () => {
  it("conta o lead pendente da corretora e zera ao tratar", async () => {
    await limparConversa();
    await inserirMensagem({ direcao: "entrada", minutosAtras: 30 });
    expect((await navComo(ana.id)).mensagens_aguardando).toBe(1);
    // A Bia não vê a conversa da Ana.
    expect((await navComo(bia.id)).mensagens_aguardando).toBe(0);

    await comoUsuario(c, ana.id);
    await c.query(`SELECT public.marcar_conversa_tratada($1)`, [lead]);
    expect((await navComo(ana.id)).mensagens_aguardando).toBe(0);
  });

  it("lead em aguardando_atendimento fica FORA (dono: badge da Prospecção)", async () => {
    const entrada = await criarLead(c, { corretorId: ana.id, status: "aguardando_atendimento" });
    await inserirMensagem({ leadId: entrada, direcao: "entrada", minutosAtras: 10 });
    const nav = await navComo(ana.id);
    expect(nav.mensagens_aguardando).toBe(0);
    expect(nav.atendimento).toBe(1);
    // …mas no inbox o lead está na fila `novos`, nunca em `responder`.
    const fila = await filaResponderComo(ana.id);
    expect(fila.ids).not.toContain(entrada);
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.leads WHERE id = $1`, [entrada]);
  });

  it("etapa terminal CONTA — a Central é o lugar de apagar essa luz", async () => {
    const perdido = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads
          SET status = 'perdido', motivo_perdido = 'sem retorno',
              motivo_perda_categoria = 'sem_contato'
        WHERE id = $1`,
      [perdido],
    );
    // A mudança de status pode ecoar interação (tipo mudanca_status, filtrada);
    // a ENTRADA chega depois dela.
    await inserirMensagem({ leadId: perdido, direcao: "entrada", minutosAtras: 0 });
    expect((await navComo(ana.id)).mensagens_aguardando).toBe(1);
    // O inbox segue recortado à carteira ativa: perdido não entra na fila.
    const fila = await filaResponderComo(ana.id);
    expect(fila.ids).not.toContain(perdido);
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.leads WHERE id = $1`, [perdido]);
  });
});

// ---------------------------------------------------------------------------
// 4. Fila `responder` do inbox lê a MESMA fonte
// ---------------------------------------------------------------------------

describe("atendimento_inbox_v4 (v4.1) — fila responder", () => {
  it("entrada pendente põe o lead na fila com o motivo da espera", async () => {
    await limparConversa();
    await inserirMensagem({ direcao: "entrada", minutosAtras: 45 });
    await comoUsuario(c, ana.id);
    const r = await c.query(
      `SELECT items FROM public.atendimento_inbox_v4() WHERE fila = 'responder'`,
    );
    const items = r.rows[0].items as Array<{ lead: { id: string }; motivo: string }>;
    expect(items.map((i) => i.lead.id)).toContain(lead);
    expect(items.find((i) => i.lead.id === lead)?.motivo).toMatch(/aguarda retorno/);
  });

  it("marcar tratada na Central tira o lead da fila do /atendimento", async () => {
    await comoUsuario(c, ana.id);
    await c.query(`SELECT public.marcar_conversa_tratada($1)`, [lead]);
    const fila = await filaResponderComo(ana.id);
    expect(fila.ids).not.toContain(lead);
    expect(fila.total).toBe(0);
  });

  it("eco perdido não cega: entrada só em mensagens já classifica", async () => {
    await limparConversa();
    await inserirMensagem({ direcao: "entrada", minutosAtras: 5 });
    await comoSuperuser(c);
    const eco = await c.query(
      `SELECT count(*)::int AS n FROM public.interacoes WHERE lead_id = $1`,
      [lead],
    );
    expect(eco.rows[0].n).toBe(0); // sem eco de propósito
    const fila = await filaResponderComo(ana.id);
    expect(fila.ids).toContain(lead);
  });
});

// ---------------------------------------------------------------------------
// 5. Guardas
// ---------------------------------------------------------------------------

describe("guardas e superfícies", () => {
  it("RPCs negam corretora sem acesso ao lead e chamada sem login (42501)", async () => {
    await comoUsuario(c, bia.id);
    expect(await errCode(c.query(`SELECT public.conversa_estado($1)`, [lead]))).toBe("42501");
    expect(await errCode(c.query(`SELECT public.marcar_conversa_tratada($1)`, [lead]))).toBe(
      "42501",
    );
    // Sem login (claims vazios): mesmo código, nada vaza.
    await comoSuperuser(c);
    await c.query(`SET ROLE authenticated`);
    expect(await errCode(c.query(`SELECT public.conversa_estado($1)`, [lead]))).toBe("42501");
    await c.query(`RESET ROLE`);
  });

  it("o predicado cru não é executável por authenticated (só via funções DEFINER)", async () => {
    await comoUsuario(c, ana.id);
    expect(
      await errCode(c.query(`SELECT * FROM public.conversa_aguardando_resposta($1)`, [lead])),
    ).toBe("42501");
  });

  it("nav_pendencias devolve as 6 chaves (as 5 da v4 intactas)", async () => {
    const nav = await navComo(ana.id);
    for (const k of [
      "atendimento",
      "tarefas_vencidas",
      "agenda_hoje",
      "aprovacoes",
      "followups",
      "mensagens_aguardando",
    ]) {
      expect(nav).toHaveProperty(k);
    }
  });
});

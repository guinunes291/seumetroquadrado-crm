/**
 * MÓDULO FOLLOW-UP — régua de 13 toques (migration 20260827130000_followup_regua).
 *
 * O contrato testado:
 * 1. Contador derivado (followup_tentativas / followup_toques_do_lead):
 *    interações de saída humanas + mensagens + chamadas, com colapso de
 *    sessão — eventos a menos de 10 minutos do EVENTO ANTERIOR são o mesmo
 *    toque. Retroativo por construção (ocorreu_em no passado conta).
 *    ATENÇÃO: o roteiro deste teste previa que uma mensagem a t0+31min
 *    fosse o 3º toque; o SQL (corretamente, pela regra documentada de
 *    colapso) a funde no 2º toque — ela está a 1min do evento de t0+30min.
 *    O gap é medido do evento anterior, não do início do toque anterior.
 * 2. followup_fila_v1: leads do corretor com TOQUE (tarefa de contato aberta)
 *    vencido/hoje ou sem próximo toque; tarefas de outros tipos (visita,
 *    documentação…) não são toque; vencidos primeiro; esgotados fora; guard
 *    de acesso (gestor da equipe pode, corretor alheio não).
 * 3. marcar_followup_esgotado / reativar_followup: coluna + cancelamento das
 *    tarefas de contato abertas (espelho proximo_followup zera) + nota;
 *    reativar zera o contador via baseline followup_reativado_em.
 * 4. nav_pendencias v3: chave `followups` = LEADS com tarefa de contato
 *    aberta vencendo até hoje (BRT).
 * 5. devolver_leads_followup_vencido: gate do modelo v2 + opt-in por flag em
 *    gestao_config; devolve o lead à base e loga regra 'followup_vencido'.
 * 6. KPIs: MV metrics.followup_tentativa_mensal + RPCs self-serve/gestão.
 *
 * Timestamps sempre relativos a now() (make_interval) — nada de sleep.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarLead,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
});

afterAll(async () => {
  // gestao_config sobrevive ao limparDados — devolve a flag ao default
  // mesmo se algum teste do bloco de SLA morrer no meio.
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.gestao_config
        SET valor = jsonb_set(valor, '{devolucao_ativa}', 'false'::jsonb)
      WHERE chave = 'regua_followup'`,
  );
  await limparDados(c);
  await c.end();
});

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

function daquiDias(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

/** Interação histórica (ocorreu_em = now() - minutosAtras), fora do RLS. */
async function inserirInteracao(opts: {
  leadId: string;
  autorId: string | null;
  minutosAtras: number;
  tipo?: string;
  direcao?: string;
  conteudo?: string;
}): Promise<void> {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, conteudo, ocorreu_em)
     VALUES ($1, $2, $3::public.interacao_tipo, $4::public.interacao_direcao, $5,
             now() - make_interval(mins => $6::int))`,
    [
      opts.leadId,
      opts.autorId,
      opts.tipo ?? "whatsapp",
      opts.direcao ?? "saida",
      opts.conteudo ?? "interação de teste",
      opts.minutosAtras,
    ],
  );
}

/** Mensagem de saída simulada (provider fake), fora do RLS. */
async function inserirMensagem(opts: {
  leadId: string;
  corretorId: string;
  minutosAtras: number;
  status?: string;
}): Promise<void> {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.mensagens
       (lead_id, corretor_id, direcao, canal, provider, status, conteudo, criado_em)
     VALUES ($1, $2, 'saida', 'whatsapp', 'simulado', $3, 'mensagem de teste',
             now() - make_interval(mins => $4::int))`,
    [opts.leadId, opts.corretorId, opts.status ?? "enviada", opts.minutosAtras],
  );
}

/** Tarefa fora do RLS (mesmo padrão de followup-triggers.test.ts). */
async function criarTarefa(opts: {
  leadId: string | null;
  corretorId: string;
  tipo?: string;
  status?: string;
  vencimento?: Date | null;
}): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `INSERT INTO public.tarefas (titulo, tipo, status, lead_id, corretor_id, data_vencimento)
     VALUES ('Tarefa de teste', $1::public.tarefa_tipo, $2::public.tarefa_status, $3, $4, $5)
     RETURNING id`,
    [
      opts.tipo ?? "follow_up",
      opts.status ?? "pendente",
      opts.leadId,
      opts.corretorId,
      opts.vencimento ?? null,
    ],
  );
  return r.rows[0].id as string;
}

async function tentativas(leadId: string): Promise<number> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT public.followup_tentativas($1) AS n`, [leadId]);
  return r.rows[0].n as number;
}

async function leadRow(leadId: string): Promise<Record<string, unknown>> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT status::text AS status, corretor_id, corretor_anterior_id, classe_lead,
            proximo_followup, followup_esgotado_em
       FROM public.leads WHERE id = $1`,
    [leadId],
  );
  return r.rows[0];
}

// Fixtures compartilhadas entre describes (o arquivo roda sequencial e só
// limpa no beforeAll/afterAll do arquivo — o item de KPIs reusa os toques
// do contador e a carteira da fila).
let corretorToques: UsuarioTeste;
let leadToques: string;
let corretorFila: UsuarioTeste;
let gestorFila: UsuarioTeste;
let leadA: string; // vencido ontem
let leadB: string; // sem próximo followup
let leadC: string; // amanhã
let leadD: string; // régua esgotada
let leadE: string; // só pendência de documentação vencida (não é toque)

// ---------------------------------------------------------------------------
// 1. Contador com colapso de sessão (retroativo)
// ---------------------------------------------------------------------------

describe("followup_tentativas: colapso de sessão e eventos que contam", () => {
  beforeAll(async () => {
    corretorToques = await criarUsuario(c, { papel: "corretor", nome: "Corretor Toques" });
    leadToques = await criarLead(c, { corretorId: corretorToques.id, status: "em_atendimento" });
  });

  it("t0 e t0+2min (retroativos) colapsam na mesma sessão → 1 toque", async () => {
    // t0 = now() - 180min: inserts históricos contam (contador derivado).
    await inserirInteracao({ leadId: leadToques, autorId: corretorToques.id, minutosAtras: 180 });
    await inserirInteracao({ leadId: leadToques, autorId: corretorToques.id, minutosAtras: 178 });
    expect(await tentativas(leadToques)).toBe(1);
  });

  it("t0+30min abre o 2º toque (gap de 28min ≥ 10min do evento anterior)", async () => {
    await inserirInteracao({ leadId: leadToques, autorId: corretorToques.id, minutosAtras: 150 });
    expect(await tentativas(leadToques)).toBe(2);
  });

  it("nota e interação de ENTRADA não são toque", async () => {
    await inserirInteracao({
      leadId: leadToques,
      autorId: corretorToques.id,
      minutosAtras: 160,
      tipo: "nota",
      direcao: "interna",
    });
    // cliente respondeu a t0+35min (autor NULL, direção entrada)
    await inserirInteracao({
      leadId: leadToques,
      autorId: null,
      minutosAtras: 145,
      direcao: "entrada",
    });
    expect(await tentativas(leadToques)).toBe(2);
  });

  it("mensagem a t0+31min COLAPSA no 2º toque (1min do evento anterior) — diverge do roteiro; ver resumo", async () => {
    // O roteiro da tarefa previa "3º toque" aqui, medindo os 31min a partir
    // de t0. O contrato da migration mede o gap do EVENTO anterior
    // (t0+30min): 1min < 10min → mesma sessão. Comportamento real: 2.
    await inserirMensagem({ leadId: leadToques, corretorId: corretorToques.id, minutosAtras: 149 });
    expect(await tentativas(leadToques)).toBe(2);
  });

  it("mensagem 30min após o último evento (t0+61min) é o 3º toque; mensagem com falha não conta", async () => {
    await inserirMensagem({ leadId: leadToques, corretorId: corretorToques.id, minutosAtras: 119 });
    expect(await tentativas(leadToques)).toBe(3);

    // falha de envio não é toque (status = 'falha' fica fora do predicado)
    await inserirMensagem({
      leadId: leadToques,
      corretorId: corretorToques.id,
      minutosAtras: 60,
      status: "falha",
    });
    expect(await tentativas(leadToques)).toBe(3);

    // a lista de toques é ordenada e tudo aqui é canal whatsapp
    await comoSuperuser(c);
    const toques = await c.query(`SELECT canal FROM public.followup_toques_do_lead($1)`, [
      leadToques,
    ]);
    expect(toques.rows.map((r: { canal: string }) => r.canal)).toEqual([
      "whatsapp",
      "whatsapp",
      "whatsapp",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. Fila do dia (followup_fila_v1)
// ---------------------------------------------------------------------------

describe("followup_fila_v1: composição, ordem e guard de acesso", () => {
  let intruso: UsuarioTeste;

  beforeAll(async () => {
    const equipe = await criarEquipe(c, { nome: "Equipe Fila" });
    gestorFila = await criarUsuario(c, { papel: "gestor", nome: "Gestor Fila", equipeId: equipe });
    corretorFila = await criarUsuario(c, {
      papel: "corretor",
      nome: "Corretor Fila",
      equipeId: equipe,
    });
    intruso = await criarUsuario(c, { papel: "corretor", nome: "Corretor Intruso" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [
      gestorFila.id,
      equipe,
    ]);

    // A: follow-up vencido ontem (via tarefa — proximo_followup é espelho).
    leadA = await criarLead(c, { corretorId: corretorFila.id, status: "em_atendimento" });
    await criarTarefa({ leadId: leadA, corretorId: corretorFila.id, vencimento: daquiDias(-1) });
    // última interação (não-nota) de A é de SAÍDA → respondeu = false
    await inserirInteracao({ leadId: leadA, autorId: corretorFila.id, minutosAtras: 2880 });

    // B: sem próximo followup (entra na régua agora); última não-nota é de
    // ENTRADA → respondeu = true, e uma nota posterior não muda isso.
    leadB = await criarLead(c, { corretorId: corretorFila.id, status: "em_atendimento" });
    await inserirInteracao({ leadId: leadB, autorId: null, minutosAtras: 60, direcao: "entrada" });
    await inserirInteracao({
      leadId: leadB,
      autorId: corretorFila.id,
      minutosAtras: 30,
      tipo: "nota",
      direcao: "interna",
    });

    // C: próximo followup amanhã — fora da fila de hoje.
    leadC = await criarLead(c, { corretorId: corretorFila.id, status: "em_atendimento" });
    await criarTarefa({ leadId: leadC, corretorId: corretorFila.id, vencimento: daquiDias(1) });

    // D: régua esgotada — nunca aparece na fila.
    leadD = await criarLead(c, { corretorId: corretorFila.id, status: "em_atendimento" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET followup_esgotado_em = now() WHERE id = $1`, [leadD]);

    // E: só uma pendência de DOCUMENTAÇÃO vencida há 3 dias — não é toque.
    // Entra na régua como quem não tem próximo toque, nunca como "vencido"
    // (o espelho proximo_followup cobre qualquer tipo; a fila não pode).
    leadE = await criarLead(c, { corretorId: corretorFila.id, status: "analise_credito" });
    await criarTarefa({
      leadId: leadE,
      corretorId: corretorFila.id,
      tipo: "documentacao",
      vencimento: daquiDias(-3),
    });
  });

  it("devolve A (vencido) antes de B e E (sem próximo toque); C (amanhã) e D (esgotado) ficam fora", async () => {
    await comoUsuario(c, corretorFila.id);
    const r = await c.query(`SELECT public.followup_fila_v1() AS fila`);
    const fila = r.rows[0].fila as {
      corretor_id: string;
      itens: Array<Record<string, unknown>>;
    };

    expect(fila.corretor_id).toBe(corretorFila.id);
    expect(fila.itens.map((i) => i.id)).toEqual([leadA, leadB, leadE]);

    const [a, b, e] = fila.itens;
    // A: vencido ontem — minutos_vencido > 0, 1 toque no histórico, sem resposta
    expect(a.minutos_vencido as number).toBeGreaterThan(0);
    expect(a.tentativas).toBe(1);
    expect(a.respondeu).toBe(false);
    expect(a.proximo_followup).not.toBeNull();
    // B: entra na régua sem toque agendado; cliente falou por último
    expect(b.proximo_followup).toBeNull();
    expect(b.minutos_vencido).toBe(0);
    expect(b.tentativas).toBe(0);
    expect(b.respondeu).toBe(true);
    // E: a documentação vencida NÃO é toque — entra como quem não tem próximo
    // toque, sem um "vencido há 3 dias" falso
    expect(e.proximo_followup).toBeNull();
    expect(e.minutos_vencido).toBe(0);
  });

  it("gestor da equipe consulta a fila do corretor (_corretor explícito)", async () => {
    await comoUsuario(c, gestorFila.id);
    const r = await c.query(`SELECT public.followup_fila_v1($1) AS fila`, [corretorFila.id]);
    const fila = r.rows[0].fila as { itens: Array<{ id: string }> };
    expect(fila.itens.map((i) => i.id)).toEqual([leadA, leadB, leadE]);
  });

  it("regua_followup_atual: qualquer membro ativo lê a régua vigente (a fila do corretor depende dela)", async () => {
    await comoUsuario(c, corretorFila.id);
    const r = await c.query(`SELECT public.regua_followup_atual() AS regua`);
    const regua = r.rows[0].regua as Record<string, unknown>;
    expect(regua.max_toques).toBe(13);
    expect(regua.devolucao_ativa).toBe(false);
  });

  it("corretor alheio pedindo a fila de outro → forbidden", async () => {
    await comoUsuario(c, intruso.id);
    expect(await errCode(c.query(`SELECT public.followup_fila_v1($1)`, [corretorFila.id]))).toBe(
      "P0001",
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Esgotar / reativar a régua
// ---------------------------------------------------------------------------

describe("marcar_followup_esgotado / reativar_followup", () => {
  let corretorEsg: UsuarioTeste;
  let intrusoEsg: UsuarioTeste;
  let leadEsg: string;
  let tarefaEsg: string;

  beforeAll(async () => {
    corretorEsg = await criarUsuario(c, { papel: "corretor", nome: "Corretor Esgota" });
    intrusoEsg = await criarUsuario(c, { papel: "corretor", nome: "Corretor Sem Acesso" });
    leadEsg = await criarLead(c, { corretorId: corretorEsg.id, status: "em_atendimento" });
    tarefaEsg = await criarTarefa({
      leadId: leadEsg,
      corretorId: corretorEsg.id,
      tipo: "follow_up",
      vencimento: daquiDias(2),
    });
    // um toque no histórico — o teste de reativação prova o reset do contador
    await inserirInteracao({ leadId: leadEsg, autorId: corretorEsg.id, minutosAtras: 120 });
  });

  it("esgotar: seta a coluna, cancela a tarefa de contato aberta, zera o espelho e cria nota", async () => {
    // pré-condição: o espelho está povoado pela tarefa pendente
    expect((await leadRow(leadEsg)).proximo_followup).not.toBeNull();

    await comoUsuario(c, corretorEsg.id);
    await c.query(`SELECT public.marcar_followup_esgotado($1)`, [leadEsg]);

    const l = await leadRow(leadEsg);
    expect(l.followup_esgotado_em).not.toBeNull();
    // a tarefa aberta de contato virou cancelada…
    const t = await c.query(`SELECT status::text AS status FROM public.tarefas WHERE id = $1`, [
      tarefaEsg,
    ]);
    expect(t.rows[0].status).toBe("cancelada");
    // …e o espelho tarefas ↔ proximo_followup zerou junto
    expect(l.proximo_followup).toBeNull();
    // nota de auditoria com a assinatura da régua
    const nota = await c.query(
      `SELECT autor_id FROM public.interacoes
        WHERE lead_id = $1 AND tipo = 'nota' AND metadata ->> 'fonte' = 'followup_regua'
          AND metadata ->> 'acao' = 'esgotado'`,
      [leadEsg],
    );
    expect(nota.rowCount).toBe(1);
    expect(nota.rows[0].autor_id).toBe(corretorEsg.id);
  });

  it("reativar: limpa a coluna, ZERA o contador (baseline do ciclo) e registra a nota", async () => {
    // antes da reativação o histórico conta o toque dado
    expect(await tentativas(leadEsg)).toBe(1);

    await comoUsuario(c, corretorEsg.id);
    await c.query(`SELECT public.reativar_followup($1)`, [leadEsg]);

    expect((await leadRow(leadEsg)).followup_esgotado_em).toBeNull();
    // novo ciclo de verdade: o baseline followup_reativado_em zera o derivado
    // (o toque antigo segue no histórico e na MV, mas a régua recomeça do 1)
    expect(await tentativas(leadEsg)).toBe(0);
    const nota = await c.query(
      `SELECT 1 FROM public.interacoes
        WHERE lead_id = $1 AND tipo = 'nota' AND metadata ->> 'fonte' = 'followup_regua'
          AND metadata ->> 'acao' = 'reativado'`,
      [leadEsg],
    );
    expect(nota.rowCount).toBe(1);
  });

  it("corretor sem acesso ao lead → forbidden nas duas RPCs", async () => {
    await comoUsuario(c, intrusoEsg.id);
    expect(await errCode(c.query(`SELECT public.marcar_followup_esgotado($1)`, [leadEsg]))).toBe(
      "P0001",
    );
    expect(await errCode(c.query(`SELECT public.reativar_followup($1)`, [leadEsg]))).toBe("P0001");
  });
});

// ---------------------------------------------------------------------------
// 4. nav_pendencias v3 — contador `followups`
// ---------------------------------------------------------------------------

describe("nav_pendencias: contador followups", () => {
  let corretorNav: UsuarioTeste;

  beforeAll(async () => {
    corretorNav = await criarUsuario(c, { papel: "corretor", nome: "Corretor Nav" });
    const leadNav = await criarLead(c, { corretorId: corretorNav.id, status: "em_atendimento" });
    // duas tarefas de contato até hoje no MESMO lead = UM toque a dar;
    // a de amanhã NÃO conta.
    await criarTarefa({
      leadId: leadNav,
      corretorId: corretorNav.id,
      tipo: "whatsapp",
      vencimento: daquiDias(-1),
    });
    await criarTarefa({
      leadId: leadNav,
      corretorId: corretorNav.id,
      tipo: "ligacao",
      vencimento: new Date(Date.now() - 5 * 60 * 1000),
    });
    await criarTarefa({
      leadId: leadNav,
      corretorId: corretorNav.id,
      tipo: "follow_up",
      vencimento: daquiDias(1),
    });
    // segundo lead com toque vencido — prova que o contador é por LEAD
    const leadNav2 = await criarLead(c, { corretorId: corretorNav.id, status: "em_atendimento" });
    await criarTarefa({
      leadId: leadNav2,
      corretorId: corretorNav.id,
      tipo: "follow_up",
      vencimento: daquiDias(-2),
    });
  });

  it("tem a chave `followups` e conta LEADS com toque de contato até hoje", async () => {
    await comoUsuario(c, corretorNav.id);
    const r = await c.query(`SELECT public.nav_pendencias() AS nav`);
    const nav = r.rows[0].nav as Record<string, number>;
    expect(Object.keys(nav)).toContain("followups");
    // leadNav (2 tarefas até hoje = 1 toque) + leadNav2 (1 vencida) = 2 leads;
    // a tarefa de amanhã fica de fora
    expect(nav.followups).toBe(2);
  });

  it("contadores DISJUNTOS (v4): tarefa de contato vencida NÃO acende tarefas_vencidas", async () => {
    // Todas as tarefas vencidas da fixture são de CONTATO — domínio do
    // contador `followups`. Zerar a régua no hub Follow-Up apaga o esforço em
    // todo lugar; tarefas_vencidas fica só com visita/documentacao/outro.
    await comoUsuario(c, corretorNav.id);
    const r = await c.query(`SELECT public.nav_pendencias() AS nav`);
    expect((r.rows[0].nav as Record<string, number>).tarefas_vencidas).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Devolução por SLA (opt-in via gestao_config)
// ---------------------------------------------------------------------------

describe("devolver_leads_followup_vencido: flag opt-in e handoff para a base", () => {
  let corretorSla: UsuarioTeste;
  let leadSla: string;

  async function setFlag(ativa: boolean): Promise<void> {
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.gestao_config
          SET valor = jsonb_set(valor, '{devolucao_ativa}', to_jsonb($1::boolean))
        WHERE chave = 'regua_followup'`,
      [ativa],
    );
  }

  // A devolução produz o estado do modelo v2 (corretor NULL + classe base);
  // fora do v2 ela é no-op por gate — os testes de handoff ligam a flag.
  async function setModeloV2(ativo: boolean): Promise<void> {
    await comoSuperuser(c);
    if (ativo) {
      await c.query(
        `INSERT INTO public.distribuicao_settings (chave, valor)
         VALUES ('modelo_v2_ativo', 'true'::jsonb)
         ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
      );
    } else {
      await c.query(`DELETE FROM public.distribuicao_settings WHERE chave = 'modelo_v2_ativo'`);
    }
  }

  beforeAll(async () => {
    await setFlag(false); // garante o default mesmo após um run abortado
    corretorSla = await criarUsuario(c, { papel: "corretor", nome: "Corretor SLA" });
    leadSla = await criarLead(c, { corretorId: corretorSla.id, status: "em_atendimento" });
    // toque vencido há 10 dias — via tarefa de contato pendente, nunca direto
    await criarTarefa({ leadId: leadSla, corretorId: corretorSla.id, vencimento: daquiDias(-10) });
  });

  afterAll(async () => {
    await setFlag(false);
    await setModeloV2(false);
  });

  it("fora do modelo v2 é no-op mesmo com devolucao_ativa=true (sem esteira p/ lead sem dono)", async () => {
    await setModeloV2(false);
    await setFlag(true);
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.devolver_leads_followup_vencido() AS n`);
    expect(r.rows[0].n).toBe(0);
    expect((await leadRow(leadSla)).corretor_id).toBe(corretorSla.id);
    await setFlag(false);
  });

  it("com devolucao_ativa=false devolve 0 e não toca no lead", async () => {
    await setModeloV2(true);
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.devolver_leads_followup_vencido() AS n`);
    expect(r.rows[0].n).toBe(0);

    const l = await leadRow(leadSla);
    expect(l.corretor_id).toBe(corretorSla.id);
    expect(l.status).toBe("em_atendimento");
    const log = await c.query(`SELECT 1 FROM public.distribution_log WHERE lead_id = $1`, [
      leadSla,
    ]);
    expect(log.rowCount).toBe(0);
  });

  it("com a flag ligada devolve o lead à base e loga regra 'followup_vencido'", async () => {
    await setFlag(true);
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.devolver_leads_followup_vencido() AS n`);
    // só o lead com followup vencido há 10 dias fura o SLA de 3 dias
    expect(r.rows[0].n).toBe(1);

    const l = await leadRow(leadSla);
    expect(l.corretor_id).toBeNull();
    expect(l.corretor_anterior_id).toBe(corretorSla.id);
    expect(l.status).toBe("aguardando_atendimento");
    expect(l.classe_lead).toBe("base");

    const log = await c.query(
      `SELECT corretor_id, tipo::text AS tipo, roleta_slug, regra_aplicada, resultado
         FROM public.distribution_log WHERE lead_id = $1`,
      [leadSla],
    );
    expect(log.rowCount).toBe(1);
    expect(log.rows[0].regra_aplicada).toBe("followup_vencido");
    expect(log.rows[0].resultado).toBe("sucesso");
    expect(log.rows[0].roleta_slug).toBe("base");
    expect(log.rows[0].corretor_id).toBeNull();

    // estado limpo: flag volta ao default e o log deste teste sai de cena
    await setFlag(false);
    await c.query(`DELETE FROM public.distribution_log WHERE lead_id = $1`, [leadSla]);
    // rodar de novo com a flag desligada volta a ser no-op (lead segue na base)
    const dnv = await c.query(`SELECT public.devolver_leads_followup_vencido() AS n`);
    expect(dnv.rows[0].n).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. KPIs — MV followup_tentativa_mensal e RPCs
// ---------------------------------------------------------------------------

describe("KPIs: metrics.followup_tentativa_mensal + RPCs", () => {
  let admin: UsuarioTeste;

  beforeAll(async () => {
    admin = await criarUsuario(c, { papel: "admin", nome: "Admin KPIs" });
    await comoSuperuser(c);
    await c.query(`SELECT metrics.refresh_all()`);
  });

  it("a MV existe e o refresh_all a carimba em metrics.atualizacoes", async () => {
    await comoSuperuser(c);
    const mv = await c.query(
      `SELECT 1 FROM pg_matviews
        WHERE schemaname = 'metrics' AND matviewname = 'followup_tentativa_mensal'`,
    );
    expect(mv.rowCount).toBe(1);
    const carimbo = await c.query(
      `SELECT 1 FROM metrics.atualizacoes WHERE objeto = 'followup_tentativa_mensal'`,
    );
    expect(carimbo.rowCount).toBe(1);
  });

  it("os toques do contador viram a curva tentativa 1..3 (respondidos pela entrada em 7 dias)", async () => {
    await comoSuperuser(c);
    // soma por tentativa (à prova de virada de mês dentro da janela de 3h)
    const r = await c.query(
      `SELECT tentativa::int AS tentativa, sum(enviados)::int AS enviados,
              sum(respondidos)::int AS respondidos, sum(avancaram)::int AS avancaram
         FROM metrics.followup_tentativa_mensal
        WHERE corretor_id = $1
        GROUP BY tentativa ORDER BY tentativa`,
      [corretorToques.id],
    );
    expect(r.rows).toEqual([
      // a entrada do cliente (t0+35min) responde os toques 1 e 2; o 3º
      // (t0+61min) veio depois dela e ninguém avançou de etapa.
      { tentativa: 1, enviados: 1, respondidos: 1, avancaram: 0 },
      { tentativa: 2, enviados: 1, respondidos: 1, avancaram: 0 },
      { tentativa: 3, enviados: 1, respondidos: 0, avancaram: 0 },
    ]);
  });

  it("meu_followup_tentativas devolve a própria curva 1..3 com o carimbo da MV", async () => {
    await comoUsuario(c, corretorToques.id);
    const r = await c.query(
      `SELECT tentativa, enviados::int AS enviados, respondidos::int AS respondidos,
              avancaram::int AS avancaram, atualizado_em
         FROM public.meu_followup_tentativas()`,
    );
    expect(
      r.rows.map(({ tentativa, enviados, respondidos, avancaram }) => ({
        tentativa,
        enviados,
        respondidos,
        avancaram,
      })),
    ).toEqual([
      { tentativa: 1, enviados: 1, respondidos: 1, avancaram: 0 },
      { tentativa: 2, enviados: 1, respondidos: 1, avancaram: 0 },
      { tentativa: 3, enviados: 1, respondidos: 0, avancaram: 0 },
    ]);
    expect(r.rows[0].atualizado_em).not.toBeNull();
  });

  it("gestao_followup_tentativas como corretor → forbidden (o gate roda antes da query)", async () => {
    await comoUsuario(c, corretorToques.id);
    expect(await errCode(c.query(`SELECT * FROM public.gestao_followup_tentativas()`))).toBe(
      "P0001",
    );
  });

  it("gestao_followup_tentativas como admin, filtrada pelo corretor, bate a mesma curva", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(
      `SELECT tentativa, enviados::int AS enviados, respondidos::int AS respondidos
         FROM public.gestao_followup_tentativas(NULL, NULL, $1)`,
      [corretorToques.id],
    );
    expect(r.rows).toEqual([
      { tentativa: 1, enviados: 1, respondidos: 1 },
      { tentativa: 2, enviados: 1, respondidos: 1 },
      { tentativa: 3, enviados: 1, respondidos: 0 },
    ]);
  });

  it("gestao_followup_cobertura como admin traz a linha do corretor da fila coerente", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT * FROM public.gestao_followup_cobertura()`);
    const linha = r.rows.find(
      (x: { corretor_id: string }) => x.corretor_id === corretorFila.id,
    ) as { corretor_nome: string; fila_hoje: string; vencidos: string; esgotados: string };

    expect(linha).toBeDefined();
    expect(linha.corretor_nome).toBe(corretorFila.nome);
    // fila de hoje = A (vencido) + B e E (sem próximo toque); C é amanhã,
    // D está esgotado. Vencido é só A — a documentação atrasada de E não conta.
    expect(Number(linha.fila_hoje)).toBe(3);
    expect(Number(linha.vencidos)).toBe(1);
    expect(Number(linha.esgotados)).toBe(1);
  });
});

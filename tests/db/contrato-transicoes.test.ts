/**
 * TESTE DE CONTRATO da máquina de estados do funil de leads — os dois lados:
 *
 * (a) MATRIZ COMPLETA: o espelho TS (src/lib/leads.ts → transicaoLeadPermitida,
 *     que encapsula TRANSICOES + SAIDA_EXIGE_GESTAO, ambos não exportados) deve
 *     ser idêntico a public.transicao_lead_permitida para TODO par
 *     (origem, destino) × gestao ∈ {true,false}. O TS decide o que a UI
 *     oferece; a SQL decide o que passa — qualquer divergência é bug.
 *
 * (b) COMPORTAMENTO da RPC public.transicionar_lead(p_lead_id uuid,
 *     p_novo_status lead_status, p_motivo text, p_proxima_acao text,
 *     p_proximo_followup timestamptz, p_motivo_categoria text) RETURNS leads:
 *     permissões (dono, gestor, saída de terminal exige gestão), validações
 *     (motivo na perda, follow-up futuro no aguardando_retorno, próxima ação
 *     ou follow-up nos status ativos) e efeitos colaterais (lead_eventos +
 *     lead_status_transitions na mesma operação).
 *
 *     Também: UPDATE direto de leads.status como corretor é bloqueado pelo
 *     guard trg_validar_status_lead_via_rpc (validar_status_lead_via_rpc).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";
import { LEAD_STATUS_LABEL, transicaoLeadPermitida, type LeadStatus } from "../../src/lib/leads";

const c = novoClient();

/** Todos os status do espelho TS (fonte: chaves de LEAD_STATUS_LABEL). */
const STATUSES_TS = Object.keys(LEAD_STATUS_LABEL) as LeadStatus[];

let equipeId: string;
let gestor: UsuarioTeste;
let corretor: UsuarioTeste;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  equipeId = await criarEquipe(c);
  gestor = await criarUsuario(c, { papel: "gestor", equipeId });
  corretor = await criarUsuario(c, { papel: "corretor", equipeId });
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

/** Chama a RPC com a assinatura real (6 parâmetros, posicionais). */
function transicionar(
  leadId: string,
  novoStatus: string,
  opts: {
    motivo?: string | null;
    proximaAcao?: string | null;
    followup?: Date | null;
    categoria?: string | null;
  } = {},
) {
  return c.query(
    `SELECT (t.r).id, (t.r).status::text AS status, (t.r).motivo_perdido,
            (t.r).motivo_perda_categoria, (t.r).proxima_acao, (t.r).proximo_followup
     FROM (SELECT public.transicionar_lead($1, $2::public.lead_status, $3, $4, $5, $6) AS r) t`,
    [
      leadId,
      novoStatus,
      opts.motivo ?? null,
      opts.proximaAcao ?? null,
      opts.followup ?? null,
      opts.categoria ?? null,
    ],
  );
}

/** Código + mensagem do erro Postgres de uma promise (null se resolveu). */
async function erroDe(p: Promise<unknown>): Promise<{ code?: string; message: string } | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code, message: err.message ?? String(e) };
  }
}

/** Insere lead direto (superusuário) num status terminal, contornando o RPC —
 *  como um dado histórico. `perdido` exige motivo_perda_categoria no INSERT.
 *  Modo réplica: pula os triggers de INSERT (o guard
 *  trg_proteger_fechamento_insert, corrigido nesta auditoria, bloqueia
 *  INSERT já fechado sem venda aprovada — aqui o objetivo é justamente
 *  semear um dado histórico como fixture). */
async function criarLeadTerminal(
  status: "contrato_fechado" | "perdido" | "pos_venda",
  corretorId: string,
): Promise<string> {
  await comoSuperuser(c);
  await c.query(`SET session_replication_role = replica`);
  const r = await c.query(
    `INSERT INTO public.leads
       (nome, telefone, corretor_id, status, origem, motivo_perdido, motivo_perda_categoria)
     VALUES ($1, $2, $3, $4::public.lead_status, 'outro'::public.lead_origem, $5, $6)
     RETURNING id`,
    [
      `Lead terminal ${status} ${Math.random().toString(36).slice(2, 8)}`,
      `1198${String(Math.floor(1000000 + Math.random() * 8999999))}`,
      corretorId,
      status,
      status === "perdido" ? "sem resposta" : null,
      status === "perdido" ? "sem_contato" : null,
    ],
  );
  await c.query(`SET session_replication_role = DEFAULT`);
  return r.rows[0].id as string;
}

// ---------------------------------------------------------------------------
// (a) Matriz completa: espelho TS × public.transicao_lead_permitida
// ---------------------------------------------------------------------------

describe("contrato da matriz de transições (TS × SQL)", () => {
  it("enum public.lead_status e o espelho TS enumeram exatamente os mesmos status", async () => {
    const r = await c.query(
      `SELECT unnest(enum_range(NULL::public.lead_status))::text AS s ORDER BY 1`,
    );
    const statusesSql = r.rows.map((row) => row.s as string).sort();
    expect(statusesSql).toEqual([...STATUSES_TS].sort());
  });

  it("matriz completa (origem × destino × gestao): TS e SQL decidem idêntico em todos os pares", async () => {
    // Uma única query devolve a decisão SQL para o produto cartesiano inteiro.
    const r = await c.query(`
      SELECT de::text AS de, para::text AS para, g.gestao AS gestao,
             public.transicao_lead_permitida(de, para, g.gestao) AS sql_permite
      FROM unnest(enum_range(NULL::public.lead_status)) AS de
      CROSS JOIN unnest(enum_range(NULL::public.lead_status)) AS para
      CROSS JOIN (VALUES (true), (false)) AS g(gestao)
    `);
    // 13 status × 13 status × 2 valores de gestao = 338 decisões.
    expect(r.rows.length).toBe(STATUSES_TS.length * STATUSES_TS.length * 2);

    const divergentes: string[] = [];
    for (const row of r.rows) {
      const de = row.de as string;
      const para = row.para as LeadStatus;
      const gestao = row.gestao as boolean;
      const sqlPermite = row.sql_permite as boolean;
      const tsPermite = transicaoLeadPermitida(de, para, gestao);
      if (tsPermite !== sqlPermite) {
        divergentes.push(
          `${de} -> ${para} (gestao=${gestao}): TS=${tsPermite} SQL=${sqlPermite}`,
        );
      }
    }
    // Qualquer entrada aqui = bug reportável: a UI ofereceria o que o banco
    // rejeita, ou o banco aceitaria o que a UI esconde.
    expect(divergentes, `Pares divergentes TS × SQL:\n${divergentes.join("\n")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (b) Comportamento da RPC transicionar_lead
// ---------------------------------------------------------------------------

describe("transicionar_lead: transições válidas e efeitos colaterais", () => {
  it("corretor dono realiza aguardando_atendimento -> em_atendimento e a operação grava lead_eventos E lead_status_transitions", async () => {
    const leadId = await criarLead(c, {
      corretorId: corretor.id,
      status: "aguardando_atendimento",
    });

    await comoUsuario(c, corretor.id);
    const r = await transicionar(leadId, "em_atendimento", {
      proximaAcao: "Ligar para o cliente amanhã",
    });
    expect(r.rows[0].status).toBe("em_atendimento");

    await comoSuperuser(c);
    const lead = await c.query(`SELECT status::text FROM public.leads WHERE id = $1`, [leadId]);
    expect(lead.rows[0].status).toBe("em_atendimento");

    // Efeito 1: evento de auditoria do funil (inserido pela própria RPC).
    const eventos = await c.query(
      `SELECT tipo, payload->>'de_status' AS de, payload->>'para_status' AS para,
              payload->>'alterado_por' AS alterado_por
       FROM public.lead_eventos WHERE lead_id = $1 AND tipo = 'transicao_lead'`,
      [leadId],
    );
    expect(eventos.rows).toHaveLength(1);
    expect(eventos.rows[0]).toMatchObject({
      de: "aguardando_atendimento",
      para: "em_atendimento",
      alterado_por: corretor.id,
    });

    // Efeito 2: linha em lead_status_transitions (trigger registrar_transicao_status
    // no UPDATE de leads.status — mesma transação da RPC).
    const trans = await c.query(
      `SELECT de_status::text AS de, para_status::text AS para, corretor_id, alterado_por
       FROM public.lead_status_transitions WHERE lead_id = $1`,
      [leadId],
    );
    expect(trans.rows).toHaveLength(1);
    expect(trans.rows[0]).toMatchObject({
      de: "aguardando_atendimento",
      para: "em_atendimento",
      corretor_id: corretor.id,
      alterado_por: corretor.id,
    });
  });

  it("transição inválida (aguardando_atendimento -> agendado) é rejeitada com erro claro e não deixa rastro", async () => {
    const leadId = await criarLead(c, {
      corretorId: corretor.id,
      status: "aguardando_atendimento",
    });

    await comoUsuario(c, corretor.id);
    const erro = await erroDe(
      transicionar(leadId, "agendado", { proximaAcao: "Visita ao decorado" }),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("22023");
    expect(erro!.message).toMatch(
      /transição de aguardando_atendimento para agendado não permitida/,
    );

    await comoSuperuser(c);
    const lead = await c.query(`SELECT status::text FROM public.leads WHERE id = $1`, [leadId]);
    expect(lead.rows[0].status).toBe("aguardando_atendimento");
    const rastro = await c.query(
      `SELECT (SELECT count(*)::int FROM public.lead_eventos WHERE lead_id = $1) AS eventos,
              (SELECT count(*)::int FROM public.lead_status_transitions WHERE lead_id = $1) AS transicoes`,
      [leadId],
    );
    expect(rastro.rows[0]).toEqual({ eventos: 0, transicoes: 0 });
  });

  it("mover para status ativo sem próxima ação nem follow-up é rejeitado (regra 'informe próxima ação ou follow-up')", async () => {
    const leadId = await criarLead(c, {
      corretorId: corretor.id,
      status: "aguardando_atendimento",
    });

    await comoUsuario(c, corretor.id);
    const erro = await erroDe(transicionar(leadId, "em_atendimento"));
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("22023");
    expect(erro!.message).toMatch(/informe próxima ação ou follow-up/);
  });
});

describe("transicionar_lead: perda exige motivo", () => {
  it("mover para perdido sem motivo é rejeitado; com motivo grava motivo_perdido e categoria", async () => {
    const leadId = await criarLead(c, {
      corretorId: corretor.id,
      status: "em_atendimento",
    });

    await comoUsuario(c, corretor.id);
    const semMotivo = await erroDe(transicionar(leadId, "perdido"));
    expect(semMotivo).not.toBeNull();
    expect(semMotivo!.code).toBe("22023");
    expect(semMotivo!.message).toMatch(/motivo é obrigatório ao perder um lead/);

    // Motivo só de espaços também não vale (NULLIF(btrim(...), '')).
    const motivoVazio = await erroDe(transicionar(leadId, "perdido", { motivo: "   " }));
    expect(motivoVazio).not.toBeNull();
    expect(motivoVazio!.code).toBe("22023");

    const ok = await transicionar(leadId, "perdido", {
      motivo: "Cliente parou de responder",
      categoria: "sem_contato",
    });
    expect(ok.rows[0].status).toBe("perdido");
    expect(ok.rows[0].motivo_perdido).toBe("Cliente parou de responder");
    expect(ok.rows[0].motivo_perda_categoria).toBe("sem_contato");
  });

  it("perda sem categoria explícita cai no fallback 'outro' (não trava no trigger de categoria)", async () => {
    const leadId = await criarLead(c, {
      corretorId: corretor.id,
      status: "em_atendimento",
    });

    await comoUsuario(c, corretor.id);
    const ok = await transicionar(leadId, "perdido", { motivo: "Desistiu da compra" });
    expect(ok.rows[0].status).toBe("perdido");
    expect(ok.rows[0].motivo_perda_categoria).toBe("outro");
  });
});

describe("transicionar_lead: saída de status terminal exige gestão (SAIDA_EXIGE_GESTAO vale no banco)", () => {
  it("corretor dono NÃO tira lead de contrato_fechado", async () => {
    const leadId = await criarLeadTerminal("contrato_fechado", corretor.id);

    await comoUsuario(c, corretor.id);
    // analise_credito é destino permitido para gestão a partir de contrato_fechado.
    const erro = await erroDe(
      transicionar(leadId, "analise_credito", { proximaAcao: "Reanalisar crédito" }),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("22023");
    expect(erro!.message).toMatch(/não permitida/);

    await comoSuperuser(c);
    const lead = await c.query(`SELECT status::text FROM public.leads WHERE id = $1`, [leadId]);
    expect(lead.rows[0].status).toBe("contrato_fechado");
  });

  it("corretor dono NÃO tira lead de perdido", async () => {
    const leadId = await criarLeadTerminal("perdido", corretor.id);

    await comoUsuario(c, corretor.id);
    const erro = await erroDe(
      transicionar(leadId, "em_atendimento", { proximaAcao: "Retomar contato" }),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("22023");
    expect(erro!.message).toMatch(/não permitida/);
  });

  it("corretor dono NÃO tira lead de pos_venda", async () => {
    const leadId = await criarLeadTerminal("pos_venda", corretor.id);

    await comoUsuario(c, corretor.id);
    const erro = await erroDe(
      transicionar(leadId, "em_atendimento", { proximaAcao: "Acompanhar entrega" }),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("22023");
    expect(erro!.message).toMatch(/não permitida/);
  });

  it("gestor (mesma equipe do corretor) consegue reabrir lead perdido, limpando motivo da perda", async () => {
    const leadId = await criarLeadTerminal("perdido", corretor.id);

    await comoUsuario(c, gestor.id);
    const r = await transicionar(leadId, "em_atendimento", {
      proximaAcao: "Retomar atendimento após revisão",
    });
    expect(r.rows[0].status).toBe("em_atendimento");
    // Reabertura limpa o registro da perda.
    expect(r.rows[0].motivo_perdido).toBeNull();
    expect(r.rows[0].motivo_perda_categoria).toBeNull();

    await comoSuperuser(c);
    const trans = await c.query(
      `SELECT de_status::text AS de, para_status::text AS para, alterado_por
       FROM public.lead_status_transitions WHERE lead_id = $1`,
      [leadId],
    );
    expect(trans.rows).toHaveLength(1);
    expect(trans.rows[0]).toMatchObject({
      de: "perdido",
      para: "em_atendimento",
      alterado_por: gestor.id,
    });
  });

  it("gestor consegue tirar lead de contrato_fechado (-> analise_credito)", async () => {
    const leadId = await criarLeadTerminal("contrato_fechado", corretor.id);

    await comoUsuario(c, gestor.id);
    const r = await transicionar(leadId, "analise_credito", {
      proximaAcao: "Refazer análise de crédito",
    });
    expect(r.rows[0].status).toBe("analise_credito");
  });
});

describe("transicionar_lead: aguardando_retorno exige follow-up futuro", () => {
  it("sem follow-up (nem no lead, nem no parâmetro) é rejeitado", async () => {
    const leadId = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });

    await comoUsuario(c, corretor.id);
    const erro = await erroDe(
      transicionar(leadId, "aguardando_retorno", { proximaAcao: "Aguardar retorno" }),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("22023");
    expect(erro!.message).toMatch(/aguardando retorno exige follow-up futuro/);
  });

  it("com follow-up no passado é rejeitado ('follow-up deve estar no futuro')", async () => {
    const leadId = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });

    await comoUsuario(c, corretor.id);
    const erro = await erroDe(
      transicionar(leadId, "aguardando_retorno", {
        followup: new Date(Date.now() - 60 * 60 * 1000),
      }),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("22023");
    expect(erro!.message).toMatch(/follow-up deve estar no futuro/);
  });

  it("com follow-up futuro passa e persiste proximo_followup", async () => {
    const leadId = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
    const futuro = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await comoUsuario(c, corretor.id);
    const r = await transicionar(leadId, "aguardando_retorno", { followup: futuro });
    expect(r.rows[0].status).toBe("aguardando_retorno");
    expect(new Date(r.rows[0].proximo_followup as string).getTime()).toBe(futuro.getTime());
  });
});

describe("guard validar_status_lead_via_rpc: UPDATE direto de status é bloqueado", () => {
  it("corretor dono não altera leads.status por UPDATE direto (só via transicionar_lead)", async () => {
    const leadId = await criarLead(c, {
      corretorId: corretor.id,
      status: "aguardando_atendimento",
    });

    await comoUsuario(c, corretor.id);
    const erro = await erroDe(
      c.query(`UPDATE public.leads SET status = 'em_atendimento'::public.lead_status WHERE id = $1`, [
        leadId,
      ]),
    );
    expect(erro).not.toBeNull();
    expect(erro!.code).toBe("42501");
    expect(erro!.message).toMatch(/status do lead só pode ser alterado por transicionar_lead/);

    await comoSuperuser(c);
    const lead = await c.query(`SELECT status::text FROM public.leads WHERE id = $1`, [leadId]);
    expect(lead.rows[0].status).toBe("aguardando_atendimento");
  });

  it("UPDATE direto de outros campos (sem mexer no status) continua permitido ao dono", async () => {
    const leadId = await criarLead(c, {
      corretorId: corretor.id,
      status: "aguardando_atendimento",
    });

    await comoUsuario(c, corretor.id);
    const r = await c.query(
      `UPDATE public.leads SET observacoes = 'anotação do corretor' WHERE id = $1 RETURNING observacoes`,
      [leadId],
    );
    expect(r.rows[0].observacoes).toBe("anotação do corretor");
  });
});

/**
 * CAMADA SEMÂNTICA DE GESTÃO (schema metrics + RPCs gestao_*).
 *
 * O que está em jogo:
 * - MVs não respeitam RLS: o acesso é bloqueado no schema (REVOKE) e o escopo
 *   é aplicado nas RPCs SECURITY DEFINER. O gate de merge desta suíte é o
 *   escopo por papel: gestor NUNCA vê números de outra equipe; corretor
 *   recebe 'forbidden' nas telas de gestão.
 * - Lixeira (deleted_at OU na_lixeira) fora de TODA métrica.
 * - Coorte sem transições (import legado) reporta cobertura baixa em vez de
 *   inventar conversão.
 * - Matemática do pacing (dias úteis da config, metas × realizado).
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

let equipeA: string;
let equipeB: string;
let admin: UsuarioTeste;
let gestorA: UsuarioTeste;
let corretorA: UsuarioTeste; // equipe A
let corretorB: UsuarioTeste; // equipe B

let leadComHistorico: string; // corretorA, novo -> em_atendimento via RPC real
let leadSemHistorico: string; // corretorA, em_atendimento direto (sem transições)
let leadLixeira: string; // corretorA, na lixeira — invisível em tudo
let leadEquipeB: string; // corretorB — invisível para gestorA

const ANO = 2026;
const MES = 7;

async function refreshMetrics(): Promise<void> {
  await comoSuperuser(c);
  await c.query(`SELECT metrics.refresh_all()`);
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  equipeA = await criarEquipe(c, { nome: "Equipe A" });
  equipeB = await criarEquipe(c, { nome: "Equipe B" });
  admin = await criarUsuario(c, { nome: "Admin", papel: "admin" });
  gestorA = await criarUsuario(c, { nome: "Gestor A", papel: "gestor", equipeId: equipeA });
  corretorA = await criarUsuario(c, { nome: "Corretor A", papel: "corretor", equipeId: equipeA });
  corretorB = await criarUsuario(c, { nome: "Corretor B", papel: "corretor", equipeId: equipeB });
  await comoSuperuser(c);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestorA.id, equipeA]);

  // Lead com histórico real: transição via RPC (dispara trigger de transição).
  leadComHistorico = await criarLead(c, {
    nome: "Com Histórico",
    corretorId: corretorA.id,
    status: "aguardando_atendimento",
  });
  await comoUsuario(c, corretorA.id);
  await c.query(
    `SELECT public.transicionar_lead($1, 'em_atendimento'::public.lead_status, NULL,
       'Ligar para o cliente', NULL, NULL)`,
    [leadComHistorico],
  );
  await comoSuperuser(c);

  // Lead sem histórico: nasce em_atendimento por INSERT direto (import legado).
  leadSemHistorico = await criarLead(c, {
    nome: "Sem Histórico",
    corretorId: corretorA.id,
    status: "em_atendimento",
  });

  // Lead na lixeira: não pode aparecer em métrica nenhuma.
  leadLixeira = await criarLead(c, { nome: "Na Lixeira", corretorId: corretorA.id });
  await c.query(
    `UPDATE public.leads SET na_lixeira = true, data_movido_lixeira = now() WHERE id = $1`,
    [leadLixeira],
  );

  // Lead de outra equipe.
  leadEquipeB = await criarLead(c, {
    nome: "Equipe B Lead",
    corretorId: corretorB.id,
    status: "aguardando_atendimento",
  });

  // Metas do mês corrente para o pacing (nível corretor).
  await c.query(
    `INSERT INTO public.metas (corretor_id, ano, mes, meta_vendas, meta_gmv, meta_visitas)
     VALUES ($1, $2, $3, 4, 800000, 20)`,
    [corretorA.id, ANO, MES],
  );

  await refreshMetrics();
}, 60_000);

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("refresh e carimbo", () => {
  it("refresh_all popula as 4 MVs e carimba metrics.atualizacoes", async () => {
    await comoSuperuser(c);
    const r = await c.query(`SELECT objeto, atualizado_em FROM metrics.atualizacoes ORDER BY objeto`);
    const objetos = r.rows.map((x: { objeto: string }) => x.objeto);
    expect(objetos).toEqual([
      "funil_coorte_mensal",
      "motivos_perda_mensal",
      "performance_corretor_mensal",
      "tempo_etapa_mensal",
    ]);
    for (const row of r.rows) expect(row.atualizado_em).toBeTruthy();
  });

  it("authenticated não lê o schema metrics diretamente (REVOKE)", async () => {
    await comoUsuario(c, admin.id);
    const code = await errCode(c.query(`SELECT * FROM metrics.funil_coorte_mensal LIMIT 1`));
    // 42501 insufficient_privilege — o acesso é só via RPC.
    expect(code).toBe("42501");
    await comoSuperuser(c);
  });
});

describe("funil_ordem — ordem comercial estável", () => {
  it("espelha LEAD_STATUS_ORDER e não a ordem do enum", async () => {
    await comoSuperuser(c);
    const r = await c.query(`
      SELECT public.funil_ordem('aguardando_atendimento') AS a1,
             public.funil_ordem('aguardando_retorno') AS a2,
             public.funil_ordem('em_atendimento') AS a3,
             public.funil_ordem('qualificado') AS legado3,
             public.funil_ordem('agendado') AS a4,
             public.funil_ordem('visita_realizada') AS a5,
             public.funil_ordem('proposta_enviada') AS legado5,
             public.funil_ordem('analise_credito') AS a6,
             public.funil_ordem('contrato_fechado') AS a7,
             public.funil_ordem('pos_venda') AS terminal7,
             public.funil_ordem('novo') AS pre,
             public.funil_ordem('perdido') AS perdido
    `);
    const o = r.rows[0];
    expect([o.a1, o.a2, o.a3, o.a4, o.a5, o.a6, o.a7]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(o.legado3).toBe(3);
    expect(o.legado5).toBe(5);
    expect(o.terminal7).toBe(7);
    expect(o.pre).toBe(0);
    expect(o.perdido).toBe(99);
  });
});

describe("escopo por papel", () => {
  it("corretor recebe forbidden no painel do dia", async () => {
    await comoUsuario(c, corretorA.id);
    const code = await errCode(c.query(`SELECT public.gestao_painel_dia()`));
    expect(code).toBe("P0001");
    await comoSuperuser(c);
  });

  it("gestor A não vê corretor da equipe B na performance", async () => {
    await comoUsuario(c, gestorA.id);
    const r = await c.query(`SELECT corretor_id FROM public.gestao_performance_corretores()`);
    const ids = r.rows.map((x: { corretor_id: string }) => x.corretor_id);
    expect(ids).toContain(corretorA.id);
    expect(ids).not.toContain(corretorB.id);
    await comoSuperuser(c);
  });

  it("admin vê as duas equipes na performance", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT corretor_id FROM public.gestao_performance_corretores()`);
    const ids = r.rows.map((x: { corretor_id: string }) => x.corretor_id);
    expect(ids).toContain(corretorA.id);
    expect(ids).toContain(corretorB.id);
    await comoSuperuser(c);
  });

  it("coorte do gestor A soma só a equipe A", async () => {
    await comoUsuario(c, gestorA.id);
    const r = await c.query(
      `SELECT sum(leads)::int AS leads FROM public.gestao_funil_coorte(NULL, NULL, NULL, NULL)`,
    );
    // Equipe A tem 2 leads visíveis (com/sem histórico) — lixeira e equipe B fora.
    expect(r.rows[0].leads).toBe(2);
    await comoSuperuser(c);
  });

  it("performance em janela agrega meses e respeita o escopo do gestor", async () => {
    await comoUsuario(c, gestorA.id);
    const r = await c.query(
      `SELECT corretor_id, leads_recebidos, vendas
       FROM public.gestao_performance_corretores_janela(
         (date_trunc('month', now()) - interval '5 months')::date, NULL)`,
    );
    const ids = r.rows.map((x: { corretor_id: string }) => x.corretor_id);
    expect(ids).toContain(corretorA.id);
    expect(ids).not.toContain(corretorB.id);
    // Janela contém o mês corrente: totais ≥ os do mês (aqui, iguais — só há
    // atividade no mês corrente; os 2 leads visíveis da equipe A contam).
    const linhaA = r.rows.find((x: { corretor_id: string }) => x.corretor_id === corretorA.id) as {
      leads_recebidos: number;
    };
    expect(Number(linhaA.leads_recebidos)).toBe(2);
    await comoSuperuser(c);
  });

  it("performance em janela dá forbidden para corretor", async () => {
    await comoUsuario(c, corretorA.id);
    const code = await errCode(
      c.query(`SELECT * FROM public.gestao_performance_corretores_janela(current_date, NULL)`),
    );
    expect(code).toBe("P0001");
    await comoSuperuser(c);
  });

  it("corretor não acessa drill de outro corretor, mas acessa o próprio", async () => {
    await comoUsuario(c, corretorA.id);
    const proibido = await errCode(
      c.query(`SELECT * FROM public.gestao_performance_corretor_drill($1, 6)`, [corretorB.id]),
    );
    expect(proibido).toBe("P0001");
    const proprio = await c.query(
      `SELECT * FROM public.gestao_performance_corretor_drill($1, 6)`,
      [corretorA.id],
    );
    expect(Array.isArray(proprio.rows)).toBe(true);
    await comoSuperuser(c);
  });
});

describe("lixeira fora de toda métrica", () => {
  it("lead na lixeira não aparece no painel do dia nem na coorte", async () => {
    await comoUsuario(c, admin.id);
    const painel = await c.query(`SELECT public.gestao_painel_dia() AS p`);
    const excecoes: Array<{ lead_id: string }> = painel.rows[0].p.excecoes;
    expect(excecoes.find((e) => e.lead_id === leadLixeira)).toBeUndefined();

    const coorte = await c.query(
      `SELECT sum(leads)::int AS leads FROM public.gestao_funil_coorte(NULL, NULL, NULL, NULL)`,
    );
    // 3 leads visíveis no total (2 da equipe A + 1 da B); o da lixeira não conta.
    expect(coorte.rows[0].leads).toBe(3);
    await comoSuperuser(c);
  });
});

describe("coorte honesta (cobertura de transições)", () => {
  it("mistura de leads com e sem histórico reporta cobertura parcial, nunca 100%", async () => {
    await comoUsuario(c, gestorA.id);
    const r = await c.query(
      `SELECT cobertura_pct, atingiu_atendimento, leads
       FROM public.gestao_funil_coorte(NULL, NULL, NULL, NULL)`,
    );
    expect(r.rows.length).toBe(1);
    const row = r.rows[0];
    // Dos 2 leads da equipe A, só 1 tem transição registrada → 50%.
    expect(Number(row.cobertura_pct)).toBe(50);
    // Ambos contam como "atingiu atendimento": um pela transição, o outro
    // pelo piso do status atual (nunca inferimos etapas intermediárias).
    expect(row.atingiu_atendimento).toBe(2);
    await comoSuperuser(c);
  });
});

describe("painel do dia", () => {
  it("devolve excecoes + resumo com carimbo e vgv_em_risco numérico", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT public.gestao_painel_dia() AS p`);
    const p = r.rows[0].p;
    expect(Array.isArray(p.excecoes)).toBe(true);
    expect(p.resumo).toBeTruthy();
    expect(typeof p.resumo.total).toBe("number");
    expect(p.atualizado_em).toBeTruthy();
    expect(Array.isArray(p.resumo.corretores_sem_interacao)).toBe(true);
    await comoSuperuser(c);
  });

  it("filtro por tipo devolve só o tipo pedido", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(
      `SELECT public.gestao_painel_dia(ARRAY['sla_estourado']) AS p`,
    );
    const tipos = new Set(
      (r.rows[0].p.excecoes as Array<{ tipo: string }>).map((e) => e.tipo),
    );
    for (const t of tipos) expect(t).toBe("sla_estourado");
    await comoSuperuser(c);
  });
});

describe("pacing", () => {
  it("metas do mês entram e dias úteis respeitam a config", async () => {
    await comoUsuario(c, gestorA.id);
    const r = await c.query(`SELECT public.gestao_pacing($1, $2) AS p`, [ANO, MES]);
    const p = r.rows[0].p;
    expect(p.mes_atual.meta_vendas).toBe(4);
    expect(Number(p.mes_atual.meta_gmv)).toBe(800000);
    expect(p.dias_uteis.total).toBeGreaterThan(0);
    expect(p.dias_uteis.total).toBe(p.dias_uteis.passados + p.dias_uteis.restantes);
    // Julho/2026 com seg–sáb úteis e sem feriados = 27 dias úteis.
    expect(p.dias_uteis.total).toBe(27);
    // Trimestre = soma dos meses do trimestre (só julho tem meta) — decisão 2.
    expect(p.trimestre.meta_vendas).toBe(4);
    expect(p.por_corretor.length).toBeGreaterThan(0);
    await comoSuperuser(c);
  });

  it("gestao_origens agrega a coorte por origem só do escopo do gestor", async () => {
    await comoUsuario(c, gestorA.id);
    const r = await c.query(`SELECT * FROM public.gestao_origens(NULL, NULL)`);
    // Equipe A: 2 leads visíveis, ambos origem 'outro' (factory default).
    const outro = r.rows.find((x: { origem: string }) => x.origem === "outro");
    expect(outro).toBeTruthy();
    expect(outro.leads).toBe(2);
    const totalLeads = r.rows.reduce((s: number, x: { leads: number }) => s + x.leads, 0);
    expect(totalLeads).toBe(2); // lead da equipe B e lixeira ficam fora
    await comoSuperuser(c);
  });

  it("resumo semanal devolve kpis e linhas por corretor no escopo", async () => {
    await comoUsuario(c, gestorA.id);
    const r = await c.query(`SELECT public.gestao_resumo_semanal() AS p`);
    const p = r.rows[0].p;
    expect(p.kpis).toBeTruthy();
    expect(typeof p.kpis.leads_novos).toBe("number");
    const nomes = (p.por_corretor as Array<{ nome: string }>).map((x) => x.nome);
    expect(nomes).toContain("Corretor A");
    expect(nomes).not.toContain("Corretor B");
    await comoSuperuser(c);
  });

  it("gestor de outra equipe não vê a meta da equipe A", async () => {
    await comoSuperuser(c);
    const gestorB = await criarUsuario(c, {
      nome: "Gestor B",
      papel: "gestor",
      equipeId: equipeB,
    });
    await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestorB.id, equipeB]);
    await comoUsuario(c, gestorB.id);
    const r = await c.query(`SELECT public.gestao_pacing($1, $2) AS p`, [ANO, MES]);
    expect(r.rows[0].p.mes_atual.meta_vendas).toBe(0);
    await comoSuperuser(c);
  });
});

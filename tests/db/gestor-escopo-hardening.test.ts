/**
 * Blindagem do papel GESTOR (migration 20260720180000): escopo estritamente de equipe.
 *
 * Verifica, por papel, que o gestor:
 *  - LÊ a distribuição mas NÃO opera (RPCs de escrita + RLS de escrita bloqueadas);
 *  - NÃO gerencia config org-wide sem conceito de time (projetos, templates, criar equipe);
 *  - só mexe em METAS do próprio time;
 *  - vê métricas por corretor / ranking só do time.
 * E que admin/superintendente/corretor seguem como antes onde relevante.
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
let sup: UsuarioTeste;
let corretor1: UsuarioTeste; // equipe A (time do gestorA)
let corretor2: UsuarioTeste; // equipe B (fora do time)

let roletaId: string;
let excecaoId: string;
let leadOrfao: string;

/** Mensagem de erro de uma promise rejeitada (ou null se resolveu). */
async function errMsg(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { message?: string }).message ?? "erro";
  }
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  // limparDados não limpa dados de config (roletas/projetos/templates/equipes):
  // garante idempotência dos identificadores fixos usados abaixo.
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.roleta_participantes WHERE roleta_id IN (SELECT id FROM public.roletas WHERE slug = 'hardening-roleta')`);
  await c.query(`DELETE FROM public.roletas WHERE slug = 'hardening-roleta'`);
  await c.query(`DELETE FROM public.projetos WHERE slug IN ('proj-gestor-x', 'proj-admin-x')`);
  await c.query(`DELETE FROM public.templates_mensagem WHERE nome = 'T'`);
  await c.query(`DELETE FROM public.equipes WHERE nome IN ('Nova pelo gestor', 'Nova pelo admin')`);

  equipeA = await criarEquipe(c, { nome: "Equipe A Hardening" });
  equipeB = await criarEquipe(c, { nome: "Equipe B Hardening" });
  admin = await criarUsuario(c, { nome: "Admin H", papel: "admin" });
  gestorA = await criarUsuario(c, { nome: "Gestor A H", papel: "gestor", equipeId: equipeA });
  sup = await criarUsuario(c, { nome: "Super H", papel: "superintendente" });
  corretor1 = await criarUsuario(c, { nome: "Corretor A1", papel: "corretor", equipeId: equipeA });
  corretor2 = await criarUsuario(c, { nome: "Corretor B1", papel: "corretor", equipeId: equipeB });

  await comoSuperuser(c);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestorA.id, equipeA]);

  // Leads por corretor (para métricas). Janela ampla cobre "agora".
  await criarLead(c, { nome: "L A1", corretorId: corretor1.id, status: "aguardando_atendimento" });
  await criarLead(c, { nome: "L A1 b", corretorId: corretor1.id, status: "em_atendimento" });
  await criarLead(c, { nome: "L B1", corretorId: corretor2.id, status: "aguardando_atendimento" });
  leadOrfao = await criarLead(c, { nome: "L orfao", corretorId: null, status: "novo" });

  // Distribuição: uma roleta, um participante e uma exceção (para testar leitura vs escrita).
  const r = await c.query(
    `INSERT INTO public.roletas (slug, nome) VALUES ('hardening-roleta', 'Roleta Hardening') RETURNING id`,
  );
  roletaId = r.rows[0].id as string;
  await c.query(
    `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo) VALUES ($1, $2, true)`,
    [roletaId, corretor1.id],
  );
  const ex = await c.query(
    `INSERT INTO public.distribuicao_excecoes (lead_id, motivo, status)
     VALUES ($1, 'dados_incompletos', 'pendente') RETURNING id`,
    [leadOrfao],
  );
  excecaoId = ex.rows[0].id as string;

  // Atividades diárias (ranking) para os dois corretores.
  await c.query(
    `INSERT INTO public.atividades_diarias (corretor_id, dia, pontuacao_total)
     VALUES ($1, current_date, 10), ($2, current_date, 20)`,
    [corretor1.id, corretor2.id],
  );

  await comoSuperuser(c);
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

// ---------------------------------------------------------------------------
describe("distribuição: gestor LÊ mas NÃO opera", () => {
  it("gestor consegue LER roletas/participantes/exceções", async () => {
    await comoUsuario(c, gestorA.id);
    const parts = await c.query(`SELECT count(*)::int AS n FROM public.roleta_participantes`);
    const exc = await c.query(`SELECT count(*)::int AS n FROM public.distribuicao_excecoes`);
    await comoSuperuser(c);
    expect(parts.rows[0].n).toBeGreaterThanOrEqual(1);
    expect(exc.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it("gestor NÃO opera: RPCs de escrita da distribuição estouram 'forbidden'", async () => {
    await comoUsuario(c, gestorA.id);
    expect(
      await errMsg(
        c.query(`SELECT public.gerenciar_participante_roleta('hardening-roleta', $1, 'pausar', 'x', NULL, now() + interval '1 day')`, [corretor1.id]),
      ),
    ).toMatch(/forbidden/);
    expect(await errMsg(c.query(`SELECT public.resolver_excecao($1, 'arquivar')`, [excecaoId]))).toMatch(/forbidden/);
    expect(await errMsg(c.query(`SELECT public.triar_e_distribuir_lead($1)`, [leadOrfao]))).toMatch(/forbidden/);
    expect(await errMsg(c.query(`SELECT public.distribuir_lead_v3($1)`, [leadOrfao]))).toMatch(/forbidden/);
    await comoSuperuser(c);
  });

  it("gestor NÃO escreve direto em roleta_participantes (RLS)", async () => {
    await comoUsuario(c, gestorA.id);
    const code = await errCode(
      c.query(`INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo) VALUES ($1, $2, true)`, [roletaId, corretor2.id]),
    );
    await comoSuperuser(c);
    expect(code).toBe("42501"); // insufficient_privilege / RLS
  });

  it("admin CONTINUA operando (gerenciar participante passa do gate e executa)", async () => {
    await comoUsuario(c, admin.id);
    const msg = await errMsg(
      c.query(`SELECT public.gerenciar_participante_roleta('hardening-roleta', $1, 'limite', NULL, 5, NULL)`, [corretor1.id]),
    );
    await comoSuperuser(c);
    expect(msg).toBeNull(); // sem erro
  });
});

// ---------------------------------------------------------------------------
describe("config org-wide sem conceito de time: admin-only para gestor", () => {
  it("gestor NÃO cria projeto/template/equipe (RLS)", async () => {
    await comoUsuario(c, gestorA.id);
    expect(await errCode(c.query(`INSERT INTO public.projetos (nome, slug) VALUES ('P', 'proj-gestor-x')`))).toBe("42501");
    expect(await errCode(c.query(`INSERT INTO public.templates_mensagem (nome, conteudo) VALUES ('T', 'oi')`))).toBe("42501");
    expect(await errCode(c.query(`INSERT INTO public.equipes (nome) VALUES ('Nova pelo gestor')`))).toBe("42501");
    await comoSuperuser(c);
  });

  it("gestor AINDA edita a PRÓPRIA equipe (inalterado)", async () => {
    await comoUsuario(c, gestorA.id);
    const code = await errCode(c.query(`UPDATE public.equipes SET descricao = 'x' WHERE id = $1`, [equipeA]));
    await comoSuperuser(c);
    expect(code).toBeNull();
  });

  it("admin cria projeto/template/equipe normalmente", async () => {
    await comoUsuario(c, admin.id);
    expect(await errCode(c.query(`INSERT INTO public.projetos (nome, slug) VALUES ('P', 'proj-admin-x')`))).toBeNull();
    expect(await errCode(c.query(`INSERT INTO public.templates_mensagem (nome, conteudo) VALUES ('T', 'oi')`))).toBeNull();
    expect(await errCode(c.query(`INSERT INTO public.equipes (nome) VALUES ('Nova pelo admin')`))).toBeNull();
    await comoSuperuser(c);
  });
});

// ---------------------------------------------------------------------------
describe("metas: gestor recortado por time", () => {
  it("gestor cria meta de corretor DO time e da PRÓPRIA equipe", async () => {
    await comoUsuario(c, gestorA.id);
    expect(await errCode(c.query(`INSERT INTO public.metas (ano, mes, corretor_id) VALUES (2027, 1, $1)`, [corretor1.id]))).toBeNull();
    expect(await errCode(c.query(`INSERT INTO public.metas (ano, mes, equipe_id) VALUES (2027, 2, $1)`, [equipeA]))).toBeNull();
    await comoSuperuser(c);
  });

  it("gestor NÃO cria meta de corretor de OUTRA equipe, de outra equipe, nem global", async () => {
    await comoUsuario(c, gestorA.id);
    expect(await errCode(c.query(`INSERT INTO public.metas (ano, mes, corretor_id) VALUES (2027, 3, $1)`, [corretor2.id]))).toBe("42501");
    expect(await errCode(c.query(`INSERT INTO public.metas (ano, mes, equipe_id) VALUES (2027, 4, $1)`, [equipeB]))).toBe("42501");
    expect(await errCode(c.query(`INSERT INTO public.metas (ano, mes) VALUES (2027, 5)`))).toBe("42501"); // global
    await comoSuperuser(c);
  });

  it("admin cria meta global normalmente", async () => {
    await comoUsuario(c, admin.id);
    const code = await errCode(c.query(`INSERT INTO public.metas (ano, mes) VALUES (2028, 1)`));
    await comoSuperuser(c);
    expect(code).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("métricas por corretor / ranking recortados por time", () => {
  const DI = "2026-01-01T00:00:00Z";
  const DF = "2027-06-01T00:00:00Z";

  async function metricasCids(userId: string): Promise<Set<string>> {
    await comoUsuario(c, userId);
    const r = await c.query(
      `SELECT corretor_id FROM public.dashboard_metricas_por_corretor($1::timestamptz, $2::timestamptz, 'criacao')`,
      [DI, DF],
    );
    await comoSuperuser(c);
    return new Set(r.rows.map((x) => x.corretor_id as string));
  }

  it("dashboard_metricas_por_corretor: admin vê os dois times; gestor só o dele", async () => {
    const doAdmin = await metricasCids(admin.id);
    expect(doAdmin.has(corretor1.id)).toBe(true);
    expect(doAdmin.has(corretor2.id)).toBe(true);

    const doGestor = await metricasCids(gestorA.id);
    expect(doGestor.has(corretor1.id)).toBe(true);
    expect(doGestor.has(corretor2.id)).toBe(false); // equipe B fica de fora
  });

  it("ranking_atividades: admin vê os dois; gestor só o time", async () => {
    await comoUsuario(c, admin.id);
    const a = await c.query(`SELECT corretor_id FROM public.ranking_atividades('2026-01-01','2027-06-01')`);
    await comoUsuario(c, gestorA.id);
    const g = await c.query(`SELECT corretor_id FROM public.ranking_atividades('2026-01-01','2027-06-01')`);
    await comoSuperuser(c);
    const admSet = new Set(a.rows.map((x) => x.corretor_id as string));
    const gesSet = new Set(g.rows.map((x) => x.corretor_id as string));
    expect(admSet.has(corretor1.id) && admSet.has(corretor2.id)).toBe(true);
    expect(gesSet.has(corretor1.id)).toBe(true);
    expect(gesSet.has(corretor2.id)).toBe(false);
  });

  it("equipe_metricas_campanha: gestor recebe 'forbidden'; admin executa", async () => {
    await comoUsuario(c, gestorA.id);
    expect(await errMsg(c.query(`SELECT public.equipe_metricas_campanha($1)`, [roletaId]))).toMatch(/forbidden/);
    await comoUsuario(c, admin.id);
    expect(await errMsg(c.query(`SELECT public.equipe_metricas_campanha($1)`, [roletaId]))).toBeNull();
    await comoSuperuser(c);
  });
});

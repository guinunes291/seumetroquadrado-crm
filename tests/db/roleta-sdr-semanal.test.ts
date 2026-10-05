/**
 * Permanência semanal na roleta "Agendados do SDR" — migration 20261011120000,
 * ponta a ponta no banco (docs/politica-roleta-sdr-semanal.md).
 *
 * As datas são relativas à ÚLTIMA SEMANA FECHADA no relógio de São Paulo
 * (W = sábado), calculada pelo próprio banco: a suíte passa em qualquer dia em
 * que rodar. A semana W é a única que mexe na roleta; W-7 e W-28 são
 * recálculo histórico (sempre em sombra).
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

let admin: UsuarioTeste;
let ana: UsuarioTeste; // 1 visita + 1 pasta = 2,5 (na roleta) → pausada
let bia: UsuarioTeste; // zerada (na roleta) → pausada
let caio: UsuarioTeste; // visita sexta 23:30 (W) e sábado 00:10 (W+7)
let davi: UsuarioTeste; // pasta antiga do lead que a Ana repete
let eva: UsuarioTeste; // venda há 16 dias na semana W-7
let fabio: UsuarioTeste; // removido pelo admin, 4 visitas → bloqueado
let gil: UsuarioTeste; // 2 pastas, pausado pelo SLA (pausa alheia)
let helena: UsuarioTeste; // 3 visitas, fora da roleta → incluída
let ivo: UsuarioTeste; // 3,5 pts, pausado pela regra → reativado
let jonas: UsuarioTeste; // removido por processo automático, 3 visitas → reativado
let kleber: UsuarioTeste; // 1 venda na janela, 0 pt → entra por venda com peso menor
let lia: UsuarioTeste; // 2 vendas na janela, 0 pt → entra por venda com peso cheio
let sdr: UsuarioTeste; // papel sdr: fora do universo
let inativo: UsuarioTeste; // perfil inativo: fora do universo

let roletaId: string;
let W: string; // sábado da última semana fechada (YYYY-MM-DD)

/** YYYY-MM-DD + n dias. */
function dia(base: string, n: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}

/** Instante no relógio de São Paulo (offset fixo -03:00). */
const sp = (data: string, hora = "15:00") => `${data}T${hora}:00-03:00`;

async function setting(chave: string, valor: unknown) {
  await comoSuperuser(c);
  await c.query(`UPDATE public.distribuicao_settings SET valor = $1::jsonb WHERE chave = $2`, [
    JSON.stringify(valor),
    chave,
  ]);
}

async function visita(
  corretor: UsuarioTeste,
  quando: string,
  o: { lead?: string; status?: string; auto?: boolean } = {},
): Promise<string> {
  await comoSuperuser(c);
  const lead = o.lead ?? (await criarLead(c, { corretorId: corretor.id }));
  await c.query(
    `INSERT INTO public.agendamentos
       (lead_id, corretor_id, criado_por_id, tipo, status, titulo, local, data_inicio, data_fim, auto_gerado)
     VALUES ($1, $2, $2, 'visita', $3::public.agendamento_status, 'Visita', 'Estande',
             $4::timestamptz, $4::timestamptz + interval '1 hour', $5)`,
    [lead, corretor.id, o.status ?? "realizado", quando, o.auto ?? false],
  );
  return lead;
}

async function pasta(corretor: UsuarioTeste, quando: string, lead?: string): Promise<string> {
  await comoSuperuser(c);
  const l = lead ?? (await criarLead(c, { corretorId: corretor.id }));
  await c.query(
    `INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
     VALUES ($1, $2, 'qualificado', 'analise_credito', $3::timestamptz)`,
    [l, corretor.id, quando],
  );
  return l;
}

async function venda(corretor: UsuarioTeste, data: string) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.vendas (corretor_id, valor_venda, status_venda, data_assinatura)
     VALUES ($1, 250000, 'pendente'::public.status_venda, $2::date)`,
    [corretor.id, data],
  );
}

async function participante(
  u: UsuarioTeste,
  o: { ativo?: boolean; pausadoAte?: string | null; motivo?: string | null } = {},
) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, pausado_ate, motivo_pausa, incluido_por)
     VALUES ($1, $2, $3, $4::timestamptz, $5, $6)`,
    [roletaId, u.id, o.ativo ?? true, o.pausadoAte ?? null, o.motivo ?? null, admin.id],
  );
}

async function linhaRoleta(u: UsuarioTeste) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT ativo, pausado_ate, motivo_pausa FROM public.roleta_participantes
      WHERE roleta_id = $1 AND corretor_id = $2`,
    [roletaId, u.id],
  );
  return r.rows[0] ?? null;
}

async function retratoRoleta() {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT corretor_id, ativo, pausado_ate, motivo_pausa FROM public.roleta_participantes
      WHERE roleta_id = $1 ORDER BY corretor_id`,
    [roletaId],
  );
  return r.rows;
}

async function contarLogs(): Promise<number> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT count(*)::int AS n FROM public.roleta_participantes_log WHERE roleta_id = $1`,
    [roletaId],
  );
  return r.rows[0].n;
}

async function apurar(semana?: string) {
  await comoSuperuser(c);
  const r = await c.query(`SELECT public.roleta_sdr_apurar_semana($1::date) AS r`, [
    semana ?? null,
  ]);
  return r.rows[0].r;
}

async function resultados(semana: string): Promise<Record<string, Record<string, unknown>>> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT corretor_id, visitas, pastas, pontos::float AS pontos, vendas_janela, resultado,
            peso_rodizio, sombra, aplicado_em
       FROM public.roleta_sdr_apuracoes WHERE semana_inicio = $1::date`,
    [semana],
  );
  return Object.fromEntries(r.rows.map((x) => [x.corretor_id, x]));
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.roleta_sdr_apuracoes`);

  W = (
    await c.query(
      `SELECT to_char(public._roleta_sdr_semana_de((now() AT TIME ZONE 'America/Sao_Paulo')::date) - 7,
                      'YYYY-MM-DD') AS w`,
    )
  ).rows[0].w;

  admin = await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  ana = await criarUsuario(c, { nome: "Ana" });
  bia = await criarUsuario(c, { nome: "Bia" });
  caio = await criarUsuario(c, { nome: "Caio" });
  davi = await criarUsuario(c, { nome: "Davi" });
  eva = await criarUsuario(c, { nome: "Eva" });
  fabio = await criarUsuario(c, { nome: "Fábio" });
  gil = await criarUsuario(c, { nome: "Gil" });
  helena = await criarUsuario(c, { nome: "Helena" });
  ivo = await criarUsuario(c, { nome: "Ivo" });
  jonas = await criarUsuario(c, { nome: "Jonas" });
  kleber = await criarUsuario(c, { nome: "Kleber" });
  lia = await criarUsuario(c, { nome: "Lia" });
  sdr = await criarUsuario(c, { nome: "Sara SDR", papel: "sdr" });
  inativo = await criarUsuario(c, { nome: "Ícaro Inativo" });
  await c.query(`UPDATE public.profiles SET ativo = false WHERE id = $1`, [inativo.id]);

  roletaId = (await c.query(`SELECT id FROM public.roletas WHERE slug = 'agendados-sdr'`)).rows[0]
    .id;

  // ---- Roleta hoje ---------------------------------------------------------
  await participante(ana);
  await participante(bia);
  // Fábio: removido pelo ADMIN (bloqueio manual).
  await participante(fabio, { ativo: false });
  await c.query(
    `INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por, created_at)
     VALUES ($1, $2, 'incluido', 'time inicial', $3, now() - interval '20 days'),
            ($1, $2, 'removido', 'conduta', $3, now() - interval '10 days')`,
    [roletaId, fabio.id, admin.id],
  );
  // Gil: pausa automática do SLA do quente, em vigor (pausa alheia).
  await participante(gil, {
    pausadoAte: new Date(Date.now() + 12 * 3600_000).toISOString(),
    motivo: "Pausa automática: 3 estouros de SLA no dia",
  });
  // Ivo: pausado pela regra na semana anterior, pausa ainda valendo.
  await participante(ivo, {
    pausadoAte: new Date(Date.now() + 3600_000).toISOString(),
    motivo: "Regra semanal: 1 pt (1 visita, 0 pastas) na semana anterior. Meta 3 pts.",
  });
  // Jonas: desligado por processo automático (feito_por nulo) — a regra desfaz.
  await participante(jonas, { ativo: false });
  await c.query(
    `INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
     VALUES ($1, $2, 'removido', 'processo automático', NULL)`,
    [roletaId, jonas.id],
  );

  // ---- Produção da semana W -----------------------------------------------
  // Ana: 1 visita (mesmo lead duas vezes) + 1 pasta (outra repetida e outra
  // de lead que já entrou em análise há 10 dias) = 2,5.
  const leadAna = await visita(ana, sp(dia(W, 2)));
  await visita(ana, sp(dia(W, 4)), { lead: leadAna });
  await visita(ana, sp(dia(W, 3)), { status: "nao_compareceu" });
  await visita(ana, sp(dia(W, 3), "10:00"), { status: "agendado" }); // sem desfecho
  await visita(ana, sp(dia(W, 3), "11:00"), { auto: true });
  const leadPastaAna = await pasta(ana, sp(dia(W, 1)));
  await pasta(ana, sp(dia(W, 5)), leadPastaAna);
  const leadDavi = await pasta(davi, sp(dia(W, -10)));
  await pasta(ana, sp(dia(W, 2)), leadDavi);

  // Caio: sexta 23:30 conta em W; sábado 00:10 já é a semana seguinte.
  await visita(caio, sp(dia(W, 6), "23:30"));
  await visita(caio, sp(dia(W, 7), "00:10"));

  // Fábio: 4 visitas — mas foi removido pelo admin.
  for (let i = 0; i < 4; i++) await visita(fabio, sp(dia(W, 1 + i)));
  // Gil: 2 pastas.
  await pasta(gil, sp(dia(W, 1)));
  await pasta(gil, sp(dia(W, 2)));
  // Helena: 3 visitas.
  for (let i = 0; i < 3; i++) await visita(helena, sp(dia(W, 2 + i)));
  // Ivo: 2 visitas + 1 pasta = 3,5.
  await visita(ivo, sp(dia(W, 1)));
  await visita(ivo, sp(dia(W, 2)));
  await pasta(ivo, sp(dia(W, 3)));
  // Jonas: 3 visitas.
  for (let i = 0; i < 3; i++) await visita(jonas, sp(dia(W, 1 + i)));
  // Kleber: 1 venda na janela de W, sem ponto. Lia: 2 vendas, sem ponto.
  await venda(kleber, dia(W, 2));
  await venda(lia, dia(W, 1));
  await venda(lia, dia(W, 3));
  // Quem está fora do universo produz e não aparece.
  await c.query(`DELETE FROM public.user_roles WHERE user_id = $1 AND role = 'corretor'`, [sdr.id]);
  await visita(inativo, sp(dia(W, 2)));

  // ---- Semana W-7 (cenário da cascata, recálculo histórico) ----------------
  const W7 = dia(W, -7);
  // Vendas dentro da janela de W-7 e FORA da de W (sexta de W - 15 dias):
  // em W a Ana e a Bia seguem testando a pausa, não a exceção.
  await venda(ana, dia(W7, -5)); // na janela de W-7
  await venda(bia, dia(W7, -4)); // na janela de W-7
  await visita(bia, sp(dia(W7, 2))); // 1 pt
  await visita(caio, sp(dia(W7, 2))); // 1 visita…
  await pasta(caio, sp(dia(W7, 3))); // … + 1 pasta = 2,5
  await visita(davi, sp(dia(W7, 4))); // 1 pt
  await venda(eva, dia(W7, 6 - 16)); // há 16 dias da sexta: fora da janela

  await setting("roleta_sdr_regra_ativa", true);
  await setting("roleta_sdr_modo_sombra", true);
});

afterAll(async () => {
  await setting("roleta_sdr_regra_ativa", false);
  await setting("roleta_sdr_modo_sombra", true);
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.roleta_sdr_apuracoes`);
  await limparDados(c);
  await c.end();
});

describe("fundação", () => {
  it("chaves com os padrões da política e crons em UTC (sábado 08:00 / quarta 18:00 BRT)", async () => {
    await comoSuperuser(c);
    const cfg = (await c.query(`SELECT public.roleta_sdr_config() AS c`)).rows[0].c;
    expect(cfg).toMatchObject({
      peso_visita: 1,
      peso_pasta: 1.5,
      meta_pontos: 3,
      minimo_aptos: 3,
      venda_janela_dias: 15,
    });
    const jobs = await c.query(
      `SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'roleta-sdr-%' ORDER BY jobname`,
    );
    expect(jobs.rows).toEqual([
      {
        jobname: "roleta-sdr-apuracao-semanal",
        schedule: "0 11 * * 6",
        command: "SELECT public.roleta_sdr_apurar_semana()",
      },
      {
        jobname: "roleta-sdr-aviso-meio-semana",
        schedule: "0 21 * * 3",
        command: "SELECT public.roleta_sdr_aviso_meio_semana()",
      },
    ]);
  });

  it("anon não executa nada; corretor não apura nem dispara aviso", async () => {
    await c.query(`RESET ROLE`);
    await c.query(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', false)`);
    await c.query(`SET ROLE anon`);
    expect(await errCode(c.query(`SELECT * FROM public.roleta_sdr_placar()`))).toBe("42501");
    expect(await errCode(c.query(`SELECT public.roleta_sdr_apurar_semana()`))).toBe("42501");
    expect(await errCode(c.query(`SELECT public.roleta_sdr_config()`))).toBe("42501");
    expect(await errCode(c.query(`SELECT * FROM public.roleta_sdr_previa()`))).toBe("42501");
    expect(await errCode(c.query(`SELECT * FROM public.roleta_sdr_apuracoes_recentes()`))).toBe(
      "42501",
    );
    await comoUsuario(c, ana.id);
    expect(await errCode(c.query(`SELECT public.roleta_sdr_apurar_semana()`))).toBe("42501");
    expect(await errCode(c.query(`SELECT public.roleta_sdr_aviso_meio_semana()`))).toBe("42501");
    await comoSuperuser(c);
  });

  it("regra desligada: apuração e aviso saem sem fazer nada", async () => {
    await setting("roleta_sdr_regra_ativa", false);
    expect(await apurar()).toEqual({ ok: false, motivo: "regra_inativa" });
    await comoSuperuser(c);
    const aviso = (await c.query(`SELECT public.roleta_sdr_aviso_meio_semana() AS r`)).rows[0].r;
    expect(aviso).toEqual({ ok: false, motivo: "regra_inativa" });
    expect(Object.keys(await resultados(W))).toHaveLength(0);
    await setting("roleta_sdr_regra_ativa", true);
  });
});

describe("placar", () => {
  async function placar(semana: string, como?: UsuarioTeste) {
    if (como) await comoUsuario(c, como.id);
    else await comoSuperuser(c);
    const r = await c.query(
      `SELECT corretor_id, visitas, pastas, pontos::float AS pontos, vendas_janela, bloqueado_admin
         FROM public.roleta_sdr_placar($1::date)`,
      [semana],
    );
    await comoSuperuser(c);
    return Object.fromEntries(r.rows.map((x) => [x.corretor_id, x]));
  }

  it("visita 1 por lead; no-show, sem desfecho e auto-gerada fora; pasta repetida em 30 dias fora", async () => {
    const p = await placar(W);
    expect(p[ana.id]).toMatchObject({ visitas: 1, pastas: 1, pontos: 2.5 });
    expect(p[ivo.id]).toMatchObject({ visitas: 2, pastas: 1, pontos: 3.5 });
    expect(p[gil.id]).toMatchObject({ visitas: 0, pastas: 2, pontos: 3 });
    expect(p[davi.id]).toMatchObject({ visitas: 0, pastas: 0, pontos: 0 });
  });

  it("sexta 23:30 conta na semana; sábado 00:10 conta na seguinte", async () => {
    expect((await placar(W))[caio.id]).toMatchObject({ visitas: 1 });
    expect((await placar(dia(W, 7)))[caio.id]).toMatchObject({ visitas: 1 });
  });

  it("universo: corretor ativo, esteja ou não na roleta; SDR e perfil inativo ficam fora", async () => {
    const p = await placar(W);
    expect(p[helena.id]).toBeDefined(); // fora da roleta, mas avaliada
    expect(p[fabio.id]).toMatchObject({ visitas: 4, bloqueado_admin: true });
    expect(p[jonas.id]).toMatchObject({ bloqueado_admin: false }); // remoção automática
    expect(p[sdr.id]).toBeUndefined();
    expect(p[inativo.id]).toBeUndefined();
    expect(p[admin.id]).toBeUndefined();
  });

  it("venda na janela de 15 dias; há 16 dias não conta", async () => {
    const p = await placar(dia(W, -7));
    expect(p[ana.id].vendas_janela).toBe(1);
    expect(p[eva.id].vendas_janela).toBe(0);
  });

  it("corretor vê só a própria linha; admin vê todos", async () => {
    const meu = await placar(W, ana);
    expect(Object.keys(meu)).toEqual([ana.id]);
    const todos = await placar(W, admin);
    expect(Object.keys(todos).length).toBeGreaterThanOrEqual(10);
  });

  it("semana que não começa no sábado é recusada", async () => {
    await comoSuperuser(c);
    expect(
      await errCode(c.query(`SELECT * FROM public.roleta_sdr_placar($1::date)`, [dia(W, 1)])),
    ).toBe("22023");
  });
});

describe("prévia (simulação sem gravar nada)", () => {
  it("roda a cascata de qualquer semana fechada, com a regra desligada, sem escrever", async () => {
    await setting("roleta_sdr_regra_ativa", false);
    await comoSuperuser(c);
    const antes = await retratoRoleta();
    const r = await c.query(
      `SELECT corretor_id, resultado FROM public.roleta_sdr_previa($1::date)`,
      [dia(W, -7)],
    );
    const res = Object.fromEntries(r.rows.map((x) => [x.corretor_id, x.resultado]));
    expect(res[bia.id]).toBe("apto_venda");
    expect(res[ana.id]).toBe("apto_venda");
    expect(res[caio.id]).toBe("apto_complemento");
    expect(res[davi.id]).toBe("pausado");
    expect(res[fabio.id]).toBe("bloqueado_admin");
    expect(Object.keys(await resultados(dia(W, -7)))).toHaveLength(0);
    expect(await retratoRoleta()).toEqual(antes);
    await setting("roleta_sdr_regra_ativa", true);
  });

  it("só admin: com uma linha só a cascata do mínimo sairia errada", async () => {
    await comoUsuario(c, ana.id);
    expect(await errCode(c.query(`SELECT * FROM public.roleta_sdr_previa()`))).toBe("42501");
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT count(*)::int AS n FROM public.roleta_sdr_previa($1::date)`, [
      W,
    ]);
    expect(r.rows[0].n).toBeGreaterThanOrEqual(10);
    await comoSuperuser(c);
  });
});

describe("cascata (semana W-7, recálculo histórico em sombra)", () => {
  it("0 pela meta + 2 com venda em 15 dias + 1 com 2,5 pts → 3 aptos (2 venda + 1 complemento)", async () => {
    const antes = await retratoRoleta();
    const r = await apurar(dia(W, -7));
    expect(r).toMatchObject({ ok: true, sombra: true });
    const res = await resultados(dia(W, -7));
    expect(res[bia.id].resultado).toBe("apto_venda"); // venda + 1 pt
    expect(res[ana.id].resultado).toBe("apto_venda"); // venda + 0 pt
    expect(res[caio.id].resultado).toBe("apto_complemento"); // 2,5
    expect(res[davi.id].resultado).toBe("pausado"); // 1 pt, mínimo já atingido
    expect(res[eva.id].resultado).toBe("pausado"); // venda há 16 dias não entra
    expect(res[fabio.id].resultado).toBe("bloqueado_admin");
    // Semana antiga nunca mexe na roleta.
    expect(Object.values(res).every((x) => x.sombra === true && x.aplicado_em === null)).toBe(true);
    expect(await retratoRoleta()).toEqual(antes);
  });
});

describe("apuração da última semana fechada (W)", () => {
  it("modo sombra grava a apuração sem alterar roleta_participantes", async () => {
    await setting("roleta_sdr_modo_sombra", true);
    const antes = await retratoRoleta();
    const logsAntes = await contarLogs();
    const r = await apurar();
    expect(r).toMatchObject({ ok: true, semana_inicio: W, sombra: true });
    const res = await resultados(W);
    expect(res[helena.id]).toMatchObject({
      resultado: "apto_meta",
      sombra: true,
      aplicado_em: null,
    });
    expect(res[ana.id]).toMatchObject({ resultado: "pausado", pontos: 2.5 });
    expect(await retratoRoleta()).toEqual(antes);
    expect(await contarLogs()).toBe(logsAntes);
  });

  it("valendo: cascata, inclusão, pausa, reativação e bloqueio manual", async () => {
    await setting("roleta_sdr_modo_sombra", false);
    const r = await apurar();
    expect(r).toMatchObject({
      ok: true,
      sombra: false,
      efeito: { incluidos: 3, reativados: 2, pausados: 2 },
    });
    const res = await resultados(W);
    expect(res[helena.id].resultado).toBe("apto_meta");
    expect(res[gil.id].resultado).toBe("apto_meta");
    expect(res[ivo.id].resultado).toBe("apto_meta");
    expect(res[jonas.id].resultado).toBe("apto_meta");
    expect(res[fabio.id].resultado).toBe("bloqueado_admin");
    // Faixa 1 já tem 4 ≥ 3, mas a exceção por venda não tem teto: Kleber e
    // Lia entram mesmo assim — Kleber (1 venda) com peso menor, Lia (2) cheio.
    expect(res[kleber.id]).toMatchObject({ resultado: "apto_venda", peso_rodizio: 1 });
    expect(res[lia.id]).toMatchObject({ resultado: "apto_venda", peso_rodizio: 2 });
    expect(res[helena.id].peso_rodizio).toBe(2);
    // Sem venda e sem meta: complemento só até o mínimo, que já foi atingido.
    expect(res[ana.id]).toMatchObject({ resultado: "pausado", peso_rodizio: null });
    expect(res[caio.id].resultado).toBe("pausado");
    expect(Object.values(res).every((x) => x.sombra === false && x.aplicado_em !== null)).toBe(
      true,
    );

    // Helena: fora da roleta → incluída, log automático.
    expect(await linhaRoleta(helena)).toMatchObject({ ativo: true, pausado_ate: null });
    // Ivo: pausado pela regra → despausado.
    expect(await linhaRoleta(ivo)).toMatchObject({
      ativo: true,
      pausado_ate: null,
      motivo_pausa: null,
    });
    // Jonas: desligado por processo automático → reativado.
    expect(await linhaRoleta(jonas)).toMatchObject({ ativo: true, pausado_ate: null });
    // Gil: pausa do SLA (alheia) continua valendo.
    expect((await linhaRoleta(gil)).motivo_pausa).toContain("estouros de SLA");
    // Fábio: removido pelo admin, nunca reincluído.
    expect(await linhaRoleta(fabio)).toMatchObject({ ativo: false });
    // Caio: não apto e fora da roleta → continua fora.
    expect(await linhaRoleta(caio)).toBeNull();

    // Ana: pausada até o sábado seguinte 09:00 BRT com o motivo da política.
    await comoSuperuser(c);
    const esperadoAte = (
      await c.query(
        `SELECT ((($1::date + 14)::timestamp + time '09:00') AT TIME ZONE 'America/Sao_Paulo') AS t`,
        [W],
      )
    ).rows[0].t as Date;
    const linhaAna = await linhaRoleta(ana);
    expect((linhaAna.pausado_ate as Date).toISOString()).toBe(esperadoAte.toISOString());
    const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
    expect(linhaAna.motivo_pausa).toBe(
      `Regra semanal: 2,5 pts (1 visita, 1 pasta) na semana ${dm(W)} a ${dm(dia(W, 6))}. Meta 3 pts.`,
    );

    // Todo log da regra: feito_por nulo e motivo começando por "Regra semanal".
    const logs = await c.query(
      `SELECT corretor_id, acao, motivo, feito_por FROM public.roleta_participantes_log
        WHERE roleta_id = $1 AND motivo LIKE 'Regra semanal%'`,
      [roletaId],
    );
    expect(logs.rows.every((l) => l.feito_por === null)).toBe(true);
    const acao = (u: UsuarioTeste) =>
      logs.rows.filter((l) => l.corretor_id === u.id).map((l) => l.acao);
    expect(acao(helena)).toEqual(["incluido"]);
    expect(acao(kleber)).toEqual(["incluido"]);
    expect(acao(lia)).toEqual(["incluido"]);
    const motivoKleber = logs.rows.find((l) => l.corretor_id === kleber.id)!.motivo as string;
    expect(motivoKleber).toContain("apto por exceção (venda nos últimos 15 dias)");
    expect(motivoKleber).toContain("Peso no rodízio: 1.");
    expect(acao(ivo)).toEqual(["reativado"]);
    expect(acao(jonas)).toEqual(["reativado"]);
    expect(acao(ana)).toEqual(["pausado"]);
    expect(acao(bia)).toEqual(["pausado"]);
    expect(acao(gil)).toEqual([]);
    expect(acao(fabio)).toEqual([]);
  });

  it("idempotência: rodar de novo a mesma semana dá o mesmo resultado e não mexe em nada", async () => {
    const antes = await retratoRoleta();
    const logsAntes = await contarLogs();
    const resAntes = await resultados(W);
    const r = await apurar(W);
    expect(r).toMatchObject({ ok: true, efeito: { incluidos: 0, reativados: 0, pausados: 0 } });
    expect(await retratoRoleta()).toEqual(antes);
    expect(await contarLogs()).toBe(logsAntes);
    const resDepois = await resultados(W);
    for (const id of Object.keys(resAntes)) {
      expect(resDepois[id].resultado).toBe(resAntes[id].resultado);
      expect(resDepois[id].pontos).toBe(resAntes[id].pontos);
    }
    // O histórico gravado é exatamente a prévia da semana.
    await comoSuperuser(c);
    const previa = await c.query(
      `SELECT corretor_id, resultado FROM public.roleta_sdr_previa($1::date)`,
      [W],
    );
    expect(previa.rows).toHaveLength(Object.keys(resDepois).length);
    for (const x of previa.rows) expect(resDepois[x.corretor_id].resultado).toBe(x.resultado);
  });

  it("corretor lê só a própria apuração (RLS); admin lê todas", async () => {
    await comoUsuario(c, ana.id);
    const minha = await c.query(`SELECT corretor_id FROM public.roleta_sdr_apuracoes`);
    expect(new Set(minha.rows.map((x) => x.corretor_id))).toEqual(new Set([ana.id]));
    await comoUsuario(c, admin.id);
    const todas = await c.query(
      `SELECT count(DISTINCT corretor_id)::int AS n FROM public.roleta_sdr_apuracoes`,
    );
    expect(todas.rows[0].n).toBeGreaterThanOrEqual(10);
    // Escrita só pela apuração: o corretor não apaga nem altera o histórico.
    await comoUsuario(c, ana.id);
    expect(
      await errCode(
        c.query(`DELETE FROM public.roleta_sdr_apuracoes WHERE corretor_id = $1`, [ana.id]),
      ),
    ).toBe("42501");
    expect(
      await errCode(
        c.query(
          `UPDATE public.roleta_sdr_apuracoes SET resultado = 'apto_meta' WHERE corretor_id = $1`,
          [ana.id],
        ),
      ),
    ).toBe("42501");
    await comoSuperuser(c);
  });

  it("últimas apurações para a tela: RLS decide (admin todas, corretor só as dele)", async () => {
    await comoUsuario(c, admin.id);
    const todas = await c.query(
      `SELECT DISTINCT semana_inicio::text AS s FROM public.roleta_sdr_apuracoes_recentes(4) ORDER BY 1 DESC`,
    );
    expect(todas.rows.map((x) => x.s)).toEqual([W, dia(W, -7)]);
    const helenaRow = await c.query(
      `SELECT nome, resultado FROM public.roleta_sdr_apuracoes_recentes(4)
        WHERE corretor_id = $1 AND semana_inicio = $2::date`,
      [helena.id, W],
    );
    expect(helenaRow.rows[0]).toEqual({ nome: "Helena", resultado: "apto_meta" });
    await comoUsuario(c, ana.id);
    const minhas = await c.query(
      `SELECT DISTINCT corretor_id FROM public.roleta_sdr_apuracoes_recentes(4)`,
    );
    expect(minhas.rows.map((x) => x.corretor_id)).toEqual([ana.id]);
    await comoSuperuser(c);
  });

  it("recusa semana aberta, dia que não é sábado e semana antiga que já mexeu na roleta", async () => {
    await comoSuperuser(c);
    expect(await errCode(apurar(dia(W, 7)))).toBe("22023");
    expect(await errCode(apurar(dia(W, 2)))).toBe("22023");
    await c.query(
      `UPDATE public.roleta_sdr_apuracoes SET sombra = false WHERE semana_inicio = $1::date AND corretor_id = $2`,
      [dia(W, -7), ana.id],
    );
    expect(await errCode(apurar(dia(W, -7)))).toBe("22023");
  });

  it("ninguém qualificado: roleta vazia e alerta para os admins (uma vez)", async () => {
    const semana = dia(W, -28);
    const r = await apurar(semana);
    expect(r.resultado).toMatchObject({ apto_meta: 0, apto_venda: 0, apto_complemento: 0 });
    await apurar(semana);
    await comoSuperuser(c);
    const alertas = await c.query(
      `SELECT titulo, mensagem, link FROM public.alertas WHERE user_id = $1 AND titulo LIKE '%sem aptos%'`,
      [admin.id],
    );
    expect(alertas.rows).toHaveLength(1);
    expect(alertas.rows[0].titulo).toBe("[Teste] Roleta do SDR sem aptos nesta semana");
    expect(alertas.rows[0].mensagem).toContain(
      "Roleta do SDR sem aptos nesta semana: entregas pela entrega manual do admin",
    );
  });
});

describe("rodízio ponderado (regra valendo)", () => {
  async function distribuir(n: number): Promise<Record<string, number>> {
    await comoSuperuser(c);
    const contagem: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const lead = await criarLead(c, { nome: `Lead SDR ${i}` });
      await c.query(`UPDATE public.leads SET sdr_id = $1 WHERE id = $2`, [sdr.id, lead]);
      const r = await c.query(
        `SELECT public._distribuir_lead_sdr($1, 'teste do rodízio', NULL, NULL, 'teste') AS r`,
        [lead],
      );
      expect(r.rows[0].r.ok, JSON.stringify(r.rows[0].r)).toBe(true);
      const id = r.rows[0].r.corretor_id as string;
      contagem[id] = (contagem[id] ?? 0) + 1;
    }
    return contagem;
  }

  beforeAll(async () => {
    await setting("roleta_sdr_modo_sombra", false);
    await comoSuperuser(c);
    // Só Helena (meta, peso 2) e Kleber (1 venda, peso 1) com telefone: os
    // únicos aptos da roleta de agendados neste bloco.
    await c.query(`UPDATE public.profiles SET telefone = NULL WHERE id <> ALL($1::uuid[])`, [
      [helena.id, kleber.id],
    ]);
    await c.query(
      `UPDATE public.profiles SET telefone = '11999990000' WHERE id = ANY($1::uuid[])`,
      [[helena.id, kleber.id]],
    );
  });

  it("o peso vigente vem da última semana aplicada; incluído à mão ou sem linha = peso cheio", async () => {
    await comoSuperuser(c);
    const peso = async (u: UsuarioTeste) =>
      (await c.query(`SELECT public._roleta_sdr_peso_atual($1) AS p`, [u.id])).rows[0].p;
    expect(await peso(helena)).toBe(2);
    expect(await peso(kleber)).toBe(1);
    expect(await peso(lia)).toBe(2);
    expect(await peso(ana)).toBe(2); // pausada: se o admin a incluir à mão, peso cheio
  });

  it("a apuração aplicada zera o crédito do rodízio da semana anterior", async () => {
    await comoSuperuser(c);
    await c.query(`UPDATE public.roleta_participantes SET wrr_current = 7 WHERE roleta_id = $1`, [
      roletaId,
    ]);
    await apurar(W);
    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.roleta_participantes WHERE roleta_id = $1 AND wrr_current <> 0`,
      [roletaId],
    );
    expect(r.rows[0].n).toBe(0);
  });

  it("meta (peso 2) recebe 2 agendados para cada 1 de quem entrou com 1 venda (peso 1)", async () => {
    const contagem = await distribuir(6);
    expect(contagem[helena.id]).toBe(4);
    expect(contagem[kleber.id]).toBe(2);
    await comoSuperuser(c);
    const ctx = await c.query(
      `SELECT c.contexto FROM public.distribuicao_log_contexto c
         JOIN public.distribution_log l ON l.id = c.log_id
        WHERE l.motivo = 'teste do rodízio' ORDER BY l.created_at DESC LIMIT 1`,
    );
    expect(ctx.rows[0].contexto.rodizio_ponderado).toBe(true);
  });

  it("em sombra o rodízio volta a ser o de sempre (há mais tempo sem receber)", async () => {
    await setting("roleta_sdr_modo_sombra", true);
    await comoSuperuser(c);
    expect((await c.query(`SELECT public._roleta_sdr_ponderado() AS p`)).rows[0].p).toBe(false);
    const contagem = await distribuir(4);
    expect(contagem[helena.id]).toBe(2);
    expect(contagem[kleber.id]).toBe(2);
    await setting("roleta_sdr_modo_sombra", false);
  });

  it("o motor só escolhe quem a prévia aceitou: função de escolha fechada para a API", async () => {
    await comoUsuario(c, admin.id);
    expect(
      await errCode(
        c.query(`SELECT public._roleta_sdr_escolher_ponderado($1, ARRAY[$2]::uuid[])`, [
          roletaId,
          helena.id,
        ]),
      ),
    ).toBe("42501");
    await comoSuperuser(c);
  });
});

describe("aviso de meio de semana (semana em curso)", () => {
  async function alertasDe(u: UsuarioTeste) {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT titulo, mensagem, link, ref_id FROM public.alertas
        WHERE user_id = $1 AND titulo LIKE '%Roleta do SDR: sua semana%'`,
      [u.id],
    );
    return r.rows;
  }

  it("sino para quem não bateu, com dedup; sombra sai com [Teste]; bloqueado e quem bateu ficam de fora", async () => {
    const atual = dia(W, 7);
    // Helena já bateu na semana em curso.
    for (let i = 0; i < 3; i++) await visita(helena, sp(dia(atual, 1 + i)));
    // Ana: 1 visita + 1 pasta na semana em curso.
    await visita(ana, sp(dia(atual, 1)));
    await pasta(ana, sp(dia(atual, 2)));

    await setting("roleta_sdr_modo_sombra", true);
    await comoSuperuser(c);
    const r1 = (await c.query(`SELECT public.roleta_sdr_aviso_meio_semana() AS r`)).rows[0].r;
    expect(r1).toMatchObject({ ok: true, sombra: true });
    const r2 = (await c.query(`SELECT public.roleta_sdr_aviso_meio_semana() AS r`)).rows[0].r;
    expect(r2.avisados).toBe(0); // dedup por ref_id

    const daAna = await alertasDe(ana);
    expect(daAna).toHaveLength(1);
    expect(daAna[0].titulo).toBe("[Teste] Roleta do SDR: sua semana");
    // Ana está pausada pela regra (apuração de W): o verbo é "voltar".
    expect(daAna[0].mensagem).toBe(
      "[Teste] Sua semana na roleta do SDR: 1 visita realizada e 1 pasta (2,5 pts). Para voltar a receber agendados a partir de sábado, falta 1 visita ou 1 pasta até sexta.",
    );
    const ref = (
      await c.query(`SELECT md5('roleta-sdr-aviso:' || $1 || ':' || $2)::uuid AS r`, [
        ana.id,
        atual,
      ])
    ).rows[0].r;
    expect(daAna[0].ref_id).toBe(ref);

    // Fora da roleta: o verbo é "entrar". Zerado: 3 visitas ou 2 pastas.
    const daDavi = await alertasDe(davi);
    expect(daDavi[0].mensagem).toContain(
      "Para entrar na roleta e receber agendados a partir de sábado, faltam 3 visitas ou 2 pastas até sexta.",
    );
    expect(await alertasDe(helena)).toHaveLength(0);
    expect(await alertasDe(fabio)).toHaveLength(0);
  });

  it("fora da sombra o aviso sai sem o prefixo", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.alertas WHERE user_id = $1`, [bia.id]);
    await setting("roleta_sdr_modo_sombra", false);
    await comoSuperuser(c);
    await c.query(`SELECT public.roleta_sdr_aviso_meio_semana()`);
    const daBia = await alertasDe(bia);
    expect(daBia).toHaveLength(1);
    expect(daBia[0].titulo).toBe("Roleta do SDR: sua semana");
    expect(daBia[0].mensagem.startsWith("Sua semana na roleta do SDR:")).toBe(true);
    expect(daBia[0].link).toBe("/fila");
  });
});

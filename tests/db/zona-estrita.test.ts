/**
 * ZONA ESTRITA — migrations 20261009120000 (região única) e 20261009120100
 * (motores + guarda). Decisão do dono (03/10/2026): "um corretor deve receber
 * leads de qualquer origem apenas da sua região de atuação".
 *
 * Elenco (todos com telefone, todos corretores, menos o admin):
 *   Lia   — região Leste            (definida pela aba Corretores)
 *   Saulo — região Sul, no Plantão  (definida pela aba Corretores)
 *   Nina  — região Norte            (definida pela roleta da zona, aba Filas)
 *   Sem   — sem região, no Plantão  (só pode receber lead SEM zona)
 *
 * O que cada bloco prova:
 *   1. a zona do lead é UMA regra (a da vitrine: ABC = Sul, Grande SP);
 *   2. a região do corretor é UMA (participação nas roletas de zona, com
 *      profiles.zonas como espelho que ninguém edita por fora);
 *   3. o motor nunca tira o lead da zona — sem time apto, o lead espera, e a
 *      espera destrava quando alguém da zona chega;
 *   4. campanha de equipe fixa sorteia só quem da equipe atende a zona;
 *   5. a guarda do banco barra qualquer escrita fora da região, com as
 *      isenções de propósito (sem zona, captação própria, não-corretor);
 *   6. transferência manual e exceção manual exigem motivo para furar a zona;
 *   7. Escoar estoque, SDR, Oferta Ativa, lote e Discador respeitam a região;
 *   8. zona_estrita=false devolve o comportamento antigo (rollback).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarProjeto,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  pool,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let admin: UsuarioTeste;
let lia: UsuarioTeste;
let saulo: UsuarioTeste;
let nina: UsuarioTeste;
let sem: UsuarioTeste;
let sdr: UsuarioTeste;
let v2Antes: unknown;
let pctAntes: unknown;

async function erro(p: Promise<unknown>): Promise<{ code: string | null; message: string }> {
  try {
    await p;
    return { code: null, message: "" };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code ?? "unknown", message: err.message ?? "" };
  }
}

async function leadComZona(opts: {
  nome: string;
  zona?: string | null;
  bairro?: string | null;
  projetoId?: string | null;
  status?: string;
}): Promise<string> {
  const id = await criarLead(c, {
    nome: opts.nome,
    projetoId: opts.projetoId ?? null,
    status: opts.status,
  });
  await comoSuperuser(c);
  await c.query(`UPDATE public.leads SET zona = $2, bairro = $3 WHERE id = $1`, [
    id,
    opts.zona ?? null,
    opts.bairro ?? null,
  ]);
  return id;
}

async function triar(leadId: string, gatilho = "teste") {
  await comoSuperuser(c);
  const r = await c.query(`SELECT public.triar_e_distribuir_lead($1::uuid, $2) AS res`, [
    leadId,
    gatilho,
  ]);
  return r.rows[0].res as Record<string, unknown>;
}

async function dono(leadId: string): Promise<string | null> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [leadId]);
  return (r.rows[0]?.corretor_id as string | null) ?? null;
}

async function zonasDe(u: UsuarioTeste): Promise<string[]> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT zonas FROM public.profiles WHERE id = $1`, [u.id]);
  return r.rows[0].zonas as string[];
}

// Chegar = check-in numa filial (20261013120000: marcar_presenca(true) sozinho
// não marca presença); sair = marcar_presenca(false).
async function presenca(u: UsuarioTeste, presente: boolean) {
  await comoUsuario(c, u.id);
  await c.query(
    presente
      ? `SELECT public.presenca_checkin('loja', 'barra-funda')`
      : `SELECT public.marcar_presenca(false)`,
  );
  await comoSuperuser(c);
}

async function setZonaEstrita(ligada: boolean) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.distribuicao_settings SET valor = $1::jsonb WHERE chave = 'zona_estrita'`,
    [JSON.stringify(ligada)],
  );
}

async function regiao(u: UsuarioTeste, zonas: string[]) {
  await comoUsuario(c, admin.id);
  await c.query(`SELECT public.atualizar_corretor_distribuicao($1::uuid, $2::text[])`, [
    u.id,
    zonas,
  ]);
  await comoSuperuser(c);
}

async function ultimoLog(leadId: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT dl.motivo, dl.regra_aplicada, dl.roleta_slug, dl.corretor_id, ctx.contexto
       FROM public.distribution_log dl
       LEFT JOIN public.distribuicao_log_contexto ctx ON ctx.log_id = dl.id
      WHERE dl.lead_id = $1
      ORDER BY dl.created_at DESC, dl.id DESC LIMIT 1`,
    [leadId],
  );
  return r.rows[0];
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await setZonaEstrita(true);
  // O motor v2 (faixas, vínculo, onboarding) é outra régua; aqui o motor roda
  // no modo vigente para isolar a regra de zona — quem depende do corte
  // declara o corte.
  await comoSuperuser(c);
  v2Antes = (
    await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = 'modelo_v2_ativo'`)
  ).rows[0]?.valor;
  await c.query(
    `UPDATE public.distribuicao_settings SET valor = 'false'::jsonb WHERE chave = 'modelo_v2_ativo'`,
  );
  // O Plantão é 'automatica_presenca' e exige % mínimo de carteira trabalhada;
  // a carteira de teste fica toda em "aguardando". Também é outra régua.
  pctAntes = (
    await c.query(
      `SELECT valor FROM public.distribuicao_settings WHERE chave = 'percentual_minimo_trabalhado'`,
    )
  ).rows[0]?.valor;
  await c.query(
    `UPDATE public.distribuicao_settings SET valor = '0'::jsonb WHERE chave = 'percentual_minimo_trabalhado'`,
  );

  admin = await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  lia = await criarUsuario(c, { nome: "Lia Leste", papel: "corretor" });
  saulo = await criarUsuario(c, { nome: "Saulo Sul", papel: "corretor" });
  nina = await criarUsuario(c, { nome: "Nina Norte", papel: "corretor" });
  sem = await criarUsuario(c, { nome: "Sem Região", papel: "corretor" });
  sdr = await criarUsuario(c, { nome: "Sara SDR", papel: "sdr" });

  // Elegibilidade exige telefone no perfil (a factory não preenche).
  await comoSuperuser(c);
  for (const [i, u] of [admin, lia, saulo, nina, sem, sdr].entries()) {
    await c.query(`UPDATE public.profiles SET telefone = $2 WHERE id = $1`, [
      u.id,
      `119888800${String(i).padStart(2, "0")}`,
    ]);
  }

  // Lia e Saulo pela aba Corretores; Nina pela roleta da zona (aba Filas).
  await regiao(lia, ["Leste"]);
  await regiao(saulo, ["Sul"]);
  await comoUsuario(c, admin.id);
  await c.query(`SELECT public.gerenciar_participante_roleta('zona-norte', $1::uuid, 'incluir')`, [
    nina.id,
  ]);
  for (const u of [saulo, sem]) {
    await c.query(`SELECT public.gerenciar_participante_roleta('plantao', $1::uuid, 'incluir')`, [
      u.id,
    ]);
  }
  for (const u of [lia, saulo, nina, sem]) await presenca(u, true);
});

afterAll(async () => {
  await setZonaEstrita(true);
  await comoSuperuser(c);
  if (pctAntes !== undefined) {
    await c.query(
      `UPDATE public.distribuicao_settings SET valor = $1::jsonb WHERE chave = 'percentual_minimo_trabalhado'`,
      [JSON.stringify(pctAntes)],
    );
  }
  if (v2Antes !== undefined) {
    await c.query(
      `UPDATE public.distribuicao_settings SET valor = $1::jsonb WHERE chave = 'modelo_v2_ativo'`,
      [JSON.stringify(v2Antes)],
    );
  }
  await c.query(
    `UPDATE public.cadencia_config SET modo = 'sombra', portas_legadas_bolsao = false WHERE id = 1`,
  );
  await limparDados(c);
  await c.end();
  await pool.end();
});

// ---------------------------------------------------------------------------
describe("1. a zona do lead é UMA regra (a da vitrine)", () => {
  it("texto livre: ABC é Sul, município da Grande SP é Grande SP, Vila Mauá é capital", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT z, public.zona_canonica(z) AS zona
         FROM unnest(ARRAY['Zona Leste','ZL','abc','Santo André','Guarulhos',
                           'Centro de Guarulhos','Grande SP','Vila Mauá','centro']) AS z`,
    );
    const m = Object.fromEntries(r.rows.map((x) => [x.z, x.zona]));
    expect(m).toEqual({
      "Zona Leste": "Leste",
      ZL: "Leste",
      abc: "Sul",
      "Santo André": "Sul",
      Guarulhos: "Grande SP",
      "Centro de Guarulhos": "Grande SP",
      "Grande SP": "Grande SP",
      "Vila Mauá": null,
      centro: "Centro",
    });
  });

  it("cascata: zona do lead → bairro → empreendimento; distribuição e lote concordam", async () => {
    const next = await criarProjeto(c, { nome: "Next Guarulhos" });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.projetos SET zona_smq = 'Grande SP', regiao = 'Norte' WHERE id = $1`,
      [next],
    );
    const doProjeto = await leadComZona({ nome: "Do Next", projetoId: next });
    const zonaPropria = await leadComZona({ nome: "Quer Leste", zona: "Leste", projetoId: next });
    const peloBairro = await leadComZona({ nome: "Do Tatuapé", bairro: "Tatuapé" });
    const doAbc = await leadComZona({ nome: "Do Rudge", bairro: "Rudge Ramos" });

    await comoSuperuser(c);
    const r = await c.query(
      `SELECT l.id, public.zona_do_lead(l.id) AS dist, public._prospeccao_zona_do_lead(l) AS lote
         FROM public.leads l WHERE l.id = ANY($1::uuid[])`,
      [[doProjeto, zonaPropria, peloBairro, doAbc]],
    );
    const z = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(z[doProjeto].dist).toBe("Grande SP"); // antes: NULL → Plantão
    expect(z[zonaPropria].dist).toBe("Leste");
    expect(z[peloBairro].dist).toBe("Leste");
    expect(z[doAbc].dist).toBe("Sul");
    for (const x of r.rows) expect(x.lote).toBe(x.dist);
  });
});

// ---------------------------------------------------------------------------
describe("2. a região do corretor é UMA (roletas de zona, espelhada em profiles.zonas)", () => {
  it("aba Corretores grava participação; o espelho acompanha; aba Filas também vale", async () => {
    expect(await zonasDe(lia)).toEqual(["Leste"]);
    expect(await zonasDe(saulo)).toEqual(["Sul"]);
    expect(await zonasDe(nina)).toEqual(["Norte"]); // veio da roleta zona-norte
    expect(await zonasDe(sem)).toEqual([]);

    await regiao(lia, ["Grande SP", "Leste"]);
    expect(await zonasDe(lia)).toEqual(["Leste", "Grande SP"]); // ordem dos chips
    await regiao(lia, ["Leste"]);
    expect(await zonasDe(lia)).toEqual(["Leste"]);

    await comoSuperuser(c);
    const p = await c.query(
      `SELECT r.slug, rp.ativo FROM public.roleta_participantes rp
         JOIN public.roletas r ON r.id = rp.roleta_id
        WHERE rp.corretor_id = $1 AND r.tipo = 'zona' ORDER BY r.slug`,
      [lia.id],
    );
    expect(p.rows).toEqual([
      { slug: "zona-grande-sp", ativo: false },
      { slug: "zona-leste", ativo: true },
    ]);
  });

  it("ninguém edita profiles.zonas por fora — nem a gestão por SQL, nem o próprio corretor", async () => {
    await comoSuperuser(c);
    await c.query(`UPDATE public.profiles SET zonas = '{Sul,Leste}' WHERE id = $1`, [nina.id]);
    expect(await zonasDe(nina)).toEqual(["Norte"]);

    await comoUsuario(c, nina.id);
    await c.query(`UPDATE public.profiles SET zonas = '{Sul}' WHERE id = $1`, [nina.id]);
    expect(await zonasDe(nina)).toEqual(["Norte"]);
  });

  it("zona inválida é recusada; todas as seis zonas têm roleta", async () => {
    await comoUsuario(c, admin.id);
    const e = await erro(
      c.query(`SELECT public.atualizar_corretor_distribuicao($1::uuid, '{Marte}'::text[])`, [
        sem.id,
      ]),
    );
    expect(e.message).toMatch(/zona invalida/);
    await comoSuperuser(c);
    const r = await c.query(`SELECT zona FROM public.zonas_roletas ORDER BY zona`);
    expect(r.rows.map((x) => x.zona)).toEqual([
      "Centro",
      "Grande SP",
      "Leste",
      "Norte",
      "Oeste",
      "Sul",
    ]);
  });
});

// ---------------------------------------------------------------------------
describe("3. motor: lead com zona nunca sai da zona", () => {
  it("lead da Leste vai para a Lia (time da zona)", async () => {
    const l = await leadComZona({ nome: "Leste 1", zona: "Leste" });
    const res = await triar(l);
    expect(res).toMatchObject({ ok: true, corretor_id: lia.id, roleta: "zona-leste" });
    expect(await dono(l)).toBe(lia.id);
  });

  it("Lia ausente: o lead da Leste ESPERA — não vai para o Plantão presente (Saulo/Sem)", async () => {
    await presenca(lia, false);
    const l = await leadComZona({ nome: "Leste esperando", zona: "Leste" });
    const res = await triar(l);
    expect(res).toMatchObject({ ok: false, motivo: "sem_corretor_na_zona", roleta: "zona-leste" });
    expect(await dono(l)).toBeNull();

    await comoSuperuser(c);
    const e = await c.query(
      `SELECT motivo, status FROM public.distribuicao_excecoes WHERE lead_id = $1`,
      [l],
    );
    expect(e.rows[0]).toEqual({ motivo: "sem_corretor_na_zona", status: "pendente" });

    // O cron já estaria no backoff de 30 min (3 tentativas)...
    await c.query(`UPDATE public.distribuicao_excecoes SET tentativas = 3 WHERE lead_id = $1`, [l]);
    // ...e a chegada da Lia destrava a espera da zona dela.
    await presenca(lia, true);
    const t = await c.query(
      `SELECT tentativas FROM public.distribuicao_excecoes WHERE lead_id = $1`,
      [l],
    );
    expect(t.rows[0].tentativas).toBe(0);

    expect(await triar(l)).toMatchObject({ ok: true, corretor_id: lia.id });
  });

  it("zona sem time (Centro) espera com motivo próprio — nunca cai no Plantão", async () => {
    const l = await leadComZona({ nome: "Da Liberdade", bairro: "Liberdade" });
    const res = await triar(l);
    expect(res).toMatchObject({ ok: false, motivo: "zona_sem_time", roleta: "zona-centro" });
    expect(await dono(l)).toBeNull();
  });

  it("slug explícito de OUTRA zona (token zona-norte) não tira o lead da zona dele", async () => {
    const l = await leadComZona({ nome: "Sul pelo token Norte", zona: "Sul" });
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT public.distribuir_lead_v3($1::uuid, 'automatica', 'zona-norte', NULL, 'webhook') AS res`,
      [l],
    );
    expect(r.rows[0].res).toMatchObject({ ok: true, corretor_id: saulo.id, roleta: "zona-sul" });
    const log = await ultimoLog(l);
    expect(log.contexto.roleta_pedida).toBe("zona-norte");
  });

  it("lead SEM zona segue o fluxo por origem (Plantão)", async () => {
    const l = await leadComZona({ nome: "Sem zona" });
    const res = await triar(l);
    expect(res).toMatchObject({ ok: true, roleta: "plantao" });
    expect([saulo.id, sem.id]).toContain(res.corretor_id);
  });

  it("ROLLBACK: zona_estrita=false volta ao desvio antigo (Leste sem time apto → Plantão)", async () => {
    await presenca(lia, false);
    await setZonaEstrita(false);
    try {
      const l = await leadComZona({ nome: "Leste no rollback", zona: "Leste" });
      const res = await triar(l);
      expect(res).toMatchObject({ ok: true, roleta: "plantao" });
    } finally {
      await setZonaEstrita(true);
      await presenca(lia, true);
    }
  });
});

// ---------------------------------------------------------------------------
describe("4. campanha de EQUIPE FIXA sorteia só quem da equipe atende a zona", () => {
  beforeAll(async () => {
    await comoUsuario(c, admin.id);
    for (const u of [saulo, nina]) {
      await c.query(
        `SELECT public.gerenciar_participante_roleta('equipe-guilherme', $1::uuid, 'incluir')`,
        [u.id],
      );
    }
    await comoSuperuser(c);
  });

  async function campanha(leadId: string) {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT public.distribuir_lead_ponderado($1::uuid, 'equipe-guilherme') AS res`,
      [leadId],
    );
    return r.rows[0].res as Record<string, unknown>;
  }

  it("lead do Sul fica na equipe, com o Saulo", async () => {
    const l = await leadComZona({ nome: "Sul da equipe", zona: "Sul" });
    expect(await campanha(l)).toMatchObject({ ok: true, corretor_id: saulo.id });
  });

  it("lead da Leste (ninguém da equipe atende) vai para o time da Leste — não para Saulo/Nina", async () => {
    const l = await leadComZona({ nome: "Leste da equipe", zona: "Leste" });
    const res = await campanha(l);
    expect(res).toMatchObject({ ok: true, corretor_id: lia.id, roleta: "zona-leste" });
    const log = await ultimoLog(l);
    expect(log.contexto).toMatchObject({
      campanha: "equipe-guilherme",
      equipe_sem_apto_na_zona: true,
    });
  });

  it("lead sem zona segue o sorteio da equipe", async () => {
    const l = await leadComZona({ nome: "Sem zona da equipe" });
    const res = await campanha(l);
    expect(res.ok).toBe(true);
    expect([saulo.id, nina.id]).toContain(res.corretor_id);
  });
});

// ---------------------------------------------------------------------------
describe("5. a guarda do banco barra qualquer escrita fora da região", () => {
  it("UPDATE direto de lead da Leste para o Saulo: SMQZ1 com mensagem legível", async () => {
    const l = await leadComZona({ nome: "Leste direto", zona: "Leste" });
    await comoSuperuser(c);
    const e = await erro(
      c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [l, saulo.id]),
    );
    expect(e.code).toBe("SMQZ1");
    expect(e.message).toBe(
      "Fora da região: o lead é da Zona Leste e Saulo Sul não atende essa zona. " +
        "Escolha um corretor da zona (ou registre a exceção da gestão com motivo).",
    );
    expect(await dono(l)).toBeNull();
  });

  it("isenções de propósito: lead sem zona, dono que não é corretor, captação própria", async () => {
    const semZona = await leadComZona({ nome: "Sem zona direto" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [semZona, saulo.id]);
    expect(await dono(semZona)).toBe(saulo.id);

    const paraAdmin = await leadComZona({ nome: "Leste para o admin", zona: "Leste" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [paraAdmin, admin.id]);
    expect(await dono(paraAdmin)).toBe(admin.id);

    // O Saulo cadastra o PRÓPRIO cliente da Leste (indicação dele).
    await comoUsuario(c, saulo.id);
    const r = await c.query(
      `SELECT public.criar_lead_dedup(jsonb_build_object(
          'nome', 'Indicação do Saulo', 'telefone', '11977770001',
          'zona', 'Leste', 'corretor_id', $1::text)) AS res`,
      [saulo.id],
    );
    expect(await dono(r.rows[0].res.lead_id)).toBe(saulo.id);
  });

  it("gestão criando lead da Leste JÁ com o Saulo: recusado", async () => {
    await comoUsuario(c, admin.id);
    const e = await erro(
      c.query(
        `SELECT public.criar_lead_dedup(jsonb_build_object(
            'nome', 'Criado pela gestão', 'telefone', '11977770002',
            'zona', 'Leste', 'corretor_id', $1::text))`,
        [saulo.id],
      ),
    );
    expect(e.code).toBe("SMQZ1");
  });

  it("a função legada atribuir_lead_a_corretor não é mais executável por anon/authenticated", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT has_function_privilege('anon', 'public.atribuir_lead_a_corretor(uuid,uuid)', 'EXECUTE') AS anon,
              has_function_privilege('authenticated', 'public.atribuir_lead_a_corretor(uuid,uuid)', 'EXECUTE') AS auth`,
    );
    expect(r.rows[0]).toEqual({ anon: false, auth: false });
  });
});

// ---------------------------------------------------------------------------
describe("6. furo manual só como exceção da gestão, com motivo", () => {
  let leste: string;
  let sul: string;

  beforeAll(async () => {
    leste = await leadComZona({ nome: "Leste p/ transferir", zona: "Leste" });
    sul = await leadComZona({ nome: "Sul p/ transferir", zona: "Sul" });
  });

  it("transferência com 1 lead fora da região: recusa tudo, com a contagem por zona", async () => {
    await comoUsuario(c, admin.id);
    const e = await erro(
      c.query(`SELECT public.transferir_leads($1::uuid[], $2::uuid)`, [[leste, sul], saulo.id]),
    );
    expect(e.code).toBe("SMQZ1");
    expect(e.message).toContain("1 de 2 lead(s)");
    expect(e.message).toContain("Zona Leste: 1");
    expect(await dono(leste)).toBeNull();
    expect(await dono(sul)).toBeNull(); // nada pela metade

    const curto = await erro(
      c.query(`SELECT public.transferir_leads($1::uuid[], $2::uuid, true, 'abc')`, [
        [leste],
        saulo.id,
      ]),
    );
    expect(curto.code).toBe("SMQZ1");
  });

  it("com exceção + motivo transfere e deixa o furo no log", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(
      `SELECT public.transferir_leads($1::uuid[], $2::uuid, true, 'Cliente pediu o Saulo (indicação)') AS n`,
      [[leste, sul], saulo.id],
    );
    expect(r.rows[0].n).toBe(2);
    expect(await dono(leste)).toBe(saulo.id);
    const logLeste = await ultimoLog(leste);
    expect(logLeste.regra_aplicada).toBe("transferencia_fora_da_regiao");
    expect(logLeste.motivo).toContain("Cliente pediu o Saulo");
    expect((await ultimoLog(sul)).regra_aplicada).toBe("transferencia_manual");
  });

  it("fila de exceções: atribuir manual fora da região exige exceção + motivo", async () => {
    const l = await leadComZona({ nome: "Centro p/ exceção", bairro: "Sé" });
    await triar(l); // zona_sem_time → exceção
    await comoSuperuser(c);
    const ex = await c.query(`SELECT id FROM public.distribuicao_excecoes WHERE lead_id = $1`, [l]);
    const excecaoId = ex.rows[0].id as string;

    await comoUsuario(c, admin.id);
    const e = await erro(
      c.query(
        `SELECT public.resolver_excecao($1, 'atribuir_manual', jsonb_build_object('corretor_id', $2::text))`,
        [excecaoId, saulo.id],
      ),
    );
    expect(e.code).toBe("SMQZ1");

    const r = await c.query(
      `SELECT public.resolver_excecao($1, 'atribuir_manual', jsonb_build_object(
          'corretor_id', $2::text, 'forcar_fora_da_zona', true,
          'motivo_fora_da_zona', 'Centro sem time ainda; Saulo cobre hoje')) AS res`,
      [excecaoId, saulo.id],
    );
    expect(r.rows[0].res).toMatchObject({ ok: true, corretor_id: saulo.id });
    expect((await ultimoLog(l)).motivo).toContain("FORA DA REGIÃO");
  });
});

// ---------------------------------------------------------------------------
describe("7. os outros caminhos de entrega respeitam a região", () => {
  it("Escoar estoque: cada um recebe o estoque da própria região (ou sem zona)", async () => {
    const estoque: Record<string, string> = {};
    for (const [nome, zona] of [
      ["Estoque Leste", "Leste"],
      ["Estoque Sul", "Sul"],
      ["Estoque sem zona", null],
    ] as const) {
      estoque[nome] = await leadComZona({ nome, zona });
      await comoSuperuser(c);
      await c.query(`UPDATE public.leads SET status = 'aguardando_corretor' WHERE id = $1`, [
        estoque[nome],
      ]);
    }
    await comoSuperuser(c);
    const r = await c.query(`SELECT public.distribuir_estoque_roleta('plantao', 30) AS out`);
    expect(r.rows[0].out.ok).toBe(true);

    expect(await dono(estoque["Estoque Sul"])).toBe(saulo.id);
    expect(await dono(estoque["Estoque Leste"])).toBeNull(); // ninguém da Leste no Plantão
    expect([saulo.id, sem.id]).toContain(await dono(estoque["Estoque sem zona"]));
    expect(r.rows[0].out.restante_por_zona).toMatchObject({ Leste: 1 });
  });

  it("SDR: dono antigo de outra região é recusado; sem agendado da zona, vai o time da zona", async () => {
    const l = await leadComZona({ nome: "Visita no Sul", zona: "Sul" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET sdr_id = $2 WHERE id = $1`, [l, sdr.id]);
    await c.query(
      `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo)
       SELECT r.id, $1, true FROM public.roletas r WHERE r.slug = 'agendados-sdr'
       ON CONFLICT (roleta_id, corretor_id) DO UPDATE SET ativo = true`,
      [lia.id],
    );
    // Dono antigo (Nina, Norte) continua no lead, como num reaquecimento.
    await c.query(`SET session_replication_role = replica`);
    await c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [l, nina.id]);
    await c.query(`SET session_replication_role = DEFAULT`);

    const r = await c.query(`SELECT public._distribuir_lead_sdr($1, 'Visita marcada') AS res`, [l]);
    expect(r.rows[0].res).toMatchObject({
      ok: true,
      corretor_id: saulo.id,
      regra: "roleta_sdr_zona",
      roleta: "zona-sul",
    });
    const log = await ultimoLog(l);
    expect(log.contexto.prioridade_recusa).toBe("fora_da_regiao");
  });

  it("Oferta Ativa: lista com zona que ninguém escolhido atende é recusada; dividida, cada lead vai para quem atende", async () => {
    const leste = await leadComZona({ nome: "Oferta Leste", zona: "Leste" });
    const sul = await leadComZona({ nome: "Oferta Sul", zona: "Sul" });
    const livre = await leadComZona({ nome: "Oferta sem zona" });
    await comoSuperuser(c);
    const o = await c.query(
      `INSERT INTO public.ofertas_ativas (nome, criado_por) VALUES ('Lista teste', $1) RETURNING id`,
      [admin.id],
    );
    const oferta = o.rows[0].id as string;
    await c.query(
      `INSERT INTO public.oferta_ativa_leads (oferta_id, lead_id)
       SELECT $1, unnest($2::uuid[])`,
      [oferta, [leste, sul, livre]],
    );

    await comoUsuario(c, admin.id);
    const e = await erro(
      c.query(`SELECT public.atribuir_oferta_ativa_lote($1, $2::uuid[], 50)`, [oferta, [saulo.id]]),
    );
    expect(e.code).toBe("SMQZ1");
    expect(e.message).toContain("Zona Leste: 1");

    for (let i = 0; i < 5; i++) {
      const r = await c.query(
        `SELECT public.atribuir_oferta_ativa_lote($1, $2::uuid[], 50) AS res`,
        [oferta, [saulo.id, lia.id]],
      );
      if (r.rows[0].res.concluido) break;
    }
    expect(await dono(leste)).toBe(lia.id);
    expect(await dono(sul)).toBe(saulo.id);
    expect([saulo.id, lia.id]).toContain(await dono(livre));
  });

  it("Discador: o corretor só reserva lead da própria região (ou sem zona) e não assume de outra", async () => {
    const leste = await leadComZona({ nome: "Bolsão Leste", zona: "Leste" });
    const sul = await leadComZona({ nome: "Bolsão Sul", zona: "Sul" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.cadencia_config SET portas_legadas_bolsao = true WHERE id = 1`);
    const r = await c.query(
      `SELECT lead_id, public.zona_do_lead(lead_id) AS zona
         FROM public.discador_bolsao_reservar_v1($1, 500, 'campanha', 'camp-z', NULL)`,
      [saulo.id],
    );
    const ids = r.rows.map((x) => x.lead_id as string);
    expect(ids).toContain(sul);
    expect(ids).not.toContain(leste);
    for (const x of r.rows) expect([null, "Sul"]).toContain(x.zona);

    const a = await c.query(`SELECT public.discador_bolsao_assumir_v1($1, $2, NULL) AS res`, [
      leste,
      saulo.id,
    ]);
    expect(a.rows[0].res).toMatchObject({ ok: false, motivo: "fora_da_regiao", zona: "Leste" });
    await c.query(`UPDATE public.cadencia_config SET portas_legadas_bolsao = false WHERE id = 1`);
  });

  it("Lote de prospecção: só zonas da própria região; sem região não há lote", async () => {
    await comoSuperuser(c);
    await c.query(`UPDATE public.cadencia_config SET modo = 'ativo' WHERE id = 1`);

    await comoUsuario(c, sem.id);
    const st = await c.query(`SELECT public.prospeccao_lote_status_v1() AS s`);
    expect(st.rows[0].s).toMatchObject({ pode_pedir: false, motivo: "sem_regiao", regiao: [] });

    await comoUsuario(c, saulo.id);
    const st2 = await c.query(`SELECT public.prospeccao_lote_status_v1() AS s`);
    expect(st2.rows[0].s.regiao).toEqual(["Sul"]);
    const r = await c.query(`SELECT public.prospeccao_pedir_lote('Leste') AS r`);
    expect(r.rows[0].r).toMatchObject({ ok: false, motivo: "zona_fora_da_regiao", zona: "Leste" });

    await comoSuperuser(c);
    await c.query(`UPDATE public.cadencia_config SET modo = 'sombra' WHERE id = 1`);
  });
});

// ---------------------------------------------------------------------------
describe("8. espelho e guarda não pagam custo no cursor da roleta", () => {
  it("atualizar o cursor (ultimo_lead_em) não reescreve profiles.zonas", async () => {
    await comoSuperuser(c);
    const antes = await c.query(`SELECT updated_at FROM public.profiles WHERE id = $1`, [lia.id]);
    await c.query(
      `UPDATE public.roleta_participantes SET ultimo_lead_em = now() WHERE corretor_id = $1`,
      [lia.id],
    );
    const depois = await c.query(`SELECT updated_at FROM public.profiles WHERE id = $1`, [lia.id]);
    expect(depois.rows[0].updated_at).toEqual(antes.rows[0].updated_at);
  });

  it("errCode do helper reconhece a guarda (contrato para as telas)", async () => {
    const l = await leadComZona({ nome: "Contrato SMQZ1", zona: "Norte" });
    await comoSuperuser(c);
    expect(
      await errCode(c.query(`UPDATE public.leads SET corretor_id = $2 WHERE id = $1`, [l, lia.id])),
    ).toBe("SMQZ1");
  });
});

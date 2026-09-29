/**
 * Academia SMQ · gestão contra o banco real: motor de indicadores e
 * recomendações em sombra, efeito, encontros e presença, gate em sombra e a
 * lista de candidatos.
 *
 * O que este arquivo prova:
 *
 *   • o motor mede com a régua da casa e compara com a mediana da EMPRESA
 *     sem o próprio corretor (decisão do dono);
 *   • lead sem contato registrado entra com o pior tempo, não some da conta;
 *   • em sombra o corretor não vê a própria recomendação; o gestor vê só a
 *     equipe dele; rodar de novo não duplica; modo desligado não gera nada;
 *   • presença só pela equipe; encontro só pela gestão;
 *   • o gate em sombra obedece a gate_roleta_modo, filtra pela equipe e não
 *     bloqueia nada;
 *   • sem 3 colegas com amostra não há referência nem recomendação;
 *   • só admin roda o motor e lista candidatos.
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

let admin: UsuarioTeste;
let gestorA: UsuarioTeste;
let gestorB: UsuarioTeste;
let corretorA1: UsuarioTeste;
let corretorA2: UsuarioTeste;
let corretorB1: UsuarioTeste;
let corretorC1: UsuarioTeste;
let corretorC2: UsuarioTeste;
let bot: UsuarioTeste;

/** Mensagem de erro de uma promise rejeitada (ou null se resolveu). */
async function errMsg(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { message?: string }).message ?? "erro sem mensagem";
  }
}

/** Dados sintéticos entram sem disparar triggers de negócio (pontuação etc.). */
async function semTriggers(fn: () => Promise<void>): Promise<void> {
  await comoSuperuser(c);
  await c.query(`SET session_replication_role = replica`);
  try {
    await fn();
  } finally {
    await c.query(`SET session_replication_role = DEFAULT`);
  }
}

/**
 * 8 leads novos (gatilho webhook) atribuídos há 10 dias. Com `contata`, o
 * corretor liga 5 minutos depois; sem, nunca registra contato.
 */
async function atribuicoesNovas(corretor: string, contata: boolean): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const lead = await criarLead(c, { corretorId: corretor, status: "em_atendimento" });
    await semTriggers(async () => {
      const d = await c.query(
        `INSERT INTO public.distribution_log (lead_id, corretor_id, tipo, created_at, resultado)
         VALUES ($1, $2, 'automatica', now() - interval '10 days', 'sucesso') RETURNING id`,
        [lead, corretor],
      );
      await c.query(
        `INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
         VALUES ($1, '{"gatilho":"webhook"}'::jsonb)`,
        [d.rows[0].id],
      );
      if (contata) {
        await c.query(
          `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, conteudo, created_at)
           VALUES ($1, $2, 'ligacao', 'saida', 'ligou',
                   now() - interval '10 days' + interval '5 minutes')`,
          [lead, corretor],
        );
      }
    });
  }
}

/** 10 visitas validadas nos últimos 20 dias, `realizadas` delas com o cliente. */
async function visitas(corretor: string, realizadas: number): Promise<void> {
  await semTriggers(async () => {
    for (let i = 0; i < 10; i++) {
      await c.query(
        `INSERT INTO public.agendamentos
           (corretor_id, tipo, status, titulo, data_inicio, data_fim, auto_gerado)
         VALUES ($1, 'visita', $2::public.agendamento_status, 'Visita',
                 now() - make_interval(days => 2 + $3::int),
                 now() - make_interval(days => 2 + $3::int) + interval '1 hour', false)`,
        [corretor, i < realizadas ? "realizado" : "nao_compareceu", i],
      );
    }
  });
}

async function inscrever(pessoa: string): Promise<void> {
  await comoUsuario(c, admin.id);
  await c.query(`SELECT public.academia_definir_participacao($1, true, NULL)`, [pessoa]);
}

async function rodarMotor(): Promise<void> {
  await comoUsuario(c, admin.id);
  await c.query(`SELECT public.academia_rodar_motor()`);
}

async function setModo(modo: "desligado" | "sombra" | "ativo"): Promise<void> {
  await comoSuperuser(c);
  await c.query(`UPDATE public.academia_config SET recomendacao_modo = $1 WHERE id`, [modo]);
}

async function recsDe(corretor: string): Promise<Array<{ indicador: string; status: string }>> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT indicador, status::text AS status FROM public.academia_recomendacoes
      WHERE corretor_id = $1 ORDER BY indicador`,
    [corretor],
  );
  return r.rows as Array<{ indicador: string; status: string }>;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  const equipeA = await criarEquipe(c, { nome: "Equipe A" });
  const equipeB = await criarEquipe(c, { nome: "Equipe B" });
  admin = await criarUsuario(c, { papel: "admin", equipeId: null, nome: "Admin" });
  gestorA = await criarUsuario(c, { papel: "gestor", equipeId: equipeA, nome: "Gestor A" });
  gestorB = await criarUsuario(c, { papel: "gestor", equipeId: equipeB, nome: "Gestor B" });
  corretorA1 = await criarUsuario(c, { papel: "corretor", equipeId: equipeA, nome: "A1" });
  corretorA2 = await criarUsuario(c, { papel: "corretor", equipeId: equipeA, nome: "A2" });
  corretorB1 = await criarUsuario(c, { papel: "corretor", equipeId: equipeB, nome: "B1" });
  // C1 e C2 não estudam, mas entram na mediana: a régua é a empresa inteira.
  corretorC1 = await criarUsuario(c, { papel: "corretor", equipeId: equipeA, nome: "C1" });
  corretorC2 = await criarUsuario(c, { papel: "corretor", equipeId: equipeB, nome: "C2" });
  bot = await criarUsuario(c, { papel: "corretor", equipeId: null, nome: "Bot" });

  await comoSuperuser(c);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestorA.id, equipeA]);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestorB.id, equipeB]);
  await c.query(`INSERT INTO public.service_bots (user_id, descricao) VALUES ($1, 'bot')`, [
    bot.id,
  ]);

  for (const p of [corretorA1, corretorA2, corretorB1]) await inscrever(p.id);

  // Tempo de primeiro contato: só A1 nunca liga.
  await atribuicoesNovas(corretorA1.id, false);
  for (const p of [corretorA2, corretorB1, corretorC1, corretorC2]) {
    await atribuicoesNovas(p.id, true);
  }
  // Comparecimento: A1 com 2 de 10; o resto com 10 de 10.
  await visitas(corretorA1.id, 2);
  for (const p of [corretorA2, corretorB1, corretorC1, corretorC2]) await visitas(p.id, 10);

  await setModo("sombra");
});

afterAll(async () => {
  await setModo("sombra");
  await comoSuperuser(c);
  await c.query(`UPDATE public.academia_config SET gate_roleta_modo = 'desligado'`);
  await c.end();
});

describe("quem roda o motor", () => {
  it("corretor e gestor não rodam; admin roda", async () => {
    await comoUsuario(c, corretorA1.id);
    expect(await errCode(c.query(`SELECT public.academia_rodar_motor()`))).toBe("42501");
    await comoUsuario(c, gestorA.id);
    expect(await errCode(c.query(`SELECT public.academia_rodar_motor()`))).toBe("42501");
    await comoUsuario(c, admin.id);
    expect(await errCode(c.query(`SELECT public.academia_rodar_motor()`))).toBeNull();
  });
});

describe("indicadores", () => {
  beforeAll(rodarMotor);

  it("comparecimento: valor, amostra e mediana da empresa sem o próprio", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT valor::float, amostra, referencia_time::float AS ref
         FROM public.academia_indicadores
        WHERE corretor_id = $1 AND indicador = 'taxa_comparecimento'`,
      [corretorA1.id],
    );
    expect(r.rows[0]).toEqual({ valor: 20, amostra: 10, ref: 100 });
  });

  it("sem contato registrado entra com o pior tempo, não some", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT corretor_id, valor::float, amostra, referencia_time::float AS ref
         FROM public.academia_indicadores
        WHERE indicador = 'tempo_primeiro_contato' AND corretor_id = ANY($1)`,
      [[corretorA1.id, corretorA2.id]],
    );
    const a1 = r.rows.find((x) => x.corretor_id === corretorA1.id);
    const a2 = r.rows.find((x) => x.corretor_id === corretorA2.id);
    expect(a1.amostra).toBe(8);
    expect(a2.amostra).toBe(8);
    expect(a2.valor).toBeLessThanOrEqual(5);
    expect(a1.valor).toBeGreaterThan(60);
    expect(a1.ref).toBeLessThanOrEqual(5);
  });

  it("só participante ganha linha de indicador", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.academia_indicadores WHERE corretor_id = $1`,
      [corretorC1.id],
    );
    expect(r.rows[0].n).toBe(0);
  });
});

describe("recomendações em sombra", () => {
  it("A1 recebe as duas, e ninguém mais", async () => {
    expect(await recsDe(corretorA1.id)).toEqual([
      { indicador: "taxa_comparecimento", status: "sombra" },
      { indicador: "tempo_primeiro_contato", status: "sombra" },
    ]);
    expect(await recsDe(corretorA2.id)).toEqual([]);
    expect(await recsDe(corretorB1.id)).toEqual([]);
  });

  it("rodar de novo não duplica", async () => {
    await rodarMotor();
    expect(await recsDe(corretorA1.id)).toHaveLength(2);
  });

  it("em sombra o corretor não vê; o gestor dele vê; o outro gestor não", async () => {
    await comoUsuario(c, corretorA1.id);
    const doCorretor = await c.query(
      `SELECT count(*)::int AS n FROM public.academia_recomendacoes`,
    );
    expect(doCorretor.rows[0].n).toBe(0);

    await comoUsuario(c, gestorA.id);
    const doGestor = await c.query(
      `SELECT count(*)::int AS n FROM public.academia_recomendacoes WHERE corretor_id = $1`,
      [corretorA1.id],
    );
    expect(doGestor.rows[0].n).toBe(2);

    await comoUsuario(c, gestorB.id);
    const doOutro = await c.query(
      `SELECT count(*)::int AS n FROM public.academia_recomendacoes WHERE corretor_id = $1`,
      [corretorA1.id],
    );
    expect(doOutro.rows[0].n).toBe(0);
  });

  it("modo ativo abre a recomendação; desligado não gera nada", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.academia_recomendacoes`);
    await setModo("ativo");
    await rodarMotor();
    expect((await recsDe(corretorA1.id)).map((r) => r.status)).toEqual(["aberta", "aberta"]);

    await comoSuperuser(c);
    await c.query(`DELETE FROM public.academia_recomendacoes`);
    await setModo("desligado");
    await rodarMotor();
    expect(await recsDe(corretorA1.id)).toEqual([]);
    await setModo("sombra");
  });

  it("recomendação vencida expira", async () => {
    await rodarMotor();
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.academia_recomendacoes SET expira_em = current_date - 30 WHERE corretor_id = $1`,
      [corretorA1.id],
    );
    // Sem a nova geração: só a expiração, para o teste não depender dela.
    await setModo("desligado");
    await rodarMotor();
    await setModo("sombra");
    expect((await recsDe(corretorA1.id)).map((r) => r.status)).toEqual(["expirada", "expirada"]);
  });
});

describe("efeito", () => {
  it("antes x depois aparece quando o módulo foi concluído pela recomendação", async () => {
    await comoSuperuser(c);
    await c.query(`DELETE FROM public.academia_recomendacoes`);
    await rodarMotor();
    await comoSuperuser(c);
    const rec = await c.query(
      `SELECT id, modulo_id FROM public.academia_recomendacoes
        WHERE corretor_id = $1 AND indicador = 'taxa_comparecimento'`,
      [corretorA1.id],
    );
    const { id: recId, modulo_id: moduloId } = rec.rows[0];
    // Atribuição concluída há 61 dias: a janela de 60 dias depois já fechou.
    await c.query(
      `INSERT INTO public.academia_atribuicoes
         (corretor_id, modulo_id, origem, recomendacao_id, concluida_em)
       VALUES ($1, $2, 'recomendacao', $3, now() - interval '61 days')`,
      [corretorA1.id, moduloId, recId],
    );
    await c.query(`UPDATE public.academia_recomendacoes SET status = 'concluida' WHERE id = $1`, [
      recId,
    ]);
    await c.query(
      `INSERT INTO public.academia_indicadores
         (corretor_id, indicador, data_ref, janela_dias, valor, amostra, referencia_time)
       VALUES ($1, 'taxa_comparecimento',
               ((now() - interval '61 days') AT TIME ZONE 'America/Sao_Paulo')::date + 60,
               60, 70, 12, 90)
       ON CONFLICT (corretor_id, indicador, data_ref) DO UPDATE SET valor = 70, amostra = 12`,
      [corretorA1.id],
    );

    await comoUsuario(c, gestorA.id);
    const r = await c.query(
      `SELECT valor_antes::float, valor_depois::float, amostra_depois
         FROM public.v_academia_efeito WHERE recomendacao_id = $1`,
      [recId],
    );
    expect(r.rows[0]).toEqual({ valor_antes: 20, valor_depois: 70, amostra_depois: 12 });

    await comoUsuario(c, gestorB.id);
    const outro = await c.query(
      `SELECT count(*)::int AS n FROM public.v_academia_efeito WHERE recomendacao_id = $1`,
      [recId],
    );
    expect(outro.rows[0].n).toBe(0);
  });
});

describe("encontros e presença", () => {
  let encontro: string;

  it("só a gestão cria encontro", async () => {
    await comoUsuario(c, corretorA1.id);
    expect(
      await errCode(
        c.query(
          `SELECT public.academia_salvar_encontro(NULL, 'roleplay_diario', 'Roleplay', now(),
                    30, NULL, NULL, NULL, NULL)`,
        ),
      ),
    ).toBe("42501");

    await comoUsuario(c, gestorA.id);
    const r = await c.query(
      `SELECT public.academia_salvar_encontro(NULL, 'roleplay_diario', 'Roleplay da manhã',
                now() + interval '1 day', 30, $1, NULL, NULL, NULL) AS id`,
      [gestorA.id],
    );
    encontro = r.rows[0].id as string;
    expect(encontro).toBeTruthy();
  });

  it("gestor marca presença da própria equipe, não da outra", async () => {
    await comoUsuario(c, gestorA.id);
    expect(
      await errCode(
        c.query(`SELECT public.academia_registrar_presenca($1, $2, true, NULL)`, [
          encontro,
          corretorA1.id,
        ]),
      ),
    ).toBeNull();
    expect(
      await errCode(
        c.query(`SELECT public.academia_registrar_presenca($1, $2, true, NULL)`, [
          encontro,
          corretorB1.id,
        ]),
      ),
    ).toBe("42501");

    await comoUsuario(c, corretorA1.id);
    const minha = await c.query(
      `SELECT presente FROM public.academia_presencas WHERE encontro_id = $1`,
      [encontro],
    );
    expect(minha.rows).toEqual([{ presente: true }]);
  });

  it("quem não participa não ganha presença; nulo desmarca", async () => {
    await comoUsuario(c, gestorA.id);
    expect(
      await errMsg(
        c.query(`SELECT public.academia_registrar_presenca($1, $2, true, NULL)`, [
          encontro,
          corretorC1.id,
        ]),
      ),
    ).toMatch(/nao participa/);

    await c.query(`SELECT public.academia_registrar_presenca($1, $2, NULL, NULL)`, [
      encontro,
      corretorA1.id,
    ]);
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.academia_presencas WHERE encontro_id = $1`,
      [encontro],
    );
    expect(r.rows[0].n).toBe(0);
  });
});

describe("gate em sombra", () => {
  it("desligado (padrão) devolve vazio, até para o admin; corretor segue barrado", async () => {
    await comoSuperuser(c);
    await c.query(`UPDATE public.academia_config SET gate_roleta_modo = 'desligado'`);
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT * FROM public.academia_gate_sombra()`);
    expect(r.rows).toHaveLength(0);
    await comoUsuario(c, corretorA1.id);
    expect(await errCode(c.query(`SELECT * FROM public.academia_gate_sombra()`))).toBe("42501");
  });

  it("só o admin liga a simulação; gestor não muda a chave", async () => {
    await comoUsuario(c, gestorA.id);
    const g = await c.query(
      `UPDATE public.academia_config SET gate_roleta_modo = 'sombra' RETURNING id`,
    );
    expect(g.rowCount).toBe(0);
    await comoUsuario(c, admin.id);
    const a = await c.query(
      `UPDATE public.academia_config SET gate_roleta_modo = 'sombra' RETURNING id`,
    );
    expect(a.rowCount).toBe(1);
  });

  it("admin vê todos, com a situação de cada um", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(
      `SELECT corretor_id, situacao, leads_30d FROM public.academia_gate_sombra()`,
    );
    const porId = new Map(r.rows.map((x) => [x.corretor_id, x]));
    expect(porId.get(corretorA1.id)?.situacao).toBe("nao_habilitado");
    expect(porId.get(corretorC1.id)?.situacao).toBe("fora_da_academia");
    expect(porId.get(corretorA1.id)?.leads_30d).toBe(8);
  });

  it("gestor vê só a equipe; corretor não entra; ninguém lê a view direto", async () => {
    await comoUsuario(c, gestorA.id);
    const r = await c.query(`SELECT corretor_id FROM public.academia_gate_sombra()`);
    const ids = new Set(r.rows.map((x) => x.corretor_id));
    expect(ids.has(corretorA1.id)).toBe(true);
    expect(ids.has(corretorB1.id)).toBe(false);

    await comoUsuario(c, corretorA1.id);
    expect(await errCode(c.query(`SELECT * FROM public.academia_gate_sombra()`))).toBe("42501");
    expect(await errCode(c.query(`SELECT * FROM public.v_academia_gate_sombra`))).toBe("42501");
  });
});

describe("candidatos a participante", () => {
  it("admin lista com os vetos calculados; gestor não", async () => {
    await comoUsuario(c, admin.id);
    const r = await c.query(
      `SELECT pessoa_id, eh_bot, participa FROM public.academia_candidatos()`,
    );
    const porId = new Map(r.rows.map((x) => [x.pessoa_id, x]));
    expect(porId.get(bot.id)?.eh_bot).toBe(true);
    expect(porId.get(corretorA1.id)?.participa).toBe(true);
    expect(porId.get(corretorC1.id)?.participa).toBe(false);

    await comoUsuario(c, gestorA.id);
    expect(await errCode(c.query(`SELECT * FROM public.academia_candidatos()`))).toBe("42501");
  });
});

describe("mínimo de 3 colegas para comparar (decisão do dono, 29/09/2026)", () => {
  async function refComparecimentoA1(): Promise<number | null> {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT referencia_time::float AS ref FROM public.academia_indicadores
        WHERE corretor_id = $1 AND indicador = 'taxa_comparecimento'
        ORDER BY data_ref DESC LIMIT 1`,
      [corretorA1.id],
    );
    return r.rows[0].ref;
  }

  async function semRecDeComparecimentoA1(): Promise<void> {
    await comoSuperuser(c);
    await c.query(
      `DELETE FROM public.academia_recomendacoes
        WHERE corretor_id = $1 AND indicador = 'taxa_comparecimento'`,
      [corretorA1.id],
    );
  }

  it("com 2 colegas com amostra não há referência nem recomendação", async () => {
    // Só A2 e B1 seguem com 10 visitas: 2 colegas de A1.
    await semTriggers(async () => {
      await c.query(`DELETE FROM public.agendamentos WHERE corretor_id = ANY($1)`, [
        [corretorC1.id, corretorC2.id],
      ]);
    });
    await semRecDeComparecimentoA1();
    await rodarMotor();
    expect(await refComparecimentoA1()).toBeNull();
    expect((await recsDe(corretorA1.id)).map((r) => r.indicador)).not.toContain(
      "taxa_comparecimento",
    );
  });

  it("controle: com 3 colegas a referência volta e a recomendação também", async () => {
    await visitas(corretorC1.id, 10);
    await semRecDeComparecimentoA1();
    await rodarMotor();
    expect(await refComparecimentoA1()).toBe(100);
    expect((await recsDe(corretorA1.id)).map((r) => r.indicador)).toContain("taxa_comparecimento");
  });
});

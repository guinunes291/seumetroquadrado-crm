/**
 * MOTOR DE DISTRIBUIÇÃO v3 — roleta, elegibilidade, exceções e concorrência.
 *
 * Peças descobertas no banco vivo:
 *  - Tabelas: roletas (seed: landing, plantao, marquinhos, ...),
 *    roleta_participantes (cursor ultimo_lead_em + tier/wrr),
 *    distribuicao_config (origem -> roleta_slug; 'site' -> 'landing'),
 *    distribuicao_settings (get_dist_setting), distribuicao_excecoes,
 *    distribution_log + distribuicao_log_contexto.
 *  - RPCs: triar_e_distribuir_lead(_lead_id,_gatilho) [gate admin/gestor
 *    quando auth.uid() não é NULL; NULL = contexto de serviço/cron],
 *    distribuir_lead_v3 (wrapper com gate) -> _distribuir_lead_v3 (motor,
 *    EXECUTE só p/ service_role), gerenciar_participante_roleta,
 *    marcar_presenca, _elegibilidade_roleta, resolver_excecao /
 *    reprocessar_excecao, distribuir_lead_ponderado (SWRR por tier,
 *    EXECUTE só p/ service_role).
 *  - Regra do motor: vencedor = apto há mais tempo sem receber NESTA roleta
 *    (ORDER BY ultimo_lead_em ASC NULLS FIRST, incluido_em ASC) com
 *    FOR UPDATE ... SKIP LOCKED no cursor e FOR UPDATE no lead.
 *  - Elegibilidade: participante ativo + não pausado + perfil ativo + role
 *    corretor + telefone no perfil + presença hoje (BRT) quando
 *    exigir_presenca + cota diária (derivada do distribution_log) + pct
 *    trabalhado (só em roletas criterio 'automatica_presenca').
 *  - Guard de status (validar_status_lead_via_rpc) tem carve-out explícito
 *    para a atribuição inicial novo/aguardando_corretor -> aguardando_atendimento.
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
  pool,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let gestor: UsuarioTeste;
let corretorA: UsuarioTeste; // "Alfa" — cursor mais antigo (recebe primeiro)
let corretorB: UsuarioTeste; // "Bravo"

async function triarComoServico(leadId: string, gatilho = "teste") {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT public.triar_e_distribuir_lead($1::uuid, $2) AS res`,
    [leadId, gatilho],
  );
  return r.rows[0].res as Record<string, unknown>;
}

async function leadAtual(leadId: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT corretor_id, status::text AS status, data_distribuicao,
            timestamp_recebimento, corretores_que_tentaram
       FROM public.leads WHERE id = $1`,
    [leadId],
  );
  return r.rows[0];
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  gestor = await criarUsuario(c, { nome: "Gina Gestora", papel: "gestor" });
  corretorA = await criarUsuario(c, { nome: "Alfa Corretor", papel: "corretor" });
  corretorB = await criarUsuario(c, { nome: "Bravo Corretor", papel: "corretor" });

  // Elegibilidade exige telefone no perfil (a factory não preenche).
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.profiles SET telefone = '1199999000' || CASE id
        WHEN $1::uuid THEN '1' WHEN $2::uuid THEN '2' ELSE '3' END
      WHERE id IN ($1::uuid, $2::uuid, $3::uuid)`,
    [corretorA.id, corretorB.id, gestor.id],
  );

  // Gestor monta a roleta 'landing' (seed; criterio 'manual', exige presença).
  await comoUsuario(c, gestor.id);
  await c.query(
    `SELECT public.gerenciar_participante_roleta('landing', $1::uuid, 'incluir')`,
    [corretorA.id],
  );
  await c.query(
    `SELECT public.gerenciar_participante_roleta('landing', $1::uuid, 'incluir')`,
    [corretorB.id],
  );

  // Cada corretor marca a própria presença (RPC real do app).
  await comoUsuario(c, corretorA.id);
  await c.query(`SELECT public.marcar_presenca(true)`);
  await comoUsuario(c, corretorB.id);
  await c.query(`SELECT public.marcar_presenca(true)`);

  // Cursor determinístico: A está há mais tempo sem receber que B.
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.roleta_participantes rp
        SET ultimo_lead_em = CASE rp.corretor_id
              WHEN $1::uuid THEN now() - interval '2 hours'
              ELSE now() - interval '1 hour' END
       FROM public.roletas r
      WHERE r.id = rp.roleta_id AND r.slug = 'landing'`,
    [corretorA.id],
  );
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
  await pool.end();
});

describe("triagem e atribuição inicial (roleta landing via origem 'site')", () => {
  let leadId: string;

  it("gestor dispara triar_e_distribuir_lead: lead novo vai ao corretor há mais tempo sem receber e o guard de status NÃO bloqueia", async () => {
    leadId = await criarLead(c, { origem: "site" });

    // Chamado como GESTOR autenticado — é o caminho onde o guard
    // validar_status_lead_via_rpc poderia morder (auth.role()='authenticated').
    await comoUsuario(c, gestor.id);
    const r = await c.query(
      `SELECT public.triar_e_distribuir_lead($1::uuid, 'teste_inicial') AS res`,
      [leadId],
    );
    const res = r.rows[0].res;

    // Se o guard tivesse bloqueado, o handler do triar converteria em
    // exceção 'falha_tecnica' (ok:false) — ok:true prova o carve-out.
    expect(res.ok).toBe(true);
    expect(res.corretor_id).toBe(corretorA.id);
    expect(res.roleta).toBe("landing");
    expect(res.regra).toBe("rodizio_menos_recente");

    const lead = await leadAtual(leadId);
    expect(lead.corretor_id).toBe(corretorA.id);
    expect(lead.status).toBe("aguardando_atendimento");
    expect(lead.data_distribuicao).not.toBeNull();
    expect(lead.timestamp_recebimento).not.toBeNull();
    expect(lead.corretores_que_tentaram).toContain(corretorA.id);

    // Nenhuma exceção foi criada para a atribuição bem-sucedida.
    const exc = await c.query(
      `SELECT count(*)::int AS n FROM public.distribuicao_excecoes WHERE lead_id = $1`,
      [leadId],
    );
    expect(exc.rows[0].n).toBe(0);
  });

  it("distribution_log + distribuicao_log_contexto registram o porquê da decisão", async () => {
    await comoSuperuser(c);
    const log = await c.query(
      `SELECT id, corretor_id, tipo::text AS tipo, roleta_slug, regra_aplicada,
              resultado, distribuido_por_id, motivo
         FROM public.distribution_log WHERE lead_id = $1`,
      [leadId],
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({
      corretor_id: corretorA.id,
      tipo: "automatica",
      roleta_slug: "landing",
      regra_aplicada: "rodizio_menos_recente",
      resultado: "sucesso",
      distribuido_por_id: gestor.id,
    });
    expect(log.rows[0].motivo).toContain("rodízio");

    const ctx = await c.query(
      `SELECT contexto FROM public.distribuicao_log_contexto WHERE log_id = $1`,
      [log.rows[0].id],
    );
    expect(ctx.rows).toHaveLength(1);
    const contexto = ctx.rows[0].contexto;
    expect(contexto.roleta).toBe("landing");
    expect(contexto.gatilho).toBe("teste_inicial");
    expect(contexto.regra).toBe("rodizio_menos_recente");
    expect(contexto.percentual_minimo).toBe(90); // veio de distribuicao_settings
    expect(contexto.vencedor.corretor_id).toBe(corretorA.id);
    // Snapshot de elegibilidade auditável: os 2 aptos, menos-recente primeiro.
    expect(contexto.aptos).toHaveLength(2);
    expect(contexto.aptos[0].corretor_id).toBe(corretorA.id);
    expect(contexto.inaptos).toHaveLength(0);

    // Cursor da roleta avançou para o vencedor.
    const rp = await c.query(
      `SELECT rp.ultimo_lead_em > now() - interval '5 minutes' AS avancou
         FROM public.roleta_participantes rp
         JOIN public.roletas r ON r.id = rp.roleta_id
        WHERE r.slug = 'landing' AND rp.corretor_id = $1`,
      [corretorA.id],
    );
    expect(rp.rows[0].avancou).toBe(true);
  });

  it("rodízio: o segundo lead vai para o OUTRO corretor (menos-recente primeiro)", async () => {
    const lead2 = await criarLead(c, { origem: "site" });
    const res = await triarComoServico(lead2, "teste_rodizio");

    expect(res.ok).toBe(true);
    expect(res.corretor_id).toBe(corretorB.id);

    const lead = await leadAtual(lead2);
    expect(lead.corretor_id).toBe(corretorB.id);
    expect(lead.status).toBe("aguardando_atendimento");
  });
});

describe("concorrência (FOR UPDATE do motor)", () => {
  it("mesmo lead disparado em duas conexões simultâneas: exatamente UM vencedor e UM log de sucesso", async () => {
    const leadId = await criarLead(c, { origem: "site" });

    // Duas conexões distintas do pool disparam ao mesmo tempo (contexto de
    // serviço: auth.uid() NULL, como webhook + cron colidindo).
    const [r1, r2] = await Promise.all([
      pool.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'corrida_1') AS res`, [leadId]),
      pool.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'corrida_2') AS res`, [leadId]),
    ]);
    const resultados = [r1.rows[0].res, r2.rows[0].res];

    // Ambos respondem ok; exatamente um perdeu a corrida e viu 'ja_atribuido'.
    expect(resultados.every((r) => r.ok === true)).toBe(true);
    const jaAtribuido = resultados.filter((r) => r.ja_atribuido === true);
    expect(jaAtribuido).toHaveLength(1);

    // A (há mais tempo sem receber) venceu — e ambos apontam o MESMO corretor.
    expect(resultados[0].corretor_id).toBe(corretorA.id);
    expect(resultados[1].corretor_id).toBe(corretorA.id);

    const lead = await leadAtual(leadId);
    expect(lead.corretor_id).toBe(corretorA.id);

    // Sem log duplicado: 1 sucesso, 1 contexto — o perdedor não escreve nada.
    await comoSuperuser(c);
    const logs = await c.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE resultado = 'sucesso')::int AS sucessos
         FROM public.distribution_log WHERE lead_id = $1`,
      [leadId],
    );
    expect(logs.rows[0]).toEqual({ total: 1, sucessos: 1 });
    const ctx = await c.query(
      `SELECT count(*)::int AS n
         FROM public.distribuicao_log_contexto dlc
         JOIN public.distribution_log dl ON dl.id = dlc.log_id
        WHERE dl.lead_id = $1`,
      [leadId],
    );
    expect(ctx.rows[0].n).toBe(1);
  });
});

describe("fila de exceções (lead nunca se perde)", () => {
  let leadSemElegiveis: string;
  let excecaoId: string;

  it("sem nenhum corretor presente: lead cai em distribuicao_excecoes com motivo, sem atribuir", async () => {
    // Todos batem o ponto de saída (RPC real).
    await comoUsuario(c, corretorA.id);
    await c.query(`SELECT public.marcar_presenca(false)`);
    await comoUsuario(c, corretorB.id);
    await c.query(`SELECT public.marcar_presenca(false)`);

    leadSemElegiveis = await criarLead(c, { origem: "site" });
    const res = await triarComoServico(leadSemElegiveis, "teste_sem_elegiveis");

    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("sem_corretor_elegivel");
    expect(res.excecao_id).toBeTruthy();
    excecaoId = res.excecao_id as string;

    const exc = await c.query(
      `SELECT lead_id, motivo, status, roleta_slug, tentativas, contexto
         FROM public.distribuicao_excecoes WHERE id = $1`,
      [excecaoId],
    );
    expect(exc.rows).toHaveLength(1);
    expect(exc.rows[0]).toMatchObject({
      lead_id: leadSemElegiveis,
      motivo: "sem_corretor_elegivel",
      status: "pendente",
      roleta_slug: "landing",
      tentativas: 1,
    });
    // O contexto explica POR QUE cada um ficou de fora (ausente_hoje).
    const inaptos = exc.rows[0].contexto.inaptos as Array<{ motivos: string[] }>;
    expect(inaptos).toHaveLength(2);
    for (const i of inaptos) expect(i.motivos).toContain("ausente_hoje");

    // Lead intacto (não some, não muda de status) e log 'sem_corretor'.
    const lead = await leadAtual(leadSemElegiveis);
    expect(lead.corretor_id).toBeNull();
    expect(lead.status).toBe("novo");
    const log = await c.query(
      `SELECT resultado FROM public.distribution_log WHERE lead_id = $1`,
      [leadSemElegiveis],
    );
    expect(log.rows.map((r) => r.resultado)).toEqual(["sem_corretor"]);
  });

  it("retriagem do mesmo lead não duplica a exceção aberta: upsert incrementa tentativas", async () => {
    const res = await triarComoServico(leadSemElegiveis, "teste_retry");
    expect(res.ok).toBe(false);
    expect(res.excecao_id).toBe(excecaoId); // índice único de exceção aberta

    const exc = await c.query(
      `SELECT count(*)::int AS n, max(tentativas)::int AS tentativas
         FROM public.distribuicao_excecoes WHERE lead_id = $1`,
      [leadSemElegiveis],
    );
    expect(exc.rows[0]).toEqual({ n: 1, tentativas: 2 });
  });

  it("corretor comum NÃO chama o motor (gate admin/gestor) e não pollui a fila", async () => {
    await comoUsuario(c, corretorA.id);

    // Gate explícito 'forbidden' (P0001) nas RPCs públicas.
    expect(
      await errCode(
        c.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'hack')`, [leadSemElegiveis]),
      ),
    ).toBe("P0001");
    expect(
      await errCode(
        c.query(
          `SELECT public.distribuir_lead_v3($1::uuid, 'manual', NULL, $2::uuid, 'hack')`,
          [leadSemElegiveis, corretorA.id],
        ),
      ),
    ).toBe("P0001");
    expect(
      await errCode(
        c.query(`SELECT public.gerenciar_participante_roleta('landing', $1::uuid, 'incluir')`, [
          corretorA.id,
        ]),
      ),
    ).toBe("P0001");
    expect(
      await errCode(c.query(`SELECT public.resolver_excecao($1::uuid, 'reprocessar')`, [excecaoId])),
    ).toBe("P0001");

    // Motor interno e ponderado: sem EXECUTE para authenticated (42501).
    expect(
      await errCode(c.query(`SELECT public._distribuir_lead_v3($1::uuid)`, [leadSemElegiveis])),
    ).toBe("42501");
    expect(
      await errCode(
        c.query(`SELECT public.distribuir_lead_ponderado($1::uuid, 'landing')`, [leadSemElegiveis]),
      ),
    ).toBe("42501");

    // O gate fica FORA do handler de falha técnica: nada mudou na fila.
    await comoSuperuser(c);
    const exc = await c.query(
      `SELECT tentativas, status FROM public.distribuicao_excecoes WHERE id = $1`,
      [excecaoId],
    );
    expect(exc.rows[0]).toEqual({ tentativas: 2, status: "pendente" });
    expect((await leadAtual(leadSemElegiveis)).corretor_id).toBeNull();
  });

  it("reprocessar_excecao (gestor): com presença de volta, atribui e a exceção sai da fila como resolvida", async () => {
    await comoUsuario(c, corretorA.id);
    await c.query(`SELECT public.marcar_presenca(true)`);
    await comoUsuario(c, corretorB.id);
    await c.query(`SELECT public.marcar_presenca(true)`);

    await comoUsuario(c, gestor.id);
    const r = await c.query(`SELECT public.reprocessar_excecao($1::uuid) AS res`, [excecaoId]);
    const res = r.rows[0].res;

    expect(res.ok).toBe(true);
    // Cursor: B está há mais tempo sem receber (A venceu a corrida acima).
    expect(res.corretor_id).toBe(corretorB.id);

    const lead = await leadAtual(leadSemElegiveis);
    expect(lead.corretor_id).toBe(corretorB.id);
    expect(lead.status).toBe("aguardando_atendimento");

    const exc = await c.query(
      `SELECT status, resolvida_por, resolvida_em, resolucao
         FROM public.distribuicao_excecoes WHERE id = $1`,
      [excecaoId],
    );
    expect(exc.rows[0].status).toBe("resolvida");
    expect(exc.rows[0].resolvida_por).toBe(gestor.id);
    expect(exc.rows[0].resolvida_em).not.toBeNull();
    expect(exc.rows[0].resolucao).toContain("distribuído");

    const fila = await c.query(
      `SELECT count(*)::int AS n FROM public.distribuicao_excecoes
        WHERE status IN ('pendente','em_analise')`,
    );
    expect(fila.rows[0].n).toBe(0);
  });
});

describe("elegibilidade: pausa fura a vez no rodízio", () => {
  it("participante pausado é inapto ('pausado') e o lead vai ao outro, mesmo sendo a vez dele", async () => {
    // Após o reprocesso, A é o menos-recente (seria o próximo da vez).
    await comoUsuario(c, gestor.id);

    // Pausa exige data futura.
    expect(
      await errCode(
        c.query(
          `SELECT public.gerenciar_participante_roleta('landing', $1::uuid, 'pausar', 'passado', NULL, now() - interval '1 hour')`,
          [corretorA.id],
        ),
      ),
    ).toBe("P0001");

    await c.query(
      `SELECT public.gerenciar_participante_roleta('landing', $1::uuid, 'pausar', 'almoço', NULL, now() + interval '1 day')`,
      [corretorA.id],
    );

    await comoSuperuser(c);
    const eleg = await c.query(
      `SELECT apto, pausado, motivos FROM public._elegibilidade_roleta('landing', $1::uuid)`,
      [corretorA.id],
    );
    expect(eleg.rows[0].apto).toBe(false);
    expect(eleg.rows[0].pausado).toBe(true);
    expect(eleg.rows[0].motivos).toContain("pausado");

    const leadId = await criarLead(c, { origem: "site" });
    const res = await triarComoServico(leadId, "teste_pausa");
    expect(res.ok).toBe(true);
    expect(res.corretor_id).toBe(corretorB.id); // pulou o pausado

    // Reativa A e ele volta a ser apto.
    await comoUsuario(c, gestor.id);
    await c.query(
      `SELECT public.gerenciar_participante_roleta('landing', $1::uuid, 'reativar')`,
      [corretorA.id],
    );
    await comoSuperuser(c);
    const eleg2 = await c.query(
      `SELECT apto FROM public._elegibilidade_roleta('landing', $1::uuid)`,
      [corretorA.id],
    );
    expect(eleg2.rows[0].apto).toBe(true);
  });
});

describe("triagem: dados incompletos", () => {
  it("lead sem telefone cai em exceção 'dados_incompletos' com log resultado 'excecao'", async () => {
    const leadId = await criarLead(c, { origem: "site", telefone: "" });
    const res = await triarComoServico(leadId, "teste_sem_telefone");

    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("dados_incompletos");

    await comoSuperuser(c);
    const exc = await c.query(
      `SELECT motivo, status FROM public.distribuicao_excecoes WHERE lead_id = $1`,
      [leadId],
    );
    expect(exc.rows[0]).toEqual({ motivo: "dados_incompletos", status: "pendente" });

    const log = await c.query(
      `SELECT regra_aplicada, resultado FROM public.distribution_log WHERE lead_id = $1`,
      [leadId],
    );
    expect(log.rows[0]).toEqual({ regra_aplicada: "triagem", resultado: "excecao" });

    // Encerrado para não sujar a fila dos próximos casos.
    await comoUsuario(c, gestor.id);
    await c.query(
      `SELECT public.resolver_excecao((SELECT id FROM public.distribuicao_excecoes WHERE lead_id = $1::uuid), 'arquivar', '{"motivo":"teste"}'::jsonb)`,
      [leadId],
    );
  });
});

describe("distribuir_lead_ponderado (motor por tier / SWRR)", () => {
  beforeAll(async () => {
    // Roleta 'marquinhos' (seed): A no tier A (peso 3), B no tier C (peso 1).
    await comoUsuario(c, gestor.id);
    await c.query(
      `SELECT public.gerenciar_participante_roleta('marquinhos', $1::uuid, 'incluir')`,
      [corretorA.id],
    );
    await c.query(
      `SELECT public.gerenciar_participante_roleta('marquinhos', $1::uuid, 'incluir')`,
      [corretorB.id],
    );
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.roleta_participantes rp
          SET tier = CASE rp.corretor_id WHEN $1::uuid THEN 'A' ELSE 'C' END,
              wrr_current = 0
         FROM public.roletas r
        WHERE r.id = rp.roleta_id AND r.slug = 'marquinhos'`,
      [corretorA.id],
    );
  });

  it("4 leads seguem os pesos dos tiers: 3 para o tier A, 1 para o tier C", async () => {
    await comoSuperuser(c);
    const atribuicoes: string[] = [];
    for (let i = 0; i < 4; i++) {
      const leadId = await criarLead(c, { origem: "chatbot" });
      const r = await c.query(
        `SELECT public.distribuir_lead_ponderado($1::uuid, 'marquinhos') AS res`,
        [leadId],
      );
      expect(r.rows[0].res.ok).toBe(true);
      atribuicoes.push(r.rows[0].res.corretor_id as string);
      // NOTA: este motor grava o lead direto em 'em_atendimento' (pula a etapa
      // aguardando_atendimento do v3) e regra 'roleta:<slug>:tier<X>'.
      const lead = await c.query(
        `SELECT status::text AS status, roleta_slug FROM public.leads WHERE id = $1`,
        [leadId],
      );
      expect(lead.rows[0]).toEqual({ status: "em_atendimento", roleta_slug: "marquinhos" });
    }
    expect(atribuicoes.filter((x) => x === corretorA.id)).toHaveLength(3);
    expect(atribuicoes.filter((x) => x === corretorB.id)).toHaveLength(1);

    const regras = await c.query(
      `SELECT DISTINCT regra_aplicada FROM public.distribution_log
        WHERE roleta_slug = 'marquinhos' AND resultado = 'sucesso' ORDER BY 1`,
    );
    expect(regras.rows.map((r) => r.regra_aplicada)).toEqual([
      "roleta:marquinhos:tierA",
      "roleta:marquinhos:tierC",
    ]);
  });

  // BUG descoberto: distribuir_lead_ponderado não tem a checagem de
  // idempotência do v3 ("distribuição automática nunca rouba lead já
  // atribuído") nem FOR UPDATE no lead. Corrigido na migration
  // 20260719123000: FOR UPDATE + retorno {ok:false, motivo:'ja_atribuido'}.
  it("ponderado sobre lead já atribuído deveria ser idempotente (não roubar o lead)", async () => {
    await comoUsuario(c, gestor.id);
    await c.query(
      `SELECT public.gerenciar_participante_roleta('marquinhos', $1::uuid, 'remover')`,
      [corretorB.id],
    );
    await comoSuperuser(c);
    const leadDeB = await criarLead(c, {
      origem: "chatbot",
      corretorId: corretorB.id,
      status: "em_atendimento",
    });

    const r = await c.query(
      `SELECT public.distribuir_lead_ponderado($1::uuid, 'marquinhos') AS res`,
      [leadDeB],
    );
    // Comportamento correto: reconhecer que já está atribuído e não mexer.
    const dono = await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [leadDeB]);
    expect(dono.rows[0].corretor_id).toBe(corretorB.id);
    expect(r.rows[0].res.corretor_id ?? corretorB.id).toBe(corretorB.id);
  });

  // Corrigido na migration 20260719123000: FOR UPDATE no lead serializa
  // chamadas do mesmo lead (a segunda vê ja_atribuido) e o advisory lock do
  // cursor SWRR serializa leads diferentes na mesma roleta.
  it("ponderado concorrente no mesmo lead deveria produzir UM único log de sucesso", async () => {
    await comoSuperuser(c);
    const leadId = await criarLead(c, { origem: "chatbot" });

    await Promise.all([
      pool.query(`SELECT public.distribuir_lead_ponderado($1::uuid, 'marquinhos')`, [leadId]),
      pool.query(`SELECT public.distribuir_lead_ponderado($1::uuid, 'marquinhos')`, [leadId]),
    ]);

    const logs = await c.query(
      `SELECT count(*)::int AS n FROM public.distribution_log
        WHERE lead_id = $1 AND resultado = 'sucesso'`,
      [leadId],
    );
    expect(logs.rows[0].n).toBe(1);
  });
});

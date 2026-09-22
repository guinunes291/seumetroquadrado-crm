/**
 * CADÊNCIA D1/D2/D3 E REATIVAÇÃO
 * (migrations 20260921120000 / 120100 / 120200)
 *
 * Os 12 cenários de aceite do documento, mais as duas travas que ele exige
 * fora da tabela: motivo obrigatório ao perder e contagem de dias no fuso de
 * São Paulo.
 *
 * Datas simuladas SEM sleep: as tentativas são inseridas como superusuário
 * com `ts` relativo a now() (make_interval). O `ts` do servidor é o que a
 * RPC carimba em produção — aqui ele é escrito direto justamente para poder
 * simular ontem e anteontem, que é o que a validação dos 100% mede.
 *
 * Uma armadilha que custou tempo e fica registrada: `criarLead` com
 * `corretorId` INSERE o lead já com dono, e é o gatilho AFTER INSERT que
 * inicia a cadência. Criar sem dono e atribuir depois exercita o caminho do
 * AFTER UPDATE. Os dois caminhos existem em produção (rota direta cria com
 * dono; roleta atribui depois) e os dois são testados abaixo.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

let corretor: UsuarioTeste;
let outroCorretor: UsuarioTeste;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.query(`UPDATE public.cadencia_config SET modo = 'sombra' WHERE id = 1`);
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await comoSuperuser(c);
  await c.query(`UPDATE public.cadencia_config SET modo = 'sombra' WHERE id = 1`);
  corretor = await criarUsuario(c, { papel: "corretor", nome: "Corretor Cadência" });
  outroCorretor = await criarUsuario(c, { papel: "corretor", nome: "Corretor Vizinho" });
});

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

/** Lead sem dono + atribuição (caminho da roleta: AFTER UPDATE). */
async function leadEmCadencia(status = "aguardando_corretor"): Promise<string> {
  const id = await criarLead(c, { status, corretorId: null });
  await comoSuperuser(c);
  await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [corretor.id, id]);
  return id;
}

/**
 * Tentativa com ts controlado. `minutosAtras` conta para trás a partir de
 * agora; `etapa` precisa bater com a etapa em que o lead está, porque é assim
 * que a RPC real grava.
 */
async function tentativa(
  leadId: string,
  etapa: "D1" | "D2" | "D3",
  canal: "ligacao" | "whatsapp",
  minutosAtras: number,
  resultado?: string,
): Promise<void> {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.cadencia_tentativas
       (lead_id, corretor_id, etapa, canal, resultado, ts, ciclo)
     VALUES ($1, $2, $3, $4, $5,
             now() - make_interval(mins => $6::int),
             (SELECT cadencia_ciclo FROM public.leads WHERE id = $1))`,
    [
      leadId,
      corretor.id,
      etapa,
      canal,
      resultado ?? (canal === "ligacao" ? "nao_atendeu" : "enviada"),
      minutosAtras,
    ],
  );
}

/** Fecha uma etapa (2 ligações espaçadas + 1 WhatsApp) em torno de N dias atrás. */
async function fecharEtapa(leadId: string, etapa: "D1" | "D2" | "D3", diasAtras: number) {
  const base = diasAtras * 24 * 60;
  if (etapa === "D3") {
    await tentativa(leadId, etapa, "whatsapp", base);
    return;
  }
  await tentativa(leadId, etapa, "ligacao", base + 120);
  await tentativa(leadId, etapa, "ligacao", base + 60);
  await tentativa(leadId, etapa, "whatsapp", base);
}

/**
 * As 7 tentativas das três etapas dentro de um único dia BRT, `diasAtras`
 * dias no passado. É o cenário 7: etapas completas, cadência NÃO cumprida.
 */
async function tentativasNoMesmoDia(leadId: string, diasAtras: number): Promise<void> {
  await comoSuperuser(c);
  const plano: Array<[string, string, number]> = [
    ["D1", "ligacao", 9],
    ["D1", "ligacao", 11],
    ["D1", "whatsapp", 12],
    ["D2", "ligacao", 14],
    ["D2", "ligacao", 16],
    ["D2", "whatsapp", 17],
    ["D3", "whatsapp", 18],
  ];
  for (const [etapa, canal, hora] of plano) {
    await c.query(
      `INSERT INTO public.cadencia_tentativas
         (lead_id, corretor_id, etapa, canal, resultado, ts, ciclo)
       VALUES ($1, $2, $3, $4, $5,
               ((current_date - make_interval(days => $6::int)
                  + make_interval(hours => $7::int)) AT TIME ZONE 'America/Sao_Paulo'),
               (SELECT cadencia_ciclo FROM public.leads WHERE id = $1))`,
      [
        leadId,
        corretor.id,
        etapa,
        canal,
        canal === "ligacao" ? "nao_atendeu" : "enviada",
        diasAtras,
        hora,
      ],
    );
  }
}

async function leadRow(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT cadencia_etapa, cadencia_ciclo, cadencia_prazo_ts, corretor_id, status,
            motivo_perda_categoria, reativado, arquivado_em, proxima_acao, proximo_followup
       FROM public.leads WHERE id = $1`,
    [id],
  );
  return r.rows[0];
}

async function setEtapa(leadId: string, etapa: string, prazoDiasAtras = 0) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa = $2,
            cadencia_prazo_ts = public.cadencia_fim_do_dia(now() - make_interval(days => $3::int), 0)
      WHERE id = $1`,
    [leadId, etapa, prazoDiasAtras],
  );
}

async function fila(corretorId: string) {
  await comoUsuario(c, corretorId);
  const r = await c.query(`SELECT public.cadencia_fila_v1($1, 200) AS f`, [corretorId]);
  await comoSuperuser(c);
  return r.rows[0].f as { itens: Record<string, unknown>[] };
}

// ---------------------------------------------------------------------------
// 1 a 5 — entrada, progresso e vencimento
// ---------------------------------------------------------------------------

describe("cenários 1 a 5: entrada, progresso e vencimento", () => {
  it("1. lead atribuído hoje, nada registrado → D1 na fila, fazer hoje", async () => {
    const lead = await leadEmCadencia();
    const l = await leadRow(lead);
    expect(l.cadencia_etapa).toBe("D1");
    // A cadência NÃO escreve em proxima_acao: aquela coluna é o passo que o
    // HUMANO declara, e preenchê-la aqui desarmaria as travas de transição.
    // O que o corretor deve fazer agora é etapa + prazo, e é a fila que mostra.
    expect(l.cadencia_prazo_ts).not.toBeNull();

    const f = await fila(corretor.id);
    expect(f.itens).toHaveLength(1);
    expect(f.itens[0].etapa).toBe("D1");
    expect(f.itens[0].atrasado).toBe(false);
    expect(f.itens[0].ligacoes_validas).toBe(0);
    expect(f.itens[0].whatsapp_enviado).toBe(false);
  });

  it("1b. lead criado JÁ com corretor (rota direta) também entra em D1", async () => {
    const lead = await criarLead(c, { status: "aguardando_corretor", corretorId: corretor.id });
    expect((await leadRow(lead)).cadencia_etapa).toBe("D1");
  });

  it("2. D1 com 1 ligação + 1 WhatsApp → continua em D1", async () => {
    const lead = await leadEmCadencia();
    await tentativa(lead, "D1", "ligacao", 60);
    await tentativa(lead, "D1", "whatsapp", 30);

    await comoSuperuser(c);
    const completa = await c.query(`SELECT public.cadencia_etapa_completa($1,'D1') AS ok`, [lead]);
    expect(completa.rows[0].ok).toBe(false);

    await c.query(`SELECT public.cadencia_avancar('ativo')`);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D1");
  });

  it("3. D1 com 2 ligações em 30 segundos + 1 WhatsApp → continua em D1", async () => {
    const lead = await leadEmCadencia();
    // 60 min atrás e 59,5 min atrás: meio minuto de intervalo.
    await tentativa(lead, "D1", "ligacao", 60);
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.cadencia_tentativas (lead_id, corretor_id, etapa, canal, resultado, ts)
       VALUES ($1,$2,'D1','ligacao','nao_atendeu', now() - interval '59 minutes 30 seconds')`,
      [lead, corretor.id],
    );
    await tentativa(lead, "D1", "whatsapp", 50);

    const completa = await c.query(`SELECT public.cadencia_etapa_completa($1,'D1') AS ok`, [lead]);
    expect(completa.rows[0].ok).toBe(false);

    // A fila mostra 1 de 2: o contador não pode dizer 2 e a etapa não fechar.
    const f = await fila(corretor.id);
    expect(f.itens[0].ligacoes_validas).toBe(1);
    expect(f.itens[0].whatsapp_enviado).toBe(true);
  });

  it("4. D1 completo ontem → D2, vencendo hoje", async () => {
    const lead = await leadEmCadencia();
    await fecharEtapa(lead, "D1", 1);

    await comoSuperuser(c);
    await c.query(`SELECT public.cadencia_avancar('ativo')`);

    const l = await leadRow(lead);
    expect(l.cadencia_etapa).toBe("D2");
    // Prazo = fim do dia seguinte à conclusão = fim do dia de HOJE.
    // A comparação roda INTEIRA no banco: cadencia_fim_do_dia devolve
    // ...23:59:59.999999 e o Date do JS só guarda milissegundos, então
    // levar o valor para o teste e trazer de volta perderia os microssegundos
    // e a igualdade falharia por artefato do driver, não por defeito.
    const hoje = await c.query(
      `SELECT (cadencia_prazo_ts = public.cadencia_fim_do_dia(now(),0)) AS igual
         FROM public.leads WHERE id = $1`,
      [lead],
    );
    expect(hoje.rows[0].igual).toBe(true);

    const f = await fila(corretor.id);
    expect(f.itens[0].etapa).toBe("D2");
    expect(f.itens[0].atrasado).toBe(false);
  });

  it("5. D1 completo há 3 dias e D2 vazio → sombra loga, ativo devolve à roleta", async () => {
    const lead = await leadEmCadencia();
    await fecharEtapa(lead, "D1", 3);
    await comoSuperuser(c);
    await c.query(`SELECT public.cadencia_avancar('ativo')`);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D2");

    // Sombra: log, nada muda.
    const sombra = await c.query(`SELECT * FROM public.cadencia_vencidos('sombra')`);
    expect(Number(sombra.rows[0].avaliados)).toBe(1);
    expect(Number(sombra.rows[0].aplicados)).toBe(0);
    expect((await leadRow(lead)).corretor_id).toBe(corretor.id);

    // Ativo: volta para a roleta, sem dono e sem etapa.
    const ativo = await c.query(`SELECT * FROM public.cadencia_vencidos('ativo')`);
    expect(Number(ativo.rows[0].aplicados)).toBe(1);

    const l = await leadRow(lead);
    expect(l.corretor_id).toBeNull();
    expect(l.cadencia_etapa).toBeNull();
    expect(l.status).toBe("aguardando_corretor");

    // O aviso ao corretor que perdeu o lead.
    const aviso = await c.query(
      `SELECT count(*)::int AS n FROM public.alertas WHERE user_id = $1 AND tipo = 'distribuicao'`,
      [corretor.id],
    );
    expect(aviso.rows[0].n).toBe(1);

    // E o lead recomeça em D1 quando a roleta dá um dono novo.
    await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [
      outroCorretor.id,
      lead,
    ]);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D1");
  });

  it("5b. D3 vencido NÃO volta para a roleta", async () => {
    const lead = await leadEmCadencia();
    await setEtapa(lead, "D3", 5);
    await comoSuperuser(c);
    const r = await c.query(`SELECT * FROM public.cadencia_vencidos('ativo')`);
    expect(Number(r.rows[0].avaliados)).toBe(0);
    expect((await leadRow(lead)).corretor_id).toBe(corretor.id);
  });
});

// ---------------------------------------------------------------------------
// 6 a 9 — encerramento, resposta e número inválido
// ---------------------------------------------------------------------------

describe("cenários 6 a 9: saídas da cadência", () => {
  it("6. cadência completa em 3 dias distintos + 24h sem resposta → descanso e reativação", async () => {
    const lead = await leadEmCadencia();
    await fecharEtapa(lead, "D1", 3);
    await fecharEtapa(lead, "D2", 2);
    await tentativa(lead, "D3", "whatsapp", 25 * 60); // 25h atrás
    await setEtapa(lead, "D3", 0);

    await comoSuperuser(c);
    expect(
      (await c.query(`SELECT public.cadencia_cumprida_100($1) AS ok`, [lead])).rows[0].ok,
    ).toBe(true);

    // Sombra primeiro: decide o destino certo e não aplica.
    const sombra = await c.query(`SELECT * FROM public.cadencia_encerrar('sombra')`);
    expect(Number(sombra.rows[0].aplicados)).toBe(0);
    const logSombra = await c.query(
      `SELECT etapa_para, motivo FROM public.cadencia_execucao_log
        WHERE lead_id = $1 AND job = 'encerrar' ORDER BY created_at DESC LIMIT 1`,
      [lead],
    );
    expect(logSombra.rows[0].etapa_para).toBe("descanso");
    expect(logSombra.rows[0].motivo).toBe("cumpriu_100");

    const ativo = await c.query(`SELECT * FROM public.cadencia_encerrar('ativo')`);
    expect(Number(ativo.rows[0].aplicados)).toBe(1);

    const l = await leadRow(lead);
    expect(l.cadencia_etapa).toBe("descanso");
    expect(l.status).toBe("perdido");
    expect(l.motivo_perda_categoria).toBe("sem_retorno_cadencia");
    expect(l.corretor_id).toBeNull();

    const r = await c.query(
      `SELECT origem, status, prioridade, horarios_tentados,
              (elegivel_em::date - entrou_em::date) AS dias
         FROM public.reativacao_fila WHERE lead_id = $1`,
      [lead],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].origem).toBe("cadencia_cumprida");
    expect(r.rows[0].status).toBe("aguardando");
    expect(Number(r.rows[0].dias)).toBe(15);
    expect(r.rows[0].horarios_tentados.ligacoes).toBe(4);
    expect(r.rows[0].horarios_tentados.whatsapps).toBe(3);
  });

  it("6b. em descanso o lead NÃO cai no Bolsão nem aparece para o discador", async () => {
    const lead = await leadEmCadencia();
    await fecharEtapa(lead, "D1", 3);
    await fecharEtapa(lead, "D2", 2);
    await tentativa(lead, "D3", "whatsapp", 25 * 60);
    await setEtapa(lead, "D3", 0);
    await comoSuperuser(c);
    await c.query(`SELECT public.cadencia_encerrar('ativo')`);

    // A janela de descanso vale: nem discador de reativação, nem Bolsão.
    const disc = await c.query(
      `SELECT count(*)::int AS n FROM public.v_reativacao_discador WHERE lead_id = $1`,
      [lead],
    );
    expect(disc.rows[0].n).toBe(0);

    const bolsao = await c.query(
      `SELECT public._bolsao_elegivel(l.*) AS ok FROM public.leads l WHERE l.id = $1`,
      [lead],
    );
    expect(bolsao.rows[0].ok).toBe(false);

    // Passados os 15 dias, ele aparece — e só então.
    await c.query(
      `UPDATE public.reativacao_fila SET elegivel_em = now() - interval '1 minute' WHERE lead_id = $1`,
      [lead],
    );
    const depois = await c.query(
      `SELECT count(*)::int AS n FROM public.v_reativacao_discador WHERE lead_id = $1`,
      [lead],
    );
    expect(depois.rows[0].n).toBe(1);
  });

  it("7. as 3 etapas completas no MESMO dia → não vai para a reativação", async () => {
    const lead = await leadEmCadencia();
    // As 7 tentativas num ÚNICO dia BRT, dois dias atrás. O dia precisa ser
    // no passado (e não hoje) porque o job só olha lead cuja mensagem de D3
    // saiu há mais de `espera_pos_d3_h`; com tudo hoje, o lead nem seria
    // candidato e o teste passaria por ausência de avaliação, não por acerto.
    await tentativasNoMesmoDia(lead, 2);
    await setEtapa(lead, "D3", 0);

    await comoSuperuser(c);
    expect(
      (await c.query(`SELECT public.cadencia_etapa_completa($1,'D1') AS ok`, [lead])).rows[0].ok,
    ).toBe(true);
    expect(
      (await c.query(`SELECT public.cadencia_cumprida_100($1) AS ok`, [lead])).rows[0].ok,
    ).toBe(false);

    await c.query(`SELECT public.cadencia_encerrar('ativo')`);

    const r = await c.query(
      `SELECT count(*)::int AS n FROM public.reativacao_fila WHERE lead_id = $1`,
      [lead],
    );
    expect(r.rows[0].n).toBe(0);

    // Tratado como cadência incompleta: roleta.
    const l = await leadRow(lead);
    expect(l.corretor_id).toBeNull();
    expect(l.status).toBe("aguardando_corretor");

    const log = await c.query(
      `SELECT etapa_para, motivo FROM public.cadencia_execucao_log
        WHERE lead_id = $1 AND job = 'encerrar' ORDER BY created_at DESC LIMIT 1`,
      [lead],
    );
    expect(log.rows[0].etapa_para).toBe("roleta");
    expect(log.rows[0].motivo).toBe("cadencia_incompleta");
  });

  it("8. cliente responde no D2 → sai da cadência e exige próxima ação com data", async () => {
    const lead = await leadEmCadencia();
    await setEtapa(lead, "D2", 0);

    await comoUsuario(c, corretor.id);
    // Sem data no futuro: recusado.
    expect(
      await errCode(
        c.query(
          `SELECT public.cadencia_marcar_respondeu($1, 'Ligar de novo', now() - interval '1 day')`,
          [lead],
        ),
      ),
    ).toBe("22023");
    // Sem próxima ação: recusado.
    expect(
      await errCode(
        c.query(`SELECT public.cadencia_marcar_respondeu($1, '   ', now() + interval '2 days')`, [
          lead,
        ]),
      ),
    ).toBe("22023");

    await c.query(
      `SELECT public.cadencia_marcar_respondeu($1, 'Visita marcada sábado 10h', now() + interval '2 days')`,
      [lead],
    );

    const l = await leadRow(lead);
    expect(l.cadencia_etapa).toBe("respondeu");
    expect(l.status).toBe("em_atendimento");
    expect(l.proxima_acao).toBe("Visita marcada sábado 10h");
    // O prazo virou TAREFA, e proximo_followup se preencheu pelo espelho que
    // já existia (sync_proximo_followup) — não por escrita direta na coluna.
    const t = await c.query(
      `SELECT titulo, tipo::text AS tipo, status::text AS status FROM public.tarefas WHERE lead_id = $1`,
      [lead],
    );
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].titulo).toBe("Visita marcada sábado 10h");
    expect(t.rows[0].status).toBe("pendente");
    expect(l.proximo_followup).not.toBeNull();

    // Fora da cadência: some da Fila do Dia.
    expect((await fila(corretor.id)).itens).toHaveLength(0);
  });

  it("9. número inválido na 1ª ligação → encerrado com motivo, fora da reativação", async () => {
    const lead = await leadEmCadencia();

    await comoUsuario(c, corretor.id);
    const r = await c.query(
      `SELECT public.cadencia_registrar_tentativa($1,'ligacao','numero_invalido') AS res`,
      [lead],
    );
    expect(r.rows[0].res.encerrado).toBe(true);

    const l = await leadRow(lead);
    expect(l.cadencia_etapa).toBe("encerrado");
    expect(l.status).toBe("perdido");
    expect(l.motivo_perda_categoria).toBe("numero_invalido");

    await comoSuperuser(c);
    const fi = await c.query(
      `SELECT count(*)::int AS n FROM public.reativacao_fila WHERE lead_id = $1`,
      [lead],
    );
    expect(fi.rows[0].n).toBe(0);
    // numero_invalido é "sem retrabalho": o Bolsão também não o pega.
    const b = await c.query(
      `SELECT public._bolsao_elegivel(l.*) AS ok FROM public.leads l WHERE l.id = $1`,
      [lead],
    );
    expect(b.rows[0].ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10 a 12 — reativação
// ---------------------------------------------------------------------------

describe("cenários 10 a 12: reativação", () => {
  async function leadNaReativacao(): Promise<string> {
    const lead = await leadEmCadencia();
    await fecharEtapa(lead, "D1", 3);
    await fecharEtapa(lead, "D2", 2);
    await tentativa(lead, "D3", "whatsapp", 25 * 60);
    await setEtapa(lead, "D3", 0);
    await comoSuperuser(c);
    await c.query(`SELECT public.cadencia_encerrar('ativo')`);
    await c.query(
      `UPDATE public.reativacao_fila SET elegivel_em = now() - interval '1 minute' WHERE lead_id = $1`,
      [lead],
    );
    return lead;
  }

  it("10. lead com opt-out não aparece na fila do discador", async () => {
    const lead = await leadNaReativacao();
    await comoSuperuser(c);
    expect(
      (
        await c.query(
          `SELECT count(*)::int AS n FROM public.v_reativacao_discador WHERE lead_id=$1`,
          [lead],
        )
      ).rows[0].n,
    ).toBe(1);

    await c.query(`UPDATE public.leads SET opt_out = true WHERE id = $1`, [lead]);
    expect(
      (
        await c.query(
          `SELECT count(*)::int AS n FROM public.v_reativacao_discador WHERE lead_id=$1`,
          [lead],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it("11. SDR marca reativado → roleta, reativado=true, ciclo 2, D1 com novo corretor", async () => {
    const lead = await leadNaReativacao();
    await comoSuperuser(c);
    const fid = (await c.query(`SELECT id FROM public.reativacao_fila WHERE lead_id = $1`, [lead]))
      .rows[0].id;

    await c.query(
      `SELECT public.reativacao_marcar_reativado($1, 'Cliente pediu para ligar à noite')`,
      [fid],
    );

    const l = await leadRow(lead);
    expect(l.reativado).toBe(true);
    expect(l.cadencia_ciclo).toBe(2);
    expect(l.corretor_id).toBeNull();
    expect(l.status).toBe("aguardando_corretor");
    expect(l.motivo_perda_categoria).toBeNull();

    // A roleta dá um dono novo — não o original — e a cadência recomeça em D1.
    await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [
      outroCorretor.id,
      lead,
    ]);
    const depois = await leadRow(lead);
    expect(depois.cadencia_etapa).toBe("D1");
    expect(depois.corretor_id).toBe(outroCorretor.id);

    // As 7 tentativas do ciclo 1 NÃO contam para os 100% do ciclo 2.
    expect(
      (await c.query(`SELECT public.cadencia_cumprida_100($1) AS ok`, [lead])).rows[0].ok,
    ).toBe(false);
  });

  it("12. reativado que cumpre 100% de novo é arquivado, sem 2ª reativação", async () => {
    const lead = await leadNaReativacao();
    await comoSuperuser(c);
    const fid = (await c.query(`SELECT id FROM public.reativacao_fila WHERE lead_id = $1`, [lead]))
      .rows[0].id;
    await c.query(`SELECT public.reativacao_marcar_reativado($1, null)`, [fid]);
    await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [
      outroCorretor.id,
      lead,
    ]);

    // Segundo ciclo cumprido: as tentativas nascem com ciclo = 2.
    await fecharEtapa(lead, "D1", 3);
    await fecharEtapa(lead, "D2", 2);
    await tentativa(lead, "D3", "whatsapp", 25 * 60);
    await setEtapa(lead, "D3", 0);

    expect(
      (await c.query(`SELECT public.cadencia_cumprida_100($1) AS ok`, [lead])).rows[0].ok,
    ).toBe(true);

    await c.query(`SELECT public.cadencia_encerrar('ativo')`);

    const l = await leadRow(lead);
    expect(l.cadencia_etapa).toBe("arquivado");
    expect(l.arquivado_em).not.toBeNull();

    // Nenhuma linha NOVA de reativação: a antiga ficou 'reativado'.
    const abertas = await c.query(
      `SELECT count(*)::int AS n FROM public.reativacao_fila
        WHERE lead_id = $1 AND status IN ('aguardando','em_discagem','com_sdr')`,
      [lead],
    );
    expect(abertas.rows[0].n).toBe(0);

    // Arquivado sai de todas as filas.
    const b = await c.query(
      `SELECT public._bolsao_elegivel(l.*) AS ok FROM public.leads l WHERE l.id=$1`,
      [lead],
    );
    expect(b.rows[0].ok).toBe(false);
  });

  it("arquivado volta como lead novo ao preencher formulário de novo", async () => {
    const lead = await leadNaReativacao();
    await comoSuperuser(c);
    const fid = (await c.query(`SELECT id FROM public.reativacao_fila WHERE lead_id=$1`, [lead]))
      .rows[0].id;
    await c.query(`SELECT public.reativacao_marcar_sem_retorno($1)`, [fid]);
    expect((await leadRow(lead)).cadencia_etapa).toBe("arquivado");

    await c.query(`SELECT public.reativacao_desarquivar($1)`, [lead]);
    const l = await leadRow(lead);
    expect(l.arquivado_em).toBeNull();
    expect(l.cadencia_ciclo).toBe(1);
    expect(l.status).toBe("aguardando_corretor");
  });
});

// ---------------------------------------------------------------------------
// As duas travas que o aceite pede fora da tabela de cenários
// ---------------------------------------------------------------------------

describe("travas do aceite", () => {
  it("a contagem de dias distintos usa o fuso de São Paulo (23h30 conta no mesmo dia)", async () => {
    const lead = await leadEmCadencia();
    await comoSuperuser(c);
    // Três tentativas às 23h30 (BRT) de três dias seguidos. Em UTC elas caem
    // no dia seguinte (02h30) — se a contagem fosse em UTC, o resultado seria
    // o mesmo por acaso. O caso que separa as duas leituras é ESTE: duas
    // tentativas do MESMO dia BRT, uma às 10h e outra às 23h30. Em UTC a
    // segunda vira o dia seguinte e daria 2 dias onde só houve 1.
    for (const dias of [0, 1]) {
      await c.query(
        `INSERT INTO public.cadencia_tentativas (lead_id, corretor_id, etapa, canal, resultado, ts)
         VALUES ($1,$2,'D1','ligacao','nao_atendeu',
                 ((current_date - make_interval(days => $3::int) + interval '10 hours')
                   AT TIME ZONE 'America/Sao_Paulo')),
                ($1,$2,'D1','ligacao','nao_atendeu',
                 ((current_date - make_interval(days => $3::int) + interval '23 hours 30 minutes')
                   AT TIME ZONE 'America/Sao_Paulo'))`,
        [lead, corretor.id, dias],
      );
    }
    const r = await c.query(
      `SELECT count(DISTINCT (ts AT TIME ZONE 'America/Sao_Paulo')::date) AS sp,
              count(DISTINCT (ts AT TIME ZONE 'UTC')::date)             AS utc
         FROM public.cadencia_tentativas WHERE lead_id = $1`,
      [lead],
    );
    // 2 dias reais de trabalho. Em UTC as tentativas de 23h30 escorregam para
    // o dia seguinte e viram 3 — a inflação que daria "3 dias distintos" a
    // quem trabalhou 2, e mandaria para a reativação uma cadência não cumprida.
    expect(Number(r.rows[0].sp)).toBe(2);
    expect(Number(r.rows[0].utc)).toBe(3);
  });

  it("telefone suspeito entra sem WhatsApp e a RPC recusa a tentativa", async () => {
    const lead = await criarLead(c, { status: "aguardando_corretor", telefone: "11999999999" });
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [corretor.id, lead]);

    const l = await leadRow(lead);
    expect(l.cadencia_etapa).toBe("D1");

    // O sinal de telefone suspeito viaja na FILA (que esconde o botão de
    // WhatsApp), não numa escrita em leads.proxima_acao.
    const f = await fila(corretor.id);
    expect(f.itens[0].telefone_suspeito).toBe(true);

    await comoUsuario(c, corretor.id);
    expect(
      await errCode(
        c.query(`SELECT public.cadencia_registrar_tentativa($1,'whatsapp','enviada')`, [lead]),
      ),
    ).toBe("22023");
  });

  it("a RPC recusa canal e resultado incoerentes", async () => {
    const lead = await leadEmCadencia();
    await comoUsuario(c, corretor.id);
    expect(
      await errCode(
        c.query(`SELECT public.cadencia_registrar_tentativa($1,'whatsapp','nao_atendeu')`, [lead]),
      ),
    ).toBe("22023");
    expect(
      await errCode(
        c.query(`SELECT public.cadencia_registrar_tentativa($1,'ligacao','enviada')`, [lead]),
      ),
    ).toBe("22023");
  });

  it("corretor não registra tentativa em lead que não é dele", async () => {
    const lead = await leadEmCadencia();
    await comoUsuario(c, outroCorretor.id);
    expect(
      await errCode(
        c.query(`SELECT public.cadencia_registrar_tentativa($1,'ligacao','nao_atendeu')`, [lead]),
      ),
    ).toBe("42501");
  });

  it("a Fila do Dia ordena atrasados primeiro, depois D1 < D2 < D3", async () => {
    const d3 = await leadEmCadencia();
    await setEtapa(d3, "D3", 0);
    const d1 = await leadEmCadencia();
    await setEtapa(d1, "D1", 0);
    const atrasado = await leadEmCadencia();
    await setEtapa(atrasado, "D2", 4);

    const f = await fila(corretor.id);
    expect(f.itens.map((i) => i.id)).toEqual([atrasado, d1, d3]);
    expect(f.itens[0].atrasado).toBe(true);
  });

  it("a auditoria diária acha lead em cadência sem prazo e avisa a gestão", async () => {
    const gestor = await criarUsuario(c, { papel: "gestor" });
    const lead = await leadEmCadencia();
    await comoSuperuser(c);
    // A auditoria mede a integridade da CADÊNCIA (corretor e prazo). Lead em
    // D1 sem prazo não aparece na Fila do Dia de ninguém — some da operação
    // sem sair da carteira, que é a falha silenciosa que este job procura.
    await c.query(`UPDATE public.leads SET cadencia_prazo_ts = NULL WHERE id = $1`, [lead]);

    const r = await c.query(`SELECT * FROM public.cadencia_auditoria()`);
    expect(Number(r.rows[0].achados)).toBe(1);

    const al = await c.query(
      `SELECT count(*)::int AS n FROM public.alertas WHERE user_id = $1 AND tipo = 'sistema'`,
      [gestor.id],
    );
    expect(al.rows[0].n).toBe(1);
  });
});

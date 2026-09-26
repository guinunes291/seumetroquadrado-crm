/**
 * CADÊNCIA LEAD CHEGOU/D1/D2/D3 E REATIVAÇÃO
 * (migrations 20260921120000 / 120100 / 120200; 4 etapas em 20261001120000)
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
  // A virada para 4 etapas é passado: toda tentativa simulada aqui é do
  // modelo novo. A regra antiga (3 etapas) tem teste próprio, que move o marco.
  await c.query(
    `UPDATE public.cadencia_config
        SET modo = 'sombra', quatro_etapas_desde = now() - interval '60 days'
      WHERE id = 1`,
  );
  corretor = await criarUsuario(c, { papel: "corretor", nome: "Corretor Cadência" });
  outroCorretor = await criarUsuario(c, { papel: "corretor", nome: "Corretor Vizinho" });
});

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

/** D0 é "Lead chegou"; D1 e D2 são os follow-ups; D3 é o encerramento. */
type Etapa = "D0" | "D1" | "D2" | "D3";

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
  etapa: Etapa,
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
async function fecharEtapa(leadId: string, etapa: Etapa, diasAtras: number) {
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
 * As 10 tentativas das quatro etapas: Lead chegou há 4 dias, 1º follow-up há
 * 3, 2º há 2, e a mensagem de encerramento há 25 h. Cadência cumprida.
 */
async function cumprirCadencia(leadId: string): Promise<void> {
  await fecharEtapa(leadId, "D0", 4);
  await fecharEtapa(leadId, "D1", 3);
  await fecharEtapa(leadId, "D2", 2);
  await tentativa(leadId, "D3", "whatsapp", 25 * 60);
  await setEtapa(leadId, "D3", 0);
}

/**
 * As 10 tentativas das quatro etapas dentro de um único dia BRT, `diasAtras`
 * dias no passado. É o cenário 7: etapas completas, cadência NÃO cumprida.
 */
async function tentativasNoMesmoDia(leadId: string, diasAtras: number): Promise<void> {
  await comoSuperuser(c);
  const plano: Array<[string, string, number]> = [
    ["D0", "ligacao", 8],
    ["D0", "ligacao", 9],
    ["D0", "whatsapp", 10],
    ["D1", "ligacao", 11],
    ["D1", "ligacao", 12],
    ["D1", "whatsapp", 13],
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
  it("1. lead atribuído hoje, nada registrado → Lead chegou (D0) na fila, fazer hoje", async () => {
    const lead = await leadEmCadencia();
    const l = await leadRow(lead);
    expect(l.cadencia_etapa).toBe("D0");
    // A cadência NÃO escreve em proxima_acao: aquela coluna é o passo que o
    // HUMANO declara, e preenchê-la aqui desarmaria as travas de transição.
    // O que o corretor deve fazer agora é etapa + prazo, e é a fila que mostra.
    expect(l.cadencia_prazo_ts).not.toBeNull();

    const f = await fila(corretor.id);
    expect(f.itens).toHaveLength(1);
    expect(f.itens[0].etapa).toBe("D0");
    expect(f.itens[0].atrasado).toBe(false);
    expect(f.itens[0].ligacoes_validas).toBe(0);
    expect(f.itens[0].whatsapp_enviado).toBe(false);
  });

  it("1b. lead criado JÁ com corretor (rota direta) também entra em Lead chegou", async () => {
    const lead = await criarLead(c, { status: "aguardando_corretor", corretorId: corretor.id });
    expect((await leadRow(lead)).cadencia_etapa).toBe("D0");
  });

  it("2. Lead chegou com 1 ligação + 1 WhatsApp → continua em Lead chegou", async () => {
    const lead = await leadEmCadencia();
    await tentativa(lead, "D0", "ligacao", 60);
    await tentativa(lead, "D0", "whatsapp", 30);

    await comoSuperuser(c);
    const completa = await c.query(`SELECT public.cadencia_etapa_completa($1,'D0') AS ok`, [lead]);
    expect(completa.rows[0].ok).toBe(false);

    await c.query(`SELECT public.cadencia_avancar('ativo')`);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D0");
  });

  it("3. Lead chegou com 2 ligações em 30 segundos + 1 WhatsApp → continua", async () => {
    const lead = await leadEmCadencia();
    // 60 min atrás e 59,5 min atrás: meio minuto de intervalo.
    await tentativa(lead, "D0", "ligacao", 60);
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.cadencia_tentativas (lead_id, corretor_id, etapa, canal, resultado, ts)
       VALUES ($1,$2,'D0','ligacao','nao_atendeu', now() - interval '59 minutes 30 seconds')`,
      [lead, corretor.id],
    );
    await tentativa(lead, "D0", "whatsapp", 50);

    const completa = await c.query(`SELECT public.cadencia_etapa_completa($1,'D0') AS ok`, [lead]);
    expect(completa.rows[0].ok).toBe(false);

    // A fila mostra 1 de 2: o contador não pode dizer 2 e a etapa não fechar.
    const f = await fila(corretor.id);
    expect(f.itens[0].ligacoes_validas).toBe(1);
    expect(f.itens[0].whatsapp_enviado).toBe(true);
  });

  it("4. Lead chegou completo ontem → D1 (1º follow-up), vencendo hoje", async () => {
    const lead = await leadEmCadencia();
    await fecharEtapa(lead, "D0", 1);

    await comoSuperuser(c);
    await c.query(`SELECT public.cadencia_avancar('ativo')`);

    const l = await leadRow(lead);
    expect(l.cadencia_etapa).toBe("D1");
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
    expect(f.itens[0].etapa).toBe("D1");
    expect(f.itens[0].atrasado).toBe(false);
  });

  it("5. Lead chegou completo há 3 dias e D1 vazio → sombra loga, ativo devolve à roleta", async () => {
    const lead = await leadEmCadencia();
    await fecharEtapa(lead, "D0", 3);
    await comoSuperuser(c);
    await c.query(`SELECT public.cadencia_avancar('ativo')`);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D1");

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

    // E o lead recomeça em Lead chegou quando a roleta dá um dono novo.
    await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [
      outroCorretor.id,
      lead,
    ]);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D0");
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
  it("6. as 4 etapas em 4 dias distintos + 24h sem resposta → descanso e reativação", async () => {
    const lead = await leadEmCadencia();
    await cumprirCadencia(lead); // encerramento 25h atrás

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
    expect(r.rows[0].horarios_tentados.ligacoes).toBe(6);
    expect(r.rows[0].horarios_tentados.whatsapps).toBe(4);
  });

  it("6b. em descanso o lead NÃO cai no Bolsão nem aparece para o discador", async () => {
    const lead = await leadEmCadencia();
    await cumprirCadencia(lead);
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

  it("7. as 4 etapas completas no MESMO dia → não vai para a reativação", async () => {
    const lead = await leadEmCadencia();
    // As 10 tentativas num ÚNICO dia BRT, dois dias atrás. O dia precisa ser
    // no passado (e não hoje) porque o job só olha lead cuja mensagem de D3
    // saiu há mais de `espera_pos_d3_h`; com tudo hoje, o lead nem seria
    // candidato e o teste passaria por ausência de avaliação, não por acerto.
    await tentativasNoMesmoDia(lead, 2);
    await setEtapa(lead, "D3", 0);

    await comoSuperuser(c);
    expect(
      (await c.query(`SELECT public.cadencia_etapa_completa($1,'D2') AS ok`, [lead])).rows[0].ok,
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
    await cumprirCadencia(lead);
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

  it("11. SDR marca reativado → roleta, reativado=true, ciclo 2, Lead chegou com novo corretor", async () => {
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

    // A roleta dá um dono novo — não o original — e a cadência recomeça em
    // Lead chegou.
    await c.query(`UPDATE public.leads SET corretor_id = $1 WHERE id = $2`, [
      outroCorretor.id,
      lead,
    ]);
    const depois = await leadRow(lead);
    expect(depois.cadencia_etapa).toBe("D0");
    expect(depois.corretor_id).toBe(outroCorretor.id);

    // As 10 tentativas do ciclo 1 NÃO contam para os 100% do ciclo 2.
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
    await cumprirCadencia(lead);

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
// Avanço na escrita (20260922120000)
// ---------------------------------------------------------------------------

describe("avanço na escrita", () => {
  it("fechar a etapa pela RPC avança o lead NA HORA, sem esperar a varredura", async () => {
    await comoSuperuser(c);
    await c.query(`UPDATE public.cadencia_config SET modo = 'ativo' WHERE id = 1`);
    const lead = await leadEmCadencia();

    await comoUsuario(c, corretor.id);
    await c.query(`SELECT public.cadencia_registrar_tentativa($1,'ligacao','nao_atendeu')`, [lead]);
    // A 2ª ligação precisa respeitar o intervalo mínimo, senão não conta.
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.cadencia_tentativas SET ts = ts - interval '10 minutes' WHERE lead_id = $1`,
      [lead],
    );
    await comoUsuario(c, corretor.id);
    await c.query(`SELECT public.cadencia_registrar_tentativa($1,'ligacao','nao_atendeu')`, [lead]);

    const r = await c.query(
      `SELECT public.cadencia_registrar_tentativa($1,'whatsapp','enviada') AS res`,
      [lead],
    );
    expect(r.rows[0].res.etapa_completa).toBe(true);
    expect(r.rows[0].res.etapa_nova).toBe("D1");

    // Sem nenhuma chamada à varredura, o lead JÁ está no 1º follow-up.
    expect((await leadRow(lead)).cadencia_etapa).toBe("D1");

    // E o log registra que quem avançou foi a escrita, não o motor.
    await comoSuperuser(c);
    const log = await c.query(
      `SELECT detalhe->>'origem' AS origem, aplicado FROM public.cadencia_execucao_log
        WHERE lead_id = $1 AND job = 'avancar' ORDER BY created_at DESC LIMIT 1`,
      [lead],
    );
    expect(log.rows[0].origem).toBe("escrita");
    expect(log.rows[0].aplicado).toBe(true);
  });

  it("em modo SOMBRA a escrita registra a tentativa mas NÃO avança a etapa", async () => {
    const lead = await leadEmCadencia(); // beforeEach deixa o modo em sombra
    await fecharEtapa(lead, "D0", 0);

    await comoUsuario(c, corretor.id);
    // Uma tentativa a mais pela RPC, com a etapa já completa.
    const r = await c.query(
      `SELECT public.cadencia_registrar_tentativa($1,'whatsapp','enviada') AS res`,
      [lead],
    );
    expect(r.rows[0].res.etapa_completa).toBe(true);
    expect(r.rows[0].res.etapa_nova).toBeNull();
    expect((await leadRow(lead)).cadencia_etapa).toBe("D0");

    // A sombra continua dizendo o que FARIA — é para isso que ela existe.
    await comoSuperuser(c);
    const log = await c.query(
      `SELECT etapa_para, aplicado, modo FROM public.cadencia_execucao_log
        WHERE lead_id = $1 AND job = 'avancar' ORDER BY created_at DESC LIMIT 1`,
      [lead],
    );
    expect(log.rows[0]).toMatchObject({ etapa_para: "D1", aplicado: false, modo: "sombra" });
  });

  it("a varredura ainda pega quem fechou etapa FORA da tela (discador)", async () => {
    await comoSuperuser(c);
    await c.query(`UPDATE public.cadencia_config SET modo = 'ativo' WHERE id = 1`);
    const lead = await leadEmCadencia();
    // Tentativas que nunca passaram pela RPC: origem 'discador'.
    await c.query(
      `INSERT INTO public.cadencia_tentativas (lead_id, etapa, canal, resultado, ts, origem)
       VALUES ($1,'D0','ligacao','nao_atendeu', now() - interval '3 hours','discador'),
              ($1,'D0','ligacao','nao_atendeu', now() - interval '2 hours','discador'),
              ($1,'D0','whatsapp','enviada',    now() - interval '1 hour', 'discador')`,
      [lead],
    );
    expect((await leadRow(lead)).cadencia_etapa).toBe("D0");

    await c.query(`SELECT public.cadencia_avancar('ativo')`);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D1");

    const log = await c.query(
      `SELECT detalhe->>'origem' AS origem FROM public.cadencia_execucao_log
        WHERE lead_id = $1 AND job = 'avancar' ORDER BY created_at DESC LIMIT 1`,
      [lead],
    );
    expect(log.rows[0].origem).toBe("motor");
  });

  it("escrita e varredura no mesmo lead não pulam duas etapas", async () => {
    await comoSuperuser(c);
    await c.query(`UPDATE public.cadencia_config SET modo = 'ativo' WHERE id = 1`);
    const lead = await leadEmCadencia();
    await fecharEtapa(lead, "D0", 0);

    // A escrita avança para D1...
    expect(
      await c
        .query(`SELECT public.cadencia_avancar_lead($1,'ativo',null,'escrita') AS e`, [lead])
        .then((r) => r.rows[0].e),
    ).toBe("D1");
    // ...e a varredura logo atrás não encontra o que avançar (D1 está vazio).
    expect((await leadRow(lead)).cadencia_etapa).toBe("D1");
    await c.query(`SELECT public.cadencia_avancar('ativo')`);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D1");
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
         VALUES ($1,$2,'D0','ligacao','nao_atendeu',
                 ((current_date - make_interval(days => $3::int) + interval '10 hours')
                   AT TIME ZONE 'America/Sao_Paulo')),
                ($1,$2,'D0','ligacao','nao_atendeu',
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
    expect(l.cadencia_etapa).toBe("D0");

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

  it("a Fila do Dia ordena atrasados primeiro, depois Lead chegou < D1 < D2 < D3", async () => {
    const d3 = await leadEmCadencia();
    await setEtapa(d3, "D3", 0);
    const d1 = await leadEmCadencia();
    await setEtapa(d1, "D1", 0);
    const d2 = await leadEmCadencia();
    await setEtapa(d2, "D2", 0);
    const d0 = await leadEmCadencia();
    await setEtapa(d0, "D0", 0);
    const atrasado = await leadEmCadencia();
    await setEtapa(atrasado, "D2", 4);

    const f = await fila(corretor.id);
    expect(f.itens.map((i) => i.id)).toEqual([atrasado, d0, d1, d2, d3]);
    expect(f.itens[0].atrasado).toBe(true);
  });

  it("a auditoria diária acha lead em cadência sem prazo e avisa a gestão", async () => {
    const gestor = await criarUsuario(c, { papel: "gestor" });
    const lead = await leadEmCadencia();
    await comoSuperuser(c);
    // A auditoria mede a integridade da CADÊNCIA (corretor e prazo). Lead em
    // Lead chegou sem prazo não aparece na Fila do Dia de ninguém — some da operação
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

// ---------------------------------------------------------------------------
// Quatro etapas: Lead chegou → D1 → D2 → D3 (20261001120000)
// ---------------------------------------------------------------------------

describe("quatro etapas", () => {
  it("o motor anda Lead chegou → 1º follow-up → 2º follow-up → encerramento", async () => {
    const lead = await leadEmCadencia();
    await comoSuperuser(c);

    await fecharEtapa(lead, "D0", 3);
    await c.query(`SELECT public.cadencia_avancar('ativo')`);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D1");

    await fecharEtapa(lead, "D1", 2);
    await c.query(`SELECT public.cadencia_avancar('ativo')`);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D2");

    await fecharEtapa(lead, "D2", 1);
    await c.query(`SELECT public.cadencia_avancar('ativo')`);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D3");
    // O encerramento vence no fim do dia seguinte ao 2º follow-up: hoje.
    const prazo = await c.query(
      `SELECT (cadencia_prazo_ts = public.cadencia_fim_do_dia(now(),0)) AS igual
         FROM public.leads WHERE id = $1`,
      [lead],
    );
    expect(prazo.rows[0].igual).toBe(true);

    // E no encerramento só a mensagem conta: o motor não avança mais.
    await c.query(`SELECT public.cadencia_avancar('ativo')`);
    expect((await leadRow(lead)).cadencia_etapa).toBe("D3");
  });

  it("2º follow-up vencido volta para a roleta, como os outros follow-ups", async () => {
    const lead = await leadEmCadencia();
    await setEtapa(lead, "D2", 4);
    await comoSuperuser(c);
    const r = await c.query(`SELECT * FROM public.cadencia_vencidos('ativo')`);
    expect(Number(r.rows[0].aplicados)).toBe(1);
    const l = await leadRow(lead);
    expect(l.corretor_id).toBeNull();
    expect(l.cadencia_etapa).toBeNull();
  });

  it("pular o 2º follow-up não é cadência cumprida: vai para a roleta, não para a reativação", async () => {
    const lead = await leadEmCadencia();
    await fecharEtapa(lead, "D0", 4);
    await fecharEtapa(lead, "D1", 3);
    await tentativa(lead, "D3", "whatsapp", 25 * 60);
    await setEtapa(lead, "D3", 0);

    await comoSuperuser(c);
    expect(
      (await c.query(`SELECT public.cadencia_cumprida_100($1) AS ok`, [lead])).rows[0].ok,
    ).toBe(false);

    await c.query(`SELECT public.cadencia_encerrar('ativo')`);
    const log = await c.query(
      `SELECT etapa_para, motivo FROM public.cadencia_execucao_log
        WHERE lead_id = $1 AND job = 'encerrar' ORDER BY created_at DESC LIMIT 1`,
      [lead],
    );
    expect(log.rows[0]).toMatchObject({ etapa_para: "roleta", motivo: "cadencia_incompleta" });
  });

  it("4 etapas em 3 dias não bastam: são 4 dias diferentes", async () => {
    const lead = await leadEmCadencia();
    await fecharEtapa(lead, "D0", 3);
    await fecharEtapa(lead, "D1", 2);
    // O 2º follow-up no MESMO dia do 1º: etapa completa, dia repetido.
    await tentativa(lead, "D2", "ligacao", 2 * 24 * 60 + 30);
    await tentativa(lead, "D2", "ligacao", 2 * 24 * 60 + 15);
    await tentativa(lead, "D2", "whatsapp", 2 * 24 * 60 + 10);
    await tentativa(lead, "D3", "whatsapp", 25 * 60);
    await setEtapa(lead, "D3", 0);

    await comoSuperuser(c);
    // Salvaguarda contra a virada de dia no meio do teste: as tentativas do
    // D1 e do D2 caem no mesmo dia BRT, senão o cenário não é o que diz ser.
    const dias = await c.query(
      `SELECT count(DISTINCT (ts AT TIME ZONE 'America/Sao_Paulo')::date)::int AS n
         FROM public.cadencia_tentativas WHERE lead_id = $1`,
      [lead],
    );
    if (dias.rows[0].n !== 3) return;
    expect(
      (await c.query(`SELECT public.cadencia_cumprida_100($1) AS ok`, [lead])).rows[0].ok,
    ).toBe(false);
  });

  it("encerramento enviado ANTES da virada é julgado pela regra antiga de 3 etapas", async () => {
    const lead = await leadEmCadencia();
    // O lead fez Lead chegou e 1º follow-up (os antigos D1 e D2) e recebeu a
    // mensagem de encerramento — tudo no modelo de 3 etapas.
    await fecharEtapa(lead, "D0", 5);
    await fecharEtapa(lead, "D1", 3);
    await tentativa(lead, "D3", "whatsapp", 25 * 60);
    await setEtapa(lead, "D3", 0);

    await comoSuperuser(c);
    // Virada depois do encerramento: regra antiga, cadência cumprida.
    await c.query(`UPDATE public.cadencia_config SET quatro_etapas_desde = now() WHERE id = 1`);
    expect(
      (await c.query(`SELECT public.cadencia_cumprida_100($1) AS ok`, [lead])).rows[0].ok,
    ).toBe(true);
    await c.query(`SELECT public.cadencia_encerrar('ativo')`);
    expect((await leadRow(lead)).cadencia_etapa).toBe("descanso");
  });

  it("a mesma cadência, com o encerramento DEPOIS da virada, não está cumprida", async () => {
    const lead = await leadEmCadencia();
    await fecharEtapa(lead, "D0", 5);
    await fecharEtapa(lead, "D1", 3);
    await tentativa(lead, "D3", "whatsapp", 25 * 60);
    await setEtapa(lead, "D3", 0);

    await comoSuperuser(c);
    await c.query(
      `UPDATE public.cadencia_config SET quatro_etapas_desde = now() - interval '2 days' WHERE id = 1`,
    );
    expect(
      (await c.query(`SELECT public.cadencia_cumprida_100($1) AS ok`, [lead])).rows[0].ok,
    ).toBe(false);
  });

  it("a virada renomeia etapas e tentativas uma vez só", async () => {
    // Monta, numa transação desfeita no fim, o banco como ele estava ANTES:
    // etapas D1/D2/D3, templates cadencia_D1/D2/D3 e o marco vazio.
    const aberto = await leadEmCadencia();
    const followup = await leadEmCadencia();
    const semMensagem = await leadEmCadencia();
    const comMensagem = await leadEmCadencia();
    const respondeu = await leadEmCadencia();

    await comoSuperuser(c);
    await c.query("BEGIN");
    try {
      await c.query(`UPDATE public.cadencia_config SET quatro_etapas_desde = NULL WHERE id = 1`);
      await c.query(`DELETE FROM public.templates_mensagem WHERE contexto = 'cadencia_D2'`);
      await c.query(
        `UPDATE public.templates_mensagem SET contexto = 'cadencia_D2' WHERE contexto = 'cadencia_D1'`,
      );
      await c.query(
        `UPDATE public.templates_mensagem SET contexto = 'cadencia_D1' WHERE contexto = 'cadencia_D0'`,
      );

      await setEtapa(aberto, "D1", 0);
      await tentativa(aberto, "D1", "ligacao", 30);

      await setEtapa(followup, "D2", 0);
      await fecharEtapa(followup, "D1", 1);

      await setEtapa(semMensagem, "D3", 0);
      await fecharEtapa(semMensagem, "D1", 3);
      await fecharEtapa(semMensagem, "D2", 1);

      await setEtapa(comMensagem, "D3", 0);
      await fecharEtapa(comMensagem, "D1", 5);
      await fecharEtapa(comMensagem, "D2", 3);
      await tentativa(comMensagem, "D3", "whatsapp", 120);

      await setEtapa(respondeu, "respondeu", 0);
      // O Painel mede "respondeu em qual etapa" pelo evento: ele vira junto.
      await c.query(
        `INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
         VALUES ($1, 'cadencia_etapa', 'cliente respondeu', 'teste',
                 jsonb_build_object('de_estado', 'D2', 'para_estado', 'respondeu'))`,
        [respondeu],
      );

      const r = await c.query(`SELECT public._cadencia_virada_quatro_etapas() AS r`);
      expect(r.rows[0].r).toMatchObject({
        aplicada: true,
        lead_chegou: 1,
        primeiro_followup: 1,
        segundo_followup: 1,
        encerramento: 1,
      });

      const etapas = await c.query(
        `SELECT id, cadencia_etapa FROM public.leads WHERE id = ANY($1::uuid[])`,
        [[aberto, followup, semMensagem, comMensagem, respondeu]],
      );
      const por = Object.fromEntries(etapas.rows.map((x) => [x.id, x.cadencia_etapa]));
      expect(por[aberto]).toBe("D0");
      expect(por[followup]).toBe("D1");
      expect(por[semMensagem]).toBe("D2");
      expect(por[comMensagem]).toBe("D3");
      expect(por[respondeu]).toBe("respondeu");

      const ev = await c.query(
        `SELECT payload->>'de_estado' AS de, payload->>'para_estado' AS para
           FROM public.lead_eventos
          WHERE lead_id = $1 AND tipo = 'cadencia_etapa' AND agente = 'teste'`,
        [respondeu],
      );
      expect(ev.rows[0]).toEqual({ de: "D1", para: "respondeu" });

      // As tentativas acompanham: a etapa atual do lead tem as tentativas dela.
      const tent = await c.query(
        `SELECT lead_id, string_agg(etapa, ',' ORDER BY etapa) AS e
           FROM (SELECT DISTINCT lead_id, etapa FROM public.cadencia_tentativas
                  WHERE lead_id = ANY($1::uuid[])) x
          GROUP BY lead_id`,
        [[aberto, followup, semMensagem, comMensagem]],
      );
      const tpor = Object.fromEntries(tent.rows.map((x) => [x.lead_id, x.e]));
      expect(tpor[aberto]).toBe("D0");
      expect(tpor[followup]).toBe("D0");
      expect(tpor[semMensagem]).toBe("D0,D1");
      expect(tpor[comMensagem]).toBe("D0,D1,D3");

      // O lead que já recebeu o encerramento continua com a cadência cumprida
      // pela regra antiga — não vira "incompleta" por causa da virada.
      expect(
        (await c.query(`SELECT public.cadencia_cumprida_100($1) AS ok`, [comMensagem])).rows[0].ok,
      ).toBe(true);

      const tpl = await c.query(
        `SELECT contexto FROM public.templates_mensagem
          WHERE contexto LIKE 'cadencia_D%' AND ativo ORDER BY contexto`,
      );
      expect(tpl.rows.map((x) => x.contexto)).toEqual([
        "cadencia_D0",
        "cadencia_D1",
        "cadencia_D2",
        "cadencia_D3",
      ]);

      // Rodar de novo não empurra ninguém uma etapa para trás.
      const again = await c.query(`SELECT public._cadencia_virada_quatro_etapas() AS r`);
      expect(again.rows[0].r).toEqual({ aplicada: false });
      expect((await leadRow(followup)).cadencia_etapa).toBe("D1");
    } finally {
      await c.query("ROLLBACK");
    }
  });

  it("o Kanban mostra a cadência inteira do corretor por etapa, inclusive o que vence depois", async () => {
    const chegou = await leadEmCadencia();
    const primeiro = await leadEmCadencia();
    await setEtapa(primeiro, "D1", -1); // vence amanhã: fora da Fila do Dia
    const encerramento = await leadEmCadencia();
    await setEtapa(encerramento, "D3", 2); // atrasado
    const fora = await leadEmCadencia();
    await setEtapa(fora, "respondeu", 0);
    const doVizinho = await criarLead(c, {
      status: "aguardando_corretor",
      corretorId: outroCorretor.id,
    });

    await comoUsuario(c, corretor.id);
    const k = (await c.query(`SELECT public.cadencia_kanban_v1(NULL, 400) AS k`)).rows[0].k;
    await comoSuperuser(c);

    expect(k.total).toBe(3);
    const ids = k.itens.map((i: { id: string }) => i.id);
    expect(ids).toEqual([chegou, primeiro, encerramento]);
    expect(ids).not.toContain(fora);
    expect(ids).not.toContain(doVizinho);
    const enc = k.itens.find((i: { id: string }) => i.id === encerramento);
    expect(enc.etapa).toBe("D3");
    expect(enc.atrasado).toBe(true);

    // A Fila do Dia, com a mesma cadência, não mostra quem vence amanhã.
    const f = await fila(corretor.id);
    expect(f.itens.map((i) => i.id)).not.toContain(primeiro);

    // Corretor não lê o Kanban do vizinho.
    await comoUsuario(c, outroCorretor.id);
    expect(await errCode(c.query(`SELECT public.cadencia_kanban_v1($1, 400)`, [corretor.id]))).toBe(
      "42501",
    );
    await comoSuperuser(c);
  });
});

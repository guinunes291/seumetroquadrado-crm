/**
 * HIGIENE DO FUNIL — views de leitura (Fatia 1).
 *
 * Cada teste aqui existe por causa de um defeito REAL encontrado antes de
 * escrever a tela; não são testes de fachada:
 *
 *  1. O relógio usava COALESCE encadeado. Um lead com ultima_interacao de 40
 *     dias e ultimo_contato de ontem aparecia como "parado há 40 dias".
 *     Corrigido para GREATEST — este teste é a regressão.
 *  2. A fila filtrava por temperatura='quente'. Como `temperatura` é derivada
 *     e reescrita a cada 10 min (recalcular_temperatura_leads), onde 'quente'
 *     é ser agendado/visita_realizada/analise_credito OU ter interação nas
 *     últimas 24h, isso escondia 1.018 leads parados em aguardando_retorno /
 *     proposta_enviada / qualificacao_corretor (medido em 2026-09-11) contra
 *     ~210 que a fila mostrava. A fila agora filtra por FASE.
 *  3. A view base não filtrava na_lixeira, e arquivar_leads_sem_contato_30d
 *     grava na_lixeira = true.
 *  4. 12.995 leads (22,4% da base) compartilham o mesmo timestamp ao segundo
 *     em 2026-07-26. Sem marcar isso, a fila abre numa importação.
 *  5. Paridade de pesos entre SQL e TS — a tela soma no banco (regra: o número
 *     da tela e o do motor têm que ser o mesmo), mas a régua de prioridade já
 *     existia em src/lib/priority.ts. Duplicar é aceitável; divergir em
 *     silêncio não é.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { comoSuperuser, comoUsuario, criarUsuario, limparDados, novoClient } from "./helpers";
// Caminho relativo: a suíte de banco roda em ambiente node e, ao contrário da
// suíte unit, nenhum outro teste daqui usa o alias "@/".
import { PESO_ETAPA } from "../../src/lib/priority";

const c = novoClient();
let conectado = false;

async function conectar() {
  if (!conectado) {
    await c.connect();
    conectado = true;
  }
}

/** Insere um lead com relógio controlado, sem depender de trigger. */
async function lead(opts: {
  nome: string;
  status: string;
  interacaoDiasAtras?: number | null;
  contatoDiasAtras?: number | null;
  criadoDiasAtras?: number;
  temperatura?: string;
  corretorId?: string | null;
  naLixeira?: boolean;
  instanteFixo?: string | null;
  /** Pula triggers para semear status terminal (ver semTriggers abaixo). */
  semTriggers?: boolean;
}): Promise<string> {
  await comoSuperuser(c);
  // contrato_fechado e pos_venda têm guarda de produção
  // (trg_proteger_fechamento_sem_venda_aprovada): não se cria lead já fechado
  // sem venda aprovada. Para testar que a VIEW os exclui, a fixture entra por
  // baixo do trigger — mesmo recurso que helpers.criarUsuario usa para
  // auth.users. Não afrouxa a guarda: ela segue valendo no caminho real.
  if (opts.semTriggers) await c.query(`SET session_replication_role = replica`);
  const r = await c.query(
    `INSERT INTO public.leads
       (nome, telefone, status, temperatura, corretor_id, na_lixeira,
        ultima_interacao, ultimo_contato, created_at)
     VALUES ($1, $2, $3::public.lead_status, $4::public.lead_temperatura, $5, $6,
             $7, $8, now() - make_interval(days => $9))
     RETURNING id`,
    [
      opts.nome,
      // Telefone único por nome: o CRM deduplica por telefone.
      `11${String(Math.abs(hash(opts.nome)) % 1_000_000_000).padStart(9, "0")}`,
      opts.status,
      opts.temperatura ?? "frio",
      opts.corretorId ?? null,
      opts.naLixeira ?? false,
      opts.instanteFixo ??
        (opts.interacaoDiasAtras == null
          ? null
          : new Date(Date.now() - opts.interacaoDiasAtras * 86_400_000).toISOString()),
      opts.contatoDiasAtras == null
        ? null
        : new Date(Date.now() - opts.contatoDiasAtras * 86_400_000).toISOString(),
      opts.criadoDiasAtras ?? 120,
    ],
  );
  if (opts.semTriggers) await c.query(`SET session_replication_role = DEFAULT`);
  return r.rows[0].id as string;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

async function filaNomes(): Promise<string[]> {
  const r = await c.query(
    `SELECT nome FROM public.v_higiene_fila ORDER BY prioridade, dias_parado DESC`,
  );
  return r.rows.map((x) => x.nome as string);
}

beforeEach(async () => {
  await conectar();
  await limparDados(c);
  await comoSuperuser(c);
  // Prazo e limiar explícitos: o teste não pode depender do default mudar.
  await c.query(`UPDATE public.higiene_config SET dias_parado_min = 5, lote_min_leads = 50`);
  // limparDados() (helpers) TRUNCA as tabelas do CRM, mas não conhece as
  // tabelas de higiene — sem este reset, o teste que desativa uma fase vaza
  // `ativa = false` para todos os testes seguintes e a fila some.
  await c.query(`UPDATE public.higiene_regra_fase SET ativa = true WHERE NOT ativa`);
});

afterAll(async () => {
  if (conectado) await c.end();
});

describe("relógio de parado", () => {
  it("usa o toque MAIS RECENTE, não o primeiro campo preenchido", async () => {
    // Regressão do defeito 1: com COALESCE encadeado este lead dava 40 dias.
    await lead({
      nome: "contato ontem",
      status: "aguardando_retorno",
      interacaoDiasAtras: 40,
      contatoDiasAtras: 1,
    });
    const r = await c.query(
      `SELECT dias_parado, parado FROM public.v_higiene_base WHERE nome = 'contato ontem'`,
    );
    expect(r.rows[0].dias_parado).toBe(1);
    expect(r.rows[0].parado).toBe(false);
  });

  it("cai em ultimo_contato quando não houve interação (dado importado)", async () => {
    await lead({
      nome: "so contato",
      status: "aguardando_retorno",
      interacaoDiasAtras: null,
      contatoDiasAtras: 30,
    });
    const r = await c.query(
      `SELECT dias_parado, nunca_tocado FROM public.v_higiene_base WHERE nome = 'so contato'`,
    );
    expect(r.rows[0].dias_parado).toBe(30);
    expect(r.rows[0].nunca_tocado).toBe(false);
  });

  it("cai em created_at e marca nunca_tocado quando não há nenhum toque", async () => {
    await lead({
      nome: "virgem",
      status: "em_atendimento",
      interacaoDiasAtras: null,
      contatoDiasAtras: null,
      criadoDiasAtras: 90,
    });
    const r = await c.query(
      `SELECT dias_parado, nunca_tocado, parado FROM public.v_higiene_base WHERE nome = 'virgem'`,
    );
    expect(r.rows[0].dias_parado).toBe(90);
    expect(r.rows[0].nunca_tocado).toBe(true);
    expect(r.rows[0].parado).toBe(true);
  });
});

describe("quem entra na base", () => {
  it("exclui lixeira, apagados e status terminais", async () => {
    await lead({
      nome: "na lixeira",
      status: "em_atendimento",
      interacaoDiasAtras: 30,
      naLixeira: true,
    });
    await lead({
      nome: "fechado",
      status: "contrato_fechado",
      interacaoDiasAtras: 30,
      semTriggers: true,
    });
    await lead({
      nome: "pos venda",
      status: "pos_venda",
      interacaoDiasAtras: 30,
      semTriggers: true,
    });
    await lead({ nome: "perdido", status: "perdido", interacaoDiasAtras: 30, semTriggers: true });
    await lead({ nome: "vivo", status: "em_atendimento", interacaoDiasAtras: 30 });

    const r = await c.query(`SELECT nome FROM public.v_higiene_base ORDER BY nome`);
    expect(r.rows.map((x) => x.nome)).toEqual(["vivo"]);
  });
});

describe("fila de ação", () => {
  it("mostra lead FRIO em fase avançada — o filtro é fase, não temperatura", async () => {
    // Regressão do defeito 2: com `temperatura='quente'` no WHERE este lead,
    // que é o estrangulamento do funil, nunca aparecia.
    await lead({
      nome: "frio parado em aguardando_retorno",
      status: "aguardando_retorno",
      temperatura: "frio",
      interacaoDiasAtras: 40,
    });
    expect(await filaNomes()).toContain("frio parado em aguardando_retorno");
  });

  it("não lista fase sem regra ativa, mesmo parada", async () => {
    // em_atendimento e aguardando_corretor contam no denominador (são leads
    // vivos) mas não geram ação linha a linha — decisão de produto.
    await lead({ nome: "em atendimento", status: "em_atendimento", interacaoDiasAtras: 30 });
    await lead({
      nome: "aguardando corretor",
      status: "aguardando_corretor",
      interacaoDiasAtras: 30,
    });
    expect(await filaNomes()).toEqual([]);

    const base = await c.query(`SELECT count(*)::int AS n FROM public.v_higiene_base WHERE parado`);
    expect(base.rows[0].n).toBe(2);
  });

  it("não lista lead dentro do prazo", async () => {
    await lead({ nome: "recente", status: "analise_credito", interacaoDiasAtras: 2 });
    expect(await filaNomes()).toEqual([]);
  });

  it("ordena por peso da fase antes de dias parados", async () => {
    await lead({ nome: "retorno 90d", status: "aguardando_retorno", interacaoDiasAtras: 90 });
    await lead({ nome: "credito 10d", status: "analise_credito", interacaoDiasAtras: 10 });
    // Crédito (peso 25) vem antes de aguardando_retorno (peso 10) mesmo estando
    // parado há muito menos tempo: é onde está o dinheiro.
    expect(await filaNomes()).toEqual(["credito 10d", "retorno 90d"]);
  });

  it("respeita a desativação de uma fase", async () => {
    await lead({ nome: "credito", status: "analise_credito", interacaoDiasAtras: 30 });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.higiene_regra_fase SET ativa = false WHERE status = 'analise_credito'`,
    );
    expect(await filaNomes()).toEqual([]);
  });
});

describe("escrita em lote", () => {
  it("marca só a partir do limiar configurado", async () => {
    const instante = new Date(Date.now() - 40 * 86_400_000).toISOString();
    await comoSuperuser(c);
    // 49 no mesmo segundo: abaixo do limiar.
    await c.query(
      `INSERT INTO public.leads (nome, telefone, status, ultima_interacao, created_at)
       SELECT 'lote-'||g, '119222'||lpad(g::text,5,'0'), 'em_atendimento'::public.lead_status,
              $1::timestamptz, now() - interval '100 days'
         FROM generate_series(1,49) g`,
      [instante],
    );
    let r = await c.query(
      `SELECT count(*)::int AS n FROM public.v_higiene_base WHERE escrita_em_lote`,
    );
    expect(r.rows[0].n).toBe(0);

    // O 50º cruza o limiar e marca o bloco INTEIRO.
    await c.query(
      `INSERT INTO public.leads (nome, telefone, status, ultima_interacao, created_at)
       VALUES ('lote-50', '11922299999', 'em_atendimento'::public.lead_status,
               $1::timestamptz, now() - interval '100 days')`,
      [instante],
    );
    r = await c.query(`SELECT count(*)::int AS n FROM public.v_higiene_base WHERE escrita_em_lote`);
    expect(r.rows[0].n).toBe(50);
  });

  it("não marca leads com relógio próprio", async () => {
    await lead({ nome: "sozinho", status: "em_atendimento", interacaoDiasAtras: 33 });
    const r = await c.query(
      `SELECT escrita_em_lote FROM public.v_higiene_base WHERE nome = 'sozinho'`,
    );
    expect(r.rows[0].escrita_em_lote).toBe(false);
  });
});

describe("resumo", () => {
  it("separa nunca tocado de abandonado", async () => {
    await lead({ nome: "abandonado", status: "em_atendimento", interacaoDiasAtras: 30 });
    await lead({
      nome: "nunca tocado",
      status: "em_atendimento",
      interacaoDiasAtras: null,
      contatoDiasAtras: null,
      criadoDiasAtras: 30,
    });
    await lead({ nome: "em dia", status: "em_atendimento", interacaoDiasAtras: 1 });

    const r = await c.query(`SELECT * FROM public.v_higiene_resumo`);
    const s = r.rows[0];
    expect(Number(s.vivos)).toBe(3);
    expect(Number(s.parados)).toBe(2);
    expect(Number(s.parados_nunca_tocados)).toBe(1);
    expect(Number(s.parados_abandonados)).toBe(1);
    expect(Number(s.prazo_dias)).toBe(5);
  });

  it("segue o prazo da config, sem deploy", async () => {
    await lead({ nome: "parado 7d", status: "em_atendimento", interacaoDiasAtras: 7 });
    await comoSuperuser(c);
    await c.query(`UPDATE public.higiene_config SET dias_parado_min = 10`);
    const r = await c.query(`SELECT parados, prazo_dias FROM public.v_higiene_resumo`);
    expect(Number(r.rows[0].parados)).toBe(0);
    expect(Number(r.rows[0].prazo_dias)).toBe(10);
  });
});

describe("paridade SQL x TypeScript", () => {
  it("os pesos da tabela batem com PESO_ETAPA de src/lib/priority.ts", async () => {
    await comoSuperuser(c);
    const r = await c.query(`SELECT status::text AS status, peso FROM public.higiene_regra_fase`);
    const divergentes: string[] = [];
    for (const row of r.rows) {
      const noTs = PESO_ETAPA[row.status as string];
      // proposta_enviada é status legado e não existe em PESO_ETAPA — a linha
      // documenta isso na migration e fica fora da comparação de propósito.
      if (noTs === undefined) continue;
      if (noTs !== Number(row.peso)) {
        divergentes.push(`${row.status}: SQL=${row.peso} TS=${noTs}`);
      }
    }
    expect(divergentes).toEqual([]);
  });
});

describe("visibilidade", () => {
  it("corretor enxerga pela view apenas a própria carteira", async () => {
    const a = await criarUsuario(c, { papel: "corretor" });
    const b = await criarUsuario(c, { papel: "corretor" });
    await lead({
      nome: "do corretor A",
      status: "analise_credito",
      interacaoDiasAtras: 30,
      corretorId: a.id,
    });
    await lead({
      nome: "do corretor B",
      status: "analise_credito",
      interacaoDiasAtras: 30,
      corretorId: b.id,
    });

    await comoUsuario(c, a.id);
    const r = await c.query(`SELECT nome FROM public.v_higiene_fila ORDER BY nome`);
    expect(r.rows.map((x) => x.nome)).toEqual(["do corretor A"]);
    await comoSuperuser(c);
  });
});

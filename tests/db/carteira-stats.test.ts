/**
 * `carteira_stats_por_corretor_v1` (migration 20260914170000).
 *
 * A RPC antiga (`leads_stats_por_corretor`) responde "quantos leads ele tem".
 * Esta responde "quantos estão em tratativa" — e a diferença é a tela inteira
 * de gestão de carteira: `aguardando` sozinho são 6.186 leads com dono e
 * domina tudo, misturando topo de funil com abandono.
 *
 * Três grupos, e cada um quebra de um jeito diferente:
 *  - ATIVA: em tratativa COM sinal de vida no prazo da fase.
 *  - PROSPECÇÃO: novo/aguardando — nunca teve primeiro contato. NÃO é
 *    carteira parada; está na fila.
 *  - PARADA: com dono, fora do topo, sem registro no prazo. É o que a régua
 *    de devolução leva, e é o número que faltava ter nome.
 *
 * O fundo do funil usa 30 dias e o resto usa 7 — os mesmos prazos da régua de
 * posse. Tela e régua contando tempo de formas diferentes é o pior dos dois
 * mundos: o gestor vê um número e a operação executa outro.
 *
 * A partir de 20260914180000 a coluna `ativa` respeita o TETO
 * (`capacidade_leads_ativos_por_corretor`, 65): o corretor tem no máximo esse
 * tanto em tratativa, e o que passa disso sai em `acima_do_teto` — visível,
 * não escondido. O teto e os prazos vêm na própria resposta para a tela não
 * guardar uma segunda cópia deles.
 */
import { beforeAll, describe, expect, it } from "vitest";
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

type Linha = {
  corretor_id: string | null;
  total: string;
  ativa: string;
  acima_do_teto: string;
  prospeccao: string;
  parada: string;
  fundo: string;
  ganhos: string;
  perdidos: string;
  teto: number;
  dias_atendimento: number;
  dias_avancado: number;
};

const CHAVE_TETO = "capacidade_leads_ativos_por_corretor";

/** Roda `fn` com o teto da casa trocado e devolve a config ao valor original.
 *  É assim que se prova que o teto SAI da config: baixando-o, o corte muda. */
async function comTeto<T>(n: number, fn: () => Promise<T>): Promise<T> {
  await comoSuperuser(c);
  const antes = (
    await c.query(`SELECT valor FROM public.gestao_config WHERE chave = $1`, [CHAVE_TETO])
  ).rows[0]?.valor;
  await c.query(`UPDATE public.gestao_config SET valor = $1::jsonb WHERE chave = $2`, [
    JSON.stringify(n),
    CHAVE_TETO,
  ]);
  try {
    return await fn();
  } finally {
    await comoSuperuser(c);
    await c.query(`UPDATE public.gestao_config SET valor = $1::jsonb WHERE chave = $2`, [
      JSON.stringify(antes),
      CHAVE_TETO,
    ]);
  }
}

let admin: UsuarioTeste;
let corretor: UsuarioTeste;

async function stats(quem: UsuarioTeste, alvo: string): Promise<Linha | undefined> {
  await comoUsuario(c, quem.id);
  const r = await c.query(`SELECT * FROM public.carteira_stats_por_corretor_v1()`);
  return (r.rows as Linha[]).find((l) => l.corretor_id === alvo);
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  admin = await criarUsuario(c, { nome: "Admin Stats", papel: "admin" });
  corretor = await criarUsuario(c, { nome: "Corretor Stats", papel: "corretor" });

  const emTratativa = await criarLead(c, {
    nome: "Vivo",
    corretorId: corretor.id,
    status: "em_atendimento",
  });
  const parado = await criarLead(c, {
    nome: "Abandonado",
    corretorId: corretor.id,
    status: "em_atendimento",
  });
  const fundoRecente = await criarLead(c, {
    nome: "Agendado",
    corretorId: corretor.id,
    status: "agendado",
  });
  // O caso que separa as duas réguas: agendado parado há 20 dias passa dos 7
  // do atendimento mas NÃO dos 30 do fundo — continua sendo tratativa.
  const fundoVinteDias = await criarLead(c, {
    nome: "Agendado 20d",
    corretorId: corretor.id,
    status: "agendado",
  });
  const fundoParado = await criarLead(c, {
    nome: "Agendado velho",
    corretorId: corretor.id,
    status: "agendado",
  });
  await criarLead(c, {
    nome: "Nunca tocado",
    corretorId: corretor.id,
    status: "aguardando_atendimento",
  });
  // O caso que realmente existe na base: prospecção ANTIGA. São 6.186 leads
  // em aguardando na casa, a maioria velha. Sem ele no fixture, a guarda de
  // "prospecção não é carteira parada" passa por acidente — o lead recente
  // não é parado de qualquer jeito.
  const prospeccaoVelha = await criarLead(c, {
    nome: "Nunca tocado velho",
    corretorId: corretor.id,
    status: "aguardando_atendimento",
  });
  // Balcão: leads em tratativa SEM dono. O teto é por corretor — a linha do
  // balcão não é a carteira de ninguém e não pode ser cortada em 65.
  const semDono: string[] = [];
  for (let i = 0; i < 3; i++) {
    semDono.push(await criarLead(c, { nome: `Balcao ${i}`, status: "em_atendimento" }));
  }
  // O banco exige `motivo_perda_categoria` para nascer perdido; cria vivo e
  // transiciona com os triggers desligados, como a suíte já faz em outros casos.
  const perdido = await criarLead(c, {
    nome: "Perdido",
    corretorId: corretor.id,
    status: "em_atendimento",
  });

  await comoSuperuser(c);
  // Base em formação (20260925120000): `criarLead` com corretor põe o lead
  // em D0 (Lead chegou). Os leads EM TRATATIVA deste fixture modelam carteira que já passou
  // da cadência (em produção, sai ao avançar de fase ou ganhar passo) — o D0
  // deles é artefato e mudaria o que a suíte mede. Os "nunca tocados" ficam
  // em D0: são prospecção pelo status e continuam sendo.
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa = NULL, cadencia_prazo_ts = NULL, cadencia_inicio_ts = NULL
      WHERE cadencia_etapa IN ('D0','D1','D2','D3') AND status = 'em_atendimento'`,
  );
  await c.query(`SET session_replication_role = replica`);
  await c.query(
    `UPDATE public.leads
        SET status = 'perdido'::public.lead_status,
            motivo_perda_categoria = 'sem_contato'
      WHERE id = $1`,
    [perdido],
  );
  await c.query(`SET session_replication_role = DEFAULT`);
  await c.query(`UPDATE public.leads SET ultima_interacao = now() WHERE id = ANY($1::uuid[])`, [
    [emTratativa, fundoRecente, ...semDono],
  ]);
  // 20 dias: passa dos 7 do atendimento, mas NÃO dos 30 do fundo.
  await c.query(
    `UPDATE public.leads SET ultima_interacao = now() - interval '20 days'
      WHERE id = ANY($1::uuid[])`,
    [[parado, fundoVinteDias]],
  );
  await c.query(
    `UPDATE public.leads SET ultima_interacao = now() - interval '90 days' WHERE id = $1`,
    [fundoParado],
  );
  await c.query(`UPDATE public.leads SET created_at = now() - interval '90 days' WHERE id = $1`, [
    prospeccaoVelha,
  ]);
});

describe("os três grupos", () => {
  it("separa tratativa, prospecção e parados", async () => {
    const s = await stats(admin, corretor.id);
    expect(Number(s?.total)).toBe(8);
    // Vivo + agendado recente. O agendado parado há 20 dias TAMBÉM conta como
    // ativo: a régua dele é 30 dias, não 7.
    expect(Number(s?.ativa)).toBe(3);
    expect(Number(s?.prospeccao)).toBe(2);
    // Só o em_atendimento de 20 dias e o agendado de 90.
    expect(Number(s?.parada)).toBe(2);
    expect(Number(s?.fundo)).toBe(3);
    expect(Number(s?.perdidos)).toBe(1);
  });

  it("prospecção VELHA continua sendo prospecção, não carteira parada", async () => {
    const s = await stats(admin, corretor.id);
    expect(Number(s?.ativa) + Number(s?.parada) + Number(s?.prospeccao) + Number(s?.perdidos)).toBe(
      Number(s?.total),
    );
  });
});

describe("o prazo depende da fase", () => {
  it("agendado parado há 20 dias ainda é tratativa; em atendimento não", async () => {
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT l.nome, l.status,
              (COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at)
                 > now() - interval '7 days') AS recente_7,
              (COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at)
                 > now() - interval '30 days') AS recente_30
         FROM public.leads l WHERE l.nome IN ('Abandonado','Agendado velho')
        ORDER BY l.nome`,
    );
    const abandonado = r.rows.find((x) => x.nome === "Abandonado");
    expect(abandonado.recente_7).toBe(false);
    expect(abandonado.recente_30).toBe(true);
  });
});

describe("escopo", () => {
  it("corretor comum recebe 42501, não uma lista vazia", async () => {
    await comoUsuario(c, corretor.id);
    expect(await errCode(c.query(`SELECT * FROM public.carteira_stats_por_corretor_v1()`))).toBe(
      "42501",
    );
  });
});

describe("o teto", () => {
  it("corta a carteira ativa e mostra o excedente em vez de escondê-lo", async () => {
    // O corretor tem 3 em tratativa. Com teto 2, a tela deve dizer 2 ativos e
    // 1 acima do teto — nunca 2 e silêncio sobre o terceiro.
    const s = await comTeto(2, () => stats(admin, corretor.id));
    expect(Number(s?.ativa)).toBe(2);
    expect(Number(s?.acima_do_teto)).toBe(1);
    expect(Number(s?.teto)).toBe(2);
    // A soma continua fechando com o que está em tratativa de verdade.
    expect(Number(s?.ativa) + Number(s?.acima_do_teto)).toBe(3);
  });

  it("sai de gestao_config, não de um 65 fixo no código", async () => {
    // Mesma base, teto maior: nada é cortado. Se o 65 estivesse fixo na
    // função, este teste e o anterior não poderiam passar os dois.
    const s = await comTeto(10, () => stats(admin, corretor.id));
    expect(Number(s?.ativa)).toBe(3);
    expect(Number(s?.acima_do_teto)).toBe(0);
    expect(Number(s?.teto)).toBe(10);
  });

  it("não corta o balcão: lead sem dono não é carteira de ninguém", async () => {
    const s = await comTeto(2, async () => {
      await comoUsuario(c, admin.id);
      const r = await c.query(`SELECT * FROM public.carteira_stats_por_corretor_v1()`);
      return (r.rows as Linha[]).find((l) => l.corretor_id === null);
    });
    expect(Number(s?.ativa)).toBe(3);
    expect(Number(s?.acima_do_teto)).toBe(0);
  });
});

describe("os prazos saem na resposta", () => {
  it("a lista da tela filtra com os mesmos 7/30 que a contagem usou", async () => {
    // Sem isso a tela fixaria 7/30 no cliente e passaria a existir um segundo
    // lugar guardando o prazo — a divergência que este repo documenta contra.
    const s = await stats(admin, corretor.id);
    expect(Number(s?.dias_atendimento)).toBe(7);
    expect(Number(s?.dias_avancado)).toBe(30);
  });
});

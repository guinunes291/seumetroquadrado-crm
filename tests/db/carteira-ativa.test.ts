/**
 * Carteira ativa (migration 20260913120000; teto 65 desde 20260913140000) —
 * o modo sombra da Fatia 3.
 *
 * O que está em jogo, na ordem em que quebraria a operação:
 *  - O FUNDO DO FUNIL NUNCA CAI NA RESERVA. É a regra §4.1 do documento e a
 *    que mais custa errar: o primeiro corte deste classificador devolvia os
 *    negócios avançados MAIS RECENTES quando o fundo sozinho estourava o
 *    teto — exatamente os recém-agendados. Quem estoura para de RECEBER; o
 *    fundo fica.
 *  - A precedência das faixas: fundo → resgate → conversa → sla. Um lead em
 *    análise parado há 80 dias vem antes de um lead novo de hoje.
 *  - A Reserva é o COMPLEMENTO EXATO da carteira ativa (nenhum lead vivo
 *    fica de fora das duas listas, nenhum aparece nas duas).
 *  - Escopo: corretor pedindo a carteira de outro recebe 42501, nunca uma
 *    lista vazia — lista vazia é indistinguível de "não tem nada".
 *  - A busca da Reserva acha o lead pelo telefone como o CLIENTE o manda,
 *    não como está no cadastro (a base tem o mesmo número em várias
 *    formatações).
 *  - O SLA mede desde a ENTREGA, não desde o nascimento do lead. Medido em
 *    produção em 13/09/2026: dos 142 leads entregues a corretores em 72 h,
 *    só 23 tinham nascido nesse período — 84% vêm do estoque de julho que a
 *    roleta escoa. Com o relógio errado, a faixa SLA ficava travada em zero
 *    e a trava por vaga da roleta nunca apertava.
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

type Linha = {
  lead_id: string;
  nome: string;
  faixa: string;
  posicao: number;
  ativa: boolean;
  motivo: string | null;
  dias_parado: number;
};

let corretor: UsuarioTeste;
let outro: UsuarioTeste;
let cheio: UsuarioTeste;
let leadFrio: string;

/** O classificador cru — as duas RPCs públicas são recortes desta linha. */
async function classificar(id: string): Promise<Linha[]> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT * FROM public._carteira_classificar($1)`, [id]);
  return r.rows as Linha[];
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);

  corretor = await criarUsuario(c, { nome: "Corretor Carteira", papel: "corretor" });
  outro = await criarUsuario(c, { nome: "Outro Carteira", papel: "corretor" });
  cheio = await criarUsuario(c, { nome: "Corretor Cheio", papel: "corretor" });

  await comoSuperuser(c);

  // Carteira pequena e legível: um de cada faixa, mais um que sobra.
  const fundo = await criarLead(c, { corretorId: corretor.id, status: "analise_credito" });
  await c.query(
    `UPDATE public.leads SET created_at = now() - interval '80 days',
                             ultima_interacao = now() - interval '80 days' WHERE id = $1`,
    [fundo],
  );
  const conversa = await criarLead(c, { corretorId: corretor.id, status: "em_atendimento" });
  await c.query(
    `UPDATE public.leads SET ultima_interacao = now() - interval '1 day',
                             proximo_followup = now() + interval '1 day' WHERE id = $1`,
    [conversa],
  );
  const novo = await criarLead(c, { corretorId: corretor.id, status: "aguardando_atendimento" });
  await c.query(`UPDATE public.leads SET created_at = now() - interval '2 hours' WHERE id = $1`, [
    novo,
  ]);
  // O frio: parado há 60 dias, telefone gravado com máscara.
  leadFrio = await criarLead(c, {
    corretorId: corretor.id,
    status: "em_atendimento",
    telefone: "(11) 94844-2250",
  });
  await c.query(
    `UPDATE public.leads SET created_at = now() - interval '60 days',
                             ultima_interacao = now() - interval '60 days' WHERE id = $1`,
    [leadFrio],
  );

  // O estouro do teto. Com o teto em 65 (13/09/2026) nenhum corretor REAL
  // estoura hoje pelo fundo — o maior medido é a graziele, com 53 —, então a
  // fixture usa 70 para continuar exercitando a regra: ela tem de valer
  // quando chegar a vez, não só enquanto os números ajudam. Mais 10 leads
  // novos que não têm onde entrar.
  for (let i = 1; i <= 70; i++) {
    const l = await criarLead(c, { corretorId: cheio.id, status: "analise_credito" });
    await c.query(
      `UPDATE public.leads SET created_at = now() - make_interval(days => $2),
                               ultima_interacao = now() - make_interval(days => $2) WHERE id = $1`,
      [l, i],
    );
  }
  for (let i = 1; i <= 10; i++) {
    const l = await criarLead(c, { corretorId: cheio.id, status: "aguardando_atendimento" });
    await c.query(`UPDATE public.leads SET created_at = now() - interval '1 hour' WHERE id = $1`, [
      l,
    ]);
  }

  await comoSuperuser(c);
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("carteira ativa — o SLA mede a entrega, não o nascimento", () => {
  it("lead nascido há 50 dias e entregue agora é SLA, não Reserva", async () => {
    const dono = await criarUsuario(c, { nome: "Corretor Estoque", papel: "corretor" });
    await comoSuperuser(c);
    const l = await criarLead(c, { corretorId: dono.id, status: "aguardando_atendimento" });
    // O caso real: veio da importação de julho, chegou na mesa há 2 horas.
    await c.query(
      `UPDATE public.leads
          SET created_at = now() - interval '50 days',
              data_distribuicao = now() - interval '2 hours'
        WHERE id = $1`,
      [l],
    );

    const linhas = await classificar(dono.id);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].faixa).toBe("sla");
    expect(linhas[0].ativa).toBe(true);
  });

  it("entregue há 5 dias já saiu da janela do SLA e cai na Reserva", async () => {
    const dono = await criarUsuario(c, { nome: "Corretor Estoque Velho", papel: "corretor" });
    await comoSuperuser(c);
    const l = await criarLead(c, { corretorId: dono.id, status: "aguardando_atendimento" });
    await c.query(
      `UPDATE public.leads
          SET created_at = now() - interval '50 days',
              data_distribuicao = now() - interval '5 days'
        WHERE id = $1`,
      [l],
    );

    const linhas = await classificar(dono.id);
    expect(linhas[0].faixa).toBe("reserva");
    expect(linhas[0].ativa).toBe(false);
  });

  it("a vaga de ENTRADA volta a apertar: enche a faixa SLA e ela fecha", async () => {
    const dono = await criarUsuario(c, { nome: "Corretor SLA Cheio", papel: "corretor" });
    await comoSuperuser(c);
    // cap_sla = 20. Vinte e cinco leads do estoque entregues agora.
    for (let i = 1; i <= 25; i++) {
      const l = await criarLead(c, { corretorId: dono.id, status: "aguardando_atendimento" });
      await c.query(
        `UPDATE public.leads
            SET created_at = now() - interval '50 days',
                data_distribuicao = now() - make_interval(mins => $2)
          WHERE id = $1`,
        [l, i],
      );
    }

    const vagas = await c.query(`SELECT public.carteira_vagas_entrada_v1($1)::int AS v`, [dono.id]);
    // Antes da correção isto devolvia 20 para sempre — a roleta nunca parava.
    expect(vagas.rows[0].v).toBe(0);

    const linhas = await classificar(dono.id);
    expect(linhas.filter((l) => l.faixa === "sla" && l.ativa)).toHaveLength(20);
    expect(linhas.filter((l) => !l.ativa && l.motivo === "faixa cheia (sla)")).toHaveLength(5);
  });
});

describe("carteira ativa — faixas e precedência", () => {
  it("ordena fundo → resgate → conversa → sla, e o fundo parado vem primeiro", async () => {
    const linhas = (await classificar(corretor.id))
      .filter((l) => l.ativa)
      .sort((a, b) => a.posicao - b.posicao);
    expect(linhas.map((l) => l.faixa)).toEqual(["fundo", "conversa", "sla"]);
    expect(linhas[0].dias_parado).toBe(80);
  });

  it("o lead sem conversa viva fica na Reserva, com o motivo dito em texto", async () => {
    const fora = (await classificar(corretor.id)).filter((l) => !l.ativa);
    expect(fora).toHaveLength(1);
    expect(fora[0].lead_id).toBe(leadFrio);
    expect(fora[0].motivo).toBe("sem movimento há 60 dias");
  });

  it("a Reserva é o complemento exato da carteira ativa", async () => {
    await comoUsuario(c, corretor.id);
    const ativa = await c.query(`SELECT lead_id FROM public.carteira_ativa_v1()`);
    const reserva = await c.query(`SELECT lead_id FROM public.carteira_reserva_v1()`);
    await comoSuperuser(c);
    const vivos = await c.query(
      `SELECT count(*)::int AS n FROM public.leads
        WHERE corretor_id = $1 AND deleted_at IS NULL AND na_lixeira = false
          AND status NOT IN ('perdido','contrato_fechado','pos_venda')`,
      [corretor.id],
    );
    const ids = new Set([
      ...ativa.rows.map((r) => r.lead_id),
      ...reserva.rows.map((r) => r.lead_id),
    ]);
    expect(ativa.rows.length + reserva.rows.length).toBe(vivos.rows[0].n);
    expect(ids.size).toBe(vivos.rows[0].n); // nenhum lead nas duas listas
  });
});

describe("carteira ativa — o fundo nunca é o excedente", () => {
  it("70 leads no fundo com teto 65: todos os 70 seguem na carteira", async () => {
    const linhas = await classificar(cheio.id);
    const fundo = linhas.filter((l) => l.faixa === "fundo");
    expect(fundo).toHaveLength(70);
    expect(fundo.filter((l) => !l.ativa)).toHaveLength(0);
  });

  it("com o fundo estourado o corretor para de RECEBER: zero vagas e nenhum novo entra", async () => {
    await comoSuperuser(c);
    const vagas = await c.query(`SELECT public.carteira_vagas_v1($1)::int AS v`, [cheio.id]);
    expect(vagas.rows[0].v).toBe(0);

    const linhas = await classificar(cheio.id);
    const sla = linhas.filter((l) => l.faixa === "sla");
    expect(sla).toHaveLength(10);
    expect(sla.every((l) => !l.ativa)).toBe(true);
    expect(sla.every((l) => l.motivo === "acima do teto de 65")).toBe(true);
  });
});

describe("carteira ativa — resgate (a faixa B)", () => {
  it("resgatar traz o lead da Reserva para a carteira, logo abaixo do fundo", async () => {
    await comoUsuario(c, corretor.id);
    const r = await c.query(`SELECT public.carteira_resgatar($1) AS out`, [leadFrio]);
    expect(r.rows[0].out.ok).toBe(true);

    const ativa = await c.query(
      `SELECT lead_id, faixa, posicao FROM public.carteira_ativa_v1() ORDER BY posicao`,
    );
    await comoSuperuser(c);
    const resgatado = ativa.rows.find((l) => l.lead_id === leadFrio);
    expect(resgatado?.faixa).toBe("resgate");
    expect(resgatado?.posicao).toBe(2); // depois do fundo, antes de conversa e sla
  });

  it("soltar devolve o lead para a Reserva", async () => {
    await comoUsuario(c, corretor.id);
    await c.query(`SELECT public.carteira_soltar($1)`, [leadFrio]);
    const reserva = await c.query(`SELECT lead_id FROM public.carteira_reserva_v1()`);
    await comoSuperuser(c);
    expect(reserva.rows.map((r) => r.lead_id)).toContain(leadFrio);
  });

  it("resgatar lead de outro corretor é 42501 — o resgate é para a própria carteira", async () => {
    await comoUsuario(c, outro.id);
    const code = await errCode(c.query(`SELECT public.carteira_resgatar($1)`, [leadFrio]));
    await comoSuperuser(c);
    expect(code).toBe("42501");
  });
});

describe("carteira ativa — escopo e busca", () => {
  it("corretor pedindo a carteira de outro recebe 42501, nunca lista vazia", async () => {
    await comoUsuario(c, corretor.id);
    const code = await errCode(c.query(`SELECT * FROM public.carteira_ativa_v1($1)`, [cheio.id]));
    await comoSuperuser(c);
    expect(code).toBe("42501");
  });

  it("a Reserva acha pelo telefone como o cliente manda, não como está no cadastro", async () => {
    await comoUsuario(c, corretor.id);
    // Cadastrado como "(11) 94844-2250"; o corretor digita só os dígitos.
    const r = await c.query(`SELECT lead_id, total FROM public.carteira_reserva_v1(NULL, $1)`, [
      "11948442250",
    ]);
    await comoSuperuser(c);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].lead_id).toBe(leadFrio);
  });

  it("busca sem dígitos não vira LIKE '%%' e não devolve a base inteira", async () => {
    await comoUsuario(c, corretor.id);
    const r = await c.query(`SELECT lead_id FROM public.carteira_reserva_v1(NULL, $1)`, [
      "zzz-inexistente",
    ]);
    await comoSuperuser(c);
    expect(r.rows).toHaveLength(0);
  });
});

describe("carteira ativa — sombra do gestor", () => {
  it("corretor recebe 42501 (ver a carteira parada dos colegas é assunto da gestão)", async () => {
    await comoUsuario(c, corretor.id);
    const code = await errCode(c.query(`SELECT * FROM public.carteira_sombra_v1()`));
    await comoSuperuser(c);
    expect(code).toBe("42501");
  });

  it("admin vê a linha de quem estourou, com o excedente que NÃO foi devolvido", async () => {
    const admin = await criarUsuario(c, { nome: "Admin Carteira", papel: "admin" });
    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT * FROM public.carteira_sombra_v1()`);
    await comoSuperuser(c);
    const linha = r.rows.find((l) => l.corretor_id === cheio.id);
    expect(linha).toBeDefined();
    expect(linha.teto).toBe(65);
    expect(linha.fundo).toBe(70);
    expect(linha.ativa).toBe(70); // o fundo inteiro segue na carteira
    expect(linha.reserva).toBe(10); // os novos que não couberam
  });
});

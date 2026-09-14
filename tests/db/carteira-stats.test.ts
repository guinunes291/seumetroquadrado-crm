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
  prospeccao: string;
  parada: string;
  fundo: string;
  ganhos: string;
  perdidos: string;
};

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
  // O banco exige `motivo_perda_categoria` para nascer perdido; cria vivo e
  // transiciona com os triggers desligados, como a suíte já faz em outros casos.
  const perdido = await criarLead(c, {
    nome: "Perdido",
    corretorId: corretor.id,
    status: "em_atendimento",
  });

  await comoSuperuser(c);
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
    [emTratativa, fundoRecente],
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

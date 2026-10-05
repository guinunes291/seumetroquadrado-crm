/**
 * REGRA DOS 65 — Fatia 4: a revisão mensal (migration 20261010121100).
 *
 *  1. TOQUE É CONTATO REAL, o mesmo recorte da regra: interação que entra ou
 *     que sai com autor, mensagem do cliente ou do corretor, chamada feita.
 *     Mudança de status, nota, mensagem do bot e chamada falha não contam.
 *  2. UMA CONVERSA É UM TOQUE: toques a menos de `revisao_conversa_min` do
 *     anterior fundem; a espera vai do fim de uma conversa ao começo da
 *     seguinte. A mediana é dessas esperas.
 *  3. SÓ ENQUANTO O LEAD ESTEVE EM ATENDIMENTO: toque depois da saída não
 *     conta; lead que entrou antes do mês e segue nos 65 conta como "nos 65".
 *  4. A SAFRA é por mês de entrada: agendou = a saída foi para o fundo;
 *     em aberto = ainda não saiu.
 *  5. MOVIMENTOS da regra ligada e trocas no mês; sombra, desfeito e "fica
 *     com alerta" não contam.
 *  6. A LINHA DA CASA agrega o escopo: admin vê todos, gestor só a equipe;
 *     corretor e anon não leem.
 *  7. O RELÓGIO É O DA REGRA: o último toque desta lista é o `movimento` que
 *     `em_atendimento_sombra_leads_v2` dá ao mesmo lead.
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
let gestor: UsuarioTeste;
let ana: UsuarioTeste;
let bia: UsuarioTeste;
let caio: UsuarioTeste;
/** Início do mês passado (calendário de America/Sao_Paulo), ISO. */
let M0: string;
let mesPassado: string;
let mesAtual: string;
const L: Record<string, string> = {};
const D = 24;

async function comoAnon() {
  await c.query(`RESET ROLE`);
  await c.query(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', false)`);
  await c.query(`SET ROLE anon`);
}

async function cfg(mudar: Record<string, unknown>) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.gestao_config SET valor = valor || $1::jsonb WHERE chave = 'em_atendimento'`,
    [JSON.stringify(mudar)],
  );
}

/** Transição registrada em `M0 + horas`. */
async function transicao(
  lead: string,
  corretor: string,
  de: string | null,
  para: string,
  horas: number,
) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, created_at)
     VALUES ($1, $2, $3::public.lead_status, $4::public.lead_status,
             $5::timestamptz + make_interval(mins => $6::int))`,
    [lead, corretor, de, para, M0, Math.round(horas * 60)],
  );
}

/** Interação em `M0 + horas`; por padrão WhatsApp enviado pela Ana. */
async function interacao(
  lead: string,
  horas: number,
  o: { autor?: string | null; tipo?: string; direcao?: string } = {},
) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, conteudo, ocorreu_em)
     VALUES ($1, $2, $3::public.interacao_tipo, $4::public.interacao_direcao, 'teste',
             $5::timestamptz + make_interval(mins => $6::int))`,
    [
      lead,
      o.autor === undefined ? ana.id : o.autor,
      o.tipo ?? "whatsapp",
      o.direcao ?? "saida",
      M0,
      Math.round(horas * 60),
    ],
  );
}

type Linha = {
  mes: string;
  casa: boolean;
  corretor_id: string | null;
  nome: string | null;
  dias: number;
  leads_65: number;
  leads_tocados: number;
  toques: number;
  intervalos: number;
  mediana_horas: string | null;
  entraram: number;
  agendaram: number;
  em_aberto: number;
  taxa_agendado: string | null;
  perderam_vaga: number;
  sairam_base: number;
  trocas: number;
};

async function revisao(meses: number | null, quem: UsuarioTeste = admin): Promise<Linha[]> {
  await comoUsuario(c, quem.id);
  try {
    return (
      await c.query(
        `SELECT to_char(r.mes, 'YYYY-MM-DD') AS mes, r.casa, r.corretor_id, r.nome, r.dias,
                r.leads_65, r.leads_tocados, r.toques, r.intervalos, r.mediana_horas,
                r.entraram, r.agendaram, r.em_aberto, r.taxa_agendado,
                r.perderam_vaga, r.sairam_base, r.trocas
           FROM public.em_atendimento_revisao_v1($1) AS r`,
        [meses],
      )
    ).rows as Linha[];
  } finally {
    await comoSuperuser(c);
  }
}

const casa = (rows: Linha[], mes: string) => rows.find((r) => r.casa && r.mes === mes)!;
const de = (rows: Linha[], mes: string, u: UsuarioTeste) =>
  rows.find((r) => !r.casa && r.mes === mes && r.corretor_id === u.id);
const num = (s: string | null) => (s == null ? null : Number(s));

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  admin = await criarUsuario(c, { papel: "admin", nome: "Admin" });
  gestor = await criarUsuario(c, { papel: "gestor", nome: "Gestor" });
  const equipe = await criarEquipe(c, { gestorId: gestor.id });
  ana = await criarUsuario(c, { papel: "corretor", nome: "Ana", equipeId: equipe });
  bia = await criarUsuario(c, { papel: "corretor", nome: "Bia" });
  caio = await criarUsuario(c, { papel: "corretor", nome: "Caio" });

  await comoSuperuser(c);
  const m = (
    await c.query(
      `SELECT (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month')
                AT TIME ZONE 'America/Sao_Paulo' AS m0,
              to_char(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month', 'YYYY-MM-DD') AS passado,
              to_char(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS atual`,
    )
  ).rows[0];
  M0 = (m.m0 as Date).toISOString();
  mesPassado = m.passado;
  mesAtual = m.atual;

  // A: entrou no dia 1. Conversa 1 = três toques entre 24,0 h e 24,8 h; depois
  // conversas em 48 h, 58 h, 130 h e 226 h. Esperas (do FIM da conversa
  // anterior): 23,2 h · 10 h · 72 h · 96 h → mediana (23,2 + 72) / 2 = 47,6 h.
  L.a = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
  await transicao(L.a, ana.id, "novo", "em_atendimento", 1 * D);
  await interacao(L.a, 24.0);
  await interacao(L.a, 24.5, { tipo: "ligacao" });
  await interacao(L.a, 24.8, { tipo: "whatsapp", direcao: "entrada", autor: null });
  await interacao(L.a, 48);
  await interacao(L.a, 58);
  await interacao(L.a, 130);
  await interacao(L.a, 226);
  // No dia 3, só o que NÃO é toque: status, nota, saída automática, bot, falha.
  await interacao(L.a, 3 * D, { tipo: "mudanca_status", direcao: "interna", autor: null });
  await interacao(L.a, 3 * D, { tipo: "nota", direcao: "interna" });
  await interacao(L.a, 3 * D, { autor: null });
  await c.query(
    `INSERT INTO public.mensagens (lead_id, corretor_id, direcao, status, conteudo, recebida_em)
     VALUES ($1, NULL, 'saida', 'enviada', 'bot', $2::timestamptz + interval '3 days')`,
    [L.a, M0],
  );
  await c.query(
    `INSERT INTO public.chamadas (lead_id, corretor_id, direcao, status, numero, criado_em)
     VALUES ($1, $2, 'saida', 'falha', '11999990000', $3::timestamptz + interval '3 days')`,
    [L.a, ana.id, M0],
  );

  // B: em atendimento desde 10 dias antes do mês, sem toque algum.
  L.b = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
  await transicao(L.b, ana.id, "aguardando_retorno", "em_atendimento", -10 * D);

  // C: entrou no dia 5 (o cliente escreveu), saiu para Agendado no dia 15;
  // o toque do dia 16 é depois da saída e não conta.
  L.c = await criarLead(c, { corretorId: ana.id, status: "agendado" });
  await transicao(L.c, ana.id, "aguardando_retorno", "em_atendimento", 5 * D);
  await c.query(
    `INSERT INTO public.mensagens (lead_id, corretor_id, direcao, status, conteudo, recebida_em)
     VALUES ($1, NULL, 'entrada', 'recebida', 'oi', $2::timestamptz + interval '5 days')`,
    [L.c, M0],
  );
  await transicao(L.c, ana.id, "em_atendimento", "agendado", 15 * D);
  await interacao(L.c, 16 * D);

  // D: entrou no dia 8 e saiu para Aguardando retorno no dia 12.
  L.d = await criarLead(c, { corretorId: ana.id, status: "aguardando_retorno" });
  await transicao(L.d, ana.id, "novo", "em_atendimento", 8 * D);
  await transicao(L.d, ana.id, "em_atendimento", "aguardando_retorno", 12 * D);

  // E: entrou no dia 20 numa troca de vaga e segue em atendimento.
  L.e = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
  await transicao(L.e, ana.id, "novo", "em_atendimento", 20 * D);
  await c.query(
    `INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload, created_at) VALUES
       ($1, 'troca_em_atendimento', 'Entrou', 'trocar_vaga_em_atendimento',
        jsonb_build_object('papel', 'entra', 'alterado_por', $3::uuid), $4::timestamptz + interval '21 days'),
       ($2, 'troca_em_atendimento', 'Saiu', 'trocar_vaga_em_atendimento',
        jsonb_build_object('papel', 'sai', 'alterado_por', $3::uuid), $4::timestamptz + interval '21 days')`,
    [L.e, L.d, ana.id, M0],
  );

  // G: entrou no dia 3, saiu para Aguardando retorno no dia 6 e de LÁ foi
  // para Agendado no dia 20: não é "Em atendimento → Agendado".
  L.g = await criarLead(c, { corretorId: ana.id, status: "agendado" });
  await transicao(L.g, ana.id, "novo", "em_atendimento", 3 * D);
  await transicao(L.g, ana.id, "em_atendimento", "aguardando_retorno", 6 * D);
  await transicao(L.g, ana.id, "aguardando_retorno", "agendado", 20 * D);

  // H: entrou duas vezes no mês (dia 23 e dia 26): uma safra só, e a saída
  // que conta é a primeira (Aguardando retorno no dia 24).
  L.h = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
  await transicao(L.h, ana.id, "novo", "em_atendimento", 23 * D);
  await transicao(L.h, ana.id, "em_atendimento", "aguardando_retorno", 24 * D);
  await transicao(L.h, ana.id, "aguardando_retorno", "em_atendimento", 26 * D);

  // F (Bia, fora da equipe do gestor): entrou no dia 2 com um toque.
  L.f = await criarLead(c, { corretorId: bia.id, status: "em_atendimento" });
  await transicao(L.f, bia.id, "novo", "em_atendimento", 2 * D);
  await interacao(L.f, 2 * D, { autor: bia.id });

  // Movimentos da regra: só o aplicado, ligado e não desfeito conta.
  const exec = (
    await c.query(
      `INSERT INTO public.em_atendimento_execucoes (modo, gatilho) VALUES ('ligado', 'teste') RETURNING id`,
    )
  ).rows[0].id as string;
  await c.query(
    `INSERT INTO public.em_atendimento_movimentos
       (execucao_id, lead_id, corretor_id, acao, destino, modo, aplicado, created_at, desfeito_em)
     VALUES
       ($1, $2, $4, 'perde_vaga', 'minha_base', 'ligado', true,  $6::timestamptz + interval '10 days', NULL),
       ($1, $3, $4, 'sem_toque',  'bolsao',     'ligado', true,  $6::timestamptz + interval '11 days', NULL),
       ($1, $3, $4, 'sem_toque',  'bolsao',     'sombra', true,  $6::timestamptz + interval '11 days', NULL),
       ($1, $2, $4, 'perde_vaga', 'minha_base', 'ligado', true,  $6::timestamptz + interval '12 days', $6::timestamptz + interval '13 days'),
       ($1, $3, $4, 'sem_toque',  'fica_alerta_gestor', 'ligado', true, $6::timestamptz + interval '14 days', NULL),
       ($1, $3, $4, 'sem_toque',  'bolsao',     'ligado', false, $6::timestamptz + interval '14 days', NULL),
       ($1, $7, $5, 'excedente',  'minha_base', 'ligado', true,  $6::timestamptz + interval '4 days', NULL)`,
    [exec, L.a, L.b, ana.id, bia.id, M0, L.f],
  );
  // O relógio da casa não é o desta regra: `ultimo_contato` nulo força a
  // leitura pelos eventos, nos dois lados do contrato (item 7).
  await c.query(`UPDATE public.leads SET ultimo_contato = NULL, ultima_interacao = now()`);
});

afterAll(async () => {
  await comoSuperuser(c);
  await cfg({ revisao_conversa_min: 60 });
  await c.end();
});

describe("Fatia 4: a revisão mensal", () => {
  it("config: metas e janela de conversa com os defaults do desenho", async () => {
    await comoSuperuser(c);
    const v = (await c.query(`SELECT public.em_atendimento_config() AS c`)).rows[0].c;
    expect(v.revisao_toque_meta_horas).toBe(72);
    expect(v.revisao_agendado_meta_pct).toBe(70);
    expect(v.revisao_conversa_min).toBe(60);
  });

  it("mediana entre conversas nos 65: só contato real, só dentro do período, conversa fundida", async () => {
    const r = await revisao(2);
    const a = de(r, mesPassado, ana)!;
    expect(a).toBeDefined();
    expect(a.leads_65).toBe(7); // A, B, C, D, E, G, H
    expect(a.leads_tocados).toBe(2); // A e C (o cliente escreveu)
    expect(a.toques).toBe(6); // A: 5 conversas · C: 1
    expect(a.intervalos).toBe(4);
    expect(num(a.mediana_horas)).toBe(47.6);
  });

  it("safra do mês: entraram, agendaram, em aberto e a taxa", async () => {
    const r = await revisao(2);
    const a = de(r, mesPassado, ana)!;
    expect(a.entraram).toBe(6); // A, C, D, E, G, H (B entrou antes; H uma vez só)
    expect(a.agendaram).toBe(1); // C (G agendou de Aguardando retorno, não dos 65)
    expect(a.em_aberto).toBe(2); // A, E (H saiu antes de voltar)
    expect(num(a.taxa_agendado)).toBe(16.7);
  });

  it("movimentos da regra e trocas no mês", async () => {
    const r = await revisao(2);
    const a = de(r, mesPassado, ana)!;
    expect(a.perderam_vaga).toBe(1);
    expect(a.sairam_base).toBe(1);
    expect(a.trocas).toBe(1);
    const b = de(r, mesPassado, bia)!;
    expect(b.perderam_vaga).toBe(1);
    expect(b.sairam_base).toBe(0);
    expect(b.trocas).toBe(0);
  });

  it("a linha da casa agrega o escopo: admin vê todos; a mediana é das esperas, não das medianas", async () => {
    const r = await revisao(2);
    const h = casa(r, mesPassado);
    expect(h.corretor_id).toBeNull();
    expect(h.leads_65).toBe(8);
    expect(h.leads_tocados).toBe(3);
    expect(h.toques).toBe(7);
    expect(h.intervalos).toBe(4);
    expect(num(h.mediana_horas)).toBe(47.6);
    expect(h.entraram).toBe(7);
    expect(h.agendaram).toBe(1);
    expect(h.em_aberto).toBe(3);
    expect(num(h.taxa_agendado)).toBe(14.3);
    expect(h.perderam_vaga).toBe(2);
    expect(h.sairam_base).toBe(1);
    expect(h.trocas).toBe(1);
    // Bia tem linha própria; a Ana também.
    expect(de(r, mesPassado, bia)?.leads_65).toBe(1);
  });

  it("gestor vê só a equipe: a casa dele é a Ana, e a Bia não aparece", async () => {
    const r = await revisao(2, gestor);
    const h = casa(r, mesPassado);
    expect(h.leads_65).toBe(7);
    expect(h.entraram).toBe(6);
    expect(h.perderam_vaga).toBe(1);
    expect(de(r, mesPassado, bia)).toBeUndefined();
    expect(de(r, mesPassado, ana)?.toques).toBe(6);
  });

  it("os meses: N meses até o atual, dias decorridos no corrente, casa sempre presente", async () => {
    const r = await revisao(2);
    const meses = [...new Set(r.map((x) => x.mes))].sort();
    expect(meses).toEqual([mesPassado, mesAtual]);
    const atual = casa(r, mesAtual);
    await comoSuperuser(c);
    const hoje = (
      await c.query(`SELECT EXTRACT(day FROM now() AT TIME ZONE 'America/Sao_Paulo')::int AS d`)
    ).rows[0].d;
    expect(atual.dias).toBe(hoje);
    // Quem segue em atendimento está "nos 65" também neste mês; nada mais.
    expect(atual.leads_65).toBe(5); // A, B, E, H, F
    expect(atual.toques).toBe(0);
    expect(atual.entraram).toBe(0);
    expect(atual.taxa_agendado).toBeNull();
    const passado = casa(r, mesPassado);
    const diasDoMes = (
      await c.query(
        `SELECT EXTRACT(day FROM ($1::date + interval '1 month' - interval '1 day'))::int AS d`,
        [mesPassado],
      )
    ).rows[0].d;
    expect(passado.dias).toBe(diasDoMes);
    expect([...new Set((await revisao(1)).map((x) => x.mes))]).toEqual([mesAtual]);
    expect([...new Set((await revisao(null)).map((x) => x.mes))]).toHaveLength(6);
    expect([...new Set((await revisao(0)).map((x) => x.mes))]).toEqual([mesAtual]);
  });

  it("a janela de conversa vem da config: com 5 min, cada toque do dia 1 vira conversa própria", async () => {
    await cfg({ revisao_conversa_min: 5 });
    try {
      const a = de(await revisao(2), mesPassado, ana)!;
      expect(a.toques).toBe(8); // A: 7 · C: 1
      expect(a.intervalos).toBe(6); // 0,5 · 0,3 · 23,2 · 10 · 72 · 96
      expect(num(a.mediana_horas)).toBe(16.6);
    } finally {
      await cfg({ revisao_conversa_min: 60 });
    }
  });

  it("contrato com a regra: o último toque desta lista é o `movimento` da simulação", async () => {
    await comoSuperuser(c);
    const toques = (
      await c.query(
        `SELECT max(em) AS ultimo FROM public._em_atendimento_toques($1, '-infinity', now())`,
        [L.a],
      )
    ).rows[0].ultimo as Date;
    expect(toques.toISOString()).toBe(
      new Date(new Date(M0).getTime() + 226 * 3600_000).toISOString(),
    );
    await comoUsuario(c, admin.id);
    const sim = (
      await c.query(
        `SELECT movimento FROM public.em_atendimento_sombra_leads_v2($1, 'em_atendimento') WHERE lead_id = $2`,
        [ana.id, L.a],
      )
    ).rows[0];
    await comoSuperuser(c);
    expect((sim.movimento as Date).toISOString()).toBe(toques.toISOString());
  });

  it("acesso: anon e corretor não leem; a lista de toques não tem grant", async () => {
    await comoAnon();
    expect(
      await errCode(c.query(`SELECT * FROM public.em_atendimento_revisao_v1(2)`)),
    ).not.toBeNull();
    await comoSuperuser(c);
    await comoUsuario(c, caio.id);
    expect(await errCode(c.query(`SELECT * FROM public.em_atendimento_revisao_v1(2)`))).toBe(
      "42501",
    );
    await comoUsuario(c, ana.id);
    expect(await errCode(c.query(`SELECT * FROM public.em_atendimento_revisao_v1(2)`))).toBe(
      "42501",
    );
    expect(
      await errCode(
        c.query(`SELECT * FROM public._em_atendimento_toques($1, '-infinity', now())`, [L.a]),
      ),
    ).toBe("42501");
    await comoSuperuser(c);
  });
});

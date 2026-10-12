/**
 * Roletas por zona — a fila de cada roleta e a posição de cada corretor
 * (migration 20261015120000).
 *
 * Pedido do dono (11/10/2026): "a roleta será apenas para o SDR e os
 * corretores vendo em qual posição da fila estão. Por fila de zona." O SDR vê
 * todas as roletas da zona com nomes; o corretor vê só a própria posição.
 *
 * A previsão não decide nada: lê o estado de cada motor. Então a prova é
 * sempre a mesma — a fila prevista ANTES bate com a ordem em que o motor real
 * entrega os leads DEPOIS:
 *   1. roleta de filial (rodízio "há mais tempo sem receber"), só com
 *      presença — desde as roletas por filial (20261018120000), a roleta da
 *      zona é a da filial que a atende;
 *   2. Agendados do SDR com a regra semanal (ponderado pelo peso da semana);
 *   3. campanha de equipe fixa (ponderado por faixa A/B/C), a equipe inteira,
 *      de qualquer zona (decisão do dono, 12/10/2026); campanha comum manda o
 *      lead com zona para a filial da zona;
 *   4. Marquinhos filtrado pela zona; zona sem ninguém do time do SDR mostra a
 *      reserva (time da filial da vez pela régua do SDR, sem presença);
 *   5. acesso: SDR e gestão veem nomes; corretor só a própria posição; ler a
 *      fila não mexe em cursor nenhum.
 *
 * Elenco (corretores com telefone):
 *   Lara, Leo, Lia — Liberdade (Centro e Leste), presentes;
 *   Luca — Liberdade, ausente
 *   Otto — Barra Funda (Oeste, Norte e Sul), presente
 *   Gil — Belém (Leste e Grande SP), ausente: a Belém não tem ninguém apto,
 *         então o lead da Leste vai sempre para a Liberdade
 *   Sem — sem região
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  darRegiao,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

type Pessoa = { posicao?: number; corretor_id: string; nome: string; motivos?: string[] };
type FilaRoleta = {
  slug: string;
  nome: string;
  papel: "sdr" | "zona" | "marquinhos" | "campanha";
  mecanica: string;
  da_vez?: boolean;
  segue_zona: boolean;
  fila: Pessoa[];
  fora: Pessoa[];
  reserva?: { slug: string; fila: Pessoa[] };
};
type Filas = { zona: string | null; zonas: string[]; roletas: FilaRoleta[] };
type MinhaPosicao = {
  slug: string;
  papel: string;
  zona: string | null;
  posicao: number | null;
  total: number;
  apto: boolean;
  motivos: string[];
};

const c = novoClient();
const settingsAntes = new Map<string, unknown>();
const roletasCriadas: string[] = [];

let admin: UsuarioTeste;
let sdr: UsuarioTeste;
let lara: UsuarioTeste;
let leo: UsuarioTeste;
let lia: UsuarioTeste;
let luca: UsuarioTeste;
let otto: UsuarioTeste;
let gil: UsuarioTeste;
let sem: UsuarioTeste;

const DIA = 24 * 60 * 60 * 1000;
let horario = 0;
const proximoHorario = () =>
  new Date(Date.now() + 3 * DIA + ++horario * 3 * 60 * 60 * 1000).toISOString();
let tel = 0;
const novoTelefone = () => `1196${String(2000000 + ++tel).slice(-7)}`;

async function setSetting(chave: string, valor: unknown) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.distribuicao_settings (chave, valor) VALUES ($1, $2::jsonb)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [chave, JSON.stringify(valor)],
  );
}

async function checkin(u: UsuarioTeste) {
  await comoUsuario(c, u.id);
  await c.query(`SELECT public.presenca_checkin('loja', 'barra-funda')`);
  await comoSuperuser(c);
}

async function filas(u: UsuarioTeste, zona: string | null): Promise<Filas> {
  await comoUsuario(c, u.id);
  try {
    return (await c.query(`SELECT public.roletas_filas_zona_v1($1) AS r`, [zona])).rows[0]
      .r as Filas;
  } finally {
    await comoSuperuser(c);
  }
}

async function minhas(u: UsuarioTeste): Promise<MinhaPosicao[]> {
  await comoUsuario(c, u.id);
  try {
    return (await c.query(`SELECT public.minhas_posicoes_roletas_v1() AS r`)).rows[0]
      .r as MinhaPosicao[];
  } finally {
    await comoSuperuser(c);
  }
}

function roleta(f: Filas, slug: string): FilaRoleta {
  const r = f.roletas.find((x) => x.slug === slug);
  if (!r) throw new Error(`roleta ${slug} fora da resposta`);
  return r;
}

const ids = (xs: Pessoa[]) => xs.map((x) => x.corretor_id);

async function roletaId(slug: string): Promise<string> {
  await comoSuperuser(c);
  return (await c.query(`SELECT id FROM public.roletas WHERE slug = $1`, [slug])).rows[0]
    .id as string;
}

async function participar(
  slug: string,
  u: UsuarioTeste,
  extra: { tier?: string; ultimoHaHoras?: number | null; incluidoHaHoras?: number } = {},
) {
  const rid = await roletaId(slug);
  await c.query(
    `INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, tier, ultimo_lead_em, incluido_em)
     VALUES ($1, $2, true, COALESCE($3, 'B'),
             CASE WHEN $4::int IS NULL THEN NULL ELSE now() - make_interval(hours => $4::int) END,
             now() - make_interval(hours => COALESCE($5::int, 0)))
     ON CONFLICT (roleta_id, corretor_id) DO UPDATE
       SET ativo = true, tier = EXCLUDED.tier, ultimo_lead_em = EXCLUDED.ultimo_lead_em,
           incluido_em = EXCLUDED.incluido_em`,
    [rid, u.id, extra.tier ?? null, extra.ultimoHaHoras ?? null, extra.incluidoHaHoras ?? null],
  );
}

async function leadComZona(zona: string | null): Promise<string> {
  const id = await criarLead(c, { telefone: novoTelefone() });
  await comoSuperuser(c);
  await c.query(`UPDATE public.leads SET zona = $2 WHERE id = $1`, [id, zona]);
  return id;
}

async function dono(leadId: string): Promise<string | null> {
  await comoSuperuser(c);
  return (await c.query(`SELECT corretor_id FROM public.leads WHERE id = $1`, [leadId])).rows[0]
    .corretor_id as string | null;
}

async function cursores() {
  await comoSuperuser(c);
  return (
    await c.query(
      `SELECT roleta_id, corretor_id, ultimo_lead_em, wrr_current
         FROM public.roleta_participantes ORDER BY roleta_id, corretor_id`,
    )
  ).rows;
}

/** A ordem da PRIMEIRA vez de cada um numa sequência de vencedores. */
function primeiraVez(vencedores: (string | null)[]): string[] {
  const out: string[] = [];
  for (const v of vencedores) if (v && !out.includes(v)) out.push(v);
  return out;
}

async function criarRoleta(slug: string, nome: string, extra: { equipeFixa: boolean }) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.roletas (slug, nome, tipo, equipe_fixa, ativo)
     VALUES ($1, $2, 'campanha', $3, true)`,
    [slug, nome, extra.equipeFixa],
  );
  roletasCriadas.push(slug);
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  await comoSuperuser(c);
  for (const chave of [
    "zona_estrita",
    "modelo_v2_ativo",
    "percentual_minimo_trabalhado",
    "sdr_ativo",
    "roleta_sdr_regra_ativa",
    "roleta_sdr_modo_sombra",
  ]) {
    const r = await c.query(`SELECT valor FROM public.distribuicao_settings WHERE chave = $1`, [
      chave,
    ]);
    settingsAntes.set(chave, r.rows[0]?.valor);
  }
  await setSetting("zona_estrita", true);
  await setSetting("modelo_v2_ativo", false);
  await setSetting("percentual_minimo_trabalhado", 0);
  await setSetting("sdr_ativo", true);

  admin = await criarUsuario(c, { nome: "Ada Admin", papel: "admin" });
  sdr = await criarUsuario(c, { nome: "Sara SDR", papel: "sdr" });
  lara = await criarUsuario(c, { nome: "Lara Leste" });
  leo = await criarUsuario(c, { nome: "Leo Leste" });
  lia = await criarUsuario(c, { nome: "Lia Leste" });
  luca = await criarUsuario(c, { nome: "Luca Leste" });
  otto = await criarUsuario(c, { nome: "Otto Oeste" });
  gil = await criarUsuario(c, { nome: "Gil Grande SP" });
  sem = await criarUsuario(c, { nome: "Sem Regiao" });

  await comoSuperuser(c);
  for (const [i, u] of [lara, leo, lia, luca, otto, gil, sem].entries()) {
    await c.query(`UPDATE public.profiles SET telefone = $2, ativo = true WHERE id = $1`, [
      u.id,
      `119555500${String(i).padStart(2, "0")}`,
    ]);
  }
  // darRegiao(["Leste"]) poria nas duas filiais da Leste; aqui o time da
  // Leste que importa é o da Liberdade.
  for (const u of [lara, leo, lia, luca]) await darRegiao(c, u.id, ["Centro"]);
  await darRegiao(c, otto.id, ["Oeste"]);
  await darRegiao(c, gil.id, ["Grande SP"]);
  for (const u of [lara, leo, lia, otto]) await checkin(u);
});

afterAll(async () => {
  await comoSuperuser(c);
  for (const [chave, valor] of settingsAntes) {
    if (valor === undefined) {
      await c.query(`DELETE FROM public.distribuicao_settings WHERE chave = $1`, [chave]);
    } else {
      await c.query(`UPDATE public.distribuicao_settings SET valor = $2::jsonb WHERE chave = $1`, [
        chave,
        JSON.stringify(valor),
      ]);
    }
  }
  await c.query(`DELETE FROM public.roleta_sdr_apuracoes`);
  await c.query(`DELETE FROM public.roleta_participantes`);
  if (roletasCriadas.length > 0) {
    await c.query(`DELETE FROM public.roletas WHERE slug = ANY($1::text[])`, [roletasCriadas]);
  }
  await c.end();
});

describe("roleta de filial (rodízio, com presença)", () => {
  it("a fila prevista é a ordem em que o motor entrega", async () => {
    // Leo nunca recebeu (vai primeiro), Lia há 5h, Lara há 3h.
    await participar("filial-liberdade", leo, { ultimoHaHoras: null });
    await participar("filial-liberdade", lia, { ultimoHaHoras: 5 });
    await participar("filial-liberdade", lara, { ultimoHaHoras: 3 });

    const f = await filas(sdr, "Leste");
    const zona = roleta(f, "filial-liberdade");
    expect(zona.papel).toBe("zona");
    expect(zona.mecanica).toBe("rodizio");
    expect(zona.da_vez).toBe(true);
    expect(ids(zona.fila)).toEqual([leo.id, lia.id, lara.id]);
    expect(zona.fila.map((p) => p.posicao)).toEqual([1, 2, 3]);
    // Luca não fez check-in: fora da fila, com o motivo.
    expect(zona.fora).toEqual([
      expect.objectContaining({ corretor_id: luca.id, motivos: ["ausente_hoje"] }),
    ]);
    // A outra filial da Leste: só o Gil, ausente — não é a da vez.
    const belem = roleta(f, "filial-belem");
    expect(belem.da_vez).toBe(false);
    expect(belem.fila).toEqual([]);
    expect(ids(belem.fora)).toEqual([gil.id]);

    const vencedores = [];
    for (let i = 0; i < 3; i++) {
      const id = await leadComZona("Leste");
      await comoSuperuser(c);
      await c.query(`SELECT public.triar_e_distribuir_lead($1::uuid, 'teste')`, [id]);
      vencedores.push(await dono(id));
    }
    expect(vencedores).toEqual([leo.id, lia.id, lara.id]);

    // Depois das entregas, a fila gira: Leo recebeu primeiro, volta primeiro.
    expect(ids(roleta(await filas(sdr, "Leste"), "filial-liberdade").fila)).toEqual([
      leo.id,
      lia.id,
      lara.id,
    ]);
  });
});

describe("Agendados do SDR (regra semanal, ponderado)", () => {
  it("a fila da zona é a ordem da primeira vez de cada um no motor do SDR", async () => {
    await setSetting("roleta_sdr_regra_ativa", true);
    await setSetting("roleta_sdr_modo_sombra", false);
    // Pesos da semana aplicada: Lara e Lia peso cheio (2), Leo peso menor (1).
    await comoSuperuser(c);
    for (const [u, resultado, peso] of [
      [lara, "apto_meta", 2],
      [leo, "apto_complemento", 1],
      [lia, "apto_meta", 2],
    ] as const) {
      await c.query(
        `INSERT INTO public.roleta_sdr_apuracoes
           (semana_inicio, semana_fim, corretor_id, resultado, sombra, aplicado_em, peso_rodizio)
         VALUES ('2026-10-03', '2026-10-09', $1, $2, false, now(), $3)`,
        [u.id, resultado, peso],
      );
    }
    await participar("agendados-sdr", lara, { incluidoHaHoras: 3 });
    await participar("agendados-sdr", leo, { incluidoHaHoras: 2 });
    await participar("agendados-sdr", lia, { incluidoHaHoras: 1 });
    await participar("agendados-sdr", otto, { incluidoHaHoras: 4 });

    const f = await filas(sdr, "Leste");
    const fila = roleta(f, "agendados-sdr");
    expect(fila.papel).toBe("sdr");
    expect(fila.mecanica).toBe("ponderado_semana");
    // Otto é do Oeste: não está na fila do Leste.
    expect(ids(fila.fila)).not.toContain(otto.id);
    expect(fila.fila).toHaveLength(3);
    const prevista = ids(fila.fila);

    // Uma volta inteira do ponderado (soma dos pesos = 5) põe todos na vez.
    const vencedores: (string | null)[] = [];
    for (let i = 0; i < 5; i++) {
      await comoUsuario(c, sdr.id);
      const res = (
        await c.query(`SELECT public.sdr_passar_cliente($1::jsonb) AS res`, [
          JSON.stringify({
            modo: "visita",
            nome: `Cliente SDR ${i}`,
            telefone: novoTelefone(),
            renda: "3.200",
            tipo_renda: "CLT",
            fgts: "sim",
            decisor: "Sozinho",
            restricao_cpf: "nao",
            zona: "Leste",
            local: "Estande Penha",
            inicio: proximoHorario(),
          }),
        ])
      ).rows[0].res as { corretor_id: string; regra: string };
      await comoSuperuser(c);
      expect(res.regra).toBe("roleta_sdr");
      vencedores.push(res.corretor_id);
    }
    expect(primeiraVez(vencedores)).toEqual(prevista);
    // Peso cheio recebe duas vezes na volta; peso menor, uma.
    expect(vencedores.filter((v) => v === leo.id)).toHaveLength(1);
  });

  it("zona sem ninguém do time do SDR: mostra a reserva (time da zona, sem presença)", async () => {
    const f = await filas(sdr, "Grande SP");
    const fila = roleta(f, "agendados-sdr");
    expect(fila.fila).toEqual([]);
    // Gil não fez check-in e está na reserva: a visita do SDR não pede presença.
    expect(fila.reserva?.slug).toBe("filial-belem");
    expect(ids(fila.reserva?.fila ?? [])).toEqual([gil.id]);
  });
});

describe("campanhas (Facebook Ads)", () => {
  // Decisão do dono (12/10/2026): a campanha de equipe fixa manda — a equipe
  // inteira recebe, de qualquer zona (acabou o corte por zona de 03/10).
  it("equipe fixa: ponderado por faixa entre toda a equipe, mesmo quem não atende a zona", async () => {
    await criarRoleta("teste-fila-equipe", "Teste Equipe Fixa", { equipeFixa: true });
    await participar("teste-fila-equipe", lara, { tier: "C" });
    await participar("teste-fila-equipe", leo, { tier: "A" });
    await participar("teste-fila-equipe", lia, { tier: "B" });
    await participar("teste-fila-equipe", otto, { tier: "A" });

    const f = await filas(sdr, "Leste");
    const camp = roleta(f, "teste-fila-equipe");
    expect(camp.papel).toBe("campanha");
    expect(camp.mecanica).toBe("ponderado_faixa");
    // Otto é da Barra Funda e está na fila do lead da Leste.
    expect(ids(camp.fila).sort()).toEqual([lara.id, leo.id, lia.id, otto.id].sort());
    const prevista = ids(camp.fila);
    // Faixa A (peso 3) é a primeira da vez (Leo e Otto: desempate pelo id).
    expect([leo.id, otto.id]).toContain(prevista[0]);

    const vencedores: (string | null)[] = [];
    for (let i = 0; i < 6; i++) {
      const id = await leadComZona("Leste");
      await comoSuperuser(c);
      const r = (
        await c.query(
          `SELECT public.distribuir_lead_ponderado($1::uuid, 'teste-fila-equipe') AS r`,
          [id],
        )
      ).rows[0].r as { corretor_id: string };
      vencedores.push(r.corretor_id);
    }
    expect(primeiraVez(vencedores)).toEqual(prevista);
    expect(vencedores).toContain(otto.id);
  });

  it("campanha comum: lead com zona segue a roleta da zona; a fila dela é só a de lead sem zona", async () => {
    await criarRoleta("teste-fila-comum", "Teste Campanha Comum", { equipeFixa: false });
    await participar("teste-fila-comum", lara, { tier: "B" });
    await participar("teste-fila-comum", otto, { tier: "B" });

    const leste = await filas(sdr, "Leste");
    expect(leste.roletas.map((r) => r.slug)).not.toContain("teste-fila-comum");

    const semZona = await filas(sdr, null);
    const camp = roleta(semZona, "teste-fila-comum");
    expect(ids(camp.fila).sort()).toEqual([lara.id, otto.id].sort());
    // Sem zona não há fila do SDR (a passagem exige zona) nem roleta de zona.
    expect(semZona.roletas.map((r) => r.papel)).not.toContain("sdr");
    expect(semZona.roletas.map((r) => r.papel)).not.toContain("zona");
  });
});

describe("Marquinhos", () => {
  it("a fila da zona tem só quem da Marquinhos atende a zona", async () => {
    await participar("marquinhos", lara, { ultimoHaHoras: 2 });
    await participar("marquinhos", otto, { ultimoHaHoras: 9 });

    expect(ids(roleta(await filas(sdr, "Leste"), "marquinhos").fila)).toEqual([lara.id]);
    expect(ids(roleta(await filas(sdr, "Oeste"), "marquinhos").fila)).toEqual([otto.id]);
    // Lead sem zona: a Marquinhos inteira, há mais tempo sem receber primeiro.
    expect(ids(roleta(await filas(sdr, null), "marquinhos").fila)).toEqual([otto.id, lara.id]);
  });
});

describe("acesso e leitura", () => {
  it("SDR e gestão veem as filas; corretor não", async () => {
    expect((await filas(admin, "Leste")).roletas.length).toBeGreaterThan(0);
    await comoUsuario(c, lara.id);
    expect(await errCode(c.query(`SELECT public.roletas_filas_zona_v1('Leste')`))).toBe("42501");
    await comoUsuario(c, sdr.id);
    expect(await errCode(c.query(`SELECT public.roletas_filas_zona_v1('Marte')`))).toBe("22023");
    await comoSuperuser(c);
  });

  it("o corretor vê a própria posição em cada fila, igual à do SDR, sem nomes de colegas", async () => {
    const f = await filas(sdr, "Leste");
    const minhasLia = await minhas(lia);

    // A roleta de filial e a campanha são uma fila só para o corretor (zona
    // null); a do SDR, uma por zona que ele atende.
    for (const [slug, zona] of [
      ["filial-liberdade", null],
      ["agendados-sdr", "Leste"],
      ["teste-fila-equipe", null],
    ] as const) {
      const linha = minhasLia.find((m) => m.slug === slug && m.zona === zona);
      const r = roleta(f, slug);
      const esperada = r.fila.find((p) => p.corretor_id === lia.id)?.posicao ?? null;
      expect(linha).toMatchObject({ apto: true, posicao: esperada, total: r.fila.length });
    }
    const texto = JSON.stringify(minhasLia);
    for (const colega of [lara, leo, luca, otto]) {
      expect(texto).not.toContain(colega.nome);
      expect(texto).not.toContain(colega.id);
    }
  });

  it("fora da fila: diz o motivo em vez da posição", async () => {
    const minhasLuca = await minhas(luca);
    expect(minhasLuca.find((m) => m.slug === "filial-liberdade")).toMatchObject({
      posicao: null,
      apto: false,
      motivos: ["ausente_hoje"],
    });

    await participar("agendados-sdr", sem);
    const minhasSem = await minhas(sem);
    expect(minhasSem.find((m) => m.slug === "agendados-sdr")).toMatchObject({
      zona: null,
      posicao: null,
      apto: false,
      motivos: ["sem_zona_no_perfil"],
    });
  });

  it("roleta de onde a gestão removeu o corretor não aparece em Sua vez (0077)", async () => {
    // Visto em produção (11/10): a remoção da Zona Norte aparecia como "Não
    // atende esta zona", como se faltasse cadastro. Removido não é "fora".
    expect((await minhas(luca)).some((m) => m.slug === "filial-liberdade")).toBe(true);
    await comoUsuario(c, admin.id);
    await c.query(
      `SELECT public.gerenciar_participante_roleta('filial-liberdade', $1, 'remover', 'teste 0077')`,
      [luca.id],
    );
    await comoSuperuser(c);
    expect((await minhas(luca)).some((m) => m.slug === "filial-liberdade")).toBe(false);
    // Removido da roleta da filial, deixa de atender o Leste (a roleta É a
    // região): some da lista da zona também para o SDR, nem como "fora".
    const zona = roleta(await filas(sdr, "Leste"), "filial-liberdade");
    expect(ids(zona.fila)).not.toContain(luca.id);
    expect(ids(zona.fora)).not.toContain(luca.id);
  });

  it("ler as filas não mexe em cursor nenhum", async () => {
    const antes = await cursores();
    await filas(sdr, "Leste");
    await filas(admin, null);
    await minhas(lia);
    expect(await cursores()).toEqual(antes);
  });
});

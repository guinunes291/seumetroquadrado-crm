/**
 * PARIDADE DA PRÉVIA — "Incluir minha localização" (pedido do dono,
 * 13/10/2026). A tela calcula NO APARELHO a distância até cada filial e diz
 * "Você está aqui" (e, com a leitura dentro do raio, faz o check-in direto,
 * sem a pergunta). Se a conta da tela divergir da do banco, o corretor vê
 * "dentro" e o banco barra — exatamente o que a prévia existe para evitar.
 *
 * A prévia (src/features/presenca/localizacao-previa.ts) é um espelho termo a
 * termo de public._distancia_metros (20261013120000) e da regra de
 * presenca_checkin (0082 = 20261021120000): round() do Postgres em double é
 * rint (o empate vai para o PAR, não para cima como Math.round), e a precisão
 * conta a favor até 150 m. Este arquivo trava as duas metades contra o banco
 * de verdade:
 *   1. a distância: 300 pontos determinísticos (LCG de semente fixa, até 2 km
 *      de cada filial de produção) contra as 3 filiais — só SELECT;
 *   2. a decisão: pontos nas bordas (raio, raio + precisão, teto de 150 m),
 *      com as precisões que a regra trata de jeitos diferentes, passando pelo
 *      presenca_checkin como um corretor — dentro ↔ confirmada, fora ↔
 *      fora_do_raio, e a distância gravada igual à da tela.
 *
 * Não altera `filiais` (os pinos de produção vêm do replay das migrations).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";
import {
  arredondarComoBanco,
  conferirFilial,
  distanciaMetros,
  precisaoComoBanco,
  type CoordenadasFilial,
} from "../../src/features/presenca/localizacao-previa";

const c = novoClient();

type Filial = CoordenadasFilial & { nome: string; latitude: number; longitude: number };
let filiais: Filial[];
let corretor: UsuarioTeste;

/** Gerador congruente linear (Numerical Recipes): o mesmo conjunto a cada execução. */
function lcg(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Metros por grau de latitude na esfera de raio 6 371 000 m (2πR/360 ≈ 111 195). */
const METROS_POR_GRAU = 111_195;

/**
 * Um ponto a `m` metros ao norte do pino da filial, pela MESMA fórmula da
 * tela: desloca a latitude por m / 111 195 e corrige 3 vezes com
 * distanciaMetros (sobra bem menos de 1 mm — longe do 0,1 m que separa as
 * bordas x,4 e x,6 do empate do arredondamento).
 */
function pontoA(f: Filial, m: number): { lat: number; lng: number } {
  let lat = f.latitude + m / METROS_POR_GRAU;
  for (let i = 0; i < 3; i++) {
    const d = distanciaMetros(lat, f.longitude, f.latitude, f.longitude);
    lat += (m - d) / METROS_POR_GRAU;
  }
  return { lat, lng: f.longitude };
}

type Status = {
  checkin: {
    filial_slug: string | null;
    localizacao: string | null;
    distancia_m: number | null;
    precisao_m: number | null;
  } | null;
};

async function checkinNaFilial(
  slug: string,
  p: { lat: number; lng: number },
  precisao: number | null,
): Promise<Status> {
  await comoUsuario(c, corretor.id);
  const r = await c.query(`SELECT public.presenca_checkin('loja', $1, $2, $3, $4) AS s`, [
    slug,
    p.lat,
    p.lng,
    precisao,
  ]);
  await comoSuperuser(c);
  return r.rows[0].s as Status;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  corretor = await criarUsuario(c, { nome: "Corretor Teste" });
  await comoSuperuser(c);
  filiais = (
    await c.query(
      `SELECT slug, nome, latitude, longitude, raio_metros, ativa
         FROM public.filiais
        WHERE ativa AND latitude IS NOT NULL
        ORDER BY ordem`,
    )
  ).rows as Filial[];
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("a distância da prévia é a do banco", () => {
  it("os pinos de produção estão no replay (Barra Funda, Liberdade, Belém; raio 300 m)", () => {
    expect(filiais.map((f) => [f.slug, f.raio_metros])).toEqual([
      ["barra-funda", 300],
      ["liberdade", 300],
      ["belem", 300],
    ]);
  });

  it("300 pontos até 2 km de cada filial × as 3 filiais: round(_distancia_metros) = arredondarComoBanco(distanciaMetros)", async () => {
    const aleatorio = lcg(20261013);
    const lats: number[] = [];
    const lngs: number[] = [];
    for (let i = 0; i < 300; i++) {
      const f = filiais[i % filiais.length];
      // Até 2 km em qualquer direção (o grau de longitude encolhe com cos(lat)).
      const raio = aleatorio() * 2000;
      const angulo = aleatorio() * 2 * Math.PI;
      lats.push(f.latitude + (raio * Math.cos(angulo)) / METROS_POR_GRAU);
      lngs.push(
        f.longitude +
          (raio * Math.sin(angulo)) / (METROS_POR_GRAU * Math.cos((f.latitude * Math.PI) / 180)),
      );
    }
    // Os pontos de referência da especificação entram junto (80 m e 491 m
    // da Liberdade, de presenca-filial.test.ts; o "Corretor Teste" e a
    // fixture `naLoja` das telas).
    lats.push(-23.56053, -23.55737, -23.518983, -23.52);
    lngs.push(-46.63889, -46.63659, -46.676975, -46.677);

    const r = await c.query(
      `SELECT p.i::int AS i, f.slug,
              round(public._distancia_metros(p.lat, p.lng, f.latitude, f.longitude))::int AS d
         FROM unnest($1::float8[], $2::float8[]) WITH ORDINALITY AS p(lat, lng, i)
         CROSS JOIN public.filiais f
        WHERE f.ativa AND f.latitude IS NOT NULL`,
      [lats, lngs],
    );
    const banco = r.rows as { i: number; slug: string; d: number }[];
    expect(banco).toHaveLength(lats.length * filiais.length);
    const divergentes = banco.filter((row) => {
      const f = filiais.find((x) => x.slug === row.slug);
      if (!f) return true;
      const tela = arredondarComoBanco(
        distanciaMetros(lats[row.i - 1], lngs[row.i - 1], f.latitude, f.longitude),
      );
      return tela !== row.d;
    });
    expect(divergentes).toEqual([]);

    // Os números conhecidos (conferidos à mão na especificação).
    const d = (i: number, slug: string) => banco.find((row) => row.i === i && row.slug === slug)?.d;
    expect(d(301, "liberdade")).toBe(80);
    expect(d(302, "liberdade")).toBe(491);
    expect([d(303, "barra-funda"), d(303, "liberdade"), d(303, "belem")]).toEqual([
      126, 6096, 9722,
    ]);
    expect([d(304, "barra-funda"), d(304, "liberdade"), d(304, "belem")]).toEqual([13, 6010, 9691]);
  });

  it("o round do banco é rint (empate vai para o par), como arredondarComoBanco — Math.round não serve", async () => {
    const valores = [0.5, 1.5, 2.5, 12.5, 13.5, 149.5, 300.5, 301.5, 125.984, 312.6];
    const r = await c.query(`SELECT round(v)::int AS r FROM unnest($1::float8[]) AS v`, [valores]);
    expect(r.rows.map((x) => x.r)).toEqual(valores.map(arredondarComoBanco));
    expect(valores.map(arredondarComoBanco)).not.toEqual(valores.map(Math.round));
  });
});

describe("a decisão da prévia é a do presenca_checkin, nas bordas", () => {
  // Alvos em torno de cada limite (300 = o raio; 390 = raio + 90; 450 = o
  // teto de 150 m de precisão), 0,4 m de cada lado do inteiro: o
  // arredondamento leva x,4 para baixo e x,6 para cima.
  const ALVOS = [299.6, 300.4, 300.6, 389.6, 390.4, 390.6, 449.6, 450.4, 450.6];
  // null, 0 e −1 (= null): limite 300; 90: 390; 149,5 (rint → 150), 150, 200
  // e 5000: o teto, 450.
  const PRECISOES: (number | null)[] = [null, 0, 90, 149.5, 150, 200, 5000, -1];

  it.each(["barra-funda", "liberdade", "belem"])(
    "%s: cada alvo × cada precisão — dentro ↔ confirmada, fora ↔ fora_do_raio, a mesma distância e a mesma precisão",
    async (slug) => {
      const f = filiais.find((x) => x.slug === slug);
      expect(f).toBeDefined();
      if (!f) return;
      const divergentes: unknown[] = [];
      let dentro = 0;
      let fora = 0;
      for (const alvo of ALVOS) {
        const p = pontoA(f, alvo);
        for (const precisao of PRECISOES) {
          const tela = conferirFilial({ lat: p.lat, lng: p.lng, precisao }, f);
          const s = await checkinNaFilial(slug, p, precisao);
          const ck = s.checkin;
          const esperado = tela.tipo === "dentro" ? "confirmada" : "fora_do_raio";
          if (tela.tipo === "dentro") dentro++;
          else fora++;
          if (
            tela.tipo === "sem_coordenadas" ||
            ck?.filial_slug !== slug ||
            ck.localizacao !== esperado ||
            ck.distancia_m !== tela.distancia_m ||
            ck.precisao_m !== precisaoComoBanco(precisao)
          ) {
            divergentes.push({ alvo, precisao, tela, banco: ck });
          }
        }
      }
      expect(divergentes).toEqual([]);
      // As bordas cobrem os dois lados (senão o teste não provaria nada).
      expect(dentro).toBeGreaterThan(10);
      expect(fora).toBeGreaterThan(10);
    },
  );

  it("as bordas decidem como o esperado (a tabela da regra, à mão)", () => {
    const f = filiais[0];
    const tipo = (m: number, precisao: number | null) =>
      conferirFilial({ ...pontoA(f, m), precisao }, f).tipo;
    // Raio 300 sem precisão: 300,4 → 300 (dentro); 300,6 → 301 (fora).
    expect([tipo(299.6, null), tipo(300.4, null), tipo(300.6, null)]).toEqual([
      "dentro",
      "dentro",
      "fora",
    ]);
    // ±90: o limite é 390.
    expect([tipo(390.4, 90), tipo(390.6, 90), tipo(389.6, 0)]).toEqual(["dentro", "fora", "fora"]);
    // A precisão conta só até 150 m (149,5 arredonda para 150, o par).
    expect([tipo(450.4, 149.5), tipo(450.4, 5000), tipo(450.6, 200), tipo(300.6, -1)]).toEqual([
      "dentro",
      "dentro",
      "fora",
      "fora",
    ]);
  });
});

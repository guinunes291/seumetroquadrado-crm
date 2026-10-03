/**
 * ZONA ESTRITA — a parte da tela e o contrato das migrations
 * (20261009120000 região única, 20261009120100 motores + guarda).
 *
 * As regras moram no banco (tests/db/zona-estrita.test.ts roda contra o
 * Postgres de verdade). Aqui:
 *  - os helpers da exceção da gestão mandam NADA a mais quando não há
 *    exceção (chamada idêntica à antiga — banco sem a migration aguenta);
 *  - o lote só oferece as zonas da região do corretor;
 *  - as seis zonas e as seis roletas de zona são as mesmas no front e no banco;
 *  - as migrations não podem perder as peças que fecham os vazamentos.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXCECAO_ZONA_VAZIA,
  MOTIVO_EXCECAO_MINIMO,
  argsExcecaoTransferencia,
  ehErroForaDaRegiao,
  excecaoZonaValida,
  paramsExcecaoAtribuicao,
} from "@/lib/zona-estrita";
import { ZONA_ROLETAS, motivoExcecaoLabel } from "@/lib/distribuicao";
import { ZONAS_REGIAO } from "@/lib/zonas";
import { motivoBloqueio, parseStatusLote, zonasDoLote } from "@/features/prospeccao/lote-client";
import { MOTIVO_ASSUMIR } from "@/features/telefonia/discador-atendidos-client";

const DIR = join(process.cwd(), "supabase", "migrations");
const REGIAO = "20261009120000_zona_estrita_regiao_unica.sql";
const MOTOR = "20261009120100_zona_estrita_motor_e_guarda.sql";
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
const semComentario = (sql: string) => sql.replace(/--[^\n]*/g, "");
const regiao = read(REGIAO);
const motor = read(MOTOR);

/** Corpo de uma função dentro da migration (do CREATE até o fim do corpo). */
function corpo(sql: string, nome: string): string {
  const ini = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
  expect(ini, `${nome} ausente`).toBeGreaterThanOrEqual(0);
  const fins = ["\n$$;", "\n$function$;", "$function$;"]
    .map((t) => sql.indexOf(t, ini))
    .filter((i) => i !== -1);
  return sql.slice(ini, Math.min(...fins) + 1);
}

describe("exceção da gestão (helpers da tela)", () => {
  it("sem exceção, a chamada não ganha argumento nenhum", () => {
    expect(argsExcecaoTransferencia(EXCECAO_ZONA_VAZIA)).toEqual({});
    expect(paramsExcecaoAtribuicao(EXCECAO_ZONA_VAZIA)).toEqual({});
    expect(argsExcecaoTransferencia({ ativa: false, motivo: "qualquer" })).toEqual({});
  });

  it("com exceção, manda o pedido e o motivo aparado", () => {
    expect(argsExcecaoTransferencia({ ativa: true, motivo: "  indicação do Saulo " })).toEqual({
      _forcar_fora_da_zona: true,
      _motivo_fora_da_zona: "indicação do Saulo",
    });
    expect(paramsExcecaoAtribuicao({ ativa: true, motivo: "cliente pediu" })).toEqual({
      forcar_fora_da_zona: true,
      motivo_fora_da_zona: "cliente pediu",
    });
  });

  it("motivo curto trava o botão — mesmo mínimo do banco", () => {
    expect(MOTIVO_EXCECAO_MINIMO).toBe(5);
    expect(excecaoZonaValida(EXCECAO_ZONA_VAZIA)).toBe(true);
    expect(excecaoZonaValida({ ativa: true, motivo: "abc  " })).toBe(false);
    expect(excecaoZonaValida({ ativa: true, motivo: "abcde" })).toBe(true);
    expect(motor).toMatch(/char_length\(COALESCE\(_motivo_fora, ''\)\) < 5/);
  });

  it("reconhece o erro da guarda pelo código e pela mensagem", () => {
    expect(ehErroForaDaRegiao({ code: "SMQZ1", message: "x" })).toBe(true);
    expect(ehErroForaDaRegiao({ message: "Fora da região: o lead é da Zona Leste…" })).toBe(true);
    expect(ehErroForaDaRegiao({ code: "42501", message: "forbidden" })).toBe(false);
    expect(ehErroForaDaRegiao(null)).toBe(false);
  });
});

describe("as seis zonas, iguais no front e no banco", () => {
  it("região e lead usam as seis zonas; cada uma tem roleta", () => {
    expect(ZONAS_REGIAO).toEqual(["Norte", "Sul", "Leste", "Oeste", "Centro", "Grande SP"]);
    expect(regiao).toContain(
      "SELECT ARRAY['Norte','Sul','Leste','Oeste','Centro','Grande SP']::text[];",
    );
    expect(ZONA_ROLETAS).toEqual([
      "zona-norte",
      "zona-sul",
      "zona-leste",
      "zona-oeste",
      "zona-centro",
      "zona-grande-sp",
    ]);
    expect(regiao).toMatch(/\('Centro', 'zona-centro'\),\s*\('Grande SP', 'zona-grande-sp'\)/);
  });

  it("os motivos novos da fila de exceções têm rótulo", () => {
    for (const m of ["sem_corretor_na_zona", "zona_sem_time", "zona_sem_roleta"]) {
      expect(motivoExcecaoLabel(m)).not.toBe(m);
      expect(motor).toContain(`'${m}'`);
    }
  });
});

describe("lote de prospecção: só zonas da região", () => {
  const base = {
    lote_id: null,
    zona: null,
    criado_em: null,
    entregues: 0,
    em_cadencia: 0,
    ficaram: 0,
    sairam: 0,
    em_cadencia_total: 0,
    vagas: 10,
    teto: 65,
    pode_pedir: true,
    motivo: null,
  };

  it("com região, só as zonas dela (na ordem dos chips); sem a chave, as seis", () => {
    expect(zonasDoLote(parseStatusLote({ ...base, regiao: ["Grande SP", "Sul"] }))).toEqual([
      "Sul",
      "Grande SP",
    ]);
    expect(zonasDoLote(parseStatusLote({ ...base, regiao: [] }))).toEqual([]);
    expect(zonasDoLote(parseStatusLote({ ...base, regiao: null }))).toHaveLength(6);
    expect(zonasDoLote(parseStatusLote(base))).toHaveLength(6);
    expect(zonasDoLote(undefined)).toHaveLength(6);
  });

  it("as travas de região viram texto para o corretor", () => {
    expect(motivoBloqueio({ motivo: "sem_regiao", em_cadencia: 0, teto: 65 })).toMatch(
      /região de atuação/,
    );
    expect(motivoBloqueio({ motivo: "zona_fora_da_regiao", em_cadencia: 0, teto: 65 })).toMatch(
      /não é da sua região/,
    );
  });

  it("o Discador explica a recusa de lead de outra região", () => {
    expect(MOTIVO_ASSUMIR.fora_da_regiao).toMatch(/fora da sua região/);
  });
});

describe("contrato das migrations", () => {
  it("são as MAIORES do diretório (o runner do Supabase recusa migration no meio)", () => {
    const todas = readdirSync(DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(todas.slice(-2)).toEqual([REGIAO, MOTOR]);
  });

  it("região = participação nas roletas de zona; profiles.zonas é espelho blindado", () => {
    expect(regiao).toContain("CREATE TRIGGER trg_profiles_zonas_espelho");
    expect(regiao).toMatch(/BEFORE INSERT OR UPDATE OF zonas ON public\.profiles/);
    expect(regiao).toMatch(
      /AFTER INSERT OR DELETE OR UPDATE OF ativo, roleta_id, corretor_id ON public\.roleta_participantes/,
    );
    // Sem "vazio = todas": o predicado só aceita a zona que está na região.
    const pred = semComentario(corpo(regiao, "corretor_atende_zona"));
    expect(pred).toContain("_zona IS NULL");
    expect(pred).toContain("_zona = ANY (p.zonas)");
    expect(pred).not.toMatch(/array_length/);
  });

  it("o motor não tem mais desvio de zona no modo estrito", () => {
    const m = semComentario(corpo(motor, "_distribuir_lead_v3"));
    // Lead com zona: roleta da zona, sem exigir "pronta".
    expect(m).toMatch(/ELSIF _estrita AND _zona IS NOT NULL AND _corretor_id IS NULL THEN/);
    expect(m).toContain("_slug := _zslug_lead;");
    // O fallback "qualquer apto" só sobrevive no ramo antigo (rollback).
    const estrito = m.slice(
      m.indexOf("IF _estrita THEN\n      -- "),
      m.indexOf("ELSIF _zona IS NOT NULL AND COALESCE(_roleta_tipo"),
    );
    expect(estrito).not.toContain("_zona_fallback := true");
    expect(m).toContain("'sem_corretor_na_zona'");
    expect(m).toContain("'zona_sem_time'");
  });

  it("a guarda fica DEPOIS dos outros BEFORE e com as isenções certas", () => {
    expect(motor).toMatch(
      /CREATE TRIGGER trg_zz_guarda_zona_corretor\s+BEFORE INSERT OR UPDATE OF corretor_id ON public\.leads/,
    );
    const g = semComentario(corpo(motor, "tg_leads_guarda_zona"));
    expect(g).toContain("current_setting('app.zona_override', true)");
    expect(g).toContain("TG_OP = 'INSERT' AND NEW.corretor_id = auth.uid()");
    expect(g).toContain("ur.role = 'corretor'::public.app_role");
    expect(g).toContain("ERRCODE = 'SMQZ1'");
  });

  it("todo override é desligado logo depois do UPDATE que precisou dele", () => {
    const on = (motor.match(/set_config\('app\.zona_override', 'on', true\)/g) ?? []).length;
    const off = (motor.match(/set_config\('app\.zona_override', 'off', true\)/g) ?? []).length;
    expect(on).toBeGreaterThan(0);
    expect(off).toBe(on);
  });

  it("rollback é uma chave: zona_estrita nasce ligada e todo motor a consulta", () => {
    expect(motor).toMatch(/VALUES \('zona_estrita', 'true'::jsonb,/);
    for (const fn of [
      "_distribuir_lead_v3",
      "distribuir_lead_ponderado",
      "distribuir_estoque_roleta",
      "_distribuir_lead_sdr",
      "atribuir_oferta_ativa_lote",
      "transferir_leads",
      "discador_bolsao_assumir_v1",
      "discador_bolsao_reservar_v1",
      "prospeccao_pedir_lote",
    ]) {
      expect(corpo(motor, fn), fn).toContain("_zona_estrita()");
    }
  });

  it("a função legada sem checagem de permissão sai do alcance de anon/authenticated", () => {
    expect(motor).toContain(
      "REVOKE ALL ON FUNCTION public.atribuir_lead_a_corretor(uuid, uuid) FROM PUBLIC, anon, authenticated;",
    );
  });
});

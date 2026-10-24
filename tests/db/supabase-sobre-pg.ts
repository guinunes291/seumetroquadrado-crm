/**
 * supabase-js "de bolso" sobre o Postgres do harness (só para tests/db).
 *
 * O harness não tem PostgREST. Para rodar o caminho de escrita da Sami de
 * verdade (executor, confirmação, desfazer) contra as RPCs, triggers e
 * policies reais, este adaptador traduz o subconjunto do query builder que o
 * código usa (select/insert/update/delete com eq, neq, in, is, gte, lte, gt,
 * lt, like, ilike, order, limit, maybeSingle, single, embed "alias:tabela(cols)"
 * e rpc) para SQL, numa conexão que age COMO o usuário (SET ROLE authenticated
 * + request.jwt.claims, igual ao PostgREST) ou como o service_role.
 *
 * Os tipos voltam como o PostgREST devolve: timestamptz em ISO, numeric e
 * bigint como número. Erros viram { code, message } (SQLSTATE do Postgres).
 */
import { Client, types as pgTypes } from "pg";
import { DATABASE_URL } from "./helpers";

type Linha = Record<string, unknown>;
type Resultado<T = unknown> = {
  data: T | null;
  error: { code: string; message: string } | null;
  count?: number | null;
};

const TIPOS_COMO_POSTGREST: Record<number, (v: string) => unknown> = {
  1184: (v) => new Date(v).toISOString(), // timestamptz
  1114: (v) => new Date(`${v}Z`).toISOString(), // timestamp
  1700: (v) => Number(v), // numeric
  20: (v) => Number(v), // int8
};

export function novoClientPostgrest(): Client {
  return new Client({
    connectionString: DATABASE_URL,
    types: {
      getTypeParser: ((oid: number, format?: "text" | "binary") =>
        TIPOS_COMO_POSTGREST[oid] ??
        pgTypes.getTypeParser(oid, format)) as typeof pgTypes.getTypeParser,
    },
  });
}

type Identidade = { tipo: "usuario"; userId: string } | { tipo: "servico" };

async function assumir(c: Client, quem: Identidade) {
  await c.query(`RESET ROLE`);
  if (quem.tipo === "usuario") {
    await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ sub: quem.userId, role: "authenticated" }),
    ]);
    await c.query(`SET ROLE authenticated`);
  } else {
    await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ role: "service_role" }),
    ]);
    await c.query(`SET ROLE service_role`);
  }
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** "id, nome, lead:leads(id, nome)" → lista SQL; embed por <alias>_id → <tabela>.id. */
function colunasSql(cols: string, alias: string): string {
  const partes: string[] = [];
  let nivel = 0;
  let atual = "";
  for (const ch of cols) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) {
      partes.push(atual.trim());
      atual = "";
    } else atual += ch;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes
    .map((p) => {
      if (p === "*") return `${alias}.*`;
      const embed = p.match(/^(\w+):(\w+)\((.*)\)$/s);
      if (embed) {
        const [, nome, tabela, dentro] = embed;
        return `(SELECT row_to_json(e) FROM (SELECT ${colunasSql(dentro, "x")} FROM public.${ident(tabela)} x WHERE x.id = ${alias}.${ident(`${nome}_id`)}) e) AS ${ident(nome)}`;
      }
      return `${alias}.${ident(p)}`;
    })
    .join(", ");
}

class Consulta implements PromiseLike<Resultado> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private cols = "*";
  private retorno: string | null = null;
  private valores: Linha | Linha[] | null = null;
  private filtros: Array<{ sql: (n: () => string) => string; params: unknown[] }> = [];
  private ordem: string[] = [];
  private limite: number | null = null;
  private modo: "lista" | "single" | "maybeSingle" = "lista";

  constructor(
    private readonly exec: (sql: string, params: unknown[]) => Promise<Linha[]>,
    private readonly tabela: string,
  ) {}

  select(cols = "*") {
    if (this.op === "select") this.cols = cols;
    else this.retorno = cols;
    return this;
  }
  insert(v: Linha | Linha[]) {
    this.op = "insert";
    this.valores = v;
    return this;
  }
  update(v: Linha) {
    this.op = "update";
    this.valores = v;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  private filtro(sql: (n: () => string) => string, ...params: unknown[]) {
    this.filtros.push({ sql, params });
    return this;
  }
  eq(c: string, v: unknown) {
    return this.filtro((n) => `t.${ident(c)} = ${n()}`, v);
  }
  neq(c: string, v: unknown) {
    return this.filtro((n) => `t.${ident(c)} IS DISTINCT FROM ${n()}`, v);
  }
  gt(c: string, v: unknown) {
    return this.filtro((n) => `t.${ident(c)} > ${n()}`, v);
  }
  gte(c: string, v: unknown) {
    return this.filtro((n) => `t.${ident(c)} >= ${n()}`, v);
  }
  lt(c: string, v: unknown) {
    return this.filtro((n) => `t.${ident(c)} < ${n()}`, v);
  }
  lte(c: string, v: unknown) {
    return this.filtro((n) => `t.${ident(c)} <= ${n()}`, v);
  }
  like(c: string, v: string) {
    return this.filtro((n) => `t.${ident(c)}::text LIKE ${n()}`, v);
  }
  ilike(c: string, v: string) {
    return this.filtro((n) => `t.${ident(c)}::text ILIKE ${n()}`, v);
  }
  in(c: string, v: unknown[]) {
    return this.filtro((n) => `t.${ident(c)}::text = ANY(${n()}::text[])`, v.map(String));
  }
  is(c: string, v: null | boolean) {
    return this.filtro(() => `t.${ident(c)} IS ${v === null ? "NULL" : v ? "TRUE" : "FALSE"}`);
  }
  order(c: string, o: { ascending?: boolean } = {}) {
    this.ordem.push(`t.${ident(c)} ${o.ascending === false ? "DESC" : "ASC"}`);
    return this;
  }
  limit(n: number) {
    this.limite = n;
    return this;
  }
  maybeSingle() {
    this.modo = "maybeSingle";
    return this;
  }
  single() {
    this.modo = "single";
    return this;
  }

  private montar(): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const param = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const onde = () =>
      this.filtros.length
        ? ` WHERE ${this.filtros
            .map((f) => {
              const vals = [...f.params];
              return f.sql(() => param(vals.shift()));
            })
            .join(" AND ")}`
        : "";
    const tabela = `public.${ident(this.tabela)}`;
    const ret = this.retorno ? ` RETURNING ${colunasSql(this.retorno, "t")}` : "";
    if (this.op === "select") {
      const where = onde();
      const ordem = this.ordem.length ? ` ORDER BY ${this.ordem.join(", ")}` : "";
      const lim = this.limite !== null ? ` LIMIT ${this.limite}` : "";
      return {
        sql: `SELECT ${colunasSql(this.cols, "t")} FROM ${tabela} t${where}${ordem}${lim}`,
        params,
      };
    }
    if (this.op === "insert") {
      const linhas = Array.isArray(this.valores) ? this.valores : [this.valores ?? {}];
      const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
      const valores = linhas
        .map(
          (l) =>
            `(${colunas.map((k) => (k in l ? param(jsonParaPg(l[k])) : "DEFAULT")).join(", ")})`,
        )
        .join(", ");
      return {
        sql: `INSERT INTO ${tabela} AS t (${colunas.map(ident).join(", ")}) VALUES ${valores}${ret}`,
        params,
      };
    }
    if (this.op === "update") {
      const sets = Object.entries(this.valores ?? {}).map(
        ([k, v]) => `${ident(k)} = ${param(jsonParaPg(v))}`,
      );
      return { sql: `UPDATE ${tabela} AS t SET ${sets.join(", ")}${onde()}${ret}`, params };
    }
    return { sql: `DELETE FROM ${tabela} AS t${onde()}${ret}`, params };
  }

  async executar(): Promise<Resultado> {
    try {
      const { sql, params } = this.montar();
      const linhas = await this.exec(sql, params);
      if (this.modo === "lista")
        return { data: this.op === "select" || this.retorno ? linhas : null, error: null };
      if (linhas.length > 1)
        return { data: null, error: { code: "PGRST116", message: "mais de uma linha" } };
      if (linhas.length === 0 && this.modo === "single") {
        return { data: null, error: { code: "PGRST116", message: "nenhuma linha" } };
      }
      return { data: linhas[0] ?? null, error: null };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      return { data: null, error: { code: err.code ?? "XX000", message: err.message ?? "erro" } };
    }
  }

  then<A = Resultado, B = never>(
    ok?: ((v: Resultado) => A | PromiseLike<A>) | null,
    erro?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.executar().then(ok, erro);
  }
}

/** Objeto/array JS para parâmetro: json vira texto JSON; array de texto fica array. */
function jsonParaPg(v: unknown): unknown {
  if (v === undefined) return null;
  if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date))
    return JSON.stringify(v);
  return v;
}

export type SupabaseSobrePg = {
  from(tabela: string): Consulta;
  rpc(fn: string, args?: Linha): Promise<Resultado>;
  storage: { from(bucket: string): Record<string, (...a: unknown[]) => Promise<Resultado>> };
  /** SQL executado (para asserções). */
  log: string[];
};

/**
 * Cliente que age como `quem` em toda chamada (a conexão é exclusiva do
 * adaptador). Storage é de mentira (o harness não tem buckets).
 */
export function supabaseSobrePg(c: Client, quem: Identidade): SupabaseSobrePg {
  const log: string[] = [];
  let fila = Promise.resolve();
  const exec = (sql: string, params: unknown[]) => {
    const p = fila.then(async () => {
      await assumir(c, quem);
      log.push(sql);
      const r = await c.query(sql, params);
      return r.rows as Linha[];
    });
    fila = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  };
  return {
    log,
    from: (tabela) => new Consulta(exec, tabela),
    async rpc(fn, args = {}) {
      try {
        const nomes = Object.entries(args).filter(([, v]) => v !== undefined);
        // Tipos dos parâmetros: json/jsonb vão como texto JSON (mesmo arrays);
        // arrays de texto/uuid ficam arrays (o pg monta o literal).
        const meta = await exec(
          `SELECT p.proretset AS conjunto, p.proargnames AS nomes,
                  ARRAY(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) AS t) AS tipos
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = $1
            ORDER BY p.pronargs DESC LIMIT 1`,
          [fn],
        );
        const nomesArgs = (meta[0]?.nomes as string[] | null) ?? [];
        const tiposArgs = (meta[0]?.tipos as string[] | null) ?? [];
        const tipoDe = (k: string) => tiposArgs[nomesArgs.indexOf(k)] ?? "";
        const lista = nomes.map(([k], i) => `${ident(k)} => $${i + 1}`).join(", ");
        const params = nomes.map(([k, v]) =>
          /^jsonb?$/.test(tipoDe(k)) && v !== null ? JSON.stringify(v) : jsonParaPg(v),
        );
        if (meta[0]?.conjunto) {
          const linhas = await exec(`SELECT * FROM public.${ident(fn)}(${lista})`, params);
          return { data: linhas, error: null };
        }
        const linhas = await exec(`SELECT public.${ident(fn)}(${lista}) AS r`, params);
        return { data: linhas[0]?.r ?? null, error: null };
      } catch (e) {
        const err = e as { code?: string; message?: string };
        return { data: null, error: { code: err.code ?? "XX000", message: err.message ?? "erro" } };
      }
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: "x" }, error: null }),
        copy: async () => ({ data: { path: "x" }, error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
  };
}

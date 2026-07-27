// Teste de CONTRATO entre as duas rotas públicas que resolvem lead por telefone:
//   GET  /api/public/leads?q=<telefone>   (leitura / pré-checagem de ambiguidade)
//   POST /api/public/documentos           (anexa o arquivo no lead)
//
// Elas precisam concordar. Quando discordaram, deu dano nos dois sentidos:
//   F-063 — o GET via 0 onde o POST via 1 (telefone armazenado formatado).
//   F-071 — o POST podia escolher um lead da LIXEIRA que o GET nem enxerga.
//
// O falso Postgres abaixo não é decorativo: ele interpreta de verdade os filtros
// `.eq/.is/.or(...ilike...)` que as rotas montam. Um filtro errado reprova aqui.
import { describe, it, expect } from "vitest";
import {
  apenasDigitos,
  casaTelefone,
  filtrarLeadVivo,
  filtroBuscaLead,
  pareceTelefone,
  resolverLeadPorTelefone,
  sufixosTelefone,
} from "@/lib/lead-busca-telefone";
import { escapeLike } from "@/lib/validators";

// --------------------------------------------------------------- falso Postgres

type Linha = Record<string, unknown>;

/** Traduz um padrão ILIKE do PostgREST (com escapes de escapeLike) em RegExp. */
function ilikeParaRegex(padrao: string): RegExp {
  let re = "";
  for (let i = 0; i < padrao.length; i++) {
    const c = padrao[i];
    if (c === "\\") {
      // `\%` e `\_` vieram de escapeLike: são literais, não curingas.
      const prox = padrao[++i] ?? "";
      re += prox.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (c === "%") re += ".*";
    else if (c === "_") re += ".";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

/** Avalia um termo `coluna.ilike.padrao` / `coluna.is.null` contra uma linha. */
function avaliaTermo(linha: Linha, termo: string): boolean {
  const [col, op, ...resto] = termo.split(".");
  const valor = linha[col];
  const alvo = resto.join(".");
  if (op === "ilike") {
    if (valor == null) return false;
    return ilikeParaRegex(alvo).test(String(valor));
  }
  if (op === "is") return alvo === "null" ? valor == null : valor === (alvo === "true");
  if (op === "eq") return String(valor) === alvo;
  throw new Error(`operador não suportado no falso Postgres: ${op}`);
}

type Builder = PromiseLike<{ data: Linha[]; count: number; error: null }> & {
  select: (cols?: string, opts?: unknown) => Builder;
  eq: (col: string, val: unknown) => Builder;
  is: (col: string, val: unknown) => Builder;
  or: (filtro: string) => Builder;
  order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => Builder;
  limit: (n: number) => Builder;
  range: (de: number, ate: number) => Builder;
};

function fakeSupabase(linhas: Linha[]) {
  function builder(
    preds: Array<(l: Linha) => boolean>,
    ordem: string | null,
    corte: number | null,
  ): Builder {
    const rodar = () => {
      let out = linhas.filter((l) => preds.every((p) => p(l)));
      if (ordem) {
        out = [...out].sort((a, b) => String(b[ordem] ?? "").localeCompare(String(a[ordem] ?? "")));
      }
      const total = out.length;
      if (corte != null) out = out.slice(0, corte);
      return { data: out, count: total, error: null as null };
    };
    const b: Builder = {
      select: () => builder(preds, ordem, corte),
      eq: (col, val) => builder([...preds, (l) => l[col] === val], ordem, corte),
      is: (col, val) =>
        builder([...preds, (l) => (val === null ? l[col] == null : l[col] === val)], ordem, corte),
      or: (filtro) => {
        const termos = filtro.split(",");
        return builder([...preds, (l) => termos.some((t) => avaliaTermo(l, t))], ordem, corte);
      },
      order: (col) => builder(preds, col, corte),
      limit: (n) => builder(preds, ordem, n),
      range: (de, ate) => builder(preds, ordem, ate - de + 1),
      then: (aceita, recusa) => Promise.resolve(rodar()).then(aceita, recusa),
    };
    return b;
  }
  return { from: () => builder([], null, null) };
}

// ------------------------------------------------------------------- o cenário
//
// Telefone gravado FORMATADO, que é o padrão do lote importado em 26/07 — a
// forma que o canário da drenagem provou não ser achável por dígitos (F-063).
// O "clone" é o mesmo telefone numa linha já mandada para a lixeira (F-071).
// Dado sintético: nome e número não pertencem a nenhum lead real (política de
// segredos-em-disco, regra 6 — sem PII em arquivo versionado).

const LEAD_VIVO = {
  id: "lead-vivo",
  nome: "Lead Sintético de Teste",
  telefone: "(11) 91234-5678",
  telefone_e164: "5511912345678",
  corretor_id: "corretor-1",
  ultima_interacao: "2026-07-20T10:00:00Z",
  na_lixeira: false,
  deleted_at: null,
};

const LEAD_NA_LIXEIRA = {
  ...LEAD_VIVO,
  id: "lead-na-lixeira",
  nome: "Lead Sintético de Teste (duplicado)",
  // Mais recente de propósito: sem o filtro de lixeira, a ordenação por
  // ultima_interacao DESC faria ESTA linha ser a escolhida.
  ultima_interacao: "2026-07-26T23:00:00Z",
  na_lixeira: true,
};

/** Simula o que o GET /api/public/leads monta para `?q=...`. */
async function getLeads(linhas: Linha[], termo: string) {
  const sb = fakeSupabase(linhas);
  const query = filtrarLeadVivo(sb.from().select("*", { count: "exact" })) as Builder;
  const { data, count } = await query.or(filtroBuscaLead(termo, escapeLike)).range(0, 49);
  return { total: count, ids: data.map((l) => l.id) };
}

/** Simula o que o POST /api/public/documentos faz antes de anexar. */
async function postResolve(linhas: Linha[], telefone: string) {
  return resolverLeadPorTelefone(fakeSupabase(linhas), telefone);
}

// ------------------------------------------------------------------- os testes

describe("F-063 — o GET acha telefone armazenado formatado buscado por dígitos", () => {
  it("busca por sufixo de 9 dígitos casa o telefone com hífen e parênteses", async () => {
    const { total, ids } = await getLeads([LEAD_VIVO], "912345678");
    expect(total).toBe(1);
    expect(ids).toEqual(["lead-vivo"]);
  });

  it("busca pelo número completo em dígitos também casa", async () => {
    const { total } = await getLeads([LEAD_VIVO], "5511912345678");
    expect(total).toBe(1);
  });

  it("busca pelo telefone formatado (como está gravado) continua funcionando", async () => {
    const { total } = await getLeads([LEAD_VIVO], "91234-5678");
    expect(total).toBe(1);
  });

  it("não é regressão: busca por nome segue funcionando e não vira busca de telefone", async () => {
    expect((await getLeads([LEAD_VIVO], "Sintético")).total).toBe(1);
    expect(pareceTelefone("Sintético")).toBe(false);
  });

  it("telefone de outro lead não casa (o filtro não virou curinga)", async () => {
    expect((await getLeads([LEAD_VIVO], "988887777")).total).toBe(0);
  });
});

describe("F-071 — lixeira: as duas rotas escolhem o MESMO lead vivo", () => {
  const base = [LEAD_VIVO, LEAD_NA_LIXEIRA];

  it("o POST anexa no lead vivo, não no da lixeira (que é o mais recente)", async () => {
    const r = await postResolve(base, "5511912345678");
    expect(r?.lead.id).toBe("lead-vivo");
  });

  it("o POST não marca ambíguo: só existe UM lead vivo para o telefone", async () => {
    const r = await postResolve(base, "5511912345678");
    expect(r?.ambiguo).toBe(false);
  });

  it("o GET conta 1, e é o mesmo id que o POST escolheu — as rotas concordam", async () => {
    const get = await getLeads(base, "912345678");
    const post = await postResolve(base, "5511912345678");
    expect(get.total).toBe(1);
    expect(get.ids).toEqual([post!.lead.id]);
  });

  it("se o único lead do telefone está na lixeira, ambas devolvem vazio", async () => {
    const so = [LEAD_NA_LIXEIRA];
    expect((await getLeads(so, "912345678")).total).toBe(0);
    expect(await postResolve(so, "5511912345678")).toBeNull();
  });

  it("lead excluído (deleted_at) segue fora das duas rotas", async () => {
    const excluido = [{ ...LEAD_VIVO, id: "lead-excluido", deleted_at: "2026-07-01T00:00:00Z" }];
    expect((await getLeads(excluido, "912345678")).total).toBe(0);
    expect(await postResolve(excluido, "5511912345678")).toBeNull();
  });

  it("ambiguidade real (2 leads VIVOS) é sinalizada, e o GET vê os mesmos 2", async () => {
    const outro = {
      ...LEAD_VIVO,
      id: "lead-vivo-2",
      nome: "Lead Sintético 2",
      ultima_interacao: "2026-07-25T10:00:00Z",
    };
    const dois = [LEAD_VIVO, outro];
    const post = await postResolve(dois, "5511912345678");
    expect(post?.ambiguo).toBe(true);
    expect((await getLeads(dois, "912345678")).total).toBe(2);
  });
});

describe("normalização de telefone — as peças", () => {
  it("apenasDigitos remove a formatação", () => {
    expect(apenasDigitos("(11) 91234-5678")).toBe("11912345678");
    expect(apenasDigitos(null)).toBe("");
  });

  it("sufixosTelefone vai do mais específico (9) ao menos (8)", () => {
    expect(sufixosTelefone("5511912345678")).toEqual(["912345678", "12345678"]);
    expect(sufixosTelefone("1234567")).toEqual([]);
  });

  it("casaTelefone compara dígito a dígito, não texto", () => {
    expect(casaTelefone("(11) 91234-5678", "912345678")).toBe(true);
    expect(casaTelefone("(11) 91234-5678", "988887777")).toBe(false);
  });

  it("pareceTelefone exige 8+ dígitos — nome com número não vira busca de telefone", () => {
    expect(pareceTelefone("912345678")).toBe(true);
    expect(pareceTelefone("Ap 302 bloco 4")).toBe(false);
  });

  it("curinga do usuário é escapado: '%' não vira busca-tudo", () => {
    const filtro = filtroBuscaLead("%", escapeLike);
    expect(filtro).toContain("\\%");
  });
});

// Banco falso do executor da Sami (samiq-executar.server.ts) para a
// caracterização: GRAVA cada chamada — leitura, escrita e RPC, com os
// argumentos — e responde pelo cenário. Chaves de resposta, da mais
// específica para a mais geral: "tabela:operacao:modo", "tabela:modo",
// "tabela" e "rpc:nome"; operacao = select|insert|update|delete|upsert e
// modo = unica|lista. Com a chave em `erros`, a chamada devolve erro.

type Resposta = unknown;

const OPERACOES = ["insert", "update", "delete", "upsert"] as const;

export function bancoDoExecutor(
  respostas: Record<string, Resposta> = {},
  erros: readonly string[] = [],
) {
  const chamadas: string[] = [];
  const fmt = (v: unknown) => JSON.stringify(v);

  const responder = (tabela: string, passos: string[], unica: boolean) => {
    const op = OPERACOES.find((o) => passos.some((p) => p.startsWith(`.${o}(`))) ?? "select";
    const modo = unica ? "unica" : "lista";
    const chaves = [`${tabela}:${op}:${modo}`, `${tabela}:${op}`, `${tabela}:${modo}`, tabela];
    const erro = chaves.find((c) => erros.includes(c));
    if (erro) return { data: null, error: { message: `falha em ${erro}`, code: "XX000" } };
    const chave = chaves.find((c) => c in respostas);
    if (chave) return { data: respostas[chave], error: null };
    if (op === "insert" && unica) return { data: { id: `${tabela}-novo` }, error: null };
    return { data: unica ? null : [], error: null };
  };

  const from = (tabela: string) => {
    const passos: string[] = [];
    const indice = chamadas.push(`from(${tabela})`) - 1;
    const resolver = (unica: boolean) => {
      chamadas[indice] = `from(${tabela})${passos.join("")}`;
      return Promise.resolve(responder(tabela, passos, unica));
    };
    const q: Record<string, unknown> = new Proxy(
      {},
      {
        get(_alvo, prop: string) {
          if (prop === "then")
            return (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
              resolver(false).then(ok, falha);
          return (...args: unknown[]) => {
            passos.push(`.${prop}(${args.map(fmt).join(",")})`);
            chamadas[indice] = `from(${tabela})${passos.join("")}`;
            if (prop === "maybeSingle" || prop === "single") return resolver(true);
            return q;
          };
        },
      },
    );
    return q;
  };

  const rpc = async (nome: string, params?: unknown) => {
    chamadas.push(`rpc(${nome}${params === undefined ? "" : `,${fmt(params)}`})`);
    if (erros.includes(`rpc:${nome}`))
      return { data: null, error: { message: `falha em rpc:${nome}`, code: "XX000" } };
    return { data: respostas[`rpc:${nome}`] ?? null, error: null };
  };

  return { chamadas, cliente: { from, rpc } as never };
}

// Cliente Supabase falso que GRAVA cada chamada como uma linha legível, para
// testes de caracterização da camada de dados: "o que este hook pede ao banco,
// e em que ordem". Uso: crie com `criarGravador(respostas)` dentro de
// vi.hoisted e entregue `.cliente` (e `.pendente`) nos vi.mock dos módulos
// @/integrations/supabase/client e @/integrations/supabase/pendentes.
//
// Respostas: por nome de tabela (lista de linhas) e por nome de RPC (valor
// cru). `maybeSingle`/`single` devolvem a primeira linha da tabela.

type Respostas = Record<string, unknown>;

const fmt = (v: unknown) => JSON.stringify(v);

export function criarGravador(respostas: Respostas = {}) {
  const chamadas: string[] = [];

  function tabela(cliente: string, nome: string) {
    const passos: string[] = [];
    const registrar = () => `${cliente}.from(${nome})${passos.join("")}`;
    let indice = -1;
    const resolver = (unica: boolean) => {
      chamadas[indice] = registrar();
      const linhas = (respostas[nome] ?? []) as unknown[];
      return Promise.resolve({ data: unica ? (linhas[0] ?? null) : linhas, error: null });
    };
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_alvo, prop: string) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              resolver(false).then(ok, erro);
          }
          return (...args: unknown[]) => {
            if (indice < 0) {
              indice = chamadas.length;
              chamadas.push("");
            }
            passos.push(`.${prop}(${args.map(fmt).join(",")})`);
            chamadas[indice] = registrar();
            if (prop === "maybeSingle" || prop === "single") return resolver(true);
            return builder;
          };
        },
      },
    );
    return builder;
  }

  function cliente(nomeCliente: string) {
    return {
      from: (nome: string) => tabela(nomeCliente, nome),
      rpc: async (nome: string, params?: unknown) => {
        chamadas.push(
          `${nomeCliente}.rpc(${nome}${params === undefined ? "" : `,${fmt(params)}`})`,
        );
        return { data: respostas[`rpc:${nome}`] ?? null, error: null };
      },
      auth: {
        getUser: async () => {
          chamadas.push(`${nomeCliente}.auth.getUser()`);
          return { data: { user: respostas["auth:user"] ?? null }, error: null };
        },
      },
      functions: {
        invoke: async (nome: string, opcoes?: unknown) => {
          chamadas.push(`${nomeCliente}.functions.invoke(${nome},${fmt(opcoes)})`);
          return { data: null, error: null };
        },
      },
    };
  }

  return {
    chamadas,
    cliente: cliente("supabase"),
    pendente: cliente("pendente"),
    limpar: () => chamadas.splice(0),
  };
}

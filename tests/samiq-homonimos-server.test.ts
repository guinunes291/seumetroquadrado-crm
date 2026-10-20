// Trava de homônimos ligada às ferramentas propor_* (samiq-propostas.server.ts),
// com um supabase falso que imita a carteira do corretor (RLS já aplicado).
import { describe, expect, it } from "vitest";
import {
  criarFerramentasDePropostaSamiQ,
  type PropostaColetada,
} from "@/lib/samiq-propostas.server";

type Linha = {
  id: string;
  nome: string;
  status: string;
  projeto_nome: string | null;
  telefone: string | null;
  telefone_e164: string | null;
  deleted_at: null;
  na_lixeira: boolean;
};

const FERREIRA: Linha = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Lucas Ferreira",
  status: "em_atendimento",
  projeto_nome: "Vibra Sabará",
  telefone: "(11) 98765-4321",
  telefone_e164: "5511987654321",
  deleted_at: null,
  na_lixeira: false,
};
const ANDRADE: Linha = {
  id: "22222222-2222-4222-8222-222222222222",
  nome: "Lucas Andrade",
  status: "aguardando_retorno",
  projeto_nome: "Parque das Perdizes",
  telefone: null,
  telefone_e164: "5511912340000",
  deleted_at: null,
  na_lixeira: false,
};
const MARIA: Linha = {
  ...ANDRADE,
  id: "33333333-3333-4333-8333-333333333333",
  nome: "Maria Souza",
};

function supabaseFalso(carteira: Linha[]) {
  return {
    from() {
      let linhas = [...carteira];
      const b = {
        select: () => b,
        is: () => b,
        eq: (col: keyof Linha, v: unknown) => {
          linhas = linhas.filter((l) => l[col] === v);
          return b;
        },
        neq: (col: keyof Linha, v: unknown) => {
          linhas = linhas.filter((l) => l[col] !== v);
          return b;
        },
        ilike: (col: keyof Linha, padrao: string) => {
          const prefixo = padrao.replace(/%$/, "").toLowerCase();
          linhas = linhas.filter((l) => String(l[col]).toLowerCase().startsWith(prefixo));
          return b;
        },
        limit: () => b,
        maybeSingle: async () => ({ data: linhas[0] ?? null, error: null }),
        then: (ok: (r: { data: Linha[]; error: null }) => unknown) =>
          ok({ data: linhas, error: null }),
      };
      return b;
    },
  };
}

async function propor(args: {
  carteira: Linha[];
  texto: string;
  leadId: string;
  contexto?: string;
}) {
  const coletor: PropostaColetada[] = [];
  const tools = criarFerramentasDePropostaSamiQ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabaseFalso(args.carteira) as any,
    userId: "corretor",
    coletor,
    textoDoCorretor: args.texto,
    leadIdEmContexto: args.contexto,
  });
  const exec = tools.propor_anotacao.execute as (
    i: unknown,
    o: unknown,
  ) => Promise<Record<string, unknown>>;
  const r = await exec(
    { leadId: args.leadId, texto: "quer visitar sábado" },
    {
      toolCallId: "t",
      messages: [],
    },
  );
  return { r, coletor };
}

describe("propor_* com homônimos na carteira", () => {
  it("dois Lucas e o corretor só disse 'Lucas': bloqueia e devolve os candidatos", async () => {
    const { r, coletor } = await propor({
      carteira: [FERREIRA, ANDRADE, MARIA],
      texto: "liguei pro Lucas, ele quer visitar sábado",
      leadId: FERREIRA.id,
    });
    expect(r.erro).toBe("cliente_ambiguo");
    expect(coletor).toHaveLength(0);
    const nomes = (r.candidatos as Array<{ nome: string }>).map((c) => c.nome);
    expect(nomes).toEqual(["Lucas Ferreira", "Lucas Andrade"]);
    expect(JSON.stringify(r)).not.toMatch(/4321|98765|0000/);
  });

  it("'o do Sabará' libera e a proposta entra no pacote", async () => {
    const { r, coletor } = await propor({
      carteira: [FERREIRA, ANDRADE],
      texto: "o do Sabará",
      leadId: FERREIRA.id,
    });
    expect(r.status).toBe("aguardando_confirmacao");
    expect(coletor).toHaveLength(1);
  });

  it("final do telefone libera", async () => {
    const { r } = await propor({
      carteira: [FERREIRA, ANDRADE],
      texto: "o Lucas final 4321",
      leadId: FERREIRA.id,
    });
    expect(r.status).toBe("aguardando_confirmacao");
  });

  it("só um Lucas na carteira: segue direto", async () => {
    const { r } = await propor({
      carteira: [FERREIRA, MARIA],
      texto: "liguei pro Lucas",
      leadId: FERREIRA.id,
    });
    expect(r.status).toBe("aguardando_confirmacao");
  });

  it("cliente já aberto na tela (lead em contexto): não pergunta", async () => {
    const { r } = await propor({
      carteira: [FERREIRA, ANDRADE],
      texto: "liguei pro Lucas",
      leadId: FERREIRA.id,
      contexto: FERREIRA.id,
    });
    expect(r.status).toBe("aguardando_confirmacao");
  });
});

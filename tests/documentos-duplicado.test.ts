// F-083 — POST /api/public/documentos com `messageId` repetido tem que devolver
// o contrato H-016 §4 (`ok:true, duplicado:true, documento_id`) nas DUAS vias:
//
//   (a) pré-checagem: a linha já existia quando o POST chegou;
//   (b) corrida: dois POSTs passaram pela pré-checagem antes de qualquer um
//       gravar, e o perdedor bateu na constraint documentacoes_message_id_uniq.
//
// A via (b) devolvia HTTP 500 com o texto cru do Postgres. O drenador do n8n lê
// 500 como transitório e reescreve `drenagem_estado='erro'` numa linha já
// `resolvido=true` com `documento_id` — o dado certo e o estado mentindo.
//
// O que este arquivo trava: as duas vias produzem o MESMO corpo, e a tradução
// da constraint não é generosa demais (23505 de outra coluna continua sendo 500).
import { describe, it, expect } from "vitest";
import {
  buscarPorMessageId,
  ehColisaoMessageId,
  respostaDuplicado,
  SELECT_DUP,
  type DocDup,
} from "@/lib/documentos-duplicado";

const LINHA: DocDup = {
  id: "11111111-1111-4111-8111-111111111111",
  lead_id: "22222222-2222-4222-8222-222222222222",
  tipo: "nao_classificado",
  arquivo_path: "22222222-2222-4222-8222-222222222222/11111111/holerite.pdf",
  arquivo_nome: "holerite.pdf",
};

/** Erro que o supabase-js entrega quando a constraint de message_id dispara. */
const ERRO_MESSAGE_ID = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "documentacoes_message_id_uniq"',
  details: "Key (message_id)=(wamid.ABC) already exists.",
};

const assinarFake = async (_s: unknown, path: string) => `https://signed.example/${path}`;

// Falso `db` mínimo: só o encadeamento que buscarPorMessageId usa.
function fakeDb(linhaPorMessageId: Record<string, DocDup>) {
  const chamadas: { tabela: string; colunas: string; coluna: string; valor: string }[] = [];
  return {
    chamadas,
    from(tabela: string) {
      let colunas = "";
      return {
        select(cols: string) {
          colunas = cols;
          return this;
        },
        eq(coluna: string, valor: string) {
          chamadas.push({ tabela, colunas, coluna, valor });
          return this;
        },
        async maybeSingle() {
          const ultima = chamadas[chamadas.length - 1];
          return { data: linhaPorMessageId[ultima.valor] ?? null, error: null };
        },
      };
    },
  };
}

describe("ehColisaoMessageId — tradução da constraint", () => {
  it("reconhece a violação de documentacoes_message_id_uniq", () => {
    expect(ehColisaoMessageId(ERRO_MESSAGE_ID)).toBe(true);
  });

  it("reconhece pelo `details` mesmo se a mensagem não citar a coluna", () => {
    expect(
      ehColisaoMessageId({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "Key (message_id)=(wamid.XYZ) already exists.",
      }),
    ).toBe(true);
  });

  // Esta é a metade que impede a correção de virar um novo defeito: dizer
  // "já está gravado" para uma unicidade QUALQUER esconderia o erro real.
  it("NÃO trata 23505 de outra constraint como duplicata", () => {
    expect(
      ehColisaoMessageId({
        code: "23505",
        message: 'duplicate key value violates unique constraint "documentacoes_pkey"',
        details: "Key (id)=(...) already exists.",
      }),
    ).toBe(false);
  });

  it("NÃO trata outros SQLSTATE como duplicata, nem null/undefined", () => {
    expect(ehColisaoMessageId({ code: "23503", message: "message_id" })).toBe(false);
    expect(ehColisaoMessageId({ message: "message_id duplicate" })).toBe(false);
    expect(ehColisaoMessageId(null)).toBe(false);
    expect(ehColisaoMessageId(undefined)).toBe(false);
  });
});

describe("respostaDuplicado — contrato H-016 §4", () => {
  it("devolve ok/duplicado/documento_id com a URL assinada", async () => {
    const corpo = await respostaDuplicado({}, LINHA, assinarFake);
    expect(corpo).toEqual({
      ok: true,
      duplicado: true,
      ambiguo: false,
      documento_id: LINHA.id,
      lead_id: LINHA.lead_id,
      tipo: LINHA.tipo,
      nome_arquivo: LINHA.arquivo_nome,
      url: `https://signed.example/${LINHA.arquivo_path}`,
      arquivo_path: LINHA.arquivo_path,
    });
  });

  it("aceita linha sem arquivo_path (url null) sem chamar o assinador", async () => {
    let chamou = false;
    const corpo = await respostaDuplicado({}, { ...LINHA, arquivo_path: null }, async () => {
      chamou = true;
      return "nao-deveria";
    });
    expect(chamou).toBe(false);
    expect(corpo.url).toBeNull();
    expect(corpo.ok).toBe(true);
    expect(corpo.duplicado).toBe(true);
  });

  // O ponto da F-083: o drenador só marca `anexado` quando `ok === true`. Um
  // corpo sem `documento_id` faria a linha reentrar na fila para sempre.
  it("sempre carrega documento_id — é o que o drenador grava", async () => {
    const corpo = await respostaDuplicado({}, LINHA, assinarFake);
    expect(corpo.documento_id).toBeTruthy();
  });
});

describe("buscarPorMessageId", () => {
  it("lê `documentacoes` por message_id pedindo as colunas do contrato", async () => {
    const db = fakeDb({ "wamid.ABC": LINHA });
    const achado = await buscarPorMessageId(db, "wamid.ABC");
    expect(achado).toEqual(LINHA);
    expect(db.chamadas).toEqual([
      { tabela: "documentacoes", colunas: SELECT_DUP, coluna: "message_id", valor: "wamid.ABC" },
    ]);
  });

  it("devolve null quando não existe — o 500 tem que seguir de pé", async () => {
    const db = fakeDb({});
    expect(await buscarPorMessageId(db, "wamid.SUMIU")).toBeNull();
  });
});

describe("as duas vias da idempotência devolvem a MESMA coisa", () => {
  // Era exatamente esta igualdade que não existia: a pré-checagem devolvia o
  // contrato, a corrida devolvia 500 cru.
  it("pré-checagem e corrida produzem corpos idênticos", async () => {
    const db = fakeDb({ "wamid.ABC": LINHA });

    // (a) pré-checagem: a rota lê antes de gravar.
    const dupPre = await buscarPorMessageId(db, "wamid.ABC");
    const corpoPre = await respostaDuplicado({}, dupPre!, assinarFake);

    // (b) corrida: a rota gravou, tomou 23505 e relê a linha vencedora.
    expect(ehColisaoMessageId(ERRO_MESSAGE_ID)).toBe(true);
    const dupCorrida = await buscarPorMessageId(db, "wamid.ABC");
    const corpoCorrida = await respostaDuplicado({}, dupCorrida!, assinarFake);

    expect(corpoCorrida).toEqual(corpoPre);
  });
});

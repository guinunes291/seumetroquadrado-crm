// v8.1: correções do primeiro teste real pelo WhatsApp (24/10/2026).
// Cada caso abaixo é uma mensagem que de fato aconteceu na conversa.
import { describe, expect, it } from "vitest";
import { gruposPelaMensagem, ferramentasAtivas } from "@/lib/samiq-grupos";
import {
  primeiroNomeDoCorretor,
  redactSamiQPii,
  redigirTextoDoCorretor,
} from "@/lib/samiq-governance";
import {
  SAMIQ_AVISO_SEM_REGISTRO,
  semNomeDeFerramenta,
  semRegistroFantasma,
  textoParaWhatsApp,
} from "@/lib/samiq-canal";

const TODAS = new Set([
  "buscar_clientes",
  "detalhe_cliente",
  "abrir_ferramentas",
  "registrar_contato",
  "anotar",
  "criar_tarefa",
  "criar_lead",
  "pedir_lote",
  "minha_situacao",
  "minha_fila",
]);

describe("v8.1: pedir para criar lead abre o cadastro", () => {
  for (const texto of [
    "Consegue criar um novo lead pra mim?",
    "criar lead\nGuilherme teste",
    "Consegue criar um lead no CRM pra mim?",
    "cria um cliente novo pra mim",
    "adiciona esse contato no crm",
    "novo lead: Ana Souza",
  ]) {
    it(`"${texto.replace(/\n/g, " / ")}"`, () => {
      const grupos = gruposPelaMensagem({ texto });
      expect(grupos).toContain("prospeccao");
      expect(ferramentasAtivas(grupos, TODAS)).toContain("criar_lead");
    });
  }

  it("nome + telefone soltos (resposta ao 'me manda nome e telefone') abre o cadastro e mantém o padrão", () => {
    const grupos = gruposPelaMensagem({ texto: "Guilherme teste [TELEFONE_1]", temTelefone: true });
    expect(grupos).toContain("prospeccao");
    expect(grupos).toContain("carteira");
  });

  it("mensagem comum continua no padrão, sem cadastro", () => {
    expect(gruposPelaMensagem({ texto: "como está meu dia?" })).not.toContain("prospeccao");
  });
});

describe("v8.1: celular não vira RG", () => {
  it("'11 930785691' no histórico vira [TELEFONE], não [RG]", () => {
    const t = redactSamiQPii("Guilherme teste \n11 930785691");
    expect(t).toContain("[TELEFONE]");
    expect(t).not.toContain("[RG]");
    expect(t).not.toContain("930785691");
  });

  it("celular colado com DDD também é telefone", () => {
    expect(redactSamiQPii("liga 11930785691")).toBe("liga [TELEFONE]");
  });

  it("RG com pontuação continua RG", () => {
    expect(redactSamiQPii("RG 12.345.678-9")).toContain("[RG]");
  });

  it("na mensagem do turno o telefone vira marcador restaurável", () => {
    const { texto, mapa } = redigirTextoDoCorretor("Guilherme teste \n11 930785691");
    expect(texto).toContain("[TELEFONE_1]");
    expect(mapa["[TELEFONE_1]"]).toBe("11 930785691");
  });
});

describe("v8.1: perfil da empresa não é nome de pessoa", () => {
  it("'Seu Metro Quadrado' não vira 'Seu'", () => {
    expect(primeiroNomeDoCorretor("Seu Metro Quadrado")).toBeNull();
    expect(primeiroNomeDoCorretor("SMQ Admin")).toBeNull();
  });
  it("corretor de verdade segue pelo primeiro nome", () => {
    expect(primeiroNomeDoCorretor("Ana Paula Souza")).toBe("Ana");
    expect(primeiroNomeDoCorretor("Guilherme")).toBe("Guilherme");
  });
});

describe("v8.1: 'preparei' sem nada pendente não passa", () => {
  it("resposta real das 15:35 (dois passos + 'confirma pra mim que eu gravo')", () => {
    const t = textoParaWhatsApp({
      texto:
        "Seu, preparei dois passos pro Guilherme teste: a criação do lead com o telefone informado, e o registro do contato (ligação, pediu retorno, follow-up terça 27/10 às 09:00, já que você não disse horário).\n\nConfirma pra mim que eu grava os dois? Depois disso a gente segue com a ligação de terça.",
    });
    expect(t).not.toMatch(/preparei|Confirma pra mim/i);
    expect(t).toContain(SAMIQ_AVISO_SEM_REGISTRO);
  });

  it("resposta real das 15:33 ('Preparei a criação do lead... Confirma pra mim?')", () => {
    const t = textoParaWhatsApp({
      texto:
        "Preparei a criação do lead Guilherme teste com o telefone informado. Confirma pra mim?",
    });
    expect(t).toBe(SAMIQ_AVISO_SEM_REGISTRO);
  });

  it("kit de visita (leitura) não é promessa de registro", () => {
    const comum = "Preparei o roteiro da visita do Lucas: comece pela planta de 2 dorms.";
    expect(semRegistroFantasma(comum)).toBe(comum);
  });

  it("pedir para confirmar um dado do cliente não é promessa", () => {
    const comum = "Confirma pra mim o sobrenome dela?";
    expect(semRegistroFantasma(comum)).toBe(comum);
  });
});

describe("v8.1: nome de ferramenta não chega ao corretor", () => {
  it("'veja sua fila (minha_fila)' perde o parêntese", () => {
    expect(
      semNomeDeFerramenta("Quer que eu veja sua fila (minha_fila) pra apontar quem chamar?"),
    ).toBe("Quer que eu veja sua fila pra apontar quem chamar?");
  });
  it("nome solto vira o rótulo", () => {
    expect(semNomeDeFerramenta("Posso rodar o criar_lead agora.")).toBe(
      "Posso rodar o cadastrar cliente agora.",
    );
  });
  it("link com sublinhado fica intacto", () => {
    const link = "Book: https://exemplo.com/book_ma_lapa.pdf";
    expect(semNomeDeFerramenta(link)).toBe(link);
  });
});

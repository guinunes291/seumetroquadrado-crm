// As mensagens abaixo são as MESMAS que a migration 20261002120000 levanta.
// Se alguém mudar o texto de um RAISE lá, este arquivo cai, que é o ponto:
// a tradução tem de acompanhar a fonte.
import { describe, expect, it } from "vitest";
import { erroAmigavel } from "@/features/academia/erros";

const erro = (message: string) => ({ message });

describe("erros do quiz viram texto de tela", () => {
  it("intervalo entre tentativas diz quantos minutos e não convida a insistir", () => {
    const r = erroAmigavel(erro("aguarde 60 minutos entre tentativas: revise as aulas antes"));
    expect(r.titulo).toBe("Ainda não dá para tentar de novo.");
    expect(r.detalhe).toContain("60 minutos");
    expect(r.podeTentarDeNovo).toBe(false);
  });

  it("limite diário diz quantas tentativas e manda voltar amanhã", () => {
    const r = erroAmigavel(
      erro("limite de 3 tentativas por dia atingido neste modulo: volte amanha"),
    );
    expect(r.titulo).toBe("Você já usou as tentativas de hoje.");
    expect(r.detalhe).toContain("3 tentativas");
    expect(r.detalhe).toContain("amanhã");
  });

  it("tempo esgotado manda começar de novo", () => {
    const r = erroAmigavel(erro("tempo esgotado: inicie uma nova tentativa"));
    expect(r.titulo).toBe("O tempo desta tentativa acabou.");
  });

  it("tentativa já enviada e tentativa inválida são casos diferentes", () => {
    expect(erroAmigavel(erro("tentativa ja enviada")).titulo).toBe(
      "Esta tentativa já foi enviada.",
    );
    expect(erroAmigavel(erro("tentativa invalida")).titulo).toBe(
      "Esta tentativa não é sua ou não existe mais.",
    );
  });

  it("aulas faltando explica o que destrava o quiz", () => {
    const r = erroAmigavel(erro("conclua todas as aulas antes do quiz"));
    expect(r.titulo).toBe("Faltam aulas para liberar o quiz.");
  });

  it("quiz sem questões é problema de conteúdo, e manda avisar o gestor", () => {
    expect(erroAmigavel(erro("quiz sem questoes suficientes")).detalhe).toContain("gestor");
  });
});

describe("erros da prática", () => {
  it("prática já pendente explica que está na fila do gestor", () => {
    const r = erroAmigavel(erro("ja existe uma pratica aguardando avaliacao neste modulo"));
    expect(r.titulo).toBe("Você já enviou uma prática neste módulo.");
  });

  it("evidência vazia pede texto ou link", () => {
    expect(erroAmigavel(erro("descreva a pratica ou anexe um link")).titulo).toBe(
      "Faltou a evidência.",
    );
  });

  it("módulo que não pede prática", () => {
    expect(erroAmigavel(erro("este modulo nao pede pratica")).titulo).toBe(
      "Este módulo não pede prática.",
    );
  });
});

describe("erros de acesso", () => {
  it("não inscrito manda falar com o gestor", () => {
    const r = erroAmigavel(erro("voce nao esta inscrito na Academia"));
    expect(r.titulo).toBe("Você ainda não está na Academia.");
    expect(r.detalhe).toContain("gestor");
  });

  it("forbidden das RPCs não vaza a palavra do banco para a tela", () => {
    const r = erroAmigavel({ message: "forbidden", code: "42501" });
    expect(r.titulo).toBe("Você não tem acesso a esta ação.");
    expect(r.detalhe).not.toContain("forbidden");
  });

  it("módulo indisponível vale também para aula indisponível", () => {
    expect(erroAmigavel(erro("modulo indisponivel")).titulo).toBe(
      "Este conteúdo não está disponível.",
    );
    expect(erroAmigavel(erro("aula indisponivel")).titulo).toBe(
      "Este conteúdo não está disponível.",
    );
  });
});

describe("fora do catálogo", () => {
  it("erro desconhecido cai no genérico e aí SIM convida a tentar de novo", () => {
    const r = erroAmigavel(erro("connection terminated unexpectedly"));
    expect(r.titulo).toBe("Não deu para completar a ação.");
    expect(r.podeTentarDeNovo).toBe(true);
  });

  it("erro nulo ou vazio não quebra", () => {
    expect(erroAmigavel(null).titulo).toBe("Não deu para completar a ação.");
    expect(erroAmigavel(undefined).podeTentarDeNovo).toBe(true);
    expect(erroAmigavel({ message: "   " }).titulo).toBe("Não deu para completar a ação.");
  });

  it("aceita string crua, não só objeto de erro", () => {
    expect(erroAmigavel("tempo esgotado: inicie uma nova tentativa").titulo).toBe(
      "O tempo desta tentativa acabou.",
    );
  });

  it("nenhuma mensagem de tela termina sem pontuação", () => {
    const casos = [
      "aguarde 60 minutos entre tentativas",
      "limite de 3 tentativas por dia atingido",
      "tempo esgotado",
      "forbidden",
      "qualquer outra coisa",
    ];
    for (const c of casos) {
      const r = erroAmigavel(erro(c));
      expect(r.titulo.endsWith("."), `titulo sem ponto: ${r.titulo}`).toBe(true);
      expect(r.detalhe.endsWith("."), `detalhe sem ponto: ${r.detalhe}`).toBe(true);
      expect(r.titulo.includes("—"), "travessao no titulo").toBe(false);
      expect(r.detalhe.includes("—"), "travessao no detalhe").toBe(false);
    }
  });
});

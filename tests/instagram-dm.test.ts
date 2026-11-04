import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ABERTURA_PADRAO,
  TEXTOS_PADRAO,
  acharPalavra,
  chavePalavra,
  contemPalavra,
  lerRenda,
  lerWhatsapp,
  pareceSaudacao,
  preencher,
  proximoPasso,
  textosComPadrao,
} from "@/features/instagram-dm/texto";
import { assinaturaValida, lerEvento } from "@/features/instagram-dm/zernio-webhook";

describe("palavra-chave", () => {
  it("casa com ou sem acento, em qualquer caixa e no meio da frase", () => {
    expect(contemPalavra("FAIXA", "FAIXA")).toBe(true);
    expect(contemPalavra("quero a faixa 2 por favor!", "FAIXA")).toBe(true);
    expect(contemPalavra("Faixa.", "faixa")).toBe(true);
    expect(contemPalavra("quero um apê", "APÊ")).toBe(true);
    expect(contemPalavra("quero um APE", "apê")).toBe(true);
    expect(contemPalavra("Simular!!!", "SIMULAR")).toBe(true);
  });

  it("só casa palavra inteira (APÊ não dispara em 'apenas')", () => {
    expect(contemPalavra("apenas olhando", "APÊ")).toBe(false);
    expect(contemPalavra("faixas", "FAIXA")).toBe(false);
    expect(contemPalavra("", "FAIXA")).toBe(false);
  });

  it("aceita expressão de mais de uma palavra", () => {
    expect(contemPalavra("Oi, quero SIMULAR agora", "quero simular")).toBe(true);
    expect(chavePalavra(" Apê! ")).toBe("ape");
  });

  it("acharPalavra devolve a primeira ativa que aparece", () => {
    const lista = [{ palavra: "FAIXA" }, { palavra: "SIMULAR" }];
    expect(acharPalavra("vamos simular", lista)?.palavra).toBe("SIMULAR");
    expect(acharPalavra("bom dia", lista)).toBeNull();
    expect(acharPalavra(null, lista)).toBeNull();
  });
});

describe("leitura das respostas", () => {
  it("lê a renda nos formatos comuns", () => {
    expect(lerRenda("3 mil")).toBe(3000);
    expect(lerRenda("R$ 3.500")).toBe(3500);
    expect(lerRenda("3,5 mil")).toBe(3500);
    expect(lerRenda("uns 4k")).toBe(4000);
    expect(lerRenda("2500")).toBe(2500);
    expect(lerRenda("uns 3")).toBe(3000);
    expect(lerRenda("R$ 1.412,00")).toBe(1412);
    expect(lerRenda("não sei")).toBeNull();
  });

  it("lê WhatsApp com DDD e devolve +55", () => {
    expect(lerWhatsapp("(11) 91234-5678")).toBe("+5511912345678");
    expect(lerWhatsapp("+55 11 91234 5678")).toBe("+5511912345678");
    expect(lerWhatsapp("11 3456-7890")).toBe("+551134567890");
    expect(lerWhatsapp("91234-5678")).toBeNull();
    expect(lerWhatsapp("11 81234-5678")).toBeNull();
    expect(lerWhatsapp("não tenho")).toBeNull();
  });

  it("preenche o nome e limpa a vírgula quando o nome falta", () => {
    expect(preencher("Oi, {nome}! Tudo bem?", { nome: "maria silva" })).toBe(
      "Oi, Maria! Tudo bem?",
    );
    expect(preencher("Oi, {nome}! Tudo bem?", { nome: null })).toBe("Oi! Tudo bem?");
  });

  it("textos salvos vazios caem no padrão", () => {
    const t = textosComPadrao({ regiao: "  ", prazo: "E o prazo?" });
    expect(t.regiao).toBe(TEXTOS_PADRAO.regiao);
    expect(t.prazo).toBe("E o prazo?");
  });

  it("a abertura padrão tem até 4 linhas e não promete preço nem prazo", () => {
    expect(ABERTURA_PADRAO.split("\n").length).toBeLessThanOrEqual(4);
    expect(ABERTURA_PADRAO).not.toMatch(/R\$|parcela|dias?\b|semana/i);
  });
});

describe("roteiro da qualificação", () => {
  const vars = { nome: "Ana", palavra: "FAIXA" };

  it("renda → região → prazo → WhatsApp → lead", () => {
    let estado = { etapa: "aguardando_renda" as const, tentativas_whatsapp: 0 };
    const p1 = proximoPasso(estado, "uns 3 mil", TEXTOS_PADRAO, vars);
    expect(p1?.proximaEtapa).toBe("aguardando_regiao");
    expect(p1?.respostas).toEqual({ renda_texto: "uns 3 mil", renda_valor: 3000 });

    const p2 = proximoPasso(
      { ...estado, etapa: "aguardando_regiao" },
      "Zona Leste",
      TEXTOS_PADRAO,
      vars,
    );
    expect(p2?.proximaEtapa).toBe("aguardando_prazo");

    const p3 = proximoPasso(
      { ...estado, etapa: "aguardando_prazo" },
      "este ano",
      TEXTOS_PADRAO,
      vars,
    );
    expect(p3?.proximaEtapa).toBe("aguardando_whatsapp");

    const p4 = proximoPasso(
      { ...estado, etapa: "aguardando_whatsapp" },
      "11 91234-5678",
      TEXTOS_PADRAO,
      vars,
    );
    expect(p4?.proximaEtapa).toBe("concluida");
    expect(p4?.criarLead).toBe(true);
    expect(p4?.respostas.whatsapp).toBe("+5511912345678");
    expect(p4?.resposta).toContain("Ana");
    estado = { etapa: "aguardando_renda", tentativas_whatsapp: 0 };
    expect(estado.etapa).toBe("aguardando_renda");
  });

  it("cumprimento antes da renda repete a pergunta em vez de virar a renda", () => {
    const p = proximoPasso(
      { etapa: "aguardando_renda", tentativas_whatsapp: 0 },
      "Oi, bom dia!",
      TEXTOS_PADRAO,
      vars,
    );
    expect(p?.proximaEtapa).toBe("aguardando_renda");
    expect(p?.resposta).toBe(TEXTOS_PADRAO.renda_de_novo);
    expect(pareceSaudacao("oi tudo bem? ganho 3 mil")).toBe(false);
    expect(pareceSaudacao("Olá")).toBe(true);
  });

  it("renda que não dá para ler não trava a conversa", () => {
    const p = proximoPasso(
      { etapa: "aguardando_renda", tentativas_whatsapp: 0 },
      "prefiro não dizer",
      TEXTOS_PADRAO,
      vars,
    );
    expect(p?.proximaEtapa).toBe("aguardando_regiao");
    expect(p?.respostas.renda_valor).toBeNull();
  });

  it("WhatsApp inválido pede de novo uma vez e depois desiste sem criar lead", () => {
    const p1 = proximoPasso(
      { etapa: "aguardando_whatsapp", tentativas_whatsapp: 0 },
      "não tenho",
      TEXTOS_PADRAO,
      vars,
    );
    expect(p1?.proximaEtapa).toBe("aguardando_whatsapp");
    expect(p1?.tentativasWhatsapp).toBe(1);
    const p2 = proximoPasso(
      { etapa: "aguardando_whatsapp", tentativas_whatsapp: 1 },
      "sem zap",
      TEXTOS_PADRAO,
      vars,
    );
    expect(p2?.proximaEtapa).toBe("sem_whatsapp");
    expect(p2?.criarLead).toBe(false);
  });

  it("conversa encerrada não responde", () => {
    expect(
      proximoPasso({ etapa: "concluida", tentativas_whatsapp: 0 }, "oi", TEXTOS_PADRAO, vars),
    ).toBeNull();
  });
});

describe("webhook do Zernio", () => {
  const segredo = "s3gr3d0-de-teste";
  const assinar = (corpo: string) => createHmac("sha256", segredo).update(corpo).digest("hex");

  it("valida X-Zernio-Signature sobre o corpo cru", () => {
    const corpo = JSON.stringify({ id: "evt_1", event: "message.received" });
    expect(assinaturaValida(corpo, assinar(corpo), segredo)).toBe(true);
    expect(assinaturaValida(corpo, assinar(corpo).toUpperCase(), segredo)).toBe(true);
    expect(assinaturaValida(`${corpo} `, assinar(corpo), segredo)).toBe(false);
    expect(assinaturaValida(corpo, null, segredo)).toBe(false);
    expect(assinaturaValida(corpo, "abc", segredo)).toBe(false);
  });

  it("lê message.received no formato da doc", () => {
    const ev = lerEvento({
      id: "evt_5f8e2a1c",
      event: "message.received",
      message: {
        id: "66d4a1b2c3e4f5a6b7c8d9e1",
        conversationId: "66c3d2ae7b4f6c8d0e1f2a3b",
        platform: "instagram",
        direction: "incoming",
        text: "FAIXA",
        sender: { id: "17841400000000000", name: "Jane", username: "jane_doe" },
      },
      conversation: { id: "66c3d2ae7b4f6c8d0e1f2a3b", status: "active" },
      account: { id: "6adaab6643f5d6099d5dfa5b", accountId: "6adaab6643f5d6099d5dfa5b" },
    });
    expect(ev).toMatchObject({
      tipo: "mensagem",
      mensagemId: "66d4a1b2c3e4f5a6b7c8d9e1",
      conversaId: "66c3d2ae7b4f6c8d0e1f2a3b",
      contaId: "6adaab6643f5d6099d5dfa5b",
      texto: "FAIXA",
      remetente: { id: "17841400000000000", nome: "Jane", username: "jane_doe" },
    });
  });

  it("ignora mensagem enviada por nós e de outra plataforma", () => {
    const base = { event: "message.received", message: { id: "m", conversationId: "c" } };
    expect(lerEvento({ ...base, message: { ...base.message, direction: "outgoing" } }).tipo).toBe(
      "ignorado",
    );
    expect(lerEvento({ ...base, message: { ...base.message, platform: "whatsapp" } }).tipo).toBe(
      "ignorado",
    );
  });

  it("lê comment.received com nomes de campo alternativos", () => {
    const ev = lerEvento({
      id: "evt_2",
      event: "comment.received",
      comment: {
        commentId: "1790000000001",
        platformPostId: "1791234567890",
        message: "FAIXA",
        from: { id: "1784", username: "@ana.souza", name: "Ana Souza" },
      },
      account: { accountId: "6adaab6643f5d6099d5dfa5b" },
    });
    expect(ev).toMatchObject({
      tipo: "comentario",
      comentarioId: "1790000000001",
      postId: "1791234567890",
      texto: "FAIXA",
      autor: { id: "1784", username: "ana.souza", nome: "Ana Souza" },
    });
  });

  it("evento desconhecido é ignorado com motivo", () => {
    expect(lerEvento({ event: "post.published" })).toMatchObject({
      tipo: "ignorado",
      motivo: "evento_post.published",
    });
    expect(lerEvento("x").tipo).toBe("ignorado");
  });
});

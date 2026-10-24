// v8.2: correções do QA de ponta a ponta pelo WhatsApp (24/10/2026, perfil
// "Seu Metro Quadrado"). Cada caso abaixo é uma mensagem ou resposta que de
// fato aconteceu no teste em produção (com os envios de WhatsApp travados).
import { describe, expect, it } from "vitest";
import { redactSamiQPii, redigirTextoDoCorretor } from "@/lib/samiq-governance";

describe("v8.2: 'conta' só é dado bancário quando fecha a palavra e tem número", () => {
  it("resposta real das 16:34: 'cadência de primeiro contato.' fica inteira no histórico", () => {
    const texto =
      "Confirma para eu gravar e já abro a cadência de primeiro contato.\n\nPreciso do seu OK para:";
    expect(redactSamiQPii(texto)).toBe(texto);
  });

  it("resposta real das 16:45: 'que estão esperando contato' não vira [DADO_BANCARIO]", () => {
    const texto = "toco Rebeca e Rebeca Menezes, que estão esperando contato";
    expect(redactSamiQPii(texto)).toBe(texto);
  });

  it("resposta real das 16:59: 'prefere ser contatado depois das 18h' fica inteira", () => {
    const texto = "Cliente prefere ser contatado depois das 18h.";
    expect(redactSamiQPii(texto)).toBe(texto);
  });

  it("mensagem real das 17:45: 'me conta uma piada' não é dado bancário", () => {
    const { texto, mapa } = redigirTextoDoCorretor("me conta uma piada");
    expect(texto).toBe("me conta uma piada");
    expect(mapa).toEqual({});
  });

  it("'conta' seguida de palavra sem dígito não é conta bancária", () => {
    for (const t of [
      "conta pra mim o que rolou",
      "ele conta comigo",
      "a conta do restaurante foi alta",
    ]) {
      expect(redactSamiQPii(t)).toBe(t);
    }
  });

  it("conta bancária de verdade continua redigida", () => {
    expect(redactSamiQPii("agência 1234-5, conta corrente 98765-4")).toBe(
      "agência [DADO_BANCARIO], conta corrente [DADO_BANCARIO]",
    );
    expect(redactSamiQPii("conta: 12345-6 do Itaú")).toBe("conta: [DADO_BANCARIO] do Itaú");
    // Número de 8 dígitos cai antes no padrão de RG: redigido de um jeito ou de outro.
    expect(redactSamiQPii("conta 00012345-6")).toMatch(/^conta \[(DADO_BANCARIO|RG)\]$/);
    expect(redactSamiQPii("chave pix 11987654321")).toContain("[");
  });
});

// ---------------------------------------------------------------------------
import { escolherEntreHomonimos, mensagemNomeia } from "@/lib/samiq-homonimos";
import {
  SAMIQ_AVISO_SEM_REGISTRO,
  temListaNumerada,
  textoDosCandidatos,
  textoParaWhatsApp,
} from "@/lib/samiq-canal";
import { anotarAmbiguos, candidatosParaOCanal, type AmbiguosDoTurno } from "@/lib/samiq-contexto";

const UM_0001 = {
  id: "32f8e899",
  nome: "Teste QA Sami Um",
  projeto_nome: null,
  status: "aguardando_atendimento",
  telefone: "11988880001",
};
const UM_0003 = {
  id: "3254cb4d",
  nome: "Teste QA Sami Um",
  projeto_nome: null,
  status: "aguardando_atendimento",
  telefone: "11988880003",
};

describe("v8.2: homônimo apontado pelo corretor troca o alvo em vez de recusar", () => {
  it("mensagem real das 16:57: modelo mandou o 0001, corretor disse 'o do final 0003'", () => {
    const r = escolherEntreHomonimos({
      alvo: UM_0001,
      homonimos: [UM_0003],
      texto: "liguei pro Teste QA Sami Um, não atendeu\no do final 0003",
    });
    expect(r).toEqual({ ok: true, id: UM_0003.id, trocou: true, motivo: "final_telefone" });
  });

  it("alvo certo continua sem troca", () => {
    const r = escolherEntreHomonimos({
      alvo: UM_0003,
      homonimos: [UM_0001],
      texto: "o Teste QA Sami Um do telefone final 0003 desistiu",
    });
    expect(r).toEqual({ ok: true, id: UM_0003.id, trocou: false, motivo: "final_telefone" });
  });

  it("sem pista continua ambíguo (pergunta)", () => {
    const r = escolherEntreHomonimos({
      alvo: UM_0001,
      homonimos: [UM_0003],
      texto: "liguei pro Teste QA Sami Um, não atendeu",
    });
    expect(r.ok).toBe(false);
  });

  it("'e o Teste QA Sami Um?' nomeia; 'me prepara pra visita dele' não", () => {
    expect(mensagemNomeia("e o Teste QA Sami Um?", UM_0001)).toBe(true);
    expect(mensagemNomeia("me prepara pra visita dele", UM_0001)).toBe(false);
  });
});

describe("v8.2: a lista numerada sai do sistema quando o modelo não a escreveu", () => {
  const candidatos = [
    {
      id: UM_0001.id,
      nome: "Teste QA Sami Um",
      empreendimento: null,
      etapa: "aguardando_atendimento",
    },
    {
      id: UM_0003.id,
      nome: "Teste QA Sami Um",
      empreendimento: "Cury Playball",
      etapa: "agendado",
    },
  ];

  it("resposta real das 16:51 (sem lista) ganha 'Qual deles? 1) 2)' e perde o aviso 'me peça de novo'", () => {
    const texto =
      'Tem mais de um "Teste QA Sami Um" na carteira e o sistema não deixa gravar sem eu confirmar qual é. Responde com o final do telefone ou "sim, é o do plantão" que eu grave certinho.';
    const saida = textoParaWhatsApp({ texto, candidatos });
    expect(saida).toContain(
      "Qual deles?\n1) Teste QA Sami Um (aguardando atendimento)\n2) Teste QA Sami Um (Cury Playball, agendado)\nResponda com o número.",
    );
    expect(saida).not.toContain(SAMIQ_AVISO_SEM_REGISTRO);
  });

  it("modelo que já numerou não ganha segunda lista", () => {
    const texto = "Qual deles?\n1) Teste QA Sami Um (plantão)\n2) Teste QA Sami Um (captação)";
    expect(temListaNumerada(texto)).toBe(true);
    expect(textoParaWhatsApp({ texto, candidatos })).toBe(texto);
  });

  it("um candidato só não é lista", () => {
    expect(textoDosCandidatos(candidatos.slice(0, 1))).toBeNull();
  });

  it("o estado do turno guarda os candidatos com nome e os devolve ao canal", () => {
    const estado: AmbiguosDoTurno = { lista: [], conflito: false };
    anotarAmbiguos(estado, candidatos);
    expect(estado.lista).toEqual([UM_0001.id, UM_0003.id]);
    expect(candidatosParaOCanal(estado)).toEqual(candidatos);
    // Duas listas diferentes no mesmo turno = conflito: nada vai ao canal.
    anotarAmbiguos(estado, [{ id: "x", nome: "Maria", empreendimento: null, etapa: null }]);
    expect(candidatosParaOCanal(estado)).toEqual([]);
  });
});

describe("v8.2: o modelo não repete a lista nem a instrução do sistema", () => {
  const pendente = {
    payload: {
      tipo: "anotar" as const,
      leadId: "2c143850",
      nota: "Cliente prefere ser contatado depois das 18h.",
    },
    leadNome: "Teste QA Sami Dois",
  };

  it("resposta real das 17:11: 'Preciso do seu OK para: 1) Remarcar...' escrito pelo modelo some", () => {
    const texto =
      "Preparei a remarcação pra domingo 25/10 às 11h, no mesmo estande. Preciso do seu OK para: 1) Remarcar visita de Teste QA Sami Dois (dom 25/10 11:00)";
    const saida = textoParaWhatsApp({ texto, pendentes: [pendente] });
    expect(saida.match(/Preciso do seu OK para/g)?.length).toBe(1);
    expect(saida).not.toContain("1) Remarcar visita");
    expect(saida).toContain("1) Nota sobre Teste QA Sami Dois");
  });

  it("'Confirma pra eu gravar.' em minúsculas some; o resto fica", () => {
    const texto =
      "Preparei a visita pro sábado 31/10 às 10h. Confirma pra eu gravar. Depois disso, bora pedir pra ele confirmar presença.";
    const saida = textoParaWhatsApp({ texto, pendentes: [pendente] });
    expect(saida).not.toContain("Confirma pra eu gravar");
    expect(saida).toContain("bora pedir pra ele confirmar presença");
  });

  it("lista de empreendimentos '1) MK2...' do modelo fica quando não copiou a lista oficial", () => {
    const texto = "Na zona leste até 280 mil:\n1) MK2 Estação Dom Bosco\n2) Jardim das Origens";
    const saida = textoParaWhatsApp({ texto, pendentes: [pendente] });
    expect(saida).toContain("1) MK2 Estação Dom Bosco");
  });
});

// ---------------------------------------------------------------------------
import { mapaPiiValido, piiParaMemoria, restaurarPiiDoCorretor } from "@/lib/samiq-governance";
import { lerContexto } from "@/lib/samiq-contexto";

describe("v8.2: o telefone da mensagem anterior continua restaurável por 30 min", () => {
  const agora = new Date("2026-10-24T19:40:00Z");

  it("sequência real das 16:38 a 16:40: 'cadastra outro Teste QA Sami Um, 11 98888-0003' e depois 'sim, é outro cliente'", () => {
    const t1 = redigirTextoDoCorretor(
      "cadastra outro Teste QA Sami Um, telefone 11 98888-0003, veio do stand",
    );
    expect(t1.texto).toContain("[TELEFONE_1]");
    const pii = piiParaMemoria(null, t1.mapa, agora);
    expect(pii?.mapa).toEqual({ "[TELEFONE_1]": "11 98888-0003" });

    // Turno seguinte, 1 minuto depois, sem telefone na mensagem.
    const anterior = mapaPiiValido(pii, new Date(agora.getTime() + 60_000));
    const t2 = redigirTextoDoCorretor("sim, é outro cliente, pode cadastrar", 4000, anterior);
    expect(t2.mapa).toEqual({ "[TELEFONE_1]": "11 98888-0003" });
    expect(restaurarPiiDoCorretor("[TELEFONE_1]", t2.mapa)).toBe("11 98888-0003");
  });

  it("telefone novo na mensagem seguinte ganha o próximo número; o mesmo telefone reusa o marcador", () => {
    const anterior = { "[TELEFONE_1]": "11 98888-0003" };
    const t = redigirTextoDoCorretor(
      "o outro é 11 98888-0004 e o primeiro 11 98888-0003",
      4000,
      anterior,
    );
    expect(t.mapa).toEqual({ "[TELEFONE_1]": "11 98888-0003", "[TELEFONE_2]": "11 98888-0004" });
    expect(t.texto).toBe("o outro é [TELEFONE_2] e o primeiro [TELEFONE_1]");
  });

  it("depois de 30 minutos o mapa antigo não vale mais", () => {
    const pii = { mapa: { "[TELEFONE_1]": "11 98888-0003" }, em: agora.toISOString() };
    expect(mapaPiiValido(pii, new Date(agora.getTime() + 31 * 60_000))).toEqual({});
    expect(mapaPiiValido(pii, new Date(agora.getTime() + 29 * 60_000))).toEqual(pii.mapa);
  });

  it("'em' só renova quando a mensagem trouxe marcador novo", () => {
    const antes = { mapa: { "[TELEFONE_1]": "11 98888-0003" }, em: "2026-10-24T19:00:00Z" };
    expect(piiParaMemoria(antes, antes.mapa, agora)?.em).toBe("2026-10-24T19:00:00Z");
    expect(piiParaMemoria(antes, { ...antes.mapa, "[CPF_1]": "123.456.789-00" }, agora)?.em).toBe(
      agora.toISOString(),
    );
    expect(piiParaMemoria(antes, {}, agora)).toBeNull();
  });

  it("o contexto da conversa lê e ignora lixo", () => {
    const c = lerContexto({
      pii: {
        mapa: { "[TELEFONE_1]": "11 9", lixo: "x", "[CPF_1]": 5 },
        em: "2026-10-24T19:00:00Z",
      },
    });
    expect(c.pii).toEqual({ mapa: { "[TELEFONE_1]": "11 9" }, em: "2026-10-24T19:00:00Z" });
    expect(lerContexto({ pii: { mapa: {}, em: "x" } }).pii).toBeNull();
  });
});

// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("v8.2b: estado do CRM só vale lido por ferramenta neste turno", () => {
  it("o cabeçalho do WhatsApp manda ler antes de afirmar, negar ou perguntar 'qual deles?'", () => {
    const cabecalho = readFileSync(join(process.cwd(), "src/lib/samiq-core-cabecalho.ts"), "utf8");
    expect(cabecalho).toContain("só vale lido por ferramenta NESTE turno");
    expect(cabecalho).toContain("liste-os numerados (1, 2, 3)");
  });
});

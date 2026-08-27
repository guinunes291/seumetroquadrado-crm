import { describe, expect, it } from "vitest";

import {
  REGUA_PADRAO,
  parseRegua,
  proximoToque,
  tipoDaTarefa,
  tituloDoToque,
} from "@/lib/regua-followup";

describe("parseRegua (tolerante a config ruim)", () => {
  it("null/lixo devolve a régua padrão inteira", () => {
    expect(parseRegua(null)).toEqual(REGUA_PADRAO);
    expect(parseRegua("x")).toEqual(REGUA_PADRAO);
    expect(parseRegua(42)).toEqual(REGUA_PADRAO);
  });

  it("campos parciais caem no padrão campo a campo", () => {
    const r = parseRegua({ max_toques: 10, devolucao_ativa: true });
    expect(r.maxToques).toBe(10);
    expect(r.devolucaoAtiva).toBe(true);
    expect(r.gaps.quente).toHaveLength(10);
    expect(r.ligacaoNosToques).toEqual(REGUA_PADRAO.ligacaoNosToques);
  });

  it("gap malformado numa posição usa o padrão daquela posição", () => {
    const r = parseRegua({ gaps: { quente: [0, "x", 5] } });
    expect(r.gaps.quente[0]).toBe(0);
    expect(r.gaps.quente[1]).toBe(REGUA_PADRAO.gaps.quente[1]);
    expect(r.gaps.quente[2]).toBe(5);
    // Posições além do array informado seguem o padrão.
    expect(r.gaps.quente[12]).toBe(REGUA_PADRAO.gaps.quente[12]);
  });

  it("max_toques maior que os gaps informados estende repetindo o último padrão", () => {
    const r = parseRegua({ max_toques: 15 });
    expect(r.gaps.frio).toHaveLength(15);
    expect(r.gaps.frio[14]).toBe(REGUA_PADRAO.gaps.frio[12]);
  });

  it("toques de ligação fora do teto são descartados", () => {
    const r = parseRegua({ max_toques: 5, ligacao_nos_toques: [3, 7, 11] });
    expect(r.ligacaoNosToques).toEqual([3]);
  });
});

describe("proximoToque", () => {
  it("régua esgotada (tentativas >= maxToques) devolve null — decisão humana", () => {
    expect(proximoToque(REGUA_PADRAO, "quente", "em_atendimento", 13)).toBeNull();
    expect(proximoToque(REGUA_PADRAO, "quente", "em_atendimento", 20)).toBeNull();
  });

  it("1º toque é imediato (emDias 0), demais seguem os gaps da temperatura", () => {
    expect(proximoToque(REGUA_PADRAO, "quente", "em_atendimento", 0)).toEqual({
      toque: 1,
      emDias: 0,
      canal: "whatsapp",
    });
    expect(proximoToque(REGUA_PADRAO, "quente", "em_atendimento", 1)?.emDias).toBe(
      REGUA_PADRAO.gaps.quente[1],
    );
    expect(proximoToque(REGUA_PADRAO, "frio", "em_atendimento", 5)?.emDias).toBe(
      REGUA_PADRAO.gaps.frio[5],
    );
  });

  it("toques 3, 7 e 11 saem por ligação; os demais por WhatsApp", () => {
    expect(proximoToque(REGUA_PADRAO, "morno", "em_atendimento", 2)?.canal).toBe("ligacao");
    expect(proximoToque(REGUA_PADRAO, "morno", "em_atendimento", 6)?.canal).toBe("ligacao");
    expect(proximoToque(REGUA_PADRAO, "morno", "em_atendimento", 10)?.canal).toBe("ligacao");
    expect(proximoToque(REGUA_PADRAO, "morno", "em_atendimento", 3)?.canal).toBe("whatsapp");
  });

  it("etapa do fundo do funil acelera pelo multiplicador, com piso de 1 dia", () => {
    const base = proximoToque(REGUA_PADRAO, "morno", "em_atendimento", 4)!;
    const acelerado = proximoToque(REGUA_PADRAO, "morno", "analise_credito", 4)!;
    expect(acelerado.emDias).toBe(Math.max(1, Math.round(base.emDias * 0.5)));
    // Gap 1 com multiplicador 0.5 não vira 0: piso de 1 dia.
    expect(proximoToque(REGUA_PADRAO, "quente", "agendado", 1)?.emDias).toBe(1);
  });

  it("temperatura desconhecida cai em morno", () => {
    const semTemp = proximoToque(REGUA_PADRAO, null, "em_atendimento", 2)!;
    const morno = proximoToque(REGUA_PADRAO, "morno", "em_atendimento", 2)!;
    expect(semTemp.emDias).toBe(morno.emDias);
  });
});

describe("apresentação do toque", () => {
  it("título carrega N/13 e a ação do canal", () => {
    expect(tituloDoToque(4, 13, "whatsapp")).toBe("Follow-up 4/13 — WhatsApp");
    expect(tituloDoToque(7, 13, "ligacao")).toBe("Follow-up 7/13 — Ligar");
  });

  it("tipo da tarefa segue o canal (entra no espelho proximo_followup)", () => {
    expect(tipoDaTarefa("whatsapp")).toBe("whatsapp");
    expect(tipoDaTarefa("ligacao")).toBe("ligacao");
  });
});

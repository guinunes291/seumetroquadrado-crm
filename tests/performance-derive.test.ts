import { describe, expect, it } from "vitest";
import {
  conversaoPct,
  mediasDoTime,
  sinalizar,
} from "@/features/inteligencia/performance-derive";
import type { PerformanceRow } from "@/features/inteligencia/queries";

const row = (p: Partial<PerformanceRow>): PerformanceRow => ({
  corretor_id: "c",
  nome: "X",
  presente: true,
  limite_diario_leads: 50,
  leads_recebidos: 0,
  interacoes: 0,
  contatos: 0,
  agendamentos_criados: 0,
  visitas_realizadas: 0,
  no_shows: 0,
  analises: 0,
  tarefas_concluidas: 0,
  vendas: 0,
  vgv: 0,
  primeira_resposta_p50_min: null,
  leads_respondidos: 0,
  carga_ativa: 0,
  capacidade_pct: null,
  atualizado_em: null,
  ...p,
});

describe("cruzamento esforço × conversão", () => {
  const time = [
    row({ corretor_id: "a", leads_recebidos: 100, contatos: 200, vendas: 8 }), // conv 8%
    row({ corretor_id: "b", leads_recebidos: 100, contatos: 300, vendas: 2 }), // esforço alto, conv 2%
    row({ corretor_id: "c", leads_recebidos: 50, contatos: 100, vendas: 8 }), // esforço baixo, conv 16%
  ];
  const medias = mediasDoTime(time);

  it("esforço alto + conversão baixa → mentoria", () => {
    expect(sinalizar(time[1], medias)).toBe("mentoria");
  });

  it("esforço baixo + conversão alta → dar mais lead", () => {
    expect(sinalizar(time[2], medias)).toBe("dar_mais_lead");
  });

  it("na média não sinaliza nada", () => {
    expect(sinalizar(time[0], medias)).toBeNull();
  });

  it("amostra pequena (<5 leads) nunca gera sinal nem conversão", () => {
    const pequeno = row({ leads_recebidos: 3, contatos: 999, vendas: 0 });
    expect(conversaoPct(pequeno)).toBeNull();
    expect(sinalizar(pequeno, medias)).toBeNull();
  });
});

// Insights da Inteligência — deriva, dos MESMOS dados dos relatórios, frases
// de negócio acionáveis: onde o funil vaza, para onde o mês caminha, por que
// se perde e como está a entrada de leads. 100% puro e testável — nenhuma
// chamada de rede aqui.

export type FunilRow = { etapa: string; ordem: number; quantidade: number };
export type SerieRow = {
  dia: string;
  leads: number;
  agendamentos: number;
  visitas: number;
  vendas: number;
};
export type MotivoPerdaRow = { motivo: string; quantidade: number };

export type Insight = {
  tipo: "gargalo" | "previsao" | "perda" | "tendencia" | "conversao";
  intent: "danger" | "warning" | "info" | "success";
  titulo: string;
  detalhe: string;
  /** Recomendação prática — o que fazer com o número. */
  acao?: string;
};

const fmtPct = (n: number) => `${Math.round(n)}%`;

export function gerarInsights(input: {
  funil: FunilRow[];
  serie: SerieRow[];
  motivosPerda: MotivoPerdaRow[];
  /** Dias restantes no mês corrente (para a previsão). */
  diasRestantes: number;
}): Insight[] {
  const out: Insight[] = [];

  // ---- 1. Gargalo do funil: maior queda percentual entre etapas adjacentes ----
  const funil = [...input.funil].sort((a, b) => a.ordem - b.ordem).filter((f) => f.quantidade >= 0);
  let pior: { de: FunilRow; para: FunilRow; queda: number } | null = null;
  for (let i = 0; i < funil.length - 1; i++) {
    const de = funil[i];
    const para = funil[i + 1];
    if (de.quantidade < 5) continue; // amostra pequena gera ruído, não insight
    const queda = 1 - para.quantidade / de.quantidade;
    if (queda > 0 && (!pior || queda > pior.queda)) pior = { de, para, queda };
  }
  if (pior && pior.queda >= 0.3) {
    out.push({
      tipo: "gargalo",
      intent: pior.queda >= 0.6 ? "danger" : "warning",
      titulo: `O funil vaza entre ${pior.de.etapa} → ${pior.para.etapa}`,
      detalhe: `${fmtPct(pior.queda * 100)} dos leads não passam dessa transição (${pior.de.quantidade} → ${pior.para.quantidade}).`,
      acao: "Concentre treino e follow-up nessa transição — é o metro quadrado mais caro do funil.",
    });
  }

  // ---- 2. Previsão do mês: ritmo de vendas × dias restantes ----
  const diasComDado = input.serie.length;
  if (diasComDado >= 5) {
    const vendas = input.serie.reduce((a, r) => a + r.vendas, 0);
    const ritmo = vendas / diasComDado;
    const previsao = Math.round(vendas + ritmo * Math.max(0, input.diasRestantes));
    out.push({
      tipo: "previsao",
      intent: "info",
      titulo: `Previsão do período: ~${previsao} venda(s)`,
      detalhe: `${vendas} venda(s) até agora, ritmo de ${ritmo.toFixed(2)}/dia, ${input.diasRestantes} dia(s) restantes.`,
      acao:
        input.diasRestantes > 0
          ? "Use o Modo Fechamento para priorizar quem tem maior chance de fechar antes do fim do mês."
          : undefined,
    });
  }

  // ---- 3. Motivo de perda dominante ----
  const totalPerdas = input.motivosPerda.reduce((a, m) => a + m.quantidade, 0);
  const topPerda = [...input.motivosPerda].sort((a, b) => b.quantidade - a.quantidade)[0];
  if (topPerda && totalPerdas >= 5) {
    const share = (topPerda.quantidade / totalPerdas) * 100;
    if (share >= 30) {
      out.push({
        tipo: "perda",
        intent: "warning",
        titulo: `"${topPerda.motivo}" domina as perdas`,
        detalhe: `${fmtPct(share)} das perdas do período (${topPerda.quantidade} de ${totalPerdas}).`,
        acao: "Padronize a resposta a essa objeção (biblioteca de objeções + SamiQ) e ataque a causa raiz.",
      });
    }
  }

  // ---- 4. Tendência de entrada: última metade vs. primeira metade da série ----
  if (diasComDado >= 8) {
    const meio = Math.floor(diasComDado / 2);
    const antes = input.serie.slice(0, meio).reduce((a, r) => a + r.leads, 0) / meio;
    const depois = input.serie.slice(meio).reduce((a, r) => a + r.leads, 0) / (diasComDado - meio);
    if (antes > 0) {
      const delta = (depois / antes - 1) * 100;
      if (Math.abs(delta) >= 20) {
        const subiu = delta > 0;
        out.push({
          tipo: "tendencia",
          intent: subiu ? "success" : "danger",
          titulo: `Entrada de leads ${subiu ? "acelerou" : "caiu"} ${fmtPct(Math.abs(delta))}`,
          detalhe: `Média diária foi de ${antes.toFixed(1)} para ${depois.toFixed(1)} leads/dia na segunda metade do período.`,
          acao: subiu
            ? "Garanta SLA de 1º contato — volume alto desperdiçado vira custo de mídia perdido."
            : "Revise campanhas e origens com o gestor antes que o pipeline seque.",
        });
      }
    }
  }

  // ---- 5. Conversão ponta a ponta ----
  if (funil.length >= 2) {
    const primeiro = funil[0];
    const ultimo = funil[funil.length - 1];
    if (primeiro.quantidade >= 10) {
      const conv = (ultimo.quantidade / primeiro.quantidade) * 100;
      out.push({
        tipo: "conversao",
        intent: conv >= 5 ? "success" : "info",
        titulo: `Conversão ponta a ponta: ${conv.toFixed(1)}%`,
        detalhe: `${primeiro.quantidade} leads em "${primeiro.etapa}" viraram ${ultimo.quantidade} em "${ultimo.etapa}" no período.`,
      });
    }
  }

  return out;
}

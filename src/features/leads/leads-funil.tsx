// Funil da Gestão de Carteira — mesmo desenho do funil da Central de Comando,
// mas contando REGISTROS: dos leads que entraram no período (com os filtros da
// tela), quantos chegaram a ter atendimento, visita agendada, visita realizada,
// análise de crédito e venda — pelo histórico (transições, agendamentos,
// visitas, análises, vendas), não pelo status atual. Conta no banco:
// leads_funil_registros_v1.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/features/dashboard/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Degraus } from "@/features/fila-unica/fila-funil";
import {
  ETAPAS_FUNIL,
  tomDaPassagem,
  type EtapaKey,
  type FunilEtapa,
  type FunilLeitura,
  type FunilPassagem,
} from "@/features/fila-unica/funil-derive";

type Params = {
  _na_lixeira?: boolean;
  _origem?: string;
  _corretor?: string;
  _temperatura?: string;
  _periodo_start?: string;
  _periodo_end?: string;
  _search?: string;
  _search_digits?: string;
};

const ORDEM: EtapaKey[] = [
  "entrada",
  "em_atendimento",
  "agendado",
  "visita_realizada",
  "analise_credito",
  "venda",
];
const SUB: Partial<Record<EtapaKey, string>> = {
  entrada: "entraram no período",
  em_atendimento: "tiveram atendimento",
  agendado: "tiveram visita agendada",
  visita_realizada: "visitaram",
  analise_credito: "foram para análise",
  venda: "compraram",
};
const PASS: Record<string, { label: string; meta: number; fonte: string }> = {
  em_atendimento: { label: "atendimento", meta: 50, fonte: "política v1: contato efetivo 50%" },
  agendado: { label: "agendamento", meta: 70, fonte: "rotina comercial: 70%" },
  visita_realizada: { label: "comparecimento", meta: 65, fonte: "protocolo D-2/D-1/D+0" },
  analise_credito: { label: "pasta / proposta", meta: 75, fonte: "rotina comercial: 75%" },
  venda: { label: "fechamento", meta: 30, fonte: "rotina comercial: 30%" },
};

function montar(rows: { etapa: string; quantidade: number }[]): FunilLeitura {
  const q = new Map(rows.map((r) => [r.etapa, Number(r.quantidade)]));
  const maior = Math.max(1, q.get("entrada") ?? 0);
  const etapas: FunilEtapa[] = ORDEM.map((k) => {
    const d = ETAPAS_FUNIL.find((e) => e.key === k)!;
    const n = q.get(k) ?? 0;
    return {
      key: k,
      ordem: d.ordem,
      label: d.label,
      labelCurto: d.labelCurto,
      sub: SUB[k] ?? d.sub,
      quantidade: n,
      parados: 0,
      pctParados: null,
      largura: n <= 0 ? 0.1 : Math.max(0.13, Math.sqrt(n / maior)),
    };
  });
  const passagens: FunilPassagem[] = [];
  for (let i = 0; i < etapas.length - 1; i++) {
    const a = etapas[i];
    const b = etapas[i + 1];
    const p = PASS[b.key];
    const atual = a.quantidade > 0 ? Math.round((b.quantidade / a.quantidade) * 100) : null;
    passagens.push({
      de: a.key,
      para: b.key,
      label: p.label,
      atual,
      meta: p.meta,
      fonte: p.fonte,
      tom: tomDaPassagem(atual, p.meta),
      nota: atual === null ? "sem lead na etapa" : null,
    });
  }
  return {
    recorte: "base",
    dias: 0,
    etapas,
    passagens,
    total: q.get("entrada") ?? 0,
    perdidos: q.get("perdido") ?? 0,
    baseSdr: 0,
    vazamentos: [],
    nota:
      "Dos leads que entraram no período com os filtros acima, quantos chegaram a cada etapa pelo " +
      "histórico de registros (atendimento, agendamento, visita, análise e venda) — não pelo status atual.",
  };
}

export function LeadsFunil({ params }: { params: Params }) {
  const [realce, setRealce] = useState<EtapaKey | null>(null);
  const q = useQuery({
    queryKey: ["leads-funil-registros", params],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("leads_funil_registros_v1", params);
      if (error) throw error;
      return montar((data ?? []) as { etapa: string; quantidade: number }[]);
    },
  });
  return (
    <Card>
      <CardContent className="p-4 md:p-6">
        {q.isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : q.isError || !q.data ? (
          <p className="text-sm text-destructive">Não foi possível carregar o funil.</p>
        ) : q.data.total === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lead entrou com esses filtros.</p>
        ) : (
          <TooltipProvider delayDuration={150}>
            <Degraus leitura={q.data} realce={realce} onRealce={setRealce} />
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}

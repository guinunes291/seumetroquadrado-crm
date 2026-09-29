// Funil da Gestão de Carteira — mesmo desenho do funil da Central de Comando,
// mas alimentado pelas contagens por status que já respeitam os filtros da
// tela (busca, origem, temperatura, período, corretor, contato…). Nenhuma
// conta nova: só reaproveita montarFunil sobre essas contagens. Sem dado de
// "parados" nesse recorte, a barra vermelha fica escondida.

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Degraus } from "@/features/fila-unica/fila-funil";
import { montarFunil, type EtapaKey, type FunilRow } from "@/features/fila-unica/funil-derive";

const STATUS_PARA_ETAPA: Record<string, string> = {
  novo: "entrada",
  aguardando_corretor: "entrada",
  aguardando_atendimento: "aguardando_atendimento",
  aguardando_retorno: "aguardando_retorno",
  qualificacao_corretor: "qualificacao_corretor",
  qualificado: "qualificacao_corretor",
  em_atendimento: "em_atendimento",
  agendado: "agendado",
  visita_realizada: "visita_realizada",
  proposta_enviada: "visita_realizada",
  analise_credito: "analise_credito",
  contrato_fechado: "venda",
  pos_venda: "venda",
  perdido: "perdido",
};

export function LeadsFunil({ counts }: { counts: Record<string, number> }) {
  const [realce, setRealce] = useState<EtapaKey | null>(null);
  const rows: FunilRow[] = Object.entries(counts)
    .filter(([s]) => STATUS_PARA_ETAPA[s])
    .map(([s, q]) => ({ recorte: "base", etapa: STATUS_PARA_ETAPA[s], ordem: 0, quantidade: q, parados: 0 }));
  const base = montarFunil(rows, "base");
  const leitura = {
    ...base,
    etapas: base.etapas.map((e) => ({ ...e, parados: 0, pctParados: null })),
    nota:
      "Funil com os filtros selecionados acima, pelo status atual. As setas medem " +
      '"chegou à etapa seguinte ou além ÷ chegou a esta etapa ou além" — aproximação, sem contar os perdidos.',
  };
  return (
    <Card>
      <CardContent className="p-4 md:p-6">
        {leitura.total === 0 && leitura.perdidos === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lead com esses filtros.</p>
        ) : (
          <Degraus leitura={leitura} realce={realce} onRealce={setRealce} />
        )}
      </CardContent>
    </Card>
  );
}

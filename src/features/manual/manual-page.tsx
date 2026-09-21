// Página /manual — Manual de utilização do CRM, com capturas reais das telas.
// O mesmo conteúdo alimenta o PDF (public/manual/manual-crm.pdf).

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DownloadSimple } from "@phosphor-icons/react";
import { ConteudoOperacao } from "./conteudo-operacao";
import { ConteudoGestao } from "./conteudo-gestao";

const SUMARIO: { id: string; titulo: string }[] = [
  { id: "acesso", titulo: "1. Entrar no sistema" },
  { id: "mapa", titulo: "2. O mapa do sistema" },
  { id: "funil", titulo: "3. As etapas do cliente" },
  { id: "fila", titulo: "4. Fila Única, Reserva e Bolsão" },
  { id: "followup", titulo: "5. Follow-Up (13 toques)" },
  { id: "distribuicao", titulo: "6. Distribuição" },
  { id: "sdr", titulo: "7. Pré-venda (SDR)" },
  { id: "carteira", titulo: "8. Gestão de Carteira" },
  { id: "visita", titulo: "9. Modo Visita" },
  { id: "prospeccao", titulo: "10. Prospecção" },
  { id: "projetos", titulo: "11. Documentação & Projetos" },
  { id: "financeiro", titulo: "12. Assinaturas & Comissões" },
  { id: "bi", titulo: "13. Inteligência do Negócio" },
  { id: "config", titulo: "14. Configurações" },
  { id: "global", titulo: "15. Recursos do dia a dia" },
];

export function ManualPage() {
  return (
    <div>
      <PageHeader
        title="Manual do CRM"
        description="Como usar o sistema de ponta a ponta: cada módulo, cada ação e as telas reais do CRM. Vale para corretor, pré-venda, gestor e administrador."
        actions={
          <Button asChild variant="outline" size="sm">
            <a href="/manual/manual-crm.pdf" target="_blank" rel="noreferrer">
              <DownloadSimple className="mr-1.5 h-4 w-4" />
              Baixar em PDF
            </a>
          </Button>
        }
      />

      <Card className="mb-8">
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Sumário</p>
          <ol className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {SUMARIO.map((s) => (
              <li key={s.id}>
                <a className="text-primary hover:underline" href={`#${s.id}`}>
                  {s.titulo}
                </a>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="space-y-10">
        <ConteudoOperacao />
        <ConteudoGestao />
      </div>

      <p className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        As imagens deste manual são capturas reais do CRM. Números e nomes que aparecem nelas são do
        momento da captura e mudam no dia a dia.
      </p>
    </div>
  );
}

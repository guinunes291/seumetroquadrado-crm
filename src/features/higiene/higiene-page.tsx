import { useState } from "react";
import { Broom, Folders, Info, Stack, UsersThree, Warning } from "@phosphor-icons/react";
import { useHigieneResumo } from "@/hooks/use-higiene-funil";
import { FilaAcao } from "@/features/higiene/fila-acao";
import { PastasTravadas } from "@/features/higiene/pastas-travadas";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HigienePage() {
  // Ligados por padrão: a tela mostra a verdade inteira primeiro e deixa o
  // gestor ESCOLHER esconder. O contrário — esconder por padrão — seria decidir
  // por ele qual número ele pode ver.
  const [incluirLote, setIncluirLote] = useState(true);
  const [incluirNuncaTocado, setIncluirNuncaTocado] = useState(true);

  const { data: resumo, isPending, isError, error, refetch } = useHigieneResumo();

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Broom className="h-6 w-6" weight="duotone" />
          Higiene do Funil
        </h1>
        <p className="text-sm text-muted-foreground">
          O que está parado e custando dinheiro hoje. Números contados no banco, não no navegador.
        </p>
      </header>

      {isError ? (
        <QueryErrorState
          title="Não foi possível ler o resumo da higiene."
          error={error}
          onRetry={() => void refetch()}
        />
      ) : isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              title="Leads vivos"
              value={resumo.vivos}
              icon={UsersThree}
              hint={`${resumo.sem_corretor.toLocaleString("pt-BR")} sem corretor · ${resumo.em_carteira.toLocaleString("pt-BR")} em carteira`}
            />
            <StatTile
              title={`Parados (${resumo.prazo_dias}+ dias)`}
              value={resumo.parados}
              icon={Warning}
              intent={resumo.parados > 0 ? "warning" : "success"}
              hint="Sem MOVIMENTO no sistema — não é o mesmo que sem contato"
            />
            <StatTile
              title="Nunca tocados"
              value={resumo.parados_nunca_tocados}
              icon={Info}
              intent="info"
              hint="Problema de distribuição, não de corretor"
            />
            <StatTile
              title="Relógio de escrita em lote"
              value={resumo.parados_em_lote}
              icon={Stack}
              intent="neutral"
              hint="Importação/migração — não é abandono"
            />
          </div>

          {/*
            O aviso que impede o número de mentir. Quando a maior parte do
            "parado" vem de escrita em lote, o total de cima é sobre uma
            importação, não sobre a operação — e o gestor precisa saber ANTES
            de cobrar alguém.
          */}
          {resumo.parados > 0 && resumo.parados_em_lote / resumo.parados >= 0.2 && (
            <Card className="border-amber-500/40 bg-amber-500/5 p-3">
              <p className="flex items-start gap-2 text-sm">
                <Stack className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>
                    {Math.round((resumo.parados_em_lote / resumo.parados) * 100)}% dos parados
                  </strong>{" "}
                  têm o relógio vindo de escrita em lote — 50 ou mais leads com o mesmo timestamp ao
                  segundo, marca de importação ou migração, não de abandono real. Use o filtro
                  abaixo para separar os dois antes de cobrar carteira.
                </span>
              </p>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">
            Medido em {horaCurta(resumo.medido_em)}. A base se move durante o dia (distribuição a
            cada 5 min, rotinas de SDR e follow-up diárias).
          </p>
        </>
      )}

      <div className="flex flex-wrap items-center gap-6 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <Switch id="f-lote" checked={incluirLote} onCheckedChange={setIncluirLote} />
          <Label htmlFor="f-lote" className="text-sm font-normal">
            Incluir escrita em lote
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="f-virgem"
            checked={incluirNuncaTocado}
            onCheckedChange={setIncluirNuncaTocado}
          />
          <Label htmlFor="f-virgem" className="text-sm font-normal">
            Incluir nunca tocados
          </Label>
        </div>
      </div>

      <Tabs defaultValue="fila">
        <TabsList>
          <TabsTrigger value="fila" className="gap-1">
            <Warning className="h-4 w-4" />
            Fila de ação
          </TabsTrigger>
          <TabsTrigger value="pastas" className="gap-1">
            <Folders className="h-4 w-4" />
            Pastas travadas
          </TabsTrigger>
        </TabsList>
        <TabsContent value="fila" className="mt-4">
          <FilaAcao filtro={{ incluirLote, incluirNuncaTocado }} prazoDias={resumo?.prazo_dias} />
        </TabsContent>
        <TabsContent value="pastas" className="mt-4">
          <PastasTravadas />
        </TabsContent>
      </Tabs>
    </div>
  );
}

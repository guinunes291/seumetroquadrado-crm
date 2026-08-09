// A porta antiga do Modo Blitz (URL nenhuma morre): o conteúdo agora vive em
// features/atendimento/volume-view — o modo Volume de Atender (item 2.7, PR a).
// Esta rota vira redirect para /atendimento?modo=volume no PR (c) do 2.7,
// quando Atender for a porta única do objeto lead.

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { VolumeView } from "@/features/atendimento/volume-view";

export const Route = createFileRoute("/_authenticated/blitz")({
  head: () => ({ meta: [{ title: "Modo Blitz — Seu Metro Quadrado" }] }),
  component: BlitzPage,
  // Contém qualquer exceção de render do Blitz NESTA rota, dentro do layout
  // autenticado — em vez de derrubar o app inteiro no errorComponent raiz
  // ("This page didn't load"). Mostra a mensagem real para o corretor e
  // facilita o diagnóstico, com botão para tentar de novo.
  errorComponent: BlitzError,
});

function BlitzPage() {
  return <VolumeView header="pagina" />;
}

function BlitzError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  // Loga para o console (e para o relatório de erros global, via boundary raiz
  // já existente) sem precisar do white-screen.
  console.error("[Blitz] erro ao renderizar a fila:", error);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Modo Blitz"
        description="Atenda um lead por vez, priorizado por urgência."
      />
      <Card className="mx-auto max-w-xl border-warning/40">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-warning" />
          <div className="font-semibold">Não foi possível carregar sua fila do Blitz</div>
          <p className="text-sm text-muted-foreground">
            Tente novamente. Se o erro continuar, envie esta mensagem para o suporte.
          </p>
          {error?.message && (
            <pre className="max-w-full overflow-auto rounded-md bg-muted/50 p-3 text-left text-xs text-muted-foreground">
              {error.message}
            </pre>
          )}
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Button
              onClick={() => {
                router.invalidate();
                reset();
              }}
            >
              <RotateCcw className="mr-1 h-4 w-4" /> Tentar de novo
            </Button>
            <Button asChild variant="outline">
              <Link to="/leads">Ir para Meus Leads</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

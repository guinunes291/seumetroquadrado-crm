// Aba "Práticas": a fila de correção (mais antiga primeiro) e o registro de
// roleplay presencial, com a mesma rubrica do módulo.

import { useState } from "react";
import { ChatsCircle, CheckSquareOffset } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { CorrecaoPratica } from "./correcao-pratica";
import { tempoDeEspera } from "./derivacao";
import {
  useEquipeAcademia,
  useModulosAcademia,
  usePraticasPendentes,
  type PraticaPendente,
} from "./gestao-client";

export function AbaPraticas() {
  const equipe = useEquipeAcademia();
  const praticas = usePraticasPendentes();
  const modulos = useModulosAcademia();
  const [corrigindo, setCorrigindo] = useState<PraticaPendente | null>(null);
  const [roleplay, setRoleplay] = useState(false);

  const erro = equipe.error ?? praticas.error ?? modulos.error;
  if (erro) {
    return (
      <QueryErrorState
        title="Não foi possível carregar as práticas."
        error={erro}
        onRetry={() => {
          void equipe.refetch();
          void praticas.refetch();
          void modulos.refetch();
        }}
      />
    );
  }
  const eq = equipe.data;
  const pendentes = praticas.data;
  const mods = modulos.data;
  if (!eq || !pendentes || !mods) return <Skeleton className="h-64 w-full" />;

  const nomes = new Map(eq.corretores.map((c) => [c.corretor_id, c.corretor_nome]));
  const temPublicado = mods.some((m) => m.status === "publicado");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          A mais antiga primeiro. Feedback é obrigatório: 1 foco de melhoria.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRoleplay(true)}
          disabled={eq.corretores.length === 0 || !temPublicado}
        >
          <ChatsCircle className="mr-1.5 h-4 w-4" /> Registrar roleplay presencial
        </Button>
      </div>

      {pendentes.length === 0 ? (
        <EmptyState
          icon={CheckSquareOffset}
          title="Nenhuma prática esperando correção."
          description="Quando alguém da sua equipe enviar uma prática, ela aparece aqui."
        />
      ) : (
        <div className="space-y-2">
          {pendentes.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {nomes.get(p.corretor_id) ?? "Corretor"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.modulo ? `${p.modulo.codigo} · ${p.modulo.titulo}` : "Módulo"}
                  </p>
                </div>
                <StatusBadge intent="warning">{tempoDeEspera(p.enviado_em)}</StatusBadge>
                <Button size="sm" onClick={() => setCorrigindo(p)}>
                  Corrigir
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {corrigindo && (
        <CorrecaoPratica
          modo="pratica"
          pratica={corrigindo}
          nomeCorretor={nomes.get(corrigindo.corretor_id) ?? "Corretor"}
          aberto
          onFechar={() => setCorrigindo(null)}
        />
      )}
      {roleplay && (
        <CorrecaoPratica
          modo="roleplay"
          corretores={eq.corretores}
          modulos={mods}
          aberto
          onFechar={() => setRoleplay(false)}
        />
      )}
    </div>
  );
}

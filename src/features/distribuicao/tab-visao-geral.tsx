// Aba Visão Geral — saúde das 3 roletas + últimas decisões do motor.

import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, Bot, Globe, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { proximoDaVez, roletaLabel, RESULTADO_LABEL } from "@/lib/distribuicao";
import type { RoletaSlug } from "@/lib/distribuicao";
import {
  useElegibilidadeRoleta,
  useHistoricoDistribuicao,
  useNomesPerfis,
} from "./queries";

const ROLETA_ICON = { plantao: Users, marquinhos: Bot, landing: Globe } as const;

function RoletaSaudeCard({ slug }: { slug: RoletaSlug }) {
  const q = useElegibilidadeRoleta(slug);
  const linhas = q.data ?? [];
  const ativos = linhas.filter((l) => l.participante_ativo && !l.pausado);
  const aptos = linhas.filter((l) => l.apto);
  const proximo = proximoDaVez(aptos);
  const Icon = ROLETA_ICON[slug];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Icon className="h-4 w-4 text-primary" /> {roletaLabel(slug)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-2xl font-semibold tabular-nums">
                {aptos.length}
              </span>
              <span className="text-xs text-muted-foreground">
                aptos de {ativos.length} ativos ({linhas.length} participantes)
              </span>
            </div>
            {aptos.length === 0 ? (
              <StatusBadge intent="danger">Sem corretor apto — leads irão para exceção</StatusBadge>
            ) : (
              <div className="text-xs text-muted-foreground">
                Próximo da vez:{" "}
                <span className="font-medium text-foreground">
                  {linhas.find((l) => l.corretor_id === proximo?.corretor_id)?.nome ?? "—"}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function TabVisaoGeral({ onVerExcecoes }: { onVerExcecoes: () => void }) {
  const logQ = useHistoricoDistribuicao({ dias: 1 });
  const nomesQ = useNomesPerfis();
  const nomes = nomesQ.data;
  const decisoes = (logQ.data ?? []).slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <RoletaSaudeCard slug="plantao" />
        <RoletaSaudeCard slug="marquinhos" />
        <RoletaSaudeCard slug="landing" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm">Últimas decisões do motor (24h)</CardTitle>
          <Button variant="ghost" size="sm" onClick={onVerExcecoes}>
            Ver fila de exceções <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {logQ.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : decisoes.length === 0 ? (
            <EmptyState
              title="Nenhuma decisão nas últimas 24h"
              description="Assim que um lead entrar, a decisão da roleta aparece aqui com o motivo completo."
            />
          ) : (
            <ul className="divide-y">
              {decisoes.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {format(parseISO(d.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                  <StatusBadge
                    intent={
                      d.resultado === "sucesso"
                        ? "success"
                        : d.resultado === "sem_corretor" || d.resultado === "excecao"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {RESULTADO_LABEL[d.resultado] ?? d.resultado}
                  </StatusBadge>
                  <Link
                    to="/leads/$leadId"
                    params={{ leadId: d.lead_id }}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {d.leads?.nome ?? "(lead)"}
                  </Link>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {roletaLabel(d.roleta_slug)}
                  </span>
                  <span className="hidden w-36 shrink-0 truncate text-xs sm:inline">
                    {d.corretor_id ? (nomes?.get(d.corretor_id) ?? "—") : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

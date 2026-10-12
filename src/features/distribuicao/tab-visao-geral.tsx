// Aba Visão Geral — saúde das roletas por filial e de origem + últimas
// decisões do motor.

import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowRight,
  Fire,
  Globe,
  Robot,
  Storefront,
  Tray,
  UsersThree,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { proximoDaVez, roletaLabel, RESULTADO_LABEL } from "@/lib/distribuicao";
import {
  useElegibilidadeRoleta,
  useHistoricoDistribuicao,
  useNomesPerfis,
  useRoletas,
} from "./queries";

const ROLETA_ICON: Record<string, typeof UsersThree> = {
  plantao: UsersThree,
  marquinhos: Robot,
  landing: Globe,
  base: Tray,
  "agendados-sdr": Fire,
};

/** O cartão de saúde de uma roleta. O ícone e a frase do "sem apto" vêm do
 *  tipo: a roleta de filial (tipo zona) segura o lead na filial — ele nunca
 *  vai para outra zona —, as de origem mandam para a exceção. */
function RoletaSaudeCard({
  slug,
  nome,
  tipo,
}: {
  slug: string;
  nome?: string | null;
  tipo?: string | null;
}) {
  const q = useElegibilidadeRoleta(slug);
  const linhas = q.data ?? [];
  const ativos = linhas.filter((l) => l.participante_ativo && !l.pausado);
  const aptos = linhas.filter((l) => l.apto);
  const proximo = proximoDaVez(aptos);
  const ehFilial = tipo === "zona";
  const Icon = ehFilial ? Storefront : (ROLETA_ICON[slug] ?? UsersThree);

  return (
    <Card data-testid={`saude-${slug}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Icon className="h-4 w-4 text-primary" /> {roletaLabel(slug, nome)}
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
              <StatusBadge intent="danger">
                {ehFilial
                  ? "Sem corretor apto — leads da filial esperam (não vão para outra zona)"
                  : "Sem corretor apto — leads irão para exceção"}
              </StatusBadge>
            ) : (
              <div
                className="text-xs text-muted-foreground"
                title="Há mais tempo sem receber nesta roleta; a vez por zona está na aba A vez por zona."
              >
                Há mais tempo sem receber:{" "}
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
  const logQ = useHistoricoDistribuicao({ dias: 1, limite: 20 });
  const nomesQ = useNomesPerfis();
  const roletasQ = useRoletas();
  const nomes = nomesQ.data;
  const decisoes = (logQ.data ?? []).slice(0, 12);
  // Um cartão por filial: as roletas de tipo 'zona' ativas, do banco (a 0079
  // deixou as seis zona-* inativas). A ordem de slug já põe Barra Funda,
  // Belém, Liberdade; a aba Filas é que ordena por filiais.ordem.
  const filiais = (roletasQ.data ?? []).filter((r) => r.tipo === "zona" && r.ativo);

  return (
    <div className="space-y-4">
      {/* Roletas por filial primeiro — todo lead com zona vai para a filial
          que atende a zona dele e só para ela (zona estrita); as de origem
          atendem só o lead SEM zona. */}
      <div className="grid gap-4 md:grid-cols-3">
        {filiais.map((r) => (
          <RoletaSaudeCard key={r.slug} slug={r.slug} nome={r.nome} tipo={r.tipo} />
        ))}
      </div>
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

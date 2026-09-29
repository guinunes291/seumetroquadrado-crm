// Aba "Agora": abre no que precisa de ação, como a Higiene do Funil.
// Práticas esperando correção (a mais antiga primeiro, com o tempo de espera),
// atribuições vencidas, quem está sem atividade na trilha há 7 dias ou mais
// e o card do gate da roleta em sombra.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClockCountdown, Hourglass, ShieldCheck, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";
import { useUserRoles } from "@/hooks/use-auth";
import { dataBr, diasAte } from "../formato";
import { hojeBrasilia } from "../estado-modulo";
import { CorrecaoPratica } from "./correcao-pratica";
import { resumoDoGate, semAtividade, tempoDeEspera } from "./derivacao";
import { mensagemDaGestao } from "./mensagens";
import {
  useAtribuicoesAbertas,
  useDefinirModoGate,
  useEquipeAcademia,
  useGateSombra,
  useModulosAcademia,
  usePraticasPendentes,
  type PraticaPendente,
} from "./gestao-client";

export function CardGate() {
  const { isAdmin } = useUserRoles();
  const gate = useGateSombra();
  const mudar = useDefinirModoGate();
  if (gate.isPending) return <Skeleton className="h-28 w-full" />;
  if (gate.isError || !gate.data) return null;
  const { modo, linhas } = gate.data;
  // Desligada, o gestor não tem o que ver; o admin vê o card para ligar.
  if (modo !== "sombra" && !isAdmin) return null;
  const ligada = modo === "sombra";
  const r = resumoDoGate(linhas);
  const alternar = () =>
    mudar.mutate(ligada ? "desligado" : "sombra", {
      onSuccess: () => toast.success(ligada ? "Simulação desligada." : "Simulação ligada."),
      onError: (e) => toast.error(mensagemDaGestao(e)),
    });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4" /> Gate da roleta em sombra
        </CardTitle>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={alternar} disabled={mudar.isPending}>
            {ligada ? "Desligar simulação" : "Ligar simulação"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {!ligada ? (
          <p className="text-muted-foreground">
            Simulação desligada. Ligada, mostra quanto dos leads dos últimos 30 dias foi para quem
            ainda não está habilitado. Só leitura: não bloqueia a roleta.
          </p>
        ) : r.totalLeads === 0 ? (
          <p className="text-muted-foreground">Nenhum lead distribuído nos últimos 30 dias.</p>
        ) : (
          <>
            <p>
              <span className="font-semibold">{r.leadsNaoHabilitados}</span> de {r.totalLeads} leads
              dos últimos 30 dias ({r.pctNaoHabilitados ?? 0}%) foram para inscritos ainda não
              habilitados.
            </p>
            <p className="text-xs text-muted-foreground">
              Outros {r.leadsForaDaAcademia} foram para quem não está na Academia. Só leitura: a
              Academia mostra o selo e não bloqueia a roleta.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AbaAgora({ irPara }: { irPara: (aba: string) => void }) {
  const equipe = useEquipeAcademia();
  const praticas = usePraticasPendentes();
  const atribuicoes = useAtribuicoesAbertas();
  const modulos = useModulosAcademia();
  const [corrigindo, setCorrigindo] = useState<PraticaPendente | null>(null);
  const hoje = hojeBrasilia();

  const erro = equipe.error ?? praticas.error ?? atribuicoes.error;
  if (erro) {
    return (
      <QueryErrorState
        title="Não foi possível carregar o que precisa de ação."
        error={erro}
        onRetry={() => {
          void equipe.refetch();
          void praticas.refetch();
          void atribuicoes.refetch();
        }}
      />
    );
  }
  const eq = equipe.data;
  const pendentes = praticas.data;
  const abertas = atribuicoes.data;
  if (!eq || !pendentes || !abertas) return <Skeleton className="h-64 w-full" />;

  const nomes = new Map(eq.corretores.map((c) => [c.corretor_id, c.corretor_nome]));
  const titulos = new Map((modulos.data ?? []).map((m) => [m.id, `${m.codigo} · ${m.titulo}`]));
  const vencidas = abertas.filter(
    (a) => a.prazo !== null && diasAte(a.prazo, hoje) < 0 && nomes.has(a.corretor_id),
  );
  const parados = eq.corretores.filter((c) => semAtividade(c, hoje));
  const nada = pendentes.length === 0 && vencidas.length === 0 && parados.length === 0;

  return (
    <div className="space-y-4">
      {eq.corretores.length === 0 && (
        <EmptyState
          icon={Hourglass}
          title="Ninguém da sua equipe está na Academia ainda."
          description="Quem entra na trilha é decisão do admin, na aba Participantes."
          action={
            <Button variant="outline" size="sm" onClick={() => irPara("participantes")}>
              Ver participantes
            </Button>
          }
        />
      )}

      {nada && eq.corretores.length > 0 && (
        <EmptyState
          icon={ClockCountdown}
          title="Nada esperando por você agora."
          description="Nenhuma prática para corrigir, nenhuma atribuição vencida e ninguém parado na trilha."
        />
      )}

      {pendentes.length > 0 && (
        <section aria-labelledby="agora-praticas">
          <h2 id="agora-praticas" className="mb-2 text-sm font-semibold">
            Práticas para corrigir ({pendentes.length})
          </h2>
          <div className="space-y-2">
            {pendentes.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {nomes.get(p.corretor_id) ?? "Corretor"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.modulo ? `${p.modulo.codigo} · ${p.modulo.titulo}` : "Módulo"} · esperando
                      há {tempoDeEspera(p.enviado_em)}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setCorrigindo(p)}>
                    Corrigir
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {vencidas.length > 0 && (
        <section aria-labelledby="agora-vencidas">
          <h2 id="agora-vencidas" className="mb-2 text-sm font-semibold">
            Atribuições vencidas ({vencidas.length})
          </h2>
          <div className="space-y-2">
            {vencidas.map((a) => (
              <Card key={a.id} className="border-destructive/40">
                <CardContent className="flex items-center gap-3 py-3">
                  <Warning className="h-5 w-5 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{nomes.get(a.corretor_id)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {titulos.get(a.modulo_id) ?? "Módulo"} · venceu em {dataBr(a.prazo)}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/academia/gestao/corretor/$corretorId"
                      params={{ corretorId: a.corretor_id }}
                    >
                      Abrir
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {parados.length > 0 && (
        <section aria-labelledby="agora-parados">
          <h2 id="agora-parados" className="mb-2 text-sm font-semibold">
            Sem atividade na trilha há 7 dias ou mais ({parados.length})
          </h2>
          <div className="space-y-2">
            {parados.map((c) => (
              <Link
                key={c.corretor_id}
                to="/academia/gestao/corretor/$corretorId"
                params={{ corretorId: c.corretor_id }}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.corretor_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.ultima_atividade
                      ? `Última atividade em ${dataBr(c.ultima_atividade)}`
                      : `Nunca abriu uma aula. Na trilha desde ${dataBr(c.inicio_trilha)}`}
                  </p>
                </div>
                <StatusBadge intent="warning">Parado</StatusBadge>
              </Link>
            ))}
          </div>
        </section>
      )}

      <CardGate />

      {corrigindo && (
        <CorrecaoPratica
          modo="pratica"
          pratica={corrigindo}
          nomeCorretor={nomes.get(corrigindo.corretor_id) ?? "Corretor"}
          aberto
          onFechar={() => setCorrigindo(null)}
        />
      )}
    </div>
  );
}

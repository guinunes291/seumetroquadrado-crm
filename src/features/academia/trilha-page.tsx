import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDots,
  CheckCircle,
  GraduationCap,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AcademiaModuloStatusRow } from "@/integrations/supabase/academia-pendente";
import { useProximoEncontro, useTrilha } from "./academia-client";
import { dataBr, diasAte } from "./formato";
import { EsqueletoAcademia } from "./guard";
import { ROTULO_NIVEL, proximoNivel } from "./niveis";
import {
  ROTULO_ESTADO,
  continueDeOndeParou,
  estadoDoModulo,
  hojeBrasilia,
  modulosDaFase,
  progressoDoModulo,
  type EstadoModulo,
} from "./estado-modulo";

const TOM_ESTADO: Record<EstadoModulo, "success" | "warning" | "danger" | "info" | "neutral"> = {
  nao_iniciado: "neutral",
  em_andamento: "info",
  quiz_pendente: "warning",
  pratica_pendente: "warning",
  concluido: "success",
  atrasado: "danger",
};

function LinhaModulo({ m, hoje }: { m: AcademiaModuloStatusRow; hoje: string }) {
  const estado = estadoDoModulo(m, hoje);
  return (
    <Link
      to="/academia/modulo/$codigo"
      params={{ codigo: m.codigo }}
      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{m.titulo}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {m.codigo} · {m.aulas_feitas} de {m.aulas_total} aulas
        </p>
      </div>
      <StatusBadge intent={TOM_ESTADO[estado]}>{ROTULO_ESTADO[estado]}</StatusBadge>
    </Link>
  );
}

export function TrilhaPage() {
  const trilha = useTrilha();
  const encontro = useProximoEncontro();
  const hoje = hojeBrasilia();

  if (trilha.isPending) return <EsqueletoAcademia />;
  if (trilha.isError) {
    return (
      <div className="p-4 md:p-6">
        <QueryErrorState
          title="Não foi possível carregar sua trilha."
          error={trilha.error}
          onRetry={() => void trilha.refetch()}
        />
      </div>
    );
  }

  const { resumo, fases, faseStatus, modulos, atribuicoes } = trilha.data;
  const nivel = resumo?.nivel ?? "iniciante";
  const alvo = proximoNivel(nivel);
  const continuar = continueDeOndeParou(modulos);
  const completasPorFase = new Map(faseStatus.map((f) => [f.fase, f.completa]));

  const obrigatorios = modulos.filter((m) => m.obrigatorio).length;
  const concluidos = modulos.filter((m) => m.obrigatorio && m.concluido).length;
  const pct = obrigatorios > 0 ? Math.round((concluidos / obrigatorios) * 100) : 0;

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Minha trilha"
        description={
          alvo
            ? `Você está em ${ROTULO_NIVEL[nivel]}. Próximo nível: ${ROTULO_NIVEL[alvo]}.`
            : `Você está em ${ROTULO_NIVEL[nivel]}, o topo da trilha.`
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/academia/progresso">Meu progresso</Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">Módulos obrigatórios</span>
            <span className="text-sm text-muted-foreground">
              {concluidos} de {obrigatorios}
            </span>
          </div>
          <Progress value={pct} aria-label="Progresso da trilha" />
        </CardContent>
      </Card>

      {atribuicoes.length > 0 && (
        <section className="mb-4" aria-labelledby="titulo-atribuicoes">
          <h2 id="titulo-atribuicoes" className="mb-2 text-sm font-semibold">
            Seu gestor pediu
          </h2>
          <div className="space-y-2">
            {atribuicoes.map((a) => {
              const dias = a.prazo ? diasAte(a.prazo, hoje) : null;
              const atrasada = dias !== null && dias < 0;
              return (
                <Card key={a.id} className={atrasada ? "border-destructive/50" : undefined}>
                  <CardContent className="flex items-center gap-3 py-3">
                    {atrasada && <Warning className="h-5 w-5 shrink-0 text-destructive" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.titulo ?? a.modulo_id}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {a.motivo ? `${a.motivo}. ` : ""}
                        {a.prazo
                          ? atrasada
                            ? `Venceu em ${dataBr(a.prazo)}.`
                            : `Prazo: ${dataBr(a.prazo)}.`
                          : "Sem prazo."}
                      </p>
                    </div>
                    {a.codigo && (
                      <Button asChild size="sm" variant={atrasada ? "default" : "outline"}>
                        <Link to="/academia/modulo/$codigo" params={{ codigo: a.codigo }}>
                          Abrir
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {continuar && (
        <Card className="mb-4 border-primary/40">
          <CardContent className="flex items-center gap-3 py-4">
            <GraduationCap className="h-6 w-6 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Continue de onde parou</p>
              <p className="truncate text-sm font-medium">{continuar.titulo}</p>
              <Progress className="mt-2" value={progressoDoModulo(continuar)} />
            </div>
            <Button asChild size="sm">
              <Link to="/academia/modulo/$codigo" params={{ codigo: continuar.codigo }}>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {modulos.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Sua trilha ainda está vazia."
          description="Nenhum módulo foi publicado até agora. Assim que o primeiro sair, ele aparece aqui."
        />
      ) : (
        <Accordion
          type="multiple"
          defaultValue={continuar ? [`fase-${continuar.fase}`] : ["fase-0"]}
          className="w-full"
        >
          {fases.map((f) => {
            const daFase = modulosDaFase(modulos, f.numero);
            if (daFase.length === 0) return null;
            const completa = completasPorFase.get(f.numero) === true;
            return (
              <AccordionItem key={f.numero} value={`fase-${f.numero}`}>
                <AccordionTrigger className="text-left">
                  <span className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                    {completa && <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />}
                    <span className="truncate text-sm font-medium">
                      Fase {f.numero}: {f.nome}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {daFase.filter((m) => m.concluido).length}/{daFase.length}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {f.foco && <p className="mb-2 text-xs text-muted-foreground">{f.foco}</p>}
                  <div className="space-y-2">
                    {daFase.map((m) => (
                      <LinhaModulo key={m.modulo_id} m={m} hoje={hoje} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {encontro.data && (
        <Card className="mt-4">
          <CardContent className="flex items-center gap-3 py-3">
            <CalendarDots className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Próximo encontro presencial</p>
              <p className="truncate text-sm font-medium">{encontro.data.titulo}</p>
              <p className="text-xs text-muted-foreground">
                {new Intl.DateTimeFormat("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(encontro.data.inicio))}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

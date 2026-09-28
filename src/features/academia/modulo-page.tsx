import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle, Circle, PaperPlaneTilt, Question } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { useEnviarPratica, useModulo } from "./academia-client";
import { erroAmigavel } from "./erros";
import { criteriosDaRubrica, listaDeTextos } from "./formato";
import { EsqueletoAcademia } from "./guard";

/** Por que o quiz está trancado, ou null se está liberado. */
export function motivoQuizTrancado(aulasTotal: number, aulasFeitas: number): string | null {
  if (aulasTotal === 0) return "Este módulo ainda não tem aula publicada.";
  if (aulasFeitas < aulasTotal) {
    const faltam = aulasTotal - aulasFeitas;
    return faltam === 1
      ? "Falta 1 aula para liberar o quiz."
      : `Faltam ${faltam} aulas para liberar o quiz.`;
  }
  return null;
}

export function ModuloPage({ codigo }: { codigo: string }) {
  const q = useModulo(codigo);
  const enviarPratica = useEnviarPratica(codigo);
  const [texto, setTexto] = useState("");
  const [url, setUrl] = useState("");

  if (q.isPending) return <EsqueletoAcademia />;
  if (q.isError) {
    return (
      <div className="p-4 md:p-6">
        <QueryErrorState
          title="Não foi possível carregar o módulo."
          error={q.error}
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }

  const { modulo, status, aulas, aulasFeitas, praticas } = q.data;
  if (!modulo) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={Question}
          title="Módulo não encontrado."
          description="Ele pode ter saído do ar para revisão."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/academia">Voltar para a trilha</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const feitas = aulas.filter((a) => aulasFeitas.has(a.id)).length;
  const trancado = motivoQuizTrancado(aulas.length, feitas);
  const ultimaPratica = praticas[0] ?? null;
  const objetivos = listaDeTextos(modulo.objetivos);
  const criterios = criteriosDaRubrica(modulo.pratica_rubrica);
  const erroEnvio = enviarPratica.isError ? erroAmigavel(enviarPratica.error) : null;

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={modulo.titulo}
        description={`${modulo.codigo} · Fase ${modulo.fase}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/academia">Voltar</Link>
          </Button>
        }
      />

      {modulo.objetivo_principal && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <p className="text-sm">{modulo.objetivo_principal}</p>
          </CardContent>
        </Card>
      )}

      {objetivos.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold">Ao final você vai saber</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {objetivos.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-semibold">
          Aulas ({feitas} de {aulas.length})
        </h2>
        {aulas.length === 0 ? (
          <EmptyState title="Nenhuma aula publicada ainda." />
        ) : (
          <div className="space-y-2">
            {aulas.map((a) => {
              const ok = aulasFeitas.has(a.id);
              return (
                <Link
                  key={a.id}
                  to="/academia/modulo/$codigo/aula/$ordem"
                  params={{ codigo: modulo.codigo, ordem: String(a.ordem) }}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                >
                  {ok ? (
                    <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" weight="fill" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.titulo}</p>
                    {a.duracao_min && (
                      <p className="text-xs text-muted-foreground">{a.duracao_min} min</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-semibold">Quiz</h2>
        <Card>
          <CardContent className="py-4">
            {status?.quiz_aprovado && (
              <div className="mb-3">
                <StatusBadge intent="success">
                  Aprovado com {Number(status.melhor_nota ?? 0).toFixed(0)}
                </StatusBadge>
              </div>
            )}
            {trancado ? (
              <>
                <p className="mb-3 text-sm text-muted-foreground">{trancado}</p>
                <Button disabled className="w-full sm:w-auto">
                  Fazer o quiz
                </Button>
              </>
            ) : (
              <Button asChild className="w-full sm:w-auto">
                <Link to="/academia/modulo/$codigo/quiz" params={{ codigo: modulo.codigo }}>
                  {status?.quiz_aprovado ? "Refazer o quiz" : "Fazer o quiz"}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </section>

      {modulo.exige_pratica && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Prática</h2>
          <Card>
            <CardContent className="space-y-3 py-4">
              {modulo.pratica_descricao && <p className="text-sm">{modulo.pratica_descricao}</p>}
              {criterios.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Você vai ser avaliado em
                  </p>
                  <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                    {criterios.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {ultimaPratica && (
                <div className="rounded-lg border p-3">
                  <StatusBadge
                    intent={
                      ultimaPratica.status === "aprovada"
                        ? "success"
                        : ultimaPratica.status === "refazer"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {ultimaPratica.status === "aprovada"
                      ? "Aprovada"
                      : ultimaPratica.status === "refazer"
                        ? "Refazer"
                        : "Aguardando avaliação"}
                  </StatusBadge>
                  {ultimaPratica.feedback && (
                    <p className="mt-2 text-sm">
                      <span className="font-medium">Feedback do gestor: </span>
                      {ultimaPratica.feedback}
                    </p>
                  )}
                </div>
              )}

              {ultimaPratica?.status !== "pendente" && ultimaPratica?.status !== "aprovada" && (
                <div className="space-y-2">
                  <Textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Conte o que você fez: com qual lead, o que aconteceu, o que aprendeu."
                    rows={4}
                  />
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Link da gravação ou do documento (opcional)"
                    inputMode="url"
                  />
                  {erroEnvio && (
                    <div className="rounded-md border border-destructive/40 p-3">
                      <p className="text-sm font-medium">{erroEnvio.titulo}</p>
                      <p className="text-xs text-muted-foreground">{erroEnvio.detalhe}</p>
                    </div>
                  )}
                  <Button
                    className="w-full sm:w-auto"
                    disabled={enviarPratica.isPending || (texto.trim() === "" && url.trim() === "")}
                    onClick={() =>
                      enviarPratica.mutate(
                        { moduloId: modulo.id, texto, url },
                        {
                          onSuccess: () => {
                            setTexto("");
                            setUrl("");
                          },
                        },
                      )
                    }
                  >
                    <PaperPlaneTilt className="mr-2 h-4 w-4" />
                    Enviar prática
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

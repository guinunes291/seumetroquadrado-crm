import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CheckCircle, FilmSlate, Presentation } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { useMarcarAula, useModulo } from "./academia-client";
import { erroAmigavel } from "./erros";
import { EsqueletoAcademia } from "./guard";
import { Markdown } from "./markdown";
import { ehVideoDireto, urlDeEmbedGamma } from "./midia";

export function AulaPage({ codigo, ordem }: { codigo: string; ordem: number }) {
  const q = useModulo(codigo);
  const marcar = useMarcarAula(codigo);
  const navigate = useNavigate();

  if (q.isPending) return <EsqueletoAcademia />;
  if (q.isError) {
    return (
      <div className="p-4 md:p-6">
        <QueryErrorState
          title="Não foi possível carregar a aula."
          error={q.error}
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }

  const { modulo, aulas, aulasFeitas } = q.data;
  const aula = aulas.find((a) => a.ordem === ordem) ?? null;

  if (!modulo || !aula) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          title="Aula não encontrada."
          description="Ela pode ter saído do ar para revisão."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/academia">Voltar para a trilha</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const feita = aulasFeitas.has(aula.id);
  const proxima = aulas.find((a) => a.ordem > aula.ordem) ?? null;
  const embed = urlDeEmbedGamma(aula.url_material ?? modulo.url_gamma);
  const erro = marcar.isError ? erroAmigavel(marcar.error) : null;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/academia/modulo/$codigo" params={{ codigo }}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {modulo.titulo}
          </Link>
        </Button>
      </div>

      <h1 className="font-display text-xl font-semibold tracking-tight">{aula.titulo}</h1>
      <p className="mb-4 mt-1 text-xs text-muted-foreground">
        Aula {aula.ordem} de {aulas.length}
        {aula.duracao_min ? ` · ${aula.duracao_min} min` : ""}
      </p>

      {aula.tipo === "slides" &&
        (embed ? (
          <div className="mb-4 aspect-video w-full overflow-hidden rounded-lg border">
            <iframe
              src={embed}
              title={aula.titulo}
              className="h-full w-full"
              allow="fullscreen"
              loading="lazy"
            />
          </div>
        ) : (
          <Card className="mb-4">
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <Presentation className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Os slides desta aula abrem fora do CRM.
              </p>
              {(aula.url_material ?? modulo.url_gamma) && (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={(aula.url_material ?? modulo.url_gamma) as string}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir slides
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}

      {aula.tipo === "video" &&
        (ehVideoDireto(aula.url_video) ? (
          <video src={aula.url_video as string} controls className="mb-4 w-full rounded-lg border">
            <track kind="captions" />
          </video>
        ) : (
          <Card className="mb-4">
            <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
              <FilmSlate className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Vídeo em breve.</p>
              <p className="text-xs text-muted-foreground">
                A gravação ainda não foi publicada. O texto abaixo cobre o mesmo conteúdo.
              </p>
            </CardContent>
          </Card>
        ))}

      {aula.conteudo_md ? (
        <Markdown>{aula.conteudo_md}</Markdown>
      ) : (
        <p className="text-sm text-muted-foreground">
          Esta aula não tem texto, só o material acima.
        </p>
      )}

      {aula.url_material && aula.tipo !== "slides" && (
        <p className="mt-4">
          <a
            href={aula.url_material}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline"
          >
            Material de apoio
          </a>
        </p>
      )}

      {erro && (
        <div className="mt-4 rounded-md border border-destructive/40 p-3">
          <p className="text-sm font-medium">{erro.titulo}</p>
          <p className="text-xs text-muted-foreground">{erro.detalhe}</p>
        </div>
      )}

      <div className="sticky bottom-0 mt-6 flex flex-col gap-2 border-t bg-background/95 py-3 backdrop-blur sm:flex-row">
        <Button
          className="w-full sm:w-auto"
          variant={feita ? "outline" : "default"}
          disabled={marcar.isPending}
          onClick={() => marcar.mutate({ aulaId: aula.id, concluida: !feita })}
        >
          <CheckCircle className="mr-2 h-4 w-4" weight={feita ? "fill" : "regular"} />
          {feita ? "Aula concluída" : "Concluí esta aula"}
        </Button>
        <Button
          className="w-full sm:w-auto"
          variant="secondary"
          onClick={() =>
            proxima
              ? void navigate({
                  to: "/academia/modulo/$codigo/aula/$ordem",
                  params: { codigo, ordem: String(proxima.ordem) },
                })
              : void navigate({ to: "/academia/modulo/$codigo", params: { codigo } })
          }
        >
          {proxima ? "Próxima" : "Voltar ao módulo"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

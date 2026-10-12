import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle, FilmSlate, Presentation } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { StickyActionRail } from "@/components/ui/sticky-action-rail";
import { useModuloAtual } from "@/features/nav/modulo-atual";
import { useMarcarAula, useModulo } from "./academia-client";
import { erroAmigavel } from "./erros";
import { EsqueletoAcademia } from "./guard";
import { Markdown } from "./markdown";
import { ehVideoDireto, urlDeEmbedGamma } from "./midia";

/**
 * A aula é um leitor, não um painel (padrão Lançamento, 2026-10): um cabeçalho
 * só (o eyebrow diz módulo, aula e posição; a trilha do header leva de volta
 * ao módulo), o material como corpo e duas ações no fim. No celular as ações
 * vão para a barra fixa do sistema; no desktop ficam numa linha ao fim do
 * texto, onde a leitura termina.
 */
export function AulaPage({ codigo, ordem }: { codigo: string; ordem: number }) {
  const q = useModulo(codigo);
  const marcar = useMarcarAula(codigo);
  const navigate = useNavigate();
  // "Módulo 10" vem do shell, pela mesma regra da sidebar; fora dele, some.
  const moduloNav = useModuloAtual();

  if (q.isPending) return <EsqueletoAcademia />;
  if (q.isError) {
    return (
      <QueryErrorState
        title="Não foi possível carregar a aula."
        error={q.error}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const { modulo, aulas, aulasFeitas } = q.data;
  const aula = aulas.find((a) => a.ordem === ordem) ?? null;

  if (!modulo || !aula) {
    return (
      <EmptyState
        title="Aula não encontrada."
        description="Ela pode ter saído do ar para revisão."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/academia">Voltar para a trilha</Link>
          </Button>
        }
      />
    );
  }

  const feita = aulasFeitas.has(aula.id);
  const proxima = aulas.find((a) => a.ordem > aula.ordem) ?? null;
  const embed = urlDeEmbedGamma(aula.url_material ?? modulo.url_gamma);
  const erro = marcar.isError ? erroAmigavel(marcar.error) : null;
  const eyebrow = [
    moduloNav ? `Módulo ${String(moduloNav.numero).padStart(2, "0")}` : null,
    modulo.titulo,
    `Aula ${aula.ordem} de ${aulas.length}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const alternarConcluida = () => marcar.mutate({ aulaId: aula.id, concluida: !feita });
  const seguir = () =>
    proxima
      ? void navigate({
          to: "/academia/modulo/$codigo/aula/$ordem",
          params: { codigo, ordem: String(proxima.ordem) },
        })
      : void navigate({ to: "/academia/modulo/$codigo", params: { codigo } });
  const rotuloConcluir = feita ? "Aula concluída" : "Concluí esta aula";
  const rotuloSeguir = proxima ? "Próxima" : "Voltar ao módulo";

  return (
    // pb-16 só no celular: reserva o lugar da barra de ações fixa.
    <div className="pb-16 md:pb-0">
      <PageHeader
        eyebrow={eyebrow}
        title={aula.titulo}
        description={aula.duracao_min ? `${aula.duracao_min} min` : undefined}
      />

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

      {/* Desktop: as ações no fim do texto, onde a leitura termina. */}
      <div
        data-testid="aula-acoes"
        className="mt-8 hidden flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-subtle pt-5 md:flex"
      >
        <Button
          variant={feita ? "outline" : "default"}
          disabled={marcar.isPending}
          onClick={alternarConcluida}
        >
          <CheckCircle className="mr-2 h-4 w-4" weight={feita ? "fill" : "regular"} />
          {rotuloConcluir}
        </Button>
        <Button variant="outline" onClick={seguir}>
          {rotuloSeguir}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        {proxima && (
          <span className="text-xs text-muted-foreground">
            Aula {proxima.ordem} · {proxima.titulo}
          </span>
        )}
      </div>

      {/* Celular: a barra fixa do sistema, acima do menu de baixo. */}
      <StickyActionRail label="Ações da aula" statusMessage={feita ? "Aula concluída" : undefined}>
        <Button
          className="flex-[1.4]"
          variant={feita ? "outline" : "default"}
          disabled={marcar.isPending}
          onClick={alternarConcluida}
        >
          <CheckCircle className="mr-1.5 h-4 w-4" weight={feita ? "fill" : "regular"} />
          {rotuloConcluir}
        </Button>
        <Button className="flex-1" variant="outline" onClick={seguir}>
          {rotuloSeguir}
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </StickyActionRail>
    </div>
  );
}

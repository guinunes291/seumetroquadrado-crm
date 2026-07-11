import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BedDouble,
  BookOpen,
  Building2,
  CalendarClock,
  ExternalLink,
  MapPin,
  Ruler,
  Table2,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDormsRange, formatEntrega, formatM2Range } from "@/lib/projetos";
import {
  VITRINE_TOKEN_RE,
  type VitrinePublicEvent,
  type VitrinePublicPayload,
  type VitrinePublicProject,
} from "@/lib/vitrine-publica";

const SESSION_TOKEN_KEY = "smq:vitrine-publica:token";

class PublicVitrineHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "PublicVitrineHttpError";
  }
}

export const Route = createFileRoute("/vitrine-publica")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Seleção de empreendimentos — Seu Metro Quadrado" },
      { name: "description", content: "Compare os empreendimentos selecionados para você." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: VitrinePublicaPage,
});

async function publicApi<T>(payload: unknown): Promise<T> {
  const response = await fetch("/api/public/vitrine", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const code =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "request_failed";
    throw new PublicVitrineHttpError(response.status, code);
  }
  return data as T;
}

function isUnavailableLink(error: unknown): boolean {
  return error instanceof PublicVitrineHttpError && (error.status === 404 || error.status === 410);
}

function track(token: string, event: VitrinePublicEvent): void {
  void fetch("/api/public/vitrine", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "event", token, request_id: crypto.randomUUID(), event }),
    cache: "no-store",
    keepalive: true,
  }).catch(() => undefined);
}

function VitrinePublicaPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const cacheKey = useRef(crypto.randomUUID()).current;

  useEffect(() => {
    const fromFragment = window.location.hash.slice(1);
    const candidate = VITRINE_TOKEN_RE.test(fromFragment)
      ? fromFragment
      : (sessionStorage.getItem(SESSION_TOKEN_KEY) ?? "");
    if (VITRINE_TOKEN_RE.test(candidate)) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, candidate);
      setToken(candidate);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      setToken(null);
    }

    // O token não permanece no endereço, histórico ou relatórios do navegador.
    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const vitrineQ = useQuery({
    // Chave aleatória: não coloca o segredo no devtools/cache e impede reuso
    // acidental da seleção de outro link na mesma sessão.
    queryKey: ["vitrine-publica", cacheKey, token ? "active" : "missing"],
    enabled: typeof token === "string",
    retry: false,
    gcTime: 0,
    queryFn: async (): Promise<VitrinePublicPayload> => {
      const response = await publicApi<{ ok: true } & VitrinePublicPayload>({
        action: "load",
        token,
        request_id: cacheKey,
      });
      return { expires_at: response.expires_at, projects: response.projects };
    },
  });

  useEffect(() => {
    if (isUnavailableLink(vitrineQ.error)) sessionStorage.removeItem(SESSION_TOKEN_KEY);
  }, [vitrineQ.error]);

  const unavailableLink = isUnavailableLink(vitrineQ.error);
  const transientFailure = vitrineQ.isError && !unavailableLink;
  const payload = vitrineQ.data;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.12),_transparent_42%)] px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl object-contain" />
          <div>
            <p className="text-sm font-semibold">Seu Metro Quadrado</p>
            <p className="text-xs text-muted-foreground">Curadoria de empreendimentos</p>
          </div>
        </header>

        {token === undefined || (typeof token === "string" && vitrineQ.isPending) ? (
          <PublicSkeleton />
        ) : token === null || unavailableLink ? (
          <Card className="mx-auto max-w-lg">
            <CardContent className="space-y-4 py-12 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
              <div>
                <h1 className="text-xl font-semibold">Esta seleção não está mais disponível</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  O link pode ter expirado ou sido revogado. Peça uma nova seleção ao seu corretor.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : transientFailure ? (
          <Card className="mx-auto max-w-lg">
            <CardContent className="space-y-4 py-12 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
              <div>
                <h1 className="text-xl font-semibold">Não foi possível carregar agora</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sua seleção continua válida. Verifique a conexão e tente novamente em instantes.
                </p>
              </div>
              <Button
                type="button"
                className="min-h-11"
                disabled={vitrineQ.isFetching}
                onClick={() => void vitrineQ.refetch()}
              >
                {vitrineQ.isFetching ? "Tentando novamente..." : "Tentar novamente"}
              </Button>
            </CardContent>
          </Card>
        ) : !payload ? (
          <PublicSkeleton />
        ) : (
          <>
            <div className="mb-7 max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
                Seleção preparada para você
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                Compare seus empreendimentos favoritos
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                Preço, localização, planta e entrega lado a lado para facilitar sua decisão. Valores
                e disponibilidade devem ser confirmados com o corretor.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Seleção disponível até {formatDate(payload.expires_at)}.
              </p>
            </div>

            <section
              aria-label="Empreendimentos selecionados"
              className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {payload.projects.map((project) => (
                <PublicProjectCard key={project.id} project={project} token={token} />
              ))}
            </section>

            <footer className="mt-10 border-t py-6 text-center text-xs text-muted-foreground">
              Esta página não contém dados pessoais do cliente. Condições comerciais podem mudar.
            </footer>
          </>
        )}
      </div>
    </main>
  );
}

function PublicProjectCard({ project, token }: { project: VitrinePublicProject; token: string }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tracked = useRef(false);
  const location = [project.bairro, project.cidade, project.zona ? `Zona ${project.zona}` : null]
    .filter(Boolean)
    .join(" · ");
  const availability =
    project.disponibilidade_resumo ||
    (project.status_preco === "vigente"
      ? "Tabela vigente"
      : project.status_preco === "vencido"
        ? "Consulte disponibilidade"
        : "Disponibilidade a confirmar");

  const openDetails = () => {
    setDetailsOpen((current) => !current);
    if (!tracked.current) {
      tracked.current = true;
      track(token, { type: "project_viewed", project_id: project.id });
    }
  };

  return (
    <Card className="overflow-hidden border-t-4 border-t-amber-400">
      {project.capa_url && (
        <img
          src={project.capa_url}
          alt={`Capa de ${project.nome}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-44 w-full object-cover"
        />
      )}
      <CardContent className="space-y-5 p-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-4 w-4" />
            {project.construtora || "Construtora a confirmar"}
          </div>
          <h2 className="text-xl font-bold leading-tight">{project.nome}</h2>
          <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            {location || "Localização a confirmar"}
          </p>
        </div>

        <div className="rounded-xl bg-primary/5 p-4">
          <p className="text-xs font-medium text-muted-foreground">A partir de</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums">
            {project.sob_consulta || project.preco_a_partir == null
              ? "Sob consulta"
              : formatBRL(project.preco_a_partir)}
          </p>
          <p className="mt-1 text-xs font-medium text-amber-800">{availability}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <PublicSpec
            icon={BedDouble}
            label="Dormitórios"
            value={formatDormsRange(project.dorms_min, project.dorms_max) ?? "A confirmar"}
          />
          <PublicSpec
            icon={Ruler}
            label="Metragem"
            value={formatM2Range(project.metragem_min, project.metragem_max) ?? "A confirmar"}
          />
          <PublicSpec
            icon={CalendarClock}
            label="Entrega"
            value={
              formatEntrega(project.status_entrega, project.mes_entrega, project.ano_entrega) ??
              "A confirmar"
            }
          />
          <PublicSpec
            icon={WalletCards}
            label="Renda sugerida"
            value={project.renda_minima == null ? "A confirmar" : formatBRL(project.renda_minima)}
          />
        </div>

        {(project.diferenciais.length > 0 || project.galeria_urls.length > 0) && (
          <div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              aria-expanded={detailsOpen}
              onClick={openDetails}
            >
              {detailsOpen ? "Ocultar diferenciais" : "Ver detalhes e diferenciais"}
            </Button>
            {detailsOpen && (
              <div className="mt-3 space-y-4">
                <ul className="space-y-2 text-sm text-foreground/80">
                  {project.diferenciais.slice(0, 8).map((item) => (
                    <li key={item} className="flex gap-2">
                      <span
                        aria-hidden
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
                {project.galeria_urls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2" aria-label={`Galeria de ${project.nome}`}>
                    {project.galeria_urls.slice(0, 6).map((url, index) => (
                      <img
                        key={url}
                        src={url}
                        alt={`${project.nome}, imagem ${index + 1}`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="aspect-square w-full rounded-md object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(project.book_url || project.tabela_precos_url) && (
          <div className="grid grid-cols-2 gap-2 border-t pt-4">
            <PublicLink
              href={project.book_url}
              label="Abrir book"
              icon={BookOpen}
              onClick={() =>
                track(token, { type: "cta_clicked", project_id: project.id, cta: "book" })
              }
            />
            <PublicLink
              href={project.tabela_precos_url}
              label="Ver tabela"
              icon={Table2}
              onClick={() =>
                track(token, {
                  type: "cta_clicked",
                  project_id: project.id,
                  cta: "price_table",
                })
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PublicSpec({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1 font-semibold leading-snug">{value}</p>
    </div>
  );
}

function PublicLink({
  href,
  label,
  icon: Icon,
  onClick,
}: {
  href: string | null;
  label: string;
  icon: typeof BookOpen;
  onClick: () => void;
}) {
  if (!href) return <div />;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors hover:bg-accent"
    >
      <Icon className="h-4 w-4" /> {label} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function PublicSkeleton() {
  return (
    <div className="space-y-6" aria-label="Carregando seleção">
      <div className="space-y-3">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-[480px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value));
}

// Banner de campanhas — o topo da prateleira (decisões 14 e 22 de 2026-09-02).
//
// Um slide por projeto em foco: arte própria da campanha quando a gestão subiu
// (`projeto_foco.arte_url`), capa do projeto como fallback, gradiente Comando
// quando não há imagem. Motivo, contagem regressiva e as três ações que o
// corretor precisa no momento: book, tabela, enviar ao cliente.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Send,
  Star,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { formatBRL } from "@/lib/projetos";
import {
  construtoraExibida,
  iniciais,
  rotuloUrgencia,
  type ItemPrateleira,
} from "@/lib/prateleira";
import { rotuloZona } from "@/lib/zonas";
import { cn } from "@/lib/utils";
import type { MaterialTipo } from "./produto-card";
import { PlacaLogo } from "./placa-logo";

const GLASS_BTN = "border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white";

export function BannerCampanhas({
  itens,
  onEnviar,
  onAbrirMaterial,
  onAbrirFicha,
}: {
  itens: ItemPrateleira[];
  onEnviar: (item: ItemPrateleira) => void;
  onAbrirMaterial: (item: ItemPrateleira, tipo: MaterialTipo) => void;
  onAbrirFicha?: (item: ItemPrateleira) => void;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [atual, setAtual] = useState(0);

  useEffect(() => {
    if (!api) return;
    const sync = () => setAtual(api.selectedScrollSnap());
    sync();
    api.on("select", sync);
    return () => {
      api.off("select", sync);
    };
  }, [api]);

  if (itens.length === 0) return null;

  return (
    <section aria-label="Campanhas em foco" className="relative">
      <Carousel setApi={setApi} opts={{ loop: itens.length > 1, align: "start" }}>
        <CarouselContent>
          {itens.map((item) => (
            <CarouselItem key={item.id}>
              <Slide
                item={item}
                onEnviar={onEnviar}
                onAbrirMaterial={onAbrirMaterial}
                onAbrirFicha={onAbrirFicha}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      {itens.length > 1 && (
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Campanhas">
            {itens.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={i === atual}
                aria-label={`Campanha ${i + 1}: ${item.nome}`}
                onClick={() => api?.scrollTo(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === atual ? "w-6 bg-gold-500" : "w-1.5 bg-border hover:bg-muted-foreground/50",
                )}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => api?.scrollPrev()}
              aria-label="Campanha anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => api?.scrollNext()}
              aria-label="Próxima campanha"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Slide({
  item,
  onEnviar,
  onAbrirMaterial,
  onAbrirFicha,
}: {
  item: ItemPrateleira;
  onEnviar: (item: ItemPrateleira) => void;
  onAbrirMaterial: (item: ItemPrateleira, tipo: MaterialTipo) => void;
  onAbrirFicha?: (item: ItemPrateleira) => void;
}) {
  const imagem = item.foco?.arte_url ?? item.capa_url ?? null;
  const urg = rotuloUrgencia(item.foco?.diasRestantes ?? null);
  const preco =
    !item.sob_consulta && item.preco_a_partir != null ? formatBRL(item.preco_a_partir) : null;
  const local = [item.local.bairro, item.zona ? rotuloZona(item.zona) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className="beam-border relative overflow-hidden rounded-2xl bg-gradient-command text-white shadow-elev-2"
      aria-label={`Campanha: ${item.nome}`}
    >
      {imagem ? (
        <>
          <img
            src={imagem}
            alt=""
            aria-hidden="true"
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-navy-950/90 via-navy-950/70 to-navy-900/30"
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(720px 420px at 78% -8%, oklch(0.77 0.11 85 / 0.14), transparent 65%)",
          }}
        >
          {item.logo ? (
            <PlacaLogo
              logo={item.logo}
              nome={construtoraExibida(item)}
              tamanho="xl"
              className="absolute right-6 top-6 hidden md:grid"
            />
          ) : (
            <span className="font-display absolute bottom-4 right-6 text-7xl font-semibold text-white/5 md:text-9xl">
              {iniciais(item.parceira?.nome ?? item.construtora ?? item.nome)}
            </span>
          )}
        </div>
      )}

      <div className="relative flex min-h-[220px] flex-col justify-between gap-4 p-5 md:min-h-[260px] md:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-gold px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-navy-900">
            <Star className="h-3.5 w-3.5" aria-hidden="true" />
            Em foco
          </span>
          {item.foco?.motivo && (
            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs text-white/90 backdrop-blur-sm">
              {item.foco.motivo}
            </span>
          )}
          {urg && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/40 bg-gold-500/15 px-2.5 py-1 text-xs font-medium text-gold-200">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              {urg}
            </span>
          )}
          {item.logo && imagem && (
            <PlacaLogo
              logo={item.logo}
              nome={construtoraExibida(item)}
              tamanho="sm"
              className="ml-auto"
            />
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/70">
              {construtoraExibida(item)}
              {local ? ` · ${local}` : ""}
            </p>
            <h2 className="font-display mt-1 text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
              <Link
                to="/projetos/$projetoId"
                params={{ projetoId: item.id }}
                onClick={() => onAbrirFicha?.(item)}
                className="hover:underline"
              >
                {item.nome}
              </Link>
            </h2>
            {preco ? (
              <p className="mt-1 text-sm text-white/80">
                A partir de{" "}
                <span className="font-display text-xl font-semibold tabular-nums text-gold-300">
                  {preco}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-white/70">Preço na tabela vigente</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="press-scale bg-gradient-gold text-navy-900 hover:opacity-90"
              onClick={() => onEnviar(item)}
            >
              <Send className="mr-1 h-3.5 w-3.5" /> Enviar ao cliente
            </Button>
            {item.book_url && (
              <Button size="sm" variant="outline" className={GLASS_BTN} asChild>
                <a
                  href={item.book_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onAbrirMaterial(item, "book")}
                >
                  <BookOpen className="mr-1 h-3.5 w-3.5" /> Book
                </a>
              </Button>
            )}
            {item.tabela_precos_url && (
              <Button size="sm" variant="outline" className={GLASS_BTN} asChild>
                <a
                  href={item.tabela_precos_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onAbrirMaterial(item, "tabela")}
                >
                  <Table2 className="mr-1 h-3.5 w-3.5" /> Tabela
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

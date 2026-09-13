// Galeria do empreendimento — a capa e as fotos de `galeria_urls` numa faixa
// de miniaturas, com lightbox (Dialog) para ver em tamanho grande, navegar
// com as setas e abrir o original. É a peça que falta para a ficha parecer
// página de produto e não formulário: o corretor mostra o decorado ao cliente
// no celular sem sair do CRM.
//
// Imagem que não carrega some da faixa (onError) — link quebrado de Drive é
// comum na base e um quadrado cinza no meio da galeria passa impressão de
// tela quebrada.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowSquareOut, CaretLeft, CaretRight, Images, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/utils";

const MAX_MINIATURAS = 6;

export function imagensDaGaleria(
  capaUrl: string | null | undefined,
  galeriaUrls: readonly string[],
) {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const url of [capaUrl, ...galeriaUrls]) {
    const limpo = (url ?? "").trim();
    if (!limpo || vistos.has(limpo)) continue;
    vistos.add(limpo);
    saida.push(limpo);
  }
  return saida;
}

export function ProjetoGaleria({
  nome,
  capaUrl,
  galeriaUrls,
  className,
}: {
  nome: string;
  capaUrl: string | null | undefined;
  galeriaUrls: readonly string[];
  className?: string;
}) {
  const todas = useMemo(() => imagensDaGaleria(capaUrl, galeriaUrls), [capaUrl, galeriaUrls]);
  const [quebradas, setQuebradas] = useState<Set<string>>(() => new Set());
  const imagens = useMemo(() => todas.filter((u) => !quebradas.has(u)), [todas, quebradas]);
  const [aberta, setAberta] = useState<number | null>(null);

  const marcarQuebrada = (url: string) =>
    setQuebradas((atual) => {
      if (atual.has(url)) return atual;
      const proximo = new Set(atual);
      proximo.add(url);
      return proximo;
    });

  const total = imagens.length;
  const ir = useCallback(
    (delta: number) =>
      setAberta((atual) =>
        atual === null || total === 0 ? atual : (atual + delta + total) % total,
      ),
    [total],
  );

  // Setas do teclado enquanto o lightbox está aberto.
  useEffect(() => {
    if (aberta === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberta, ir]);

  if (total === 0) return null;

  const visiveis = imagens.slice(0, MAX_MINIATURAS);
  const ocultas = total - visiveis.length;
  const atual = aberta !== null ? imagens[aberta] : null;

  return (
    <section aria-label={`Galeria de ${nome}`} className={className}>
      <SectionHeader
        eyebrow="Fotos"
        title={`Galeria${total > 1 ? ` (${total})` : ""}`}
        action={
          <Button size="sm" variant="outline" onClick={() => setAberta(0)}>
            <Images className="mr-1 h-4 w-4" /> Ver em tela cheia
          </Button>
        }
      />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {visiveis.map((url, i) => {
          const ultima = i === visiveis.length - 1 && ocultas > 0;
          return (
            <button
              key={url}
              type="button"
              onClick={() => setAberta(i)}
              className={cn(
                "group relative aspect-[4/3] overflow-hidden rounded-lg border border-border-subtle bg-muted",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                i === 0 && "col-span-2 row-span-2 sm:col-span-2",
              )}
              aria-label={`Abrir foto ${i + 1} de ${total}`}
            >
              <img
                src={url}
                alt={`${nome} — foto ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                onError={() => marcarQuebrada(url)}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              {ultima && (
                <span className="absolute inset-0 flex items-center justify-center bg-navy-950/60 font-display text-lg font-semibold text-white">
                  +{ocultas}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Dialog open={aberta !== null} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent
          className="max-w-5xl overflow-hidden border-white/10 bg-navy-950 p-0 text-white [&>button]:hidden"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            {nome} — foto {(aberta ?? 0) + 1} de {total}
          </DialogTitle>
          <div className="flex items-center justify-between gap-2 px-4 py-2 text-xs text-white/80">
            <span className="truncate font-medium">{nome}</span>
            <div className="flex items-center gap-1">
              <span className="tabular-nums">
                {(aberta ?? 0) + 1} / {total}
              </span>
              {atual && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-white/80 hover:bg-white/10 hover:text-white"
                  asChild
                >
                  <a href={atual} target="_blank" rel="noopener noreferrer">
                    <ArrowSquareOut className="mr-1 h-4 w-4" /> Original
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-white/80 hover:bg-white/10 hover:text-white"
                onClick={() => setAberta(null)}
                aria-label="Fechar galeria"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="relative flex min-h-[50vh] items-center justify-center bg-black/40">
            {atual && (
              <img
                key={atual}
                src={atual}
                alt={`${nome} — foto ${(aberta ?? 0) + 1}`}
                onError={() => marcarQuebrada(atual)}
                className="max-h-[75vh] w-full object-contain"
              />
            )}
            {total > 1 && (
              <>
                <Button
                  variant="ghost"
                  className="absolute left-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-black/40 p-0 text-white hover:bg-black/60 hover:text-white"
                  onClick={() => ir(-1)}
                  aria-label="Foto anterior"
                >
                  <CaretLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  className="absolute right-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-black/40 p-0 text-white hover:bg-black/60 hover:text-white"
                  onClick={() => ir(1)}
                  aria-label="Próxima foto"
                >
                  <CaretRight className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

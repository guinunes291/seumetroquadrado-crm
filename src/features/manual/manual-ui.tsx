// Blocos visuais do Manual do CRM (/manual). Sem regra de negócio: só
// apresentação — capítulo, passo numerado, captura de tela real e avisos.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function Capitulo({
  id,
  numero,
  titulo,
  resumo,
  children,
}: {
  id: string;
  numero: string;
  titulo: string;
  resumo?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-8">
      <div className="mb-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Capítulo {numero}
        </span>
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
          {titulo}
        </h2>
        {resumo && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{resumo}</p>}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function Bloco({
  titulo,
  quem,
  children,
}: {
  titulo: string;
  quem?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-base font-semibold text-foreground">{titulo}</h3>
        {quem && (
          <Badge variant="outline" className="text-[11px] font-normal">
            {quem}
          </Badge>
        )}
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}

/** Passo a passo numerado — a forma padrão de descrever uma ação na tela. */
export function Passos({ itens }: { itens: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {itens.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold tabular-nums text-primary">
            {i + 1}
          </span>
          <span className="text-sm leading-relaxed">{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** Captura real da tela do CRM, servida de /manual/<arquivo>.png. */
export function Tela({
  src,
  legenda,
  className,
}: {
  src: string;
  legenda: string;
  className?: string;
}) {
  return (
    <figure className={cn("space-y-2 break-inside-avoid", className)}>
      <img
        src={`/manual/${src}.jpg`}
        alt={legenda}
        loading="lazy"
        className="w-full rounded-lg border border-border shadow-sm"
      />
      <figcaption className="text-xs text-muted-foreground">{legenda}</figcaption>
    </figure>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "atencao"; children: ReactNode }) {
  return (
    <Card
      className={cn(
        "border-l-4",
        tipo === "atencao" ? "border-l-destructive bg-destructive/5" : "border-l-primary bg-primary/5",
      )}
    >
      <CardContent className="p-3 text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

/** Tabela simples de referência (status, papéis, prazos). */
export function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {cabecalho.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-medium text-muted-foreground">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i} className="border-t border-border align-top">
              {linha.map((celula, j) => (
                <td key={j} className="px-3 py-2">
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

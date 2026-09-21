// Blocos visuais do Manual do CRM (/manual). Sem regra de negócio: só
// apresentação. A identidade segue o PDF da marca — azul-marinho, dourado e
// papel creme. Os tokens vivem em .manual-doc (styles.css).

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
    <section
      id={id}
      className="scroll-mt-24 border-t pt-9"
      style={{ borderColor: "var(--manual-line)" }}
    >
      <div className="mb-5">
        <span
          className="text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--manual-gold)" }}
        >
          Capítulo {numero}
        </span>
        <h2
          className="mt-1.5 font-display text-2xl font-bold tracking-tight"
          style={{ color: "var(--manual-navy)" }}
        >
          {titulo}
        </h2>
        {resumo && (
          <p
            className="mt-2 max-w-3xl text-sm leading-relaxed"
            style={{ color: "var(--manual-ink-soft)" }}
          >
            {resumo}
          </p>
        )}
      </div>
      <div className="space-y-7">{children}</div>
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
        <h3 className="font-display text-lg font-bold" style={{ color: "var(--manual-gold)" }}>
          {titulo}
        </h3>
        {quem && (
          <span
            className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
            style={{
              borderColor: "var(--manual-line)",
              background: "var(--manual-paper-2)",
              color: "var(--manual-ink-soft)",
            }}
          >
            {quem}
          </span>
        )}
      </div>
      <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/** Passo a passo numerado — a forma padrão de descrever uma ação na tela. */
export function Passos({ itens }: { itens: ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {itens.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="mt-0.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-[5px] text-xs font-semibold tabular-nums"
            style={{ background: "var(--manual-navy)", color: "var(--manual-paper)" }}
          >
            {i + 1}
          </span>
          <span className="text-sm leading-relaxed">{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** Captura real da tela do CRM, servida de /manual/<arquivo>.jpg. */
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
      <div
        className="overflow-hidden rounded-xl border p-2"
        style={{ borderColor: "var(--manual-line)", background: "var(--manual-paper-2)" }}
      >
        <img
          src={`/manual/${src}.jpg`}
          alt={legenda}
          loading="lazy"
          className="w-full rounded-lg"
          style={{ border: "1px solid var(--manual-line)" }}
        />
      </div>
      <figcaption className="text-xs" style={{ color: "var(--manual-ink-soft)" }}>
        {legenda}
      </figcaption>
    </figure>
  );
}

export function Aviso({
  tipo = "info",
  children,
}: {
  tipo?: "info" | "atencao";
  children: ReactNode;
}) {
  const cor = tipo === "atencao" ? "#a33b2a" : "var(--manual-navy)";
  return (
    <div
      className="rounded-r-lg border-l-[3px] px-4 py-3 text-sm leading-relaxed"
      style={{
        borderColor: cor,
        background: tipo === "atencao" ? "#fbf1ee" : "var(--manual-paper-2)",
      }}
    >
      {children}
    </div>
  );
}

/** Tabela simples de referência (status, papéis, prazos). */
export function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: ReactNode[][] }) {
  return (
    <div
      className="overflow-x-auto rounded-xl border"
      style={{ borderColor: "var(--manual-line)", background: "var(--manual-paper)" }}
    >
      <table className="w-full text-sm">
        <thead style={{ background: "var(--manual-paper-2)" }}>
          <tr>
            {cabecalho.map((c) => (
              <th
                key={c}
                className="px-3.5 py-2.5 text-left font-semibold"
                style={{ color: "var(--manual-navy)" }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr
              key={i}
              className="border-t align-top"
              style={{ borderColor: "var(--manual-line)" }}
            >
              {linha.map((celula, j) => (
                <td key={j} className="px-3.5 py-2.5">
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

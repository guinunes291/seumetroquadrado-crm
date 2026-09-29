// Certificado por nível (/academia/certificado/:codigo): página imprimível,
// com CSS de impressão, sem gerar PDF no servidor. Nome, nível, data e código
// de verificação. A RLS decide quem abre: o dono, a gestão dele e o admin.

import { Link } from "@tanstack/react-router";
import { ArrowLeft, Certificate, Printer } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { dataBr } from "./formato";
import { EsqueletoAcademia } from "./guard";
import { useCertificado } from "./gestao/gestao-client";
import { ROTULO_NIVEL } from "./niveis";

/** Data do certificado em Brasília, por extenso ("28 de setembro de 2026"). */
export function dataPorExtenso(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export function CertificadoPage({ codigo }: { codigo: string }) {
  const q = useCertificado(codigo);

  if (q.isError) {
    return (
      <div className="p-4 md:p-6">
        <QueryErrorState
          title="Não foi possível carregar o certificado."
          error={q.error}
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }
  if (q.isPending) return <EsqueletoAcademia />;
  if (!q.data.certificado) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={Certificate}
          title="Certificado não encontrado."
          description={`Nenhum certificado com o código ${codigo} que você possa ver.`}
        />
      </div>
    );
  }
  const c = q.data.certificado;

  return (
    <div className="p-4 md:p-6 print:p-0">
      {/* O layout do app (menu, cabeçalho) não some na impressão por conta
          própria: só o certificado fica visível no papel. */}
      <style>{`@media print {
  @page { size: A4 landscape; margin: 12mm; }
  body * { visibility: hidden; }
  #certificado-academia, #certificado-academia * { visibility: visible; }
  #certificado-academia { position: absolute; inset: 0; margin: auto; }
}`}</style>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/academia/progresso">
            <ArrowLeft className="mr-1 h-4 w-4" /> Progresso
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" /> Imprimir ou salvar em PDF
        </Button>
      </div>

      <article
        id="certificado-academia"
        className="mx-auto flex aspect-[1.414/1] w-full max-w-4xl flex-col items-center justify-center gap-4 rounded-xl border-4 border-double border-primary/60 bg-background p-8 text-center print:max-w-none print:border-primary"
        aria-label="Certificado"
      >
        <Certificate className="h-12 w-12 text-primary" weight="duotone" />
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Academia Seu Metro Quadrado
        </p>
        <h1 className="font-display text-3xl font-semibold md:text-4xl">Certificado de nível</h1>
        <p className="text-sm text-muted-foreground">Certificamos que</p>
        <p className="font-display text-2xl font-semibold md:text-3xl">
          {q.data.nome ?? "Participante"}
        </p>
        <p className="max-w-xl text-sm text-muted-foreground">
          concluiu a trilha e alcançou o nível
        </p>
        <p className="font-display text-2xl font-semibold text-primary md:text-3xl">
          {ROTULO_NIVEL[c.nivel]}
        </p>
        <p className="text-sm">em {dataPorExtenso(c.emitido_em)}</p>
        <p className="mt-4 text-xs text-muted-foreground">
          Código de verificação <span className="font-mono font-semibold">{c.codigo}</span> ·
          emitido em {dataBr(c.emitido_em)}
        </p>
      </article>
    </div>
  );
}

// Conteúdo da Academia (/academia/conteudo, só admin): os módulos por fase,
// com status, versão, revisão pendente em destaque e revisar_em vencido em
// vermelho. Publicar só depois de a revisão pendente ser resolvida.

import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Warning } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { dataBr, diasAte } from "../formato";
import { hojeBrasilia } from "../estado-modulo";
import { EsqueletoAcademia } from "../guard";
import { useConteudo, type ModuloConteudo } from "./gestao-client";

export const ROTULO_STATUS_CONTEUDO = {
  rascunho: { texto: "Rascunho", intent: "neutral" },
  publicado: { texto: "Publicado", intent: "success" },
  arquivado: { texto: "Arquivado", intent: "neutral" },
} as const;

function LinhaModulo({ m, hoje }: { m: ModuloConteudo; hoje: string }) {
  const revisarVencido = m.revisar_em !== null && diasAte(m.revisar_em, hoje) < 0;
  const status = ROTULO_STATUS_CONTEUDO[m.status];
  return (
    <Link
      to="/academia/conteudo/$codigo"
      params={{ codigo: m.codigo }}
      className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
    >
      <span className="w-10 shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">
        {m.codigo}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{m.titulo}</p>
        <p className="text-xs text-muted-foreground">
          versão {m.versao} · {m.aulasPublicadas} de {m.aulas} aulas publicadas · {m.questoesAtivas}{" "}
          questões ativas
          {m.revisar_em && (
            <span className={revisarVencido ? "font-medium text-destructive" : undefined}>
              {" · revisar até "}
              {dataBr(m.revisar_em)}
            </span>
          )}
        </p>
        {m.revisao_pendente && (
          <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
            <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {m.revisao_pendente}
          </p>
        )}
      </div>
      <StatusBadge intent={status.intent}>{status.texto}</StatusBadge>
    </Link>
  );
}

export function ConteudoPage() {
  const conteudo = useConteudo(true);
  const hoje = hojeBrasilia();

  if (conteudo.isError) {
    return (
      <div className="p-4 md:p-6">
        <QueryErrorState
          title="Não foi possível carregar o conteúdo."
          error={conteudo.error}
          onRetry={() => void conteudo.refetch()}
        />
      </div>
    );
  }
  if (conteudo.isPending) return <EsqueletoAcademia />;

  const mods = conteudo.data;
  const fases = [...new Set(mods.map((m) => m.fase))].sort((a, b) => a - b);
  const publicados = mods.filter((m) => m.status === "publicado").length;
  const comRevisao = mods.filter((m) => m.revisao_pendente).length;

  return (
    <div className="p-4 md:p-6">
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/academia/gestao">
          <ArrowLeft className="mr-1 h-4 w-4" /> Gestão
        </Link>
      </Button>
      <PageHeader
        title="Conteúdo da Academia"
        description={`${publicados} de ${mods.length} módulos publicados · ${comRevisao} com revisão pendente. Só admin edita.`}
      />
      {mods.length === 0 ? (
        <EmptyState icon={BookOpen} title="Nenhum módulo no banco." />
      ) : (
        <div className="space-y-5">
          {fases.map((f) => (
            <section key={f} aria-labelledby={`fase-${f}`}>
              <h2 id={`fase-${f}`} className="mb-2 text-sm font-semibold">
                Fase {f}
              </h2>
              <div className="space-y-2">
                {mods
                  .filter((m) => m.fase === f)
                  .map((m) => (
                    <LinhaModulo key={m.id} m={m} hoje={hoje} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// Projetos em Foco — o corpo da prateleira: esqueleto, vazios, corredores
// (Em foco → parceiras → outras) ou resultado plano quando há filtro/ordem.
// Recortado de projetos-foco-page.tsx sem mudança de comportamento.

import { Link } from "@tanstack/react-router";
import { Buildings, MagnifyingGlass, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { ProdutoCard } from "./produto-card";
import { CorredorParceira, Grade, Incremental, LOTE, PrateleiraSkeleton } from "./prateleira-pecas";
import type { usePrateleira } from "./use-prateleira";

type PrateleiraResultadosProps = Pick<
  ReturnType<typeof usePrateleira>,
  | "view"
  | "itens"
  | "ordenados"
  | "filtros"
  | "set"
  | "incompletosOcultos"
  | "podeGerir"
  | "podeVerCatalogo"
  | "limparFiltros"
  | "modoCorredores"
  | "prateleira"
  | "cardProps"
  | "limite"
  | "setLimite"
> & { carregando: boolean };

export function PrateleiraResultados({
  view,
  itens,
  ordenados,
  filtros,
  set,
  incompletosOcultos,
  podeGerir,
  podeVerCatalogo,
  limparFiltros,
  modoCorredores,
  prateleira,
  cardProps,
  limite,
  setLimite,
  carregando,
}: PrateleiraResultadosProps) {
  return carregando ? (
    <PrateleiraSkeleton view={view} />
  ) : itens.length === 0 ? (
    <EmptyState
      icon={Buildings}
      title="Nenhum empreendimento ativo no catálogo"
      description="Assim que a gestão cadastrar (ou reativar) projetos, eles aparecem aqui com book e tabela."
      action={
        podeVerCatalogo ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/projetos">Abrir catálogo</Link>
          </Button>
        ) : undefined
      }
      className="py-12"
    />
  ) : ordenados.length === 0 ? (
    <EmptyState
      icon={MagnifyingGlass}
      title={
        filtros.soQueCabe && filtros.renda != null && !filtros.busca
          ? "Nada cabe nessa renda com os filtros atuais"
          : "Nenhum empreendimento encontrado"
      }
      description={
        incompletosOcultos > 0 && podeGerir
          ? `Ajuste a busca ou os filtros. Há ${incompletosOcultos} projetos fora da prateleira por cadastro incompleto.`
          : "Ajuste a busca, a renda ou os filtros."
      }
      action={
        <Button size="sm" variant="outline" onClick={limparFiltros}>
          <X className="mr-1 h-4 w-4" />
          Limpar filtros
        </Button>
      }
      className="py-12"
    />
  ) : modoCorredores ? (
    <div className="space-y-8">
      {prateleira.emFoco.length > 0 && (
        <section aria-label="Em foco agora">
          <SectionHeader
            eyebrow="Campanha ativa"
            title="Em foco agora"
            action={
              <span className="text-xs text-muted-foreground">
                {prateleira.emFoco.length}{" "}
                {prateleira.emFoco.length === 1 ? "campanha" : "campanhas"}
              </span>
            }
          />
          <Grade view={view}>
            {prateleira.emFoco.map((item) => (
              <ProdutoCard key={item.id} {...cardProps(item)} />
            ))}
          </Grade>
        </section>
      )}

      {prateleira.parceiras.length > 0 && (
        <section aria-label="Construtoras parceiras" className="space-y-6">
          <SectionHeader eyebrow="Prioridade da operação" title="Construtoras parceiras" />
          {prateleira.parceiras.map((corredor) => (
            <CorredorParceira
              key={corredor.chave}
              corredor={corredor}
              view={view}
              renderCard={(item) => <ProdutoCard key={item.id} {...cardProps(item)} />}
              onVerTodos={() => set({ construtora: corredor.chave })}
            />
          ))}
        </section>
      )}

      {prateleira.outras.length > 0 && (
        <section aria-label="Outras construtoras">
          <SectionHeader
            eyebrow="Portfólio"
            title="Outras construtoras"
            action={
              <span className="text-xs text-muted-foreground">
                {prateleira.outras.length} empreendimentos
              </span>
            }
          />
          <Incremental
            itens={prateleira.outras}
            limite={limite}
            onMais={() => setLimite((l) => l + LOTE)}
            view={view}
            renderCard={(item) => <ProdutoCard key={item.id} {...cardProps(item)} />}
          />
        </section>
      )}
    </div>
  ) : (
    <section aria-label="Resultados">
      <Incremental
        itens={ordenados}
        limite={limite}
        onMais={() => setLimite((l) => l + LOTE)}
        view={view}
        renderCard={(item) => <ProdutoCard key={item.id} {...cardProps(item)} />}
      />
    </section>
  );
}

// "Projetos em Foco" — a PRATELEIRA de empreendimentos do corretor.
//
// O catálogo (/projetos) responde "o que existe?"; esta tela responde "o que
// eu vendo AGORA, cabe na renda deste cliente, e como mando para ele?". Leitura
// (decisões de 2026-09-02, docs/revisao-projetos-foco.md):
//   1. Renda do cliente no topo — a pergunta nº 1 do corretor (decisão 8).
//   2. Banner das campanhas em foco, com contagem regressiva (14, 22).
//   3. Filtros de loja: zona (com Grande SP), construtora, preço, dormitórios,
//      entrega, material, favoritos; ordenação; grade ou lista (7, 11, 15).
//   4. Corredores: Em foco → parceiras (ordem da gestão) → outras (9).
//   5. Ações no card: book, tabela, enviar ao lead (registra), sacola que vira
//      link da Vitrine, favorito, resumo, reportar erro (5, 16, 17, 18, 21).
//
// Só entra quem tem o mínimo (zona + book ou tabela) ou está em campanha (6);
// gestor pode abrir os incompletos e vai direto ao Materiais preencher.
// Regras de negócio em lib/prateleira (puras, testadas); aqui é orquestração.

// Desde a quebra em módulos (2026-10): estado e gestos em use-prateleira.ts,
// leituras em use-prateleira-dados.ts, filtros em prateleira-filtros.tsx,
// corpo em prateleira-resultados.tsx, peças em prateleira-pecas.tsx, resumo
// em resumo-projeto.ts e o diálogo de erro em reportar-erro-dialog.tsx.

import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  BookOpen,
  Buildings,
  CaretRight,
  Link as Link2,
  Sliders,
  UserCircle,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { EnviarVitrineDialog } from "@/components/vitrine/enviar-vitrine-dialog";
import { VitrineShortlist } from "@/components/vitrine/vitrine-shortlist-dialog";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BannerCampanhas } from "./banner-campanhas";
import { ConstrutorasParceirasDialog } from "./construtoras-parceiras-dialog";
import { RendaCliente } from "./renda-cliente";
import { PrateleiraFiltros } from "./prateleira-filtros";
import { PrateleiraResultados } from "./prateleira-resultados";
import { ReportarErroDialog } from "./reportar-erro-dialog";
import { usePrateleira } from "./use-prateleira";

// eslint-disable-next-line react-refresh/only-export-components -- texto comercial desta tela (testado à parte); conviver com o componente é intencional
export { montarResumoProjeto } from "./resumo-projeto";

export function ProjetosFocoPage({ leadId }: { leadId?: string }) {
  const {
    projetosQ,
    parceirasQ,
    podeGerir,
    podeGerirParceiras,
    podeVerCatalogo,
    isMobile,
    lead,
    filtros,
    set,
    ordem,
    setOrdem,
    view,
    viewPref,
    setViewPref,
    favoritos,
    setSacolaIds,
    enviarItem,
    setEnviarItem,
    reportarItem,
    setReportarItem,
    gerirOpen,
    setGerirOpen,
    limite,
    setLimite,
    itens,
    visiveis,
    ordenados,
    zonas,
    construtoras,
    incompletosOcultos,
    filtroAtivo,
    filtrosAtivos,
    limparFiltros,
    modoCorredores,
    prateleira,
    sacola,
    registrarEvento,
    enviar,
    abrirMaterial,
    abrirFicha,
    cardProps,
  } = usePrateleira(leadId);

  // ----- render --------------------------------------------------------------

  if (projetosQ.isError) {
    return (
      <div className="p-6">
        <PageHeader title="Documentação & Projetos" />
        <QueryErrorState
          title="Não foi possível carregar os projetos."
          error={projetosQ.error}
          onRetry={() => projetosQ.refetch()}
        />
      </div>
    );
  }

  const carregando = projetosQ.isLoading || parceirasQ.isLoading;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5 p-4 pb-28 md:p-6">
        {/* Identidade Lançamento (como no vídeo): o título é o do módulo; a
            trilha e a sidebar seguem dizendo "Projetos em Foco". */}
        <PageHeader
          title="Documentação & Projetos"
          description="Books, tabelas e catálogo. E só o que cabe na renda do cliente."
          actions={
            <>
              {podeGerir && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/projetos-materiais">
                    <BookOpen className="mr-1 h-4 w-4" />
                    Materiais
                  </Link>
                </Button>
              )}
              {podeGerirParceiras && (
                <Button variant="outline" size="sm" onClick={() => setGerirOpen(true)}>
                  <Sliders className="mr-1 h-4 w-4" />
                  Parceiras
                </Button>
              )}
              {podeVerCatalogo && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/projetos">
                    <Buildings className="mr-1 h-4 w-4" />
                    Catálogo completo
                  </Link>
                </Button>
              )}
              {/* Links Úteis saiu da sidebar (corte 2026-08-30): a home do
                  hub é a porta — a rota segue viva e no ⌘K. */}
              <Button asChild variant="outline" size="sm">
                <Link to="/links-uteis">
                  <Link2 className="mr-1 h-4 w-4" />
                  Links Úteis
                </Link>
              </Button>
            </>
          }
        />

        {podeGerirParceiras && (
          <ConstrutorasParceirasDialog
            open={gerirOpen}
            onOpenChange={setGerirOpen}
            parceiras={parceirasQ.data?.parceiras ?? []}
          />
        )}

        {lead && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
            <UserCircle className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>
              Montando a seleção para <strong>{lead.nome}</strong>. Enviar manda direto no WhatsApp
              e a sacola gera o link da Vitrine.
            </span>
            <Button asChild size="sm" variant="ghost" className="ml-auto">
              <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
                Voltar ao dossiê
                <CaretRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        )}

        <RendaCliente
          renda={filtros.renda}
          onChange={(renda) => set({ renda, soQueCabe: renda == null ? false : filtros.soQueCabe })}
          soQueCabe={filtros.soQueCabe}
          onSoQueCabe={(v) => set({ soQueCabe: v })}
          nomeLead={lead?.nome}
          contagem={carregando ? undefined : ordenados.length}
        />

        {!carregando && modoCorredores && prateleira.emFoco.length > 0 && (
          <BannerCampanhas
            itens={prateleira.emFoco}
            onEnviar={enviar}
            onAbrirMaterial={abrirMaterial}
            onAbrirFicha={abrirFicha}
          />
        )}

        <PrateleiraFiltros
          filtros={filtros}
          set={set}
          filtroAtivo={filtroAtivo}
          filtrosAtivos={filtrosAtivos}
          limparFiltros={limparFiltros}
          ordenados={ordenados}
          zonas={zonas}
          visiveis={visiveis}
          ordem={ordem}
          setOrdem={setOrdem}
          isMobile={isMobile}
          viewPref={viewPref}
          setViewPref={setViewPref}
          construtoras={construtoras}
          favoritos={favoritos}
          podeGerir={podeGerir}
          incompletosOcultos={incompletosOcultos}
          carregando={carregando}
        />

        <PrateleiraResultados
          view={view}
          itens={itens}
          ordenados={ordenados}
          filtros={filtros}
          set={set}
          incompletosOcultos={incompletosOcultos}
          podeGerir={podeGerir}
          podeVerCatalogo={podeVerCatalogo}
          limparFiltros={limparFiltros}
          modoCorredores={modoCorredores}
          prateleira={prateleira}
          cardProps={cardProps}
          limite={limite}
          setLimite={setLimite}
          carregando={carregando}
        />

        <VitrineShortlist
          projects={sacola}
          leadId={leadId ?? null}
          leadName={lead?.nome}
          onRemove={(id) => setSacolaIds((atual) => atual.filter((x) => x !== id))}
          onClear={() => setSacolaIds([])}
          origem="prateleira"
        />

        <EnviarVitrineDialog
          projeto={enviarItem}
          onClose={() => setEnviarItem(null)}
          onEnviado={(l) => {
            if (enviarItem)
              registrarEvento({ tipo: "enviar_lead", projetoId: enviarItem.id, leadId: l.id });
          }}
        />

        <ReportarErroDialog
          item={reportarItem}
          onClose={() => setReportarItem(null)}
          onEnviar={(detalhe) => {
            if (!reportarItem) return;
            registrarEvento({ tipo: "reportar_erro", projetoId: reportarItem.id, detalhe });
            toast.success("Obrigado — a gestão recebe o reporte junto com o cadastro do projeto.");
            setReportarItem(null);
          }}
        />
      </div>
    </TooltipProvider>
  );
}

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

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  Building2,
  ChevronRight,
  Compass,
  Flag,
  LayoutGrid,
  LayoutList,
  Link2,
  Search,
  Settings2,
  Star,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePreference } from "@/hooks/use-preference";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { PageHeader } from "@/components/page-header";
import { montarMensagemVenda } from "@/components/projeto-comercial";
import type { ProjetoRow } from "@/components/projeto-card";
import { EnviarVitrineDialog } from "@/components/vitrine/enviar-vitrine-dialog";
import { VitrineShortlist } from "@/components/vitrine/vitrine-shortlist-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  formatBRL,
  formatDormsRange,
  formatEntrega,
  formatM2Range,
  formatVagasRange,
  PRECO_TO_PRESETS,
} from "@/lib/projetos";
import { usePublicarFaseDoLead } from "@/features/nav/contexto-jornada";
import {
  aplicarFiltros,
  construtoraExibida,
  contarPorConstrutora,
  FILTROS_VAZIOS,
  focosPorProjeto,
  iniciais,
  montarItem,
  montarPrateleira,
  ORDENACOES,
  ordenar,
  type Corredor,
  type DormsFiltro,
  type FiltrosPrateleira,
  type ItemPrateleira,
  type OrdenacaoPrateleira,
} from "@/lib/prateleira";
import { saneiaLocal, saneiaMetragem } from "@/lib/projetos-saneamento";
import { parseRenda } from "@/lib/renda";
import { mensagemEmpreendimento, WHATSAPP_TITULO_EMPREENDIMENTO } from "@/lib/whatsapp";
import { toggleVitrineShortlist, VITRINE_MAX_PROJETOS } from "@/lib/vitrine-publica";
import type { Situacao } from "@/lib/vitrine/vitrine";
import {
  rotuloZona,
  SEM_ZONA,
  zonaDoProjeto,
  ZONAS_PROJETO_ORDEM,
  type ZonaFiltro,
} from "@/lib/zonas";
import { cn } from "@/lib/utils";
import { BannerCampanhas } from "./banner-campanhas";
import { ConstrutorasParceirasDialog } from "./construtoras-parceiras-dialog";
import { ProdutoCard, type MaterialTipo } from "./produto-card";
import { RendaCliente } from "./renda-cliente";
import { useConstrutorasParceiras } from "./use-construtoras-parceiras";
import {
  useDemandaPrateleira,
  useFocosPrateleira,
  useProjetosPrateleira,
} from "./use-prateleira-dados";
import { useRegistrarEventoProjeto } from "./use-projeto-eventos";

/** Cards por lote no carregamento incremental. */
const LOTE = 24;
/** Cards por corredor de parceira antes do "ver todos". */
const POR_CORREDOR = 8;
const TODAS = "__todas__";

const SITUACOES_FILTRO: Situacao[] = ["Pronto", "Em obras", "Lançamento"];

/**
 * Resumo pronto para colar no WhatsApp do cliente: identificação, números do
 * produto e os links do material. Reaproveita a munição comercial da ficha
 * (montarMensagemVenda) e acrescenta o que o corretor precisa mandar junto.
 * Passa pelo mesmo saneamento da prateleira: o cliente nunca recebe "240 m²".
 */
// eslint-disable-next-line react-refresh/only-export-components -- texto comercial desta tela (testado à parte); conviver com o componente é intencional
export function montarResumoProjeto(p: ProjetoRow): string {
  const linhas: string[] = [];
  const local = saneiaLocal(p.bairro, p.cidade);
  const metragem = saneiaMetragem(p.metragem_min, p.metragem_max, p.preco_a_partir);
  const zona = zonaDoProjeto({
    zona_smq: p.zona_smq,
    regiao: p.regiao,
    cidade: local.cidade,
    bairro: local.bairro,
  });
  const lugar = [
    [local.bairro, local.cidade].filter(Boolean).join(", ") || null,
    zona ? rotuloZona(zona) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (lugar) linhas.push(`📍 ${lugar}`);

  const ficha = [
    formatDormsRange(p.dorms_min, p.dorms_max),
    formatM2Range(metragem.metragem_min, metragem.metragem_max),
    formatVagasRange(p.vagas_min, p.vagas_max, p.vagas_observacao),
  ].filter(Boolean);
  if (ficha.length > 0) linhas.push(`🛏️ ${ficha.join(" · ")}`);

  const entrega = formatEntrega(p.status_entrega, p.mes_entrega, p.ano_entrega);
  if (entrega) linhas.push(`🔑 Entrega: ${entrega}`);

  const material: string[] = [];
  if (p.book_url) material.push(`📘 Book: ${p.book_url}`);
  if (p.tabela_precos_url) material.push(`📊 Tabela: ${p.tabela_precos_url}`);
  if (material.length > 0) linhas.push(material.join("\n"));

  // A mensagem de venda já abre com nome + preço + diferenciais; o bloco acima
  // entra logo depois, antes da pergunta de fechamento.
  const venda = montarMensagemVenda({
    nome: p.nome,
    preco_a_partir: p.sob_consulta ? null : p.preco_a_partir,
    diferenciais: p.diferenciais ?? null,
    argumentos_venda: p.argumentos_venda ?? null,
  }).split("\n\n");
  const fechamento = venda.pop();

  return [...venda, ...linhas, fechamento].filter(Boolean).join("\n\n");
}

type LeadContexto = {
  id: string;
  nome: string;
  telefone: string | null;
  status: string | null;
  /** Texto livre no cadastro do lead ("4.000", "R$ 4 mil"); vira número em parseRenda. */
  renda_informada: string | null;
};

export function ProjetosFocoPage({ leadId }: { leadId?: string }) {
  const { isAdmin, isGestor } = useUserRoles();
  const podeGerir = isAdmin || isGestor;
  const isMobile = useIsMobile();
  const abrirWhatsApp = useWhatsAppLead();
  const registrarEvento = useRegistrarEventoProjeto();

  const projetosQ = useProjetosPrateleira();
  const focosQ = useFocosPrateleira();
  const demandaQ = useDemandaPrateleira();
  const parceirasQ = useConstrutorasParceiras();

  const leadQ = useQuery({
    queryKey: ["prateleira-lead", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<LeadContexto | null> => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, status, renda_informada")
        .eq("id", leadId!)
        .maybeSingle();
      if (error) throw error;
      return (data as LeadContexto | null) ?? null;
    },
  });
  const lead = leadQ.data ?? null;
  // Com lead em contexto a prateleira é passo da jornada (montar seleção): a
  // sidebar mantém o hub da fase do lead. Sem lead, é consulta de estoque.
  usePublicarFaseDoLead(leadId ? (lead?.status ?? null) : null);

  const [filtros, setFiltros] = useState<FiltrosPrateleira>(FILTROS_VAZIOS);
  const set = (patch: Partial<FiltrosPrateleira>) => setFiltros((f) => ({ ...f, ...patch }));
  const [ordem, setOrdem] = usePreference<OrdenacaoPrateleira>("prateleira:ordem", "relevancia");
  const [viewPref, setViewPref] = usePreference<"grade" | "lista">("prateleira:view", "grade");
  const view: "grade" | "lista" = isMobile ? "grade" : viewPref;
  const [favoritos, setFavoritos] = usePreference<string[]>("prateleira:favoritos", []);
  const favoritosSet = useMemo(() => new Set(favoritos), [favoritos]);
  const [sacolaIds, setSacolaIds] = useState<string[]>([]);
  const [enviarItem, setEnviarItem] = useState<ItemPrateleira | null>(null);
  const [reportarItem, setReportarItem] = useState<ItemPrateleira | null>(null);
  const [gerirOpen, setGerirOpen] = useState(false);
  const [limite, setLimite] = useState(LOTE);

  // A renda informada no dossiê pré-preenche a barra uma vez; o corretor pode mudar.
  const rendaDoLeadAplicada = useRef(false);
  useEffect(() => {
    if (lead?.renda_informada && !rendaDoLeadAplicada.current) {
      rendaDoLeadAplicada.current = true;
      const renda = parseRenda(lead.renda_informada);
      if (renda != null) setFiltros((f) => ({ ...f, renda }));
    }
  }, [lead]);

  const parceiras = useMemo(
    () => (parceirasQ.data?.parceiras ?? []).filter((p) => p.ativo),
    [parceirasQ.data],
  );
  // Sem tabela no ambiente, a lista é o fallback local: não há onde gravar,
  // então a gestão não aparece prometendo uma edição que não persiste.
  const podeGerirParceiras = podeGerir && parceirasQ.data?.origem === "banco";

  // "Agora" congela por carga de dados: campanhas e selos não piscam a cada render.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcular quando os dados chegam é o comportamento desejado
  const agora = useMemo(() => Date.now(), [projetosQ.data, focosQ.data]);
  const focos = useMemo(() => focosPorProjeto(focosQ.data ?? [], agora), [focosQ.data, agora]);
  const itens = useMemo(
    () =>
      (projetosQ.data ?? []).map((p) =>
        montarItem(p, { parceiras, focos, demanda: demandaQ.data, agora }),
      ),
    [projetosQ.data, parceiras, focos, demandaQ.data, agora],
  );

  // Base das contagens dos filtros: o que está na prateleira (sem os demais filtros).
  const visiveis = useMemo(
    () =>
      aplicarFiltros(itens, { ...FILTROS_VAZIOS, mostrarIncompletos: filtros.mostrarIncompletos }),
    [itens, filtros.mostrarIncompletos],
  );
  const filtrados = useMemo(
    () => aplicarFiltros(itens, filtros, favoritosSet),
    [itens, filtros, favoritosSet],
  );
  const ordenados = useMemo(
    () => ordenar(filtrados, ordem, parceiras),
    [filtrados, ordem, parceiras],
  );

  const zonas = useMemo(() => {
    const c = new Map<ZonaFiltro, number>();
    for (const i of visiveis) {
      const z: ZonaFiltro = i.zona ?? SEM_ZONA;
      c.set(z, (c.get(z) ?? 0) + 1);
    }
    const ordemChips: readonly ZonaFiltro[] = [...ZONAS_PROJETO_ORDEM, SEM_ZONA];
    return ordemChips
      .filter((z) => (c.get(z) ?? 0) > 0)
      .map((z) => ({ zona: z, total: c.get(z)! }));
  }, [visiveis]);
  const construtoras = useMemo(
    () => contarPorConstrutora(visiveis, parceiras),
    [visiveis, parceiras],
  );
  const incompletosOcultos = filtros.mostrarIncompletos ? 0 : itens.length - visiveis.length;

  const filtroAtivo =
    filtros.busca.trim().length > 0 ||
    filtros.zona != null ||
    filtros.construtora != null ||
    filtros.precoMax != null ||
    filtros.dorms != null ||
    filtros.situacao != null ||
    filtros.comMaterial ||
    filtros.soFavoritos ||
    (filtros.soQueCabe && filtros.renda != null);
  const filtrosAtivos = [
    filtros.zona,
    filtros.construtora,
    filtros.precoMax,
    filtros.dorms,
    filtros.situacao,
    filtros.comMaterial || null,
    filtros.soFavoritos || null,
    filtros.soQueCabe && filtros.renda != null ? true : null,
  ].filter((v) => v != null && v !== false).length;
  const limparFiltros = () =>
    setFiltros((f) => ({
      ...FILTROS_VAZIOS,
      renda: f.renda,
      mostrarIncompletos: f.mostrarIncompletos,
    }));

  // Corredores só na leitura padrão; qualquer filtro ou ordenação vira resultado plano.
  const modoCorredores = ordem === "relevancia" && !filtroAtivo;
  const prateleira = useMemo(() => montarPrateleira(ordenados, parceiras), [ordenados, parceiras]);

  useEffect(() => setLimite(LOTE), [filtros, ordem, view]);

  const sacola = useMemo(
    () =>
      sacolaIds.map((id) => itens.find((i) => i.id === id)).filter((i): i is ItemPrateleira => !!i),
    [sacolaIds, itens],
  );
  const sacolaSet = useMemo(() => new Set(sacolaIds), [sacolaIds]);

  // ----- gestos --------------------------------------------------------------

  const favoritar = (item: ItemPrateleira) =>
    setFavoritos((atual) =>
      atual.includes(item.id) ? atual.filter((id) => id !== item.id) : [...atual, item.id],
    );

  const comparar = (item: ItemPrateleira) => {
    const entrando = !sacolaSet.has(item.id);
    setSacolaIds((atual) => toggleVitrineShortlist(atual, item.id));
    if (entrando) registrarEvento({ tipo: "sacola_add", projetoId: item.id, leadId });
  };

  const abrirMaterial = (item: ItemPrateleira, tipo: MaterialTipo) =>
    registrarEvento({
      tipo: tipo === "book" ? "book_abrir" : "tabela_abrir",
      projetoId: item.id,
      leadId,
    });

  const copiarResumo = (item: ItemPrateleira) => {
    navigator.clipboard
      .writeText(montarResumoProjeto(item))
      .then(() => {
        toast.success("Resumo copiado — cole no WhatsApp do cliente.");
        registrarEvento({ tipo: "resumo_copiar", projetoId: item.id, leadId });
      })
      .catch(() => toast.error("Não foi possível copiar o resumo."));
  };

  const enviar = (item: ItemPrateleira) => {
    if (lead?.telefone) {
      const precoLabel =
        item.sob_consulta || item.preco_a_partir == null
          ? "Sob consulta"
          : formatBRL(item.preco_a_partir);
      abrirWhatsApp(
        { id: lead.id, nome: lead.nome, telefone: lead.telefone },
        {
          mensagem: mensagemEmpreendimento(lead.nome, {
            nome: item.nome,
            bairro: item.local.bairro,
            zona: item.zona,
            precoLabel,
            bookUrl: item.book_url,
          }),
          titulo: `${WHATSAPP_TITULO_EMPREENDIMENTO}: ${item.nome}`,
        },
      );
      registrarEvento({ tipo: "enviar_lead", projetoId: item.id, leadId: lead.id });
      return;
    }
    setEnviarItem(item);
  };

  const abrirFicha = (item: ItemPrateleira) =>
    registrarEvento({ tipo: "ficha_abrir", projetoId: item.id, leadId });

  const cardProps = (item: ItemPrateleira) => ({
    item,
    variante: view,
    renda: filtros.renda,
    favorito: favoritosSet.has(item.id),
    onFavoritar: favoritar,
    emComparacao: sacolaSet.has(item.id),
    comparacaoCheia: sacolaIds.length >= VITRINE_MAX_PROJETOS,
    onComparar: comparar,
    onEnviar: enviar,
    onAbrirMaterial: abrirMaterial,
    onCopiarResumo: copiarResumo,
    onReportarErro: (i: ItemPrateleira) => setReportarItem(i),
    onAbrirFicha: abrirFicha,
    mostrarComissao: podeGerir,
  });

  // ----- render --------------------------------------------------------------

  if (projetosQ.isError) {
    return (
      <div className="p-6">
        <PageHeader title="Projetos em Foco" />
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
        <PageHeader
          title="Projetos em Foco"
          description="A prateleira de empreendimentos: o que vendemos agora, o que cabe na renda do cliente e o material para enviar — a um toque."
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
                  <Settings2 className="mr-1 h-4 w-4" />
                  Parceiras
                </Button>
              )}
              <Button asChild variant="outline" size="sm">
                <Link to="/projetos">
                  <Building2 className="mr-1 h-4 w-4" />
                  Catálogo completo
                </Link>
              </Button>
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
            <UserRound className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>
              Montando a seleção para <strong>{lead.nome}</strong>. Enviar manda direto no WhatsApp
              e a sacola gera o link da Vitrine.
            </span>
            <Button asChild size="sm" variant="ghost" className="ml-auto">
              <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
                Voltar ao dossiê
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
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
        />

        {!carregando && modoCorredores && prateleira.emFoco.length > 0 && (
          <BannerCampanhas
            itens={prateleira.emFoco}
            onEnviar={enviar}
            onAbrirMaterial={abrirMaterial}
            onAbrirFicha={abrirFicha}
          />
        )}

        <FilterBar
          title="Filtrar a prateleira"
          activeCount={filtrosAtivos}
          onClear={filtroAtivo ? limparFiltros : undefined}
          resultsLabel={
            carregando
              ? undefined
              : `${ordenados.length} ${ordenados.length === 1 ? "empreendimento" : "empreendimentos"}`
          }
          primary={
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filtros.busca}
                onChange={(e) => set({ busca: e.target.value })}
                placeholder="Buscar por empreendimento, construtora, bairro ou cidade…"
                aria-label="Buscar empreendimento"
                className="pl-9"
              />
            </div>
          }
          chips={
            zonas.length > 0 ? (
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="Filtrar por zona"
              >
                <Compass className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <Chip
                  ativo={filtros.zona == null}
                  onClick={() => set({ zona: null })}
                  label="Todas"
                  contagem={visiveis.length}
                />
                {zonas.map(({ zona, total }) => (
                  <Chip
                    key={zona}
                    ativo={filtros.zona === zona}
                    onClick={() => set({ zona: filtros.zona === zona ? null : zona })}
                    label={rotuloZona(zona)}
                    contagem={total}
                  />
                ))}
              </div>
            ) : undefined
          }
          actions={
            <div className="flex items-center gap-2">
              <Select value={ordem} onValueChange={(v) => setOrdem(v as OrdenacaoPrateleira)}>
                <SelectTrigger className="w-[11.5rem]" aria-label="Ordenar por">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDENACOES.map((o) => (
                    <SelectItem key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isMobile && (
                <ToggleGroup
                  type="single"
                  value={viewPref}
                  onValueChange={(v) => v && setViewPref(v as "grade" | "lista")}
                  aria-label="Modo de exibição"
                >
                  <ToggleGroupItem value="grade" aria-label="Grade">
                    <LayoutGrid className="h-4 w-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="lista" aria-label="Lista">
                    <LayoutList className="h-4 w-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
            </div>
          }
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label className="text-xs text-muted-foreground">Construtora</Label>
              <Select
                value={filtros.construtora ?? TODAS}
                onValueChange={(v) => set({ construtora: v === TODAS ? null : v })}
              >
                <SelectTrigger aria-label="Construtora" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas as construtoras</SelectItem>
                  {construtoras.map((c) => (
                    <SelectItem key={c.chave} value={c.chave}>
                      {c.parceira ? "★ " : ""}
                      {c.titulo} ({c.total})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Preço até</Label>
              <Select
                value={filtros.precoMax != null ? String(filtros.precoMax) : TODAS}
                onValueChange={(v) => set({ precoMax: v === TODAS ? null : Number(v) })}
              >
                <SelectTrigger aria-label="Preço até" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRECO_TO_PRESETS.map((o) => (
                    <SelectItem key={o.label} value={o.value == null ? TODAS : String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Dormitórios</Label>
              <ToggleGroup
                type="single"
                value={filtros.dorms ?? ""}
                onValueChange={(v) => set({ dorms: (v || null) as DormsFiltro | null })}
                className="mt-1 justify-start"
                aria-label="Dormitórios"
              >
                {(["1", "2", "3+"] as DormsFiltro[]).map((d) => (
                  <ToggleGroupItem key={d} value={d} aria-label={`${d} dormitórios`}>
                    {d}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Entrega</Label>
              <ToggleGroup
                type="single"
                value={filtros.situacao ?? ""}
                onValueChange={(v) => set({ situacao: (v || null) as Situacao | null })}
                className="mt-1 justify-start"
                aria-label="Entrega"
              >
                {SITUACOES_FILTRO.map((s) => (
                  <ToggleGroupItem key={s} value={s} className="text-xs">
                    {s}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-2">
              <Switch
                id="com-material"
                checked={filtros.comMaterial}
                onCheckedChange={(v) => set({ comMaterial: v })}
              />
              <Label htmlFor="com-material" className="cursor-pointer text-sm">
                Com book ou tabela
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="so-favoritos"
                checked={filtros.soFavoritos}
                onCheckedChange={(v) => set({ soFavoritos: v })}
              />
              <Label htmlFor="so-favoritos" className="cursor-pointer text-sm">
                Meus favoritos{" "}
                {favoritos.length > 0 && (
                  <span className="text-muted-foreground">({favoritos.length})</span>
                )}
              </Label>
            </div>
            {podeGerir && (
              <div className="flex items-center gap-2">
                <Switch
                  id="mostrar-incompletos"
                  checked={filtros.mostrarIncompletos}
                  onCheckedChange={(v) => set({ mostrarIncompletos: v })}
                />
                <Label htmlFor="mostrar-incompletos" className="cursor-pointer text-sm">
                  Mostrar incompletos
                  {incompletosOcultos > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({incompletosOcultos} fora da prateleira)
                    </span>
                  )}
                </Label>
                <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs">
                  <Link to="/projetos-materiais">Completar no Materiais</Link>
                </Button>
              </div>
            )}
          </div>
        </FilterBar>

        {carregando ? (
          <PrateleiraSkeleton view={view} />
        ) : itens.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Nenhum empreendimento ativo no catálogo"
            description="Assim que a gestão cadastrar (ou reativar) projetos, eles aparecem aqui com book e tabela."
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/projetos">Abrir catálogo</Link>
              </Button>
            }
            className="py-12"
          />
        ) : ordenados.length === 0 ? (
          <EmptyState
            icon={Search}
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
        )}

        <VitrineShortlist
          projects={sacola}
          leadId={leadId ?? null}
          leadName={lead?.nome}
          onRemove={(id) => setSacolaIds((atual) => atual.filter((x) => x !== id))}
          onClear={() => setSacolaIds([])}
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

// ---------------------------------------------------------------------------
// Peças da página
// ---------------------------------------------------------------------------

function Chip({
  ativo,
  onClick,
  label,
  contagem,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
  contagem: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "press-scale inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        ativo
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border-subtle bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      <span className="max-w-[12rem] truncate">{label}</span>
      <span className="tabular-nums opacity-70">{contagem}</span>
    </button>
  );
}

function Grade({ view, children }: { view: "grade" | "lista"; children: React.ReactNode }) {
  return view === "grade" ? (
    <div className="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {children}
    </div>
  ) : (
    <div className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-card shadow-elev-1">
      {children}
    </div>
  );
}

function CorredorParceira({
  corredor,
  view,
  renderCard,
  onVerTodos,
}: {
  corredor: Corredor;
  view: "grade" | "lista";
  renderCard: (item: ItemPrateleira) => React.ReactNode;
  onVerTodos: () => void;
}) {
  const logo = corredor.parceira?.logo_url ?? null;
  const mostrados = corredor.itens.slice(0, POR_CORREDOR);
  const restantes = corredor.itens.length - mostrados.length;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-gold-500/30 bg-gradient-command shadow-elev-1">
          {logo ? (
            <img
              src={logo}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <span className="font-display text-sm font-semibold text-gold-300">
              {iniciais(corredor.titulo)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display flex items-center gap-2 text-base font-semibold tracking-tight">
            <Star
              className="h-4 w-4 text-gold-600 dark:text-gold-300"
              aria-label="Construtora parceira"
            />
            {corredor.titulo}
            <Badge variant="outline" className="text-[10px]">
              {corredor.itens.length}
            </Badge>
          </h3>
        </div>
        {restantes > 0 && (
          <Button size="sm" variant="ghost" onClick={onVerTodos}>
            Ver todos ({corredor.itens.length})
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
      <Grade view={view}>{mostrados.map(renderCard)}</Grade>
    </div>
  );
}

/** Lista longa em lotes: primeira pintura leve, o resto entra ao rolar. */
function Incremental({
  itens,
  limite,
  onMais,
  view,
  renderCard,
}: {
  itens: ItemPrateleira[];
  limite: number;
  onMais: () => void;
  view: "grade" | "lista";
  renderCard: (item: ItemPrateleira) => React.ReactNode;
}) {
  const sentinela = useRef<HTMLDivElement>(null);
  const temMais = itens.length > limite;

  useEffect(() => {
    if (!temMais || !sentinela.current || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onMais();
      },
      { rootMargin: "400px 0px" },
    );
    obs.observe(sentinela.current);
    return () => obs.disconnect();
  }, [temMais, onMais]);

  return (
    <div className="space-y-4">
      <Grade view={view}>{itens.slice(0, limite).map(renderCard)}</Grade>
      {temMais && (
        <div ref={sentinela} className="flex justify-center">
          <Button variant="outline" onClick={onMais}>
            Mostrar mais ({itens.length - limite} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}

function PrateleiraSkeleton({ view }: { view: "grade" | "lista" }) {
  return (
    <div aria-busy="true" className="space-y-4">
      <Skeleton className="h-56 rounded-2xl" />
      <Grade view={view}>
        {Array.from({ length: 8 }).map((_, i) =>
          view === "grade" ? (
            <Skeleton key={i} className="h-[24rem] rounded-xl" />
          ) : (
            <Skeleton key={i} className="h-28 rounded-none" />
          ),
        )}
      </Grade>
    </div>
  );
}

function ReportarErroDialog({
  item,
  onClose,
  onEnviar,
}: {
  item: ItemPrateleira | null;
  onClose: () => void;
  onEnviar: (detalhe: string) => void;
}) {
  const [texto, setTexto] = useState("");
  useEffect(() => {
    if (!item) setTexto("");
  }, [item]);
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" aria-hidden="true" />
            Reportar erro no cadastro
          </DialogTitle>
          <DialogDescription>
            {item
              ? `O que está errado em "${item.nome}"${item.construtora ? ` (${construtoraExibida(item)})` : ""}? Preço, metragem, zona, link quebrado…`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="ex.: a tabela está de julho; o preço a partir de já é R$ 259 mil."
          aria-label="Descrição do erro"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onEnviar(texto.trim())} disabled={texto.trim().length < 5}>
            Enviar para a gestão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

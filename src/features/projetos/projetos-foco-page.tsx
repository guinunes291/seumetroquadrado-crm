// "Projetos em Foco" — a bancada de trabalho do corretor em campo.
//
// O catálogo (/projetos) responde "o que existe?"; esta tela responde "o que
// eu vendo AGORA e onde está o material?". Duas leituras, nessa ordem:
//   1. Em foco agora — os empreendimentos com campanha ativa (projeto_foco).
//   2. Construtoras parceiras — o portfólio agrupado por construtora.
// Em ambas, book, tabela e o resumo de WhatsApp ficam a UM clique. Sem entrar
// na ficha, sem procurar no Drive, sem pedir no grupo.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  Building2,
  CalendarClock,
  Copy,
  ExternalLink,
  MapPin,
  Search,
  Star,
  Table2,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PROJETO_CRM_SELECT } from "@/lib/projetos-query";
import { PageHeader } from "@/components/page-header";
import { montarMensagemVenda } from "@/components/projeto-comercial";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatBRL,
  formatDormsRange,
  formatEntrega,
  formatM2Range,
  formatVagasRange,
} from "@/lib/projetos";
import { cn } from "@/lib/utils";
import type { ProjetoRow } from "@/components/projeto-card";

type FocoAtivo = {
  id: string;
  projeto_id: string;
  motivo: string | null;
  inicio: string;
  fim: string | null;
};

/** Projeto do catálogo + a campanha de foco vigente, quando houver. */
type ProjetoEmFoco = ProjetoRow & { foco?: FocoAtivo };

const SEM_CONSTRUTORA = "Sem construtora informada";

/**
 * Resumo pronto para colar no WhatsApp do cliente: identificação, números do
 * produto e os links do material. Reaproveita a munição comercial da ficha
 * (montarMensagemVenda) e acrescenta o que o corretor precisa mandar junto.
 */
// eslint-disable-next-line react-refresh/only-export-components -- texto comercial desta tela (testado à parte); conviver com o componente é intencional
export function montarResumoProjeto(p: ProjetoRow): string {
  const linhas: string[] = [];
  const local = [p.bairro, p.cidade].filter(Boolean).join(", ");
  if (local) linhas.push(`📍 ${local}`);

  const ficha = [
    formatDormsRange(p.dorms_min, p.dorms_max),
    formatM2Range(p.metragem_min, p.metragem_max),
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

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Foco só vale enquanto ativo E dentro da janela (fim no futuro ou aberto). */
function focoVigente(f: { ativo: boolean; fim: string | null }, agora: number): boolean {
  if (!f.ativo) return false;
  return f.fim == null || new Date(f.fim).getTime() > agora;
}

export function ProjetosFocoPage() {
  const [busca, setBusca] = useState("");
  const [construtoraSel, setConstrutoraSel] = useState<string | null>(null);

  const projetosQ = useQuery({
    queryKey: ["projetos-foco", "catalogo"],
    queryFn: async (): Promise<ProjetoRow[]> => {
      const { data, error } = await supabase
        .from("projetos")
        .select(PROJETO_CRM_SELECT)
        .is("deleted_at", null)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ProjetoRow[];
    },
  });

  const focosQ = useQuery({
    queryKey: ["projetos-foco", "campanhas"],
    queryFn: async (): Promise<FocoAtivo[]> => {
      const { data, error } = await supabase
        .from("projeto_foco")
        .select("id, projeto_id, motivo, inicio, fim, ativo")
        .eq("ativo", true)
        .order("inicio", { ascending: false });
      if (error) throw error;
      const agora = Date.now();
      const linhas = (data ?? []) as Array<FocoAtivo & { ativo: boolean }>;
      return linhas
        .filter((f) => focoVigente(f, agora))
        .map(({ id, projeto_id, motivo, inicio, fim }) => ({
          id,
          projeto_id,
          motivo,
          inicio,
          fim,
        }));
    },
  });

  const projetos = useMemo(() => projetosQ.data ?? [], [projetosQ.data]);

  // Um projeto pode ter mais de uma campanha aberta no histórico; vale a mais
  // recente (a query já vem ordenada por início desc).
  const focoPorProjeto = useMemo(() => {
    const map = new Map<string, FocoAtivo>();
    (focosQ.data ?? []).forEach((f) => {
      if (!map.has(f.projeto_id)) map.set(f.projeto_id, f);
    });
    return map;
  }, [focosQ.data]);

  const comFoco = useMemo<ProjetoEmFoco[]>(
    () => projetos.map((p) => ({ ...p, foco: focoPorProjeto.get(p.id) })),
    [projetos, focoPorProjeto],
  );

  const construtoras = useMemo(() => {
    const map = new Map<string, number>();
    comFoco.forEach((p) => {
      const c = p.construtora?.trim() || SEM_CONSTRUTORA;
      map.set(c, (map.get(c) ?? 0) + 1);
    });
    // As "principais" primeiro: quem tem mais projeto na operação abre a lista.
    return Array.from(map.entries()).sort(
      ([a, na], [b, nb]) => nb - na || a.localeCompare(b, "pt-BR"),
    );
  }, [comFoco]);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim());
    return comFoco.filter((p) => {
      const construtora = p.construtora?.trim() || SEM_CONSTRUTORA;
      if (construtoraSel && construtora !== construtoraSel) return false;
      if (!termo) return true;
      return normalizar(
        [p.nome, construtora, p.bairro, p.cidade, p.regiao, p.zona_smq].filter(Boolean).join(" "),
      ).includes(termo);
    });
  }, [comFoco, busca, construtoraSel]);

  const destaques = useMemo(() => filtrados.filter((p) => p.foco), [filtrados]);

  const porConstrutora = useMemo(() => {
    const map = new Map<string, ProjetoEmFoco[]>();
    filtrados.forEach((p) => {
      const c = p.construtora?.trim() || SEM_CONSTRUTORA;
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(p);
    });
    return Array.from(map.entries()).sort(
      ([a, la], [b, lb]) => lb.length - la.length || a.localeCompare(b, "pt-BR"),
    );
  }, [filtrados]);

  const filtroAtivo = busca.trim().length > 0 || construtoraSel != null;
  const limparFiltros = () => {
    setBusca("");
    setConstrutoraSel(null);
  };

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

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6 p-6">
        <PageHeader
          title="Projetos em Foco"
          description="As construtoras parceiras e os empreendimentos que estamos vendendo agora — book, tabela e resumo do produto a um clique."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link to="/projetos">
                <Building2 className="mr-1 h-4 w-4" />
                Catálogo completo
              </Link>
            </Button>
          }
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            title="Em foco agora"
            value={comFoco.filter((p) => p.foco).length}
            icon={Star}
            intent="warning"
            loading={projetosQ.isLoading || focosQ.isLoading}
            hint="Campanhas ativas"
          />
          <StatTile
            title="Construtoras"
            value={construtoras.length}
            icon={Building2}
            loading={projetosQ.isLoading}
            hint="Parceiras com projeto ativo"
          />
          <StatTile
            title="Empreendimentos"
            value={comFoco.length}
            icon={Table2}
            loading={projetosQ.isLoading}
            hint="Disponíveis para indicação"
          />
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por empreendimento, construtora, bairro ou cidade…"
              aria-label="Buscar empreendimento"
              className="pl-9"
            />
          </div>

          {construtoras.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por construtora">
              <FiltroChip
                ativo={construtoraSel == null}
                onClick={() => setConstrutoraSel(null)}
                label="Todas"
                contagem={comFoco.length}
              />
              {construtoras.map(([nome, n]) => (
                <FiltroChip
                  key={nome}
                  ativo={construtoraSel === nome}
                  onClick={() => setConstrutoraSel((atual) => (atual === nome ? null : nome))}
                  label={nome}
                  contagem={n}
                />
              ))}
            </div>
          )}
        </div>

        {projetosQ.isLoading ? (
          <FocoSkeleton />
        ) : comFoco.length === 0 ? (
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
        ) : filtrados.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nenhum empreendimento encontrado"
            description="Ajuste a busca ou escolha outra construtora."
            action={
              <Button size="sm" variant="outline" onClick={limparFiltros}>
                <X className="mr-1 h-4 w-4" />
                Limpar filtros
              </Button>
            }
            className="py-12"
          />
        ) : (
          <>
            {destaques.length > 0 && (
              <section aria-label="Projetos em foco agora">
                <SectionHeader
                  eyebrow="Prioridade da operação"
                  title="Em foco agora"
                  action={
                    <span className="text-xs text-muted-foreground">
                      {destaques.length} {destaques.length === 1 ? "campanha" : "campanhas"}
                    </span>
                  }
                />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {destaques.map((p) => (
                    <ProjetoFocoCard key={p.id} projeto={p} />
                  ))}
                </div>
              </section>
            )}

            <section aria-label="Portfólio por construtora" className="space-y-6">
              <SectionHeader
                eyebrow="Portfólio"
                title="Construtoras parceiras"
                action={
                  filtroAtivo ? (
                    <Button size="sm" variant="ghost" onClick={limparFiltros}>
                      <X className="mr-1 h-4 w-4" />
                      Limpar filtros
                    </Button>
                  ) : undefined
                }
              />
              {porConstrutora.map(([construtora, itens]) => (
                <div key={construtora} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
                    <h3 className="font-display text-sm font-semibold tracking-tight">
                      {construtora}
                    </h3>
                    <Badge variant="outline" className="text-[10px]">
                      {itens.length}
                    </Badge>
                  </div>
                  <div className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-card shadow-elev-1">
                    {itens.map((p) => (
                      <ProjetoLinha key={p.id} projeto={p} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

function FiltroChip({
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
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        ativo
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border-subtle bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      <span className="max-w-[14rem] truncate">{label}</span>
      <span className="tabular-nums opacity-70">{contagem}</span>
    </button>
  );
}

/** Chips de contexto do produto — os mesmos números em card e linha. */
function chipsDoProjeto(p: ProjetoRow): string[] {
  return [
    [p.bairro, p.cidade].filter(Boolean).join(", ") || null,
    formatDormsRange(p.dorms_min, p.dorms_max),
    formatM2Range(p.metragem_min, p.metragem_max),
    formatVagasRange(p.vagas_min, p.vagas_max, p.vagas_observacao),
  ].filter((s): s is string => Boolean(s));
}

function precoLabel(p: ProjetoRow): string | null {
  if (p.sob_consulta) return "Sob consulta";
  return p.preco_a_partir != null ? `A partir de ${formatBRL(p.preco_a_partir)}` : null;
}

function copiarResumo(p: ProjetoRow) {
  const texto = montarResumoProjeto(p);
  navigator.clipboard
    .writeText(texto)
    .then(() => toast.success("Resumo copiado — cole no WhatsApp do cliente."))
    .catch(() => toast.error("Não foi possível copiar o resumo."));
}

/**
 * Ações de material. Botão sem URL cadastrada fica desabilitado com o motivo no
 * tooltip — some é pior: o corretor fica procurando um botão que não existe.
 */
function AcoesMaterial({ projeto, compacto }: { projeto: ProjetoRow; compacto?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LinkMaterial
        url={projeto.book_url}
        icon={BookOpen}
        label="Book"
        ausente="Book ainda não cadastrado neste projeto."
        titulo={`Abrir book de ${projeto.nome}`}
      />
      <LinkMaterial
        url={projeto.tabela_precos_url}
        icon={Table2}
        label="Tabela"
        ausente="Tabela de preços ainda não cadastrada neste projeto."
        titulo={`Abrir tabela de preços de ${projeto.nome}`}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copiarResumo(projeto)}
            aria-label={`Copiar resumo de ${projeto.nome}`}
          >
            <Copy className="h-4 w-4" />
            {!compacto && <span className="ml-1">Resumo</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copiar resumo pronto para o WhatsApp</TooltipContent>
      </Tooltip>
      <Button asChild size="sm" variant="ghost">
        <Link to="/projetos/$projetoId" params={{ projetoId: projeto.id }}>
          Ficha
          <ExternalLink className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function LinkMaterial({
  url,
  icon: Icon,
  label,
  ausente,
  titulo,
}: {
  url: string | null | undefined;
  icon: typeof BookOpen;
  label: string;
  ausente: string;
  titulo: string;
}) {
  if (!url) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span wrapper: botão desabilitado não dispara os eventos do tooltip. */}
          <span className="inline-flex">
            <Button size="sm" variant="outline" disabled aria-label={`${label} indisponível`}>
              <Icon className="h-4 w-4" />
              <span className="ml-1">{label}</span>
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{ausente}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button asChild size="sm" variant="outline">
      <a href={url} target="_blank" rel="noopener noreferrer" title={titulo}>
        <Icon className="h-4 w-4" />
        <span className="ml-1">{label}</span>
      </a>
    </Button>
  );
}

/** Card do destaque: capa, motivo da campanha e as ações de material. */
function ProjetoFocoCard({ projeto }: { projeto: ProjetoEmFoco }) {
  const chips = chipsDoProjeto(projeto);
  const preco = precoLabel(projeto);
  const entrega = formatEntrega(projeto.status_entrega, projeto.mes_entrega, projeto.ano_entrega);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-gold-500/30 bg-card shadow-elev-1">
      <div className="relative h-28 bg-gradient-command">
        {projeto.capa_url && (
          <img
            src={projeto.capa_url}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-full w-full object-cover opacity-70"
          />
        )}
        <div className="absolute inset-0 bg-navy-900/45" aria-hidden="true" />
        <div className="absolute inset-x-3 bottom-2 top-2 flex flex-col justify-between">
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-gradient-gold px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-navy-900">
            <Star className="h-3 w-3" aria-hidden="true" />
            Em foco
          </span>
          <div className="min-w-0">
            <h3 className="font-display truncate text-sm font-semibold text-white">
              {projeto.nome}
            </h3>
            {projeto.construtora && (
              <p className="truncate text-[11px] text-white/75">{projeto.construtora}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {projeto.foco?.motivo && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Campanha:</span> {projeto.foco.motivo}
          </p>
        )}

        <ul className="flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <li
              key={`${c}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {i === 0 && <MapPin className="h-3 w-3" aria-hidden="true" />}
              {c}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {preco && (
            <span className="inline-flex items-center gap-1 font-semibold text-gold-600 dark:text-gold-300">
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              {preco}
            </span>
          )}
          {entrega && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              {entrega}
            </span>
          )}
        </div>

        <div className="mt-auto pt-1">
          <AcoesMaterial projeto={projeto} />
        </div>
      </div>
    </article>
  );
}

/** Linha compacta do portfólio: leitura em varredura, ações à direita. */
function ProjetoLinha({ projeto }: { projeto: ProjetoEmFoco }) {
  const chips = chipsDoProjeto(projeto);
  const preco = precoLabel(projeto);
  const entrega = formatEntrega(projeto.status_entrega, projeto.mes_entrega, projeto.ano_entrega);

  return (
    <div className="flex flex-col gap-3 p-3 transition-colors hover:bg-muted/40 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{projeto.nome}</span>
          {projeto.foco && (
            <Badge className="gap-1 text-[10px]">
              <Star className="h-3 w-3" aria-hidden="true" />
              Em foco
            </Badge>
          )}
          {preco && (
            <span className="text-xs font-semibold text-gold-600 dark:text-gold-300">{preco}</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[...chips, entrega].filter(Boolean).join(" · ") || "Sem detalhes cadastrados"}
        </p>
      </div>
      <AcoesMaterial projeto={projeto} compacto />
    </div>
  );
}

function FocoSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

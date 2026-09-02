// ProdutoCard — o card ÚNICO do empreendimento na prateleira (decisões 11, 12,
// 20, 25 de 2026-09-02, docs/revisao-projetos-foco.md).
//
// Duas variantes: "grade" (foto grande, três números, ações embaixo) e "lista"
// (miniatura + linha densa). Imagem em primeiro plano; sem capa, gradiente
// navy com o logo da construtora ou a inicial. O mesmo card servirá ao
// catálogo e à Vitrine em seguida (decisão 27: card e cache únicos).
//
// O card NÃO decide nada de negócio: recebe o ItemPrateleira já montado
// (lib/prateleira) e devolve gestos ao pai — abrir material, enviar ao lead,
// comparar, favoritar, copiar resumo, reportar erro.

import { Link } from "@tanstack/react-router";
import {
  BedDouble,
  BookOpen,
  CalendarClock,
  Car,
  Copy,
  ExternalLink,
  Flag,
  Heart,
  MapPin,
  MoreHorizontal,
  Ruler,
  Scale,
  Send,
  Sparkles,
  Star,
  Table2,
  Trophy,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatBRL,
  formatDormsRange,
  formatEntrega,
  formatM2Range,
  formatVagasRange,
} from "@/lib/projetos";
import { arredondaPrestacao } from "@/lib/mcmv-estimativa";
import {
  avaliacaoDoItem,
  cabeNaRenda,
  construtoraExibida,
  iniciais,
  rotuloUrgencia,
  type ItemPrateleira,
} from "@/lib/prateleira";
import { rotuloZona } from "@/lib/zonas";
import { cn } from "@/lib/utils";

export type MaterialTipo = "book" | "tabela";

export type ProdutoCardProps = {
  item: ItemPrateleira;
  variante: "grade" | "lista";
  /** Renda do cliente informada no topo; liga o "cabe na renda". */
  renda: number | null;
  favorito: boolean;
  onFavoritar: (item: ItemPrateleira) => void;
  emComparacao: boolean;
  comparacaoCheia: boolean;
  onComparar: (item: ItemPrateleira) => void;
  onEnviar: (item: ItemPrateleira) => void;
  onAbrirMaterial: (item: ItemPrateleira, tipo: MaterialTipo) => void;
  onCopiarResumo: (item: ItemPrateleira) => void;
  onReportarErro?: (item: ItemPrateleira) => void;
  onAbrirFicha?: (item: ItemPrateleira) => void;
  /** Comissão é interna: só gestor/admin (decisão 10). */
  mostrarComissao?: boolean;
  className?: string;
};

export function ProdutoCard(props: ProdutoCardProps) {
  return props.variante === "lista" ? <CardLista {...props} /> : <CardGrade {...props} />;
}

// ---------------------------------------------------------------------------
// Pedaços compartilhados
// ---------------------------------------------------------------------------

function Capa({
  item,
  className,
  compacta,
}: {
  item: ItemPrateleira;
  className?: string;
  compacta?: boolean;
}) {
  const logo = item.parceira?.logo_url ?? null;
  return (
    <div
      className={cn("relative overflow-hidden bg-gradient-command", className)}
      aria-hidden="true"
    >
      {item.capa_url ? (
        <img
          src={item.capa_url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(420px 260px at 80% -10%, oklch(0.77 0.11 85 / 0.16), transparent 65%)",
            }}
          />
          {logo ? (
            <img
              src={logo}
              alt=""
              loading="lazy"
              className={cn(
                "relative max-h-[45%] max-w-[60%] object-contain drop-shadow",
                compacta && "max-h-[60%] max-w-[80%]",
              )}
            />
          ) : (
            <span
              className={cn(
                "font-display relative select-none font-semibold tracking-tight text-gold-300/90",
                compacta ? "text-lg" : "text-4xl",
              )}
            >
              {iniciais(item.parceira?.nome ?? item.construtora ?? item.nome)}
            </span>
          )}
        </div>
      )}
      {!compacta && (
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-navy-950/75 to-transparent" />
      )}
    </div>
  );
}

function Selos({ item, compacto }: { item: ItemPrateleira; compacto?: boolean }) {
  const selos: Array<{ chave: string; texto: string; tom: string; icone?: LucideIcon }> = [];
  if (item.foco)
    selos.push({
      chave: "foco",
      texto: "Em foco",
      tom: "bg-gradient-gold text-navy-900",
      icone: Star,
    });
  if (item.parceira)
    selos.push({
      chave: "parceira",
      texto: "Parceira",
      tom: "border border-gold-400/50 bg-navy-900/70 text-gold-200 backdrop-blur-sm",
    });
  if (item.atualizadoRecentemente)
    selos.push({
      chave: "atualizado",
      texto: "Preço/tabela atualizada",
      tom: "bg-success/90 text-success-foreground",
      icone: Sparkles,
    });
  if (item.situacao === "Pronto")
    selos.push({
      chave: "pronto",
      texto: "Pronto para morar",
      tom: "bg-info/90 text-info-foreground",
    });
  if (selos.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1", compacto && "gap-0.5")} aria-label="Selos">
      {selos.map((s) => (
        <li
          key={s.chave}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            s.tom,
          )}
        >
          {s.icone && <s.icone className="h-3 w-3" aria-hidden="true" />}
          {s.texto}
        </li>
      ))}
    </ul>
  );
}

function BotaoFavorito({
  favorito,
  onClick,
  nome,
  className,
}: {
  favorito: boolean;
  onClick: () => void;
  nome: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={favorito}
      aria-label={favorito ? `Remover ${nome} dos favoritos` : `Favoritar ${nome}`}
      className={cn(
        "press-scale grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-navy-900/60 text-white backdrop-blur-sm transition-colors hover:bg-navy-900/80",
        favorito && "border-gold-400/60 text-gold-300",
        className,
      )}
    >
      <Heart className={cn("h-4 w-4", favorito && "fill-current")} aria-hidden="true" />
    </button>
  );
}

function Specs({ item, className }: { item: ItemPrateleira; className?: string }) {
  const dorms = formatDormsRange(item.dorms_min, item.dorms_max);
  const metr = formatM2Range(item.metragem.metragem_min, item.metragem.metragem_max);
  const vagas = formatVagasRange(item.vagas_min, item.vagas_max, item.vagas_observacao);
  const entrega = formatEntrega(item.status_entrega, item.mes_entrega, item.ano_entrega);
  const partes: Array<{ icone: LucideIcon; texto: string }> = [];
  if (dorms) partes.push({ icone: BedDouble, texto: dorms });
  if (metr) partes.push({ icone: Ruler, texto: metr });
  if (vagas) partes.push({ icone: Car, texto: vagas });
  if (entrega) partes.push({ icone: CalendarClock, texto: entrega });
  if (partes.length === 0)
    return <p className={cn("text-xs text-muted-foreground", className)}>Detalhes na ficha</p>;
  return (
    <ul className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      {partes.map((p) => (
        <li key={p.texto} className="inline-flex items-center gap-1">
          <p.icone className="h-3.5 w-3.5" aria-hidden="true" />
          {p.texto}
        </li>
      ))}
    </ul>
  );
}

function Preco({ item, compacto }: { item: ItemPrateleira; compacto?: boolean }) {
  if (!item.sob_consulta && item.preco_a_partir != null) {
    return (
      <div className={cn("min-w-0", compacto && "text-right")}>
        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          A partir de
        </div>
        <div
          className={cn(
            "font-display font-semibold tabular-nums tracking-tight text-gold-600 dark:text-gold-300",
            compacto ? "text-base" : "text-xl",
          )}
        >
          {formatBRL(item.preco_a_partir)}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("min-w-0", compacto && "text-right")}>
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Preço</div>
      <div
        className={cn(
          "font-display font-semibold tracking-tight text-foreground/80",
          compacto ? "text-sm" : "text-base",
        )}
      >
        {item.tabela_precos_url ? "Consulte a tabela" : "Sob consulta"}
      </div>
    </div>
  );
}

/** "Cabe na renda?" — estimativa PRICE, sempre com o aviso de que não é aprovação. */
function CabeNaRenda({ item, renda }: { item: ItemPrateleira; renda: number | null }) {
  const cabe = cabeNaRenda(item, renda);
  if (cabe == null) return null;
  const av = avaliacaoDoItem(item, renda);
  const prestacao = av ? arredondaPrestacao(av.prestacaoTotal) : null;
  const pelaRendaMinima = item.renda_minima != null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            cabe
              ? "border-success/40 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/5 text-destructive",
          )}
        >
          {cabe ? "Cabe na renda" : "Não cabe na renda"}
          {prestacao != null && (
            <span className="font-normal opacity-80">· ≈ {formatBRL(prestacao)}/mês</span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {pelaRendaMinima
          ? `Pela renda mínima cadastrada (${formatBRL(item.renda_minima)}).`
          : av
            ? `Estimativa PRICE em ${av.faixa.rotulo}: prestação total ≈ ${formatBRL(prestacao ?? 0)}/mês (${Math.round(av.comprometimento * 100)}% da renda). Sem entrada, FGTS ou subsídio.`
            : ""}{" "}
        Não é aprovação: a análise formal é da Caixa.
      </TooltipContent>
    </Tooltip>
  );
}

function Demanda({ item }: { item: ItemPrateleira }) {
  const d = item.demanda;
  if (!d) return null;
  const partes: Array<{ icone: LucideIcon; texto: string; titulo: string }> = [];
  if (d.leads_30d > 0)
    partes.push({
      icone: Users,
      texto: `${d.leads_30d} ${d.leads_30d === 1 ? "lead" : "leads"} · 30d`,
      titulo: "Leads vinculados a este projeto nos últimos 30 dias",
    });
  if (d.vendas_total > 0)
    partes.push({
      icone: Trophy,
      texto: `${d.vendas_total} ${d.vendas_total === 1 ? "venda" : "vendas"}`,
      titulo: "Vendas registradas neste projeto",
    });
  if (d.envios_7d > 0)
    partes.push({
      icone: Send,
      texto: `${d.envios_7d} ${d.envios_7d === 1 ? "envio" : "envios"} · 7d`,
      titulo: "Vezes que o time enviou este projeto a clientes nos últimos 7 dias",
    });
  if (partes.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Demanda">
      {partes.map((p) => (
        <li
          key={p.texto}
          title={p.titulo}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <p.icone className="h-3 w-3" aria-hidden="true" />
          {p.texto}
        </li>
      ))}
    </ul>
  );
}

function BotaoMaterial({
  item,
  tipo,
  onAbrir,
  compacto,
}: {
  item: ItemPrateleira;
  tipo: MaterialTipo;
  onAbrir: (item: ItemPrateleira, tipo: MaterialTipo) => void;
  compacto?: boolean;
}) {
  const url = tipo === "book" ? item.book_url : item.tabela_precos_url;
  const Icone = tipo === "book" ? BookOpen : Table2;
  const rotulo = tipo === "book" ? "Book" : "Tabela";
  if (!url) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span wrapper: botão desabilitado não dispara os eventos do tooltip. */}
          <span className="inline-flex">
            <Button
              size="sm"
              variant="outline"
              disabled
              aria-label={`${rotulo} indisponível`}
              className={cn(compacto && "px-2")}
            >
              <Icone className="h-4 w-4" />
              {!compacto && <span className="ml-1">{rotulo}</span>}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {tipo === "book"
            ? "Book ainda não cadastrado neste projeto."
            : "Tabela de preços ainda não cadastrada neste projeto."}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button asChild size="sm" variant="outline" className={cn("press-scale", compacto && "px-2")}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={`Abrir ${rotulo.toLowerCase()} de ${item.nome}`}
        aria-label={`Abrir ${rotulo.toLowerCase()} de ${item.nome}`}
        onClick={() => onAbrir(item, tipo)}
      >
        <Icone className="h-4 w-4" />
        {!compacto && <span className="ml-1">{rotulo}</span>}
      </a>
    </Button>
  );
}

function Acoes({
  item,
  compacto,
  emComparacao,
  comparacaoCheia,
  onComparar,
  onEnviar,
  onAbrirMaterial,
  onCopiarResumo,
  onReportarErro,
  onAbrirFicha,
}: Pick<
  ProdutoCardProps,
  | "item"
  | "emComparacao"
  | "comparacaoCheia"
  | "onComparar"
  | "onEnviar"
  | "onAbrirMaterial"
  | "onCopiarResumo"
  | "onReportarErro"
  | "onAbrirFicha"
> & { compacto?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", compacto && "flex-nowrap")}>
      <BotaoMaterial item={item} tipo="book" onAbrir={onAbrirMaterial} compacto={compacto} />
      <BotaoMaterial item={item} tipo="tabela" onAbrir={onAbrirMaterial} compacto={compacto} />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            className={cn(
              "press-scale bg-gradient-gold text-navy-900 hover:opacity-90",
              compacto && "px-2",
            )}
            onClick={() => onEnviar(item)}
            aria-label={`Enviar ${item.nome} para um lead`}
          >
            <Send className="h-4 w-4" />
            {!compacto && <span className="ml-1">Enviar</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Enviar ao cliente pelo WhatsApp e registrar no lead</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              size="sm"
              variant={emComparacao ? "default" : "outline"}
              aria-pressed={emComparacao}
              disabled={!emComparacao && comparacaoCheia}
              onClick={() => onComparar(item)}
              aria-label={
                emComparacao ? `Tirar ${item.nome} da comparação` : `Comparar ${item.nome}`
              }
              className={cn("press-scale", compacto && "px-2")}
            >
              <Scale className="h-4 w-4" />
              {!compacto && <span className="ml-1">{emComparacao ? "Na sacola" : "Comparar"}</span>}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {comparacaoCheia && !emComparacao
            ? "A sacola já tem 3 empreendimentos."
            : "Colocar na sacola para comparar e enviar a seleção"}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Mais ações para ${item.nome}`}
            className="px-2"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onCopiarResumo(item)}>
            <Copy className="h-4 w-4" /> Copiar resumo para WhatsApp
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              to="/projetos/$projetoId"
              params={{ projetoId: item.id }}
              onClick={() => onAbrirFicha?.(item)}
            >
              <ExternalLink className="h-4 w-4" /> Abrir ficha completa
            </Link>
          </DropdownMenuItem>
          {onReportarErro && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onReportarErro(item)}>
                <Flag className="h-4 w-4" /> Reportar erro no cadastro
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Campanha({ item }: { item: ItemPrateleira }) {
  if (!item.foco) return null;
  const urg = rotuloUrgencia(item.foco.diasRestantes);
  return (
    <p className="text-xs text-gold-700 dark:text-gold-300">
      <Star className="mr-1 inline h-3 w-3 fill-current" aria-hidden="true" />
      <span className="font-medium">{item.foco.motivo || "Campanha ativa"}</span>
      {urg && <span className="text-muted-foreground"> · {urg}</span>}
    </p>
  );
}

function Comissao({ item, mostrar }: { item: ItemPrateleira; mostrar?: boolean }) {
  if (!mostrar || item.percentual_comissao == null) return null;
  return (
    <Badge
      variant="outline"
      className="text-[10px]"
      title="Comissão interna — visível só para a gestão"
    >
      Comissão {item.percentual_comissao.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Variante GRADE — foto grande, três números, ações embaixo
// ---------------------------------------------------------------------------

function CardGrade(props: ProdutoCardProps) {
  const { item, renda, favorito, onFavoritar, onAbrirFicha, mostrarComissao, className } = props;
  const local = [item.local.bairro, item.local.cidade].filter(Boolean).join(", ");
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-elev-1 transition-shadow hover:shadow-elev-2",
        item.foco ? "border-gold-500/40" : "border-border-subtle",
        className,
      )}
      aria-label={item.nome}
    >
      <Link
        to="/projetos/$projetoId"
        params={{ projetoId: item.id }}
        onClick={() => onAbrirFicha?.(item)}
        className="relative block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Abrir ficha de ${item.nome}`}
      >
        <Capa item={item} className="aspect-[4/3]" />
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <Selos item={item} />
        </div>
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 text-white">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-white/80">
              {construtoraExibida(item)}
            </p>
            {item.zona && (
              <p className="inline-flex items-center gap-1 text-xs text-white/90">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {rotuloZona(item.zona)}
              </p>
            )}
          </div>
        </div>
      </Link>
      <BotaoFavorito
        favorito={favorito}
        onClick={() => onFavoritar(item)}
        nome={item.nome}
        className="absolute right-3 top-3"
      />

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="min-w-0">
          <h3 className="font-display line-clamp-2 text-base font-semibold leading-snug tracking-tight">
            <Link
              to="/projetos/$projetoId"
              params={{ projetoId: item.id }}
              onClick={() => onAbrirFicha?.(item)}
              className="hover:underline"
            >
              {item.nome}
            </Link>
          </h3>
          {local && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              <span className="truncate">{local}</span>
            </p>
          )}
        </div>

        <Campanha item={item} />
        <Specs item={item} />

        <div className="flex flex-wrap items-end justify-between gap-2">
          <Preco item={item} />
          <div className="flex flex-col items-end gap-1">
            {item.renda_minima != null && (
              <span className="text-[11px] text-muted-foreground">
                Renda a partir de {formatBRL(item.renda_minima)}
              </span>
            )}
            <Comissao item={item} mostrar={mostrarComissao} />
          </div>
        </div>
        <CabeNaRenda item={item} renda={renda} />
        <Demanda item={item} />

        <div className="mt-auto pt-1">
          <Acoes {...props} />
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Variante LISTA — miniatura + linha densa (desktop, leitura em varredura)
// ---------------------------------------------------------------------------

function CardLista(props: ProdutoCardProps) {
  const { item, renda, favorito, onFavoritar, onAbrirFicha, mostrarComissao, className } = props;
  const local = [item.local.bairro, item.local.cidade].filter(Boolean).join(", ");
  return (
    <article
      className={cn(
        "group flex gap-3 p-3 transition-colors hover:bg-muted/40",
        item.foco && "bg-gold-500/5",
        className,
      )}
      aria-label={item.nome}
    >
      <Link
        to="/projetos/$projetoId"
        params={{ projetoId: item.id }}
        onClick={() => onAbrirFicha?.(item)}
        className="relative block shrink-0 overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Abrir ficha de ${item.nome}`}
      >
        <Capa item={item} className="h-[84px] w-[112px] rounded-lg" compacta />
      </Link>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display min-w-0 truncate text-sm font-semibold tracking-tight">
            <Link
              to="/projetos/$projetoId"
              params={{ projetoId: item.id }}
              onClick={() => onAbrirFicha?.(item)}
              className="hover:underline"
            >
              {item.nome}
            </Link>
          </h3>
          <Selos item={item} compacto />
          <Comissao item={item} mostrar={mostrarComissao} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[construtoraExibida(item), local, item.zona ? rotuloZona(item.zona) : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <Specs item={item} />
        <Campanha item={item} />
        <div className="flex flex-wrap items-center gap-2">
          <CabeNaRenda item={item} renda={renda} />
          <Demanda item={item} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <div className="flex items-start gap-2">
          <Preco item={item} compacto />
          <BotaoFavorito
            favorito={favorito}
            onClick={() => onFavoritar(item)}
            nome={item.nome}
            className="h-8 w-8 border-border-subtle bg-card text-muted-foreground hover:bg-muted"
          />
        </div>
        <Acoes {...props} compacto />
      </div>
    </article>
  );
}

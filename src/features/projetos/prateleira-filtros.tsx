// Projetos em Foco — a barra de filtros da prateleira: busca, chips de zona,
// ordenação, grade/lista, construtora, preço, dormitórios, entrega e chaves.
// Recortado de projetos-foco-page.tsx sem mudança de comportamento.

import { Link } from "@tanstack/react-router";
import { Compass, ListDashes, MagnifyingGlass, SquaresFour } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PRECO_TO_PRESETS } from "@/lib/projetos";
import { ORDENACOES, type DormsFiltro, type OrdenacaoPrateleira } from "@/lib/prateleira";
import type { Situacao } from "@/lib/vitrine/vitrine";
import { rotuloZona } from "@/lib/zonas";
import { Chip } from "./prateleira-pecas";
import type { usePrateleira } from "./use-prateleira";

const TODAS = "__todas__";

const SITUACOES_FILTRO: Situacao[] = ["Pronto", "Em obras", "Lançamento"];

type PrateleiraFiltrosProps = Pick<
  ReturnType<typeof usePrateleira>,
  | "filtros"
  | "set"
  | "filtroAtivo"
  | "filtrosAtivos"
  | "limparFiltros"
  | "ordenados"
  | "zonas"
  | "visiveis"
  | "ordem"
  | "setOrdem"
  | "isMobile"
  | "viewPref"
  | "setViewPref"
  | "construtoras"
  | "favoritos"
  | "podeGerir"
  | "incompletosOcultos"
> & { carregando: boolean };

export function PrateleiraFiltros({
  filtros,
  set,
  filtroAtivo,
  filtrosAtivos,
  limparFiltros,
  ordenados,
  zonas,
  visiveis,
  ordem,
  setOrdem,
  isMobile,
  viewPref,
  setViewPref,
  construtoras,
  favoritos,
  podeGerir,
  incompletosOcultos,
  carregando,
}: PrateleiraFiltrosProps) {
  return (
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
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                <SquaresFour className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="lista" aria-label="Lista">
                <ListDashes className="h-4 w-4" />
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
  );
}

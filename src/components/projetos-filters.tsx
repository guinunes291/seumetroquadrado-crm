import { useMemo, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search, X, SlidersHorizontal, MapPin } from "lucide-react";
import type { ProjetoRow } from "./projeto-card";
import { RangeSelect } from "./range-select";
import {
  formatBRL,
  splitTipoExtra,
  bucketize,
  rangeOverlapsBuckets,
  type Bucket,
  PRECO_FROM_PRESETS,
  PRECO_TO_PRESETS,
  AREA_FROM_PRESETS,
  AREA_TO_PRESETS,
  entregaYearPresets,
} from "@/lib/projetos";
import { normalizeSearch } from "@/lib/validators";

export type Filters = {
  q: string;
  cidade: string | null;
  regiao: string | null;
  bairro: string | null;
  zonas: string[];
  construtoras: string[];
  tipoExtras: string[];
  dorms: Bucket[];
  suites: Bucket[];
  vagas: Bucket[];
  includeSemVaga: boolean;
  status: string[];
  fontes: string[];
  precoMin: number | null;
  precoMax: number | null;
  includeSobConsulta: boolean;
  areaMin: number | null;
  areaMax: number | null;
  entregaAnoMin: number | null;
  entregaAnoMax: number | null;
};

export const emptyFilters: Filters = {
  q: "",
  cidade: null,
  regiao: null,
  bairro: null,
  zonas: [],
  construtoras: [],
  tipoExtras: [],
  dorms: [],
  suites: [],
  vagas: [],
  includeSemVaga: true,
  status: [],
  fontes: [],
  precoMin: null,
  precoMax: null,
  includeSobConsulta: true,
  areaMin: null,
  areaMax: null,
  entregaAnoMin: null,
  entregaAnoMax: null,
};

const ALL = "__all__";
const DORMS_BUCKETS: Bucket[] = ["1", "2", "3+"];
const SUITES_BUCKETS: Bucket[] = ["1", "2", "3+"];
const VAGAS_BUCKETS: Bucket[] = ["0", "1", "2", "3+"];

type Props = {
  projetos: ProjetoRow[];
  filters: Filters;
  onChange: (f: Filters) => void;
};

export function ProjetosFilters({ projetos, filters, onChange }: Props) {
  const opts = useMemo(() => {
    const cidades = new Set<string>();
    const regioes = new Set<string>();
    const zonas = new Set<string>();
    const bairrosByRegiao = new Map<string, Set<string>>();
    const bairrosByCidade = new Map<string, Set<string>>();
    const construtoras = new Set<string>();
    const tipoExtras = new Set<string>();
    const statuses = new Set<string>();
    const fontes = new Set<string>();

    for (const p of projetos) {
      if (p.cidade) cidades.add(p.cidade);
      if (p.regiao) regioes.add(p.regiao);
      if (p.zona_smq) zonas.add(p.zona_smq);
      if (p.regiao && p.bairro) {
        if (!bairrosByRegiao.has(p.regiao)) bairrosByRegiao.set(p.regiao, new Set());
        bairrosByRegiao.get(p.regiao)!.add(p.bairro);
      }
      if (p.cidade && p.bairro) {
        if (!bairrosByCidade.has(p.cidade)) bairrosByCidade.set(p.cidade, new Set());
        bairrosByCidade.get(p.cidade)!.add(p.bairro);
      }
      if (p.construtora) construtoras.add(p.construtora);
      for (const t of splitTipoExtra(p.tipo_extra)) tipoExtras.add(t);
      if (p.status_entrega) statuses.add(p.status_entrega);
      if (p.fonte) fontes.add(p.fonte);
    }

    let bairros: string[];
    if (filters.regiao) {
      bairros = Array.from(bairrosByRegiao.get(filters.regiao) ?? []).sort();
    } else if (filters.cidade) {
      bairros = Array.from(bairrosByCidade.get(filters.cidade) ?? []).sort();
    } else {
      bairros = Array.from(
        new Set(projetos.map((p) => p.bairro).filter(Boolean) as string[]),
      ).sort();
    }

    return {
      cidades: Array.from(cidades).sort(),
      regioes: Array.from(regioes).sort(),
      zonas: Array.from(zonas).sort(),
      bairros,
      construtoras: Array.from(construtoras).sort(),
      tipoExtras: Array.from(tipoExtras).sort(),
      statuses: Array.from(statuses).sort(),
      fontes: Array.from(fontes).sort(),
    };
  }, [projetos, filters.cidade, filters.regiao]);

  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const toggleArr = <K extends keyof Filters>(key: K, value: string) => {
    const arr = filters[key] as unknown as string[];
    set({
      [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
    } as unknown as Partial<Filters>);
  };

  // Busca com debounce (300ms): o input responde na hora; a filtragem só roda
  // após a digitação parar, evitando refiltrar o catálogo a cada tecla.
  const [qLocal, setQLocal] = useState(filters.q);
  // Ressincroniza quando a busca é limpa/alterada por fora (ex.: "Limpar", chips).
  useEffect(() => {
    setQLocal(filters.q);
  }, [filters.q]);
  useEffect(() => {
    if (qLocal === filters.q) return;
    const t = setTimeout(() => set({ q: qLocal }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  const advCount =
    filters.construtoras.length +
    filters.tipoExtras.length +
    filters.dorms.length +
    filters.suites.length +
    filters.vagas.length +
    filters.status.length +
    filters.fontes.length +
    (filters.precoMin != null || filters.precoMax != null ? 1 : 0) +
    (filters.areaMin != null || filters.areaMax != null ? 1 : 0) +
    (filters.entregaAnoMin != null || filters.entregaAnoMax != null ? 1 : 0);

  const activeChips: Array<{ label: string; onClear: () => void }> = [];
  if (filters.q)
    activeChips.push({ label: `"${filters.q}"`, onClear: () => set({ q: "" }) });
  if (filters.cidade)
    activeChips.push({
      label: filters.cidade,
      onClear: () => set({ cidade: null, regiao: null, bairro: null }),
    });
  filters.zonas.forEach((z) =>
    activeChips.push({ label: z, onClear: () => toggleArr("zonas", z) }),
  );
  if (filters.regiao)
    activeChips.push({
      label: filters.regiao,
      onClear: () => set({ regiao: null, bairro: null }),
    });
  if (filters.bairro)
    activeChips.push({ label: filters.bairro, onClear: () => set({ bairro: null }) });
  filters.construtoras.forEach((c) =>
    activeChips.push({ label: c, onClear: () => toggleArr("construtoras", c) }),
  );
  filters.tipoExtras.forEach((t) =>
    activeChips.push({ label: t, onClear: () => toggleArr("tipoExtras", t) }),
  );
  filters.dorms.forEach((d) =>
    activeChips.push({
      label: `${d} ${d === "1" ? "dorm" : "dorms"}`,
      onClear: () => toggleArr("dorms", d),
    }),
  );
  filters.suites.forEach((s) =>
    activeChips.push({
      label: `${s} suíte${s === "1" ? "" : "s"}`,
      onClear: () => toggleArr("suites", s),
    }),
  );
  filters.vagas.forEach((v) =>
    activeChips.push({
      label: v === "0" ? "Sem vaga" : `${v} vaga${v === "1" ? "" : "s"}`,
      onClear: () => toggleArr("vagas", v),
    }),
  );
  filters.status.forEach((s) =>
    activeChips.push({ label: s, onClear: () => toggleArr("status", s) }),
  );
  filters.fontes.forEach((f) =>
    activeChips.push({ label: f, onClear: () => toggleArr("fontes", f) }),
  );
  if (filters.precoMin != null || filters.precoMax != null)
    activeChips.push({
      label: `${filters.precoMin != null ? formatBRL(filters.precoMin) : "Qualquer"} – ${
        filters.precoMax != null ? formatBRL(filters.precoMax) : "Qualquer"
      }`,
      onClear: () => set({ precoMin: null, precoMax: null }),
    });
  if (filters.areaMin != null || filters.areaMax != null)
    activeChips.push({
      label: `${filters.areaMin ?? "—"}m² – ${filters.areaMax ?? "—"}m²`,
      onClear: () => set({ areaMin: null, areaMax: null }),
    });
  if (filters.entregaAnoMin != null || filters.entregaAnoMax != null)
    activeChips.push({
      label: `Entrega ${filters.entregaAnoMin ?? "—"}–${filters.entregaAnoMax ?? "—"}`,
      onClear: () => set({ entregaAnoMin: null, entregaAnoMax: null }),
    });

  const hasAny = activeChips.length > 0;

  const locLabel =
    [filters.cidade, filters.regiao, filters.bairro].filter(Boolean).join(" · ") ||
    "Localização";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, construtora, bairro, endereço…"
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            className="pl-9"
          />
        </div>

        <LocalizacaoPopover
          label={locLabel}
          active={!!(filters.cidade || filters.regiao || filters.bairro)}
          cidades={opts.cidades}
          regioes={opts.regioes}
          bairros={opts.bairros}
          cidade={filters.cidade}
          regiao={filters.regiao}
          bairro={filters.bairro}
          onCidade={(v) => set({ cidade: v, regiao: null, bairro: null })}
          onRegiao={(v) => set({ regiao: v, bairro: null })}
          onBairro={(v) => set({ bairro: v })}
        />

        <MaisFiltrosDialog
          filters={filters}
          onApply={onChange}
          opts={opts}
          count={advCount}
        />

        {hasAny && (
          <Button variant="ghost" size="sm" onClick={() => onChange(emptyFilters)}>
            <X className="h-4 w-4 mr-1" />
            Limpar
          </Button>
        )}
      </div>

      {opts.zonas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Zona:</span>
          {opts.zonas.map((z) => {
            const active = filters.zonas.includes(z);
            return (
              <Button
                key={z}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                className="rounded-full h-7 px-3 text-xs"
                onClick={() => toggleArr("zonas", z)}
              >
                {z}
              </Button>
            );
          })}
        </div>
      )}

      {hasAny && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              {chip.label}
              <button
                type="button"
                onClick={chip.onClear}
                className="ml-1 hover:bg-muted-foreground/20 rounded-sm p-0.5"
                aria-label="Remover filtro"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function LocalizacaoPopover({
  label,
  active,
  cidades,
  regioes,
  bairros,
  cidade,
  regiao,
  bairro,
  onCidade,
  onRegiao,
  onBairro,
}: {
  label: string;
  active: boolean;
  cidades: string[];
  regioes: string[];
  bairros: string[];
  cidade: string | null;
  regiao: string | null;
  bairro: string | null;
  onCidade: (v: string | null) => void;
  onRegiao: (v: string | null) => void;
  onBairro: (v: string | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={active ? "default" : "outline"} size="sm">
          <MapPin className="h-3.5 w-3.5 mr-1" />
          <span className="max-w-[200px] truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3" align="start">
        {cidades.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Cidade</Label>
            <Select
              value={cidade ?? ALL}
              onValueChange={(v) => onCidade(v === ALL ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas cidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas cidades</SelectItem>
                {cidades.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Região / Zona</Label>
          <Select
            value={regiao ?? ALL}
            onValueChange={(v) => onRegiao(v === ALL ? null : v)}
            disabled={regioes.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todas regiões" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas regiões</SelectItem>
              {regioes.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Bairro</Label>
          <Select
            value={bairro ?? ALL}
            onValueChange={(v) => onBairro(v === ALL ? null : v)}
            disabled={bairros.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos bairros" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos bairros</SelectItem>
              {bairros.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PillGroup({
  options,
  selected,
  onToggle,
  formatOption,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  formatOption?: (v: string) => string;
}) {
  if (options.length === 0)
    return <p className="text-xs text-muted-foreground">Nenhuma opção disponível.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = selected.includes(o);
        return (
          <Button
            key={o}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            className="rounded-full h-8"
            onClick={() => onToggle(o)}
          >
            {formatOption ? formatOption(o) : o}
          </Button>
        );
      })}
    </div>
  );
}

function MaisFiltrosDialog({
  filters,
  onApply,
  opts,
  count,
}: {
  filters: Filters;
  onApply: (f: Filters) => void;
  opts: {
    construtoras: string[];
    tipoExtras: string[];
    statuses: string[];
    fontes: string[];
  };
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const setD = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleD = <K extends keyof Filters>(key: K, value: string) => {
    const arr = draft[key] as unknown as string[];
    setD({
      [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
    } as unknown as Partial<Filters>);
  };

  const [construtoraQuery, setConstrutoraQuery] = useState("");
  const construtorasFiltradas = useMemo(() => {
    const q = normalizeSearch(construtoraQuery);
    if (!q) return opts.construtoras;
    return opts.construtoras.filter((c) => normalizeSearch(c).includes(q));
  }, [construtoraQuery, opts.construtoras]);

  const entregaPresets = useMemo(() => entregaYearPresets(), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant={count > 0 ? "default" : "outline"}
        size="sm"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
        Mais filtros
        {count > 0 && (
          <Badge variant="secondary" className="ml-2 h-5 px-1.5">
            {count}
          </Badge>
        )}
      </Button>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mais filtros</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <section className="space-y-2">
            <Label className="text-sm font-medium">Dormitórios</Label>
            <PillGroup
              options={DORMS_BUCKETS}
              selected={draft.dorms}
              onToggle={(v) => toggleD("dorms", v)}
              formatOption={(v) => (v === "3+" ? "3 ou mais" : `${v} dorm${v === "1" ? "" : "s"}`)}
            />
          </section>

          <Separator />

          <section className="space-y-2">
            <Label className="text-sm font-medium">Suítes</Label>
            <PillGroup
              options={SUITES_BUCKETS}
              selected={draft.suites}
              onToggle={(v) => toggleD("suites", v)}
              formatOption={(v) => (v === "3+" ? "3 ou mais" : `${v} suíte${v === "1" ? "" : "s"}`)}
            />
          </section>

          <Separator />

          <section className="space-y-2">
            <Label className="text-sm font-medium">Vagas</Label>
            <PillGroup
              options={VAGAS_BUCKETS}
              selected={draft.vagas}
              onToggle={(v) => toggleD("vagas", v)}
              formatOption={(v) =>
                v === "0" ? "Sem vaga" : v === "3+" ? "3 ou mais" : `${v} vaga${v === "1" ? "" : "s"}`
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.includeSemVaga}
                onCheckedChange={(v) => setD({ includeSemVaga: !!v })}
              />
              Incluir projetos com vagas a consultar / sem dado
            </label>
          </section>

          <Separator />

          {opts.tipoExtras.length > 0 && (
            <>
              <section className="space-y-2">
                <Label className="text-sm font-medium">Tipo de produto</Label>
                <PillGroup
                  options={opts.tipoExtras}
                  selected={draft.tipoExtras}
                  onToggle={(v) => toggleD("tipoExtras", v)}
                />
              </section>
              <Separator />
            </>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Construtora / Incorporadora</Label>
              {opts.construtoras.length > 8 && (
                <Input
                  placeholder="Buscar construtora…"
                  value={construtoraQuery}
                  onChange={(e) => setConstrutoraQuery(e.target.value)}
                  className="h-8 w-48"
                />
              )}
            </div>
            {construtorasFiltradas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma construtora.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-auto pr-1">
                {construtorasFiltradas.map((c) => {
                  const checked = draft.construtoras.includes(c);
                  return (
                    <label
                      key={c}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleD("construtoras", c)}
                      />
                      <span className="truncate">{c}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-3">
            <RangeSelect
              label="Faixa de preço"
              fromOptions={PRECO_FROM_PRESETS}
              toOptions={PRECO_TO_PRESETS}
              value={[draft.precoMin, draft.precoMax]}
              onChange={([from, to]) => setD({ precoMin: from, precoMax: to })}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.includeSobConsulta}
                onCheckedChange={(v) => setD({ includeSobConsulta: !!v })}
              />
              Incluir projetos com preço "Sob consulta"
            </label>
          </section>

          <Separator />

          <section>
            <RangeSelect
              label="Metragem (área privativa)"
              fromOptions={AREA_FROM_PRESETS}
              toOptions={AREA_TO_PRESETS}
              value={[draft.areaMin, draft.areaMax]}
              onChange={([from, to]) => setD({ areaMin: from, areaMax: to })}
            />
          </section>

          <Separator />

          <section>
            <RangeSelect
              label="Ano de entrega"
              fromOptions={entregaPresets.from}
              toOptions={entregaPresets.to}
              value={[draft.entregaAnoMin, draft.entregaAnoMax]}
              onChange={([from, to]) => setD({ entregaAnoMin: from, entregaAnoMax: to })}
            />
          </section>

          {opts.statuses.length > 0 && (
            <>
              <Separator />
              <section className="space-y-2">
                <Label className="text-sm font-medium">Status da obra</Label>
                <PillGroup
                  options={opts.statuses}
                  selected={draft.status}
                  onToggle={(v) => toggleD("status", v)}
                />
              </section>
            </>
          )}

          {opts.fontes.length > 1 && (
            <>
              <Separator />
              <section className="space-y-2">
                <Label className="text-sm font-medium">Fonte</Label>
                <PillGroup
                  options={opts.fontes}
                  selected={draft.fontes}
                  onToggle={(v) => toggleD("fontes", v)}
                />
              </section>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => setDraft({ ...emptyFilters, q: filters.q })}
          >
            Limpar tudo
          </Button>
          <Button
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------- Aplica filtros a uma lista de projetos -------
export function applyFilters(projetos: ProjetoRow[], f: Filters): ProjetoRow[] {
  // normalizeSearch remove acentos, baixa caixa e colapsa espaços, então a busca
  // casa "São" com "sao" e ignora maiúsculas/minúsculas.
  const q = normalizeSearch(f.q);
  return projetos.filter((p) => {
    if (q) {
      const hay = normalizeSearch(
        [
          p.nome,
          p.construtora,
          p.bairro,
          p.endereco,
          p.logradouro,
          p.cidade,
          p.regiao,
          p.tipo_extra,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!hay.includes(q)) return false;
    }
    if (f.cidade && p.cidade !== f.cidade) return false;
    if (f.regiao && p.regiao !== f.regiao) return false;
    if (f.bairro && p.bairro !== f.bairro) return false;
    if (f.zonas.length && (!p.zona_smq || !f.zonas.includes(p.zona_smq))) return false;
    if (f.construtoras.length && (!p.construtora || !f.construtoras.includes(p.construtora)))
      return false;
    if (f.fontes.length && (!p.fonte || !f.fontes.includes(p.fonte))) return false;
    if (f.status.length && (!p.status_entrega || !f.status.includes(p.status_entrega)))
      return false;

    if (f.tipoExtras.length) {
      const tipos = splitTipoExtra(p.tipo_extra);
      if (!tipos.some((t) => f.tipoExtras.includes(t))) return false;
    }

    if (f.dorms.length && !rangeOverlapsBuckets(p.dorms_min, p.dorms_max, f.dorms)) return false;

    if (f.suites.length) {
      const b = bucketize(p.suites);
      if (!b || !f.suites.includes(b)) return false;
    }

    if (f.vagas.length) {
      const hasRange = p.vagas_min != null || p.vagas_max != null;
      if (!hasRange) {
        if (!f.includeSemVaga) return false;
      } else if (!rangeOverlapsBuckets(p.vagas_min, p.vagas_max, f.vagas, false)) {
        return false;
      }
    }

    if (f.precoMin != null || f.precoMax != null) {
      const preco = p.preco_a_partir;
      if (preco == null) {
        if (!f.includeSobConsulta) return false;
      } else {
        if (f.precoMin != null && preco < f.precoMin) return false;
        if (f.precoMax != null && preco > f.precoMax) return false;
      }
    } else if (!f.includeSobConsulta && p.sob_consulta) {
      return false;
    }

    if (f.areaMin != null || f.areaMax != null) {
      const lo = p.metragem_min ?? p.metragem_max;
      const hi = p.metragem_max ?? p.metragem_min;
      if (lo == null || hi == null) return false;
      if (f.areaMin != null && hi < f.areaMin) return false;
      if (f.areaMax != null && lo > f.areaMax) return false;
    }

    if (f.entregaAnoMin != null || f.entregaAnoMax != null) {
      const ano = p.ano_entrega;
      if (ano == null) return false;
      if (f.entregaAnoMin != null && ano < f.entregaAnoMin) return false;
      if (f.entregaAnoMax != null && ano > f.entregaAnoMax) return false;
    }

    return true;
  });
}

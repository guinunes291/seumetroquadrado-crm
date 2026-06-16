import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, X, SlidersHorizontal } from "lucide-react";
import type { ProjetoRow } from "./projeto-card";
import {
  formatBRL,
  normalizeEntregaStatus,
  normalizeTipologia,
  normalizeVagas,
  parsePrecoBRL,
} from "@/lib/projetos";

export type Filters = {
  q: string;
  cidade: string | null;
  regiao: string | null;
  bairro: string | null;
  construtoras: string[];
  tipologias: string[];
  vagas: string[];
  status: string[];
  precoMin: number | null;
  precoMax: number | null;
  includeSemPreco: boolean;
};

export const emptyFilters: Filters = {
  q: "",
  cidade: null,
  regiao: null,
  bairro: null,
  construtoras: [],
  tipologias: [],
  vagas: [],
  status: [],
  precoMin: null,
  precoMax: null,
  includeSemPreco: true,
};

const ALL = "__all__";

type Props = {
  projetos: ProjetoRow[];
  filters: Filters;
  onChange: (f: Filters) => void;
};

export function ProjetosFilters({ projetos, filters, onChange }: Props) {
  const opts = useMemo(() => {
    const cidades = new Set<string>();
    const regioesByCidade = new Map<string, Set<string>>();
    const bairrosByRegiao = new Map<string, Set<string>>();
    const bairrosByCidade = new Map<string, Set<string>>();
    const construtoras = new Set<string>();
    const tipologias = new Set<string>();
    const statuses = new Set<string>();
    const precos: number[] = [];

    for (const p of projetos) {
      if (p.cidade) cidades.add(p.cidade);
      if (p.cidade && p.regiao) {
        if (!regioesByCidade.has(p.cidade)) regioesByCidade.set(p.cidade, new Set());
        regioesByCidade.get(p.cidade)!.add(p.regiao);
      }
      if (p.regiao && p.bairro) {
        if (!bairrosByRegiao.has(p.regiao)) bairrosByRegiao.set(p.regiao, new Set());
        bairrosByRegiao.get(p.regiao)!.add(p.bairro);
      }
      if (p.cidade && p.bairro) {
        if (!bairrosByCidade.has(p.cidade)) bairrosByCidade.set(p.cidade, new Set());
        bairrosByCidade.get(p.cidade)!.add(p.bairro);
      }
      if (p.construtora) construtoras.add(p.construtora);
      const t = normalizeTipologia(p.tipologia);
      if (t) tipologias.add(t);
      const s = normalizeEntregaStatus(p.entrega_status);
      if (s) statuses.add(s);
      const preco = parsePrecoBRL(p.preco_inicial);
      if (preco != null) precos.push(preco);
    }

    const regioes = filters.cidade
      ? Array.from(regioesByCidade.get(filters.cidade) ?? []).sort()
      : Array.from(new Set(Array.from(regioesByCidade.values()).flatMap((s) => Array.from(s)))).sort();

    let bairros: string[];
    if (filters.regiao) {
      bairros = Array.from(bairrosByRegiao.get(filters.regiao) ?? []).sort();
    } else if (filters.cidade) {
      bairros = Array.from(bairrosByCidade.get(filters.cidade) ?? []).sort();
    } else {
      bairros = Array.from(new Set(projetos.map((p) => p.bairro).filter(Boolean) as string[])).sort();
    }

    const precoMinAll = precos.length ? Math.floor(Math.min(...precos)) : 0;
    const precoMaxAll = precos.length ? Math.ceil(Math.max(...precos)) : 0;

    return {
      cidades: Array.from(cidades).sort(),
      regioes,
      bairros,
      construtoras: Array.from(construtoras).sort(),
      tipologias: Array.from(tipologias).sort(),
      statuses: Array.from(statuses).sort(),
      vagas: ["0", "1", "2", "3+"],
      precoMinAll,
      precoMaxAll,
    };
  }, [projetos, filters.cidade, filters.regiao]);

  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const toggle = (key: "construtoras" | "tipologias" | "vagas" | "status", value: string) => {
    const arr = filters[key];
    set({
      [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
    } as Partial<Filters>);
  };

  const activeChips: Array<{ label: string; onClear: () => void }> = [];
  if (filters.q) activeChips.push({ label: `"${filters.q}"`, onClear: () => set({ q: "" }) });
  if (filters.cidade)
    activeChips.push({
      label: filters.cidade,
      onClear: () => set({ cidade: null, regiao: null, bairro: null }),
    });
  if (filters.regiao)
    activeChips.push({ label: filters.regiao, onClear: () => set({ regiao: null, bairro: null }) });
  if (filters.bairro)
    activeChips.push({ label: filters.bairro, onClear: () => set({ bairro: null }) });
  filters.construtoras.forEach((c) =>
    activeChips.push({ label: c, onClear: () => toggle("construtoras", c) }),
  );
  filters.tipologias.forEach((t) =>
    activeChips.push({ label: t, onClear: () => toggle("tipologias", t) }),
  );
  filters.vagas.forEach((v) =>
    activeChips.push({ label: `${v} vaga${v === "1" ? "" : "s"}`, onClear: () => toggle("vagas", v) }),
  );
  filters.status.forEach((s) =>
    activeChips.push({ label: s, onClear: () => toggle("status", s) }),
  );
  if (filters.precoMin != null || filters.precoMax != null)
    activeChips.push({
      label: `${filters.precoMin != null ? formatBRL(filters.precoMin) : "—"} a ${filters.precoMax != null ? formatBRL(filters.precoMax) : "—"}`,
      onClear: () => set({ precoMin: null, precoMax: null }),
    });

  const hasAny = activeChips.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, construtora, bairro, endereço…"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            className="pl-9"
          />
        </div>

        <Select
          value={filters.cidade ?? ALL}
          onValueChange={(v) =>
            set({ cidade: v === ALL ? null : v, regiao: null, bairro: null })
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Cidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas cidades</SelectItem>
            {opts.cidades.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.regiao ?? ALL}
          onValueChange={(v) => set({ regiao: v === ALL ? null : v, bairro: null })}
          disabled={opts.regioes.length === 0}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Região" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas regiões</SelectItem>
            {opts.regioes.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.bairro ?? ALL}
          onValueChange={(v) => set({ bairro: v === ALL ? null : v })}
          disabled={opts.bairros.length === 0}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Bairro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos bairros</SelectItem>
            {opts.bairros.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <MultiPopover
          label="Construtora"
          options={opts.construtoras}
          selected={filters.construtoras}
          onToggle={(v) => toggle("construtoras", v)}
        />
        <MultiPopover
          label="Tipologia"
          options={opts.tipologias}
          selected={filters.tipologias}
          onToggle={(v) => toggle("tipologias", v)}
        />
        <MultiPopover
          label="Vagas"
          options={opts.vagas}
          selected={filters.vagas}
          onToggle={(v) => toggle("vagas", v)}
          formatOption={(v) => (v === "3+" ? "3 ou mais" : `${v} vaga${v === "1" ? "" : "s"}`)}
        />
        <MultiPopover
          label="Entrega"
          options={opts.statuses}
          selected={filters.status}
          onToggle={(v) => toggle("status", v)}
        />

        <PrecoPopover
          min={opts.precoMinAll}
          max={opts.precoMaxAll}
          value={[filters.precoMin, filters.precoMax]}
          includeSemPreco={filters.includeSemPreco}
          onChange={(min, max, includeSemPreco) =>
            set({ precoMin: min, precoMax: max, includeSemPreco })
          }
        />

        {hasAny && (
          <Button variant="ghost" size="sm" onClick={() => onChange(emptyFilters)}>
            <X className="h-4 w-4 mr-1" />
            Limpar
          </Button>
        )}
      </div>

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

function MultiPopover({
  label,
  options,
  selected,
  onToggle,
  formatOption,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  formatOption?: (v: string) => string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={options.length === 0}>
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 px-1.5">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 max-h-[320px] overflow-auto" align="start">
        <div className="space-y-1">
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label
                key={opt}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
              >
                <Checkbox checked={checked} onCheckedChange={() => onToggle(opt)} />
                <span>{formatOption ? formatOption(opt) : opt}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PrecoPopover({
  min,
  max,
  value,
  includeSemPreco,
  onChange,
}: {
  min: number;
  max: number;
  value: [number | null, number | null];
  includeSemPreco: boolean;
  onChange: (min: number | null, max: number | null, includeSemPreco: boolean) => void;
}) {
  const hasRange = max > min;
  const current: [number, number] = [value[0] ?? min, value[1] ?? max];
  const active = value[0] != null || value[1] != null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={!hasRange}>
          <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
          Preço
          {active && (
            <Badge variant="secondary" className="ml-2 h-5 px-1.5">
              1
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4 space-y-3" align="start">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatBRL(current[0])}</span>
          <span>{formatBRL(current[1])}</span>
        </div>
        <Slider
          min={min}
          max={max}
          step={Math.max(1000, Math.round((max - min) / 100))}
          value={current}
          onValueChange={(v) => onChange(v[0], v[1], includeSemPreco)}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={includeSemPreco}
            onCheckedChange={(v) => onChange(value[0], value[1], !!v)}
          />
          Incluir projetos sem preço informado
        </label>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(null, null, true)}
            disabled={!active}
          >
            Limpar faixa
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ------- Aplica filtros a uma lista de projetos -------
export function applyFilters(projetos: ProjetoRow[], f: Filters): ProjetoRow[] {
  const q = f.q.trim().toLowerCase();
  return projetos.filter((p) => {
    if (q) {
      const hay = [p.nome, p.construtora, p.bairro, p.endereco, p.cidade, p.regiao]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.cidade && p.cidade !== f.cidade) return false;
    if (f.regiao && p.regiao !== f.regiao) return false;
    if (f.bairro && p.bairro !== f.bairro) return false;
    if (f.construtoras.length && (!p.construtora || !f.construtoras.includes(p.construtora)))
      return false;
    if (f.tipologias.length) {
      const t = normalizeTipologia(p.tipologia);
      if (!t || !f.tipologias.includes(t)) return false;
    }
    if (f.vagas.length) {
      const v = normalizeVagas(p.vagas);
      if (!v || !f.vagas.includes(v)) return false;
    }
    if (f.status.length) {
      const s = normalizeEntregaStatus(p.entrega_status);
      if (!s || !f.status.includes(s)) return false;
    }
    if (f.precoMin != null || f.precoMax != null) {
      const preco = parsePrecoBRL(p.preco_inicial);
      if (preco == null) return f.includeSemPreco;
      if (f.precoMin != null && preco < f.precoMin) return false;
      if (f.precoMax != null && preco > f.precoMax) return false;
    }
    return true;
  });
}

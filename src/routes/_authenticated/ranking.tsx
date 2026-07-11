import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Trophy,
  Target,
  Activity,
  TrendingUp,
  Maximize,
  Minimize,
  RefreshCw,
  Play,
  Pause,
  ChevronDown,
  Calendar,
  Users,
  Phone,
  MessageSquare,
  CalendarCheck,
  Eye,
  FileCheck,
  Star,
  ArrowUp,
  ArrowDown,
  Flag,
} from "lucide-react";
import { useUserRoles } from "@/hooks/use-auth";
import { CopaPage } from "@/routes/_authenticated/copa";
import { ConquistasPage } from "@/routes/_authenticated/conquistas";
import { MetasPage } from "@/routes/_authenticated/metas";

type DesempenhoTab = "ranking" | "competicao" | "conquistas" | "metas";
const DESEMPENHO_TABS: DesempenhoTab[] = ["ranking", "competicao", "conquistas", "metas"];

export const Route = createFileRoute("/_authenticated/ranking")({
  // `tab` permite abrir/linkar direto uma aba do hub de Desempenho.
  validateSearch: (search: Record<string, unknown>): { tab?: DesempenhoTab } => ({
    tab: DESEMPENHO_TABS.includes(search.tab as DesempenhoTab)
      ? (search.tab as DesempenhoTab)
      : undefined,
  }),
  head: () => ({ meta: [{ title: "Desempenho — Seu Metro Quadrado" }] }),
  component: DesempenhoPage,
});

// Hub de Desempenho: consolida ranking ao vivo, competição (Copa), conquistas e
// metas em abas internas (Fase 2). Cada aba reaproveita a página existente; as
// rotas antigas (/copa, /conquistas, /metas) seguem válidas para deep-link.
function DesempenhoPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const podeMetas = isAdmin || isGestor;
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: DesempenhoTab = tab ?? "ranking";
  const onTabChange = (v: string) =>
    navigate({ search: { tab: v === "ranking" ? undefined : (v as DesempenhoTab) } });

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="ranking">Ranking</TabsTrigger>
        <TabsTrigger value="competicao">Competição</TabsTrigger>
        <TabsTrigger value="conquistas">Conquistas</TabsTrigger>
        {podeMetas && <TabsTrigger value="metas">Metas</TabsTrigger>}
      </TabsList>
      <TabsContent value="ranking">
        <RankingPanel />
      </TabsContent>
      <TabsContent value="competicao">
        <CopaPage />
      </TabsContent>
      <TabsContent value="conquistas">
        <ConquistasPage />
      </TabsContent>
      {podeMetas && (
        <TabsContent value="metas">
          <MetasPage />
        </TabsContent>
      )}
    </Tabs>
  );
}

// ============================================================================
// Constantes
// ============================================================================
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const TABS = ["realxmeta", "vendas", "produtividade"] as const;
type TabType = (typeof TABS)[number];

type PeriodOption = "today" | "this_week" | "this_month" | "this_year" | "all";
const periodLabels: Record<PeriodOption, string> = {
  today: "Hoje",
  this_week: "Esta semana",
  this_month: "Este mês",
  this_year: "Este ano",
  all: "Últimos 2 anos",
};

const TV_STYLES = `
@keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
@keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 10px rgba(6,182,212,.3) } 50% { box-shadow: 0 0 25px rgba(6,182,212,.7) } }
@keyframes celebration { 0% { transform: translateY(0) scale(1); opacity:1 } 100% { transform: translateY(-200px) scale(.5); opacity:0 } }
@keyframes fadeInUp { from { opacity:0; transform: translateY(20px) } to { opacity:1; transform: translateY(0) } }
`;

// ============================================================================
// Utils
// ============================================================================
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}
function endOfWeek(d: Date) {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  return endOfDay(x);
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1);
}
function endOfYear(d: Date) {
  return endOfDay(new Date(d.getFullYear(), 11, 31));
}

function getDateRange(p: PeriodOption): { from: Date; to: Date } {
  const now = new Date();
  switch (p) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "this_week":
      return { from: startOfWeek(now), to: endOfWeek(now) };
    case "this_month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "this_year":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "all":
      return {
        from: startOfDay(new Date(now.getFullYear() - 2, now.getMonth(), now.getDate())),
        to: now,
      };
  }
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatNum(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n);
}

function getHeatColor(value: number, values: number[]): string {
  if (values.length === 0 || value === 0) return "text-navy-400";
  const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return "text-navy-400";
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  if (value >= q3) return "bg-emerald-900/50 text-emerald-300";
  if (value >= median) return "bg-emerald-900/20 text-emerald-400";
  return "bg-amber-900/20 text-amber-300";
}

// ============================================================================
// Hooks
// ============================================================================
function useCountUp(target: number, duration = 900): number {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number | null>(null);
  const startValRef = useRef(0);
  useEffect(() => {
    startValRef.current = current;
    startTsRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (ts: number) => {
      if (!startTsRef.current) startTsRef.current = ts;
      const progress = Math.min((ts - startTsRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(startValRef.current + (target - startValRef.current) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return current;
}

// ============================================================================
// Subcomponentes visuais
// ============================================================================
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const date = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return (
    <div className="text-right hidden lg:block">
      <div className="text-xl font-mono font-bold text-cyan-300 tabular-nums leading-tight">
        {time}
      </div>
      <div className="text-[10px] text-navy-300 capitalize">{date}</div>
    </div>
  );
}

type KPIVariant = "default" | "success" | "warning" | "danger" | "info" | "accent";

function KPICard({
  label,
  value,
  numericValue,
  icon: Icon,
  variant = "default",
  subValue,
  highlight = false,
  delta,
  suffix = "",
}: {
  label: string;
  value?: string;
  numericValue?: number;
  icon: any;
  variant?: KPIVariant;
  subValue?: string;
  highlight?: boolean;
  delta?: number;
  suffix?: string;
}) {
  const variants: Record<KPIVariant, string> = {
    default: "bg-navy-800/60 border-navy-600/50",
    success: "bg-emerald-900/40 border-emerald-500/40",
    warning: "bg-amber-900/40 border-amber-500/40",
    danger: "bg-red-900/40 border-red-500/40",
    info: "bg-blue-900/40 border-blue-500/40",
    accent: "bg-cyan-900/40 border-cyan-500/40",
  };
  const iconColors: Record<KPIVariant, string> = {
    default: "text-navy-200",
    success: "text-emerald-300",
    warning: "text-amber-300",
    danger: "text-red-300",
    info: "text-blue-300",
    accent: "text-cyan-300",
  };
  const animated = useCountUp(numericValue ?? 0, 900);
  const displayValue =
    numericValue !== undefined ? `${formatNum(animated)}${suffix}` : (value ?? "—");
  return (
    <div
      className={`relative rounded-xl p-4 border backdrop-blur-sm ${variants[variant]} ${highlight ? "ring-2 ring-cyan-400/40" : ""} transition-all duration-300`}
      style={highlight ? { animation: "pulseGlow 3s ease-in-out infinite" } : {}}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-semibold mb-1 text-navy-100">
            {label}
          </p>
          <p className="text-2xl font-bold text-white leading-tight tabular-nums">{displayValue}</p>
          {subValue && <p className="text-[11px] text-navy-200 mt-0.5 font-medium">{subValue}</p>}
          {delta !== undefined && delta !== 0 && (
            <p
              className={`text-[10px] font-semibold mt-1 tabular-nums flex items-center gap-0.5 ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {delta > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              {delta > 0 ? "+" : ""}
              {formatNum(Math.abs(delta))} vs ant.
            </p>
          )}
        </div>
        <div className={`p-2 rounded-lg bg-white/10 shrink-0 ${iconColors[variant]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function GaugeChart({
  percentage,
  label,
  metaDefined = true,
}: {
  percentage: number;
  label: string;
  metaDefined?: boolean;
}) {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const animated = useCountUp(Math.round(clamped * 10) / 10, 1200);
  const color = !metaDefined
    ? "#475569"
    : clamped >= 100
      ? "#10b981"
      : clamped >= 75
        ? "#22c55e"
        : clamped >= 50
          ? "#f59e0b"
          : "#ef4444";
  const radius = 70;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const filledLength = arcLength * (clamped / 100);
  return (
    <div className="relative flex flex-col items-center">
      <div className="w-48 h-48 relative">
        <svg viewBox="0 0 180 180" className="w-full h-full transform rotate-[135deg]">
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke="rgba(51,65,85,0.6)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${filledLength} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1.2s ease-out, stroke .5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {metaDefined ? (
            <>
              <span className="text-4xl font-bold text-white tabular-nums">
                {(animated / 10).toFixed(1) === "NaN" ? "0" : animated.toFixed(1)}%
              </span>
              <span className="text-xs text-navy-300 uppercase tracking-wider">{label}</span>
            </>
          ) : (
            <>
              <span className="text-3xl font-bold text-navy-400">?</span>
              <span className="text-xs text-navy-400 text-center px-4">
                Meta não
                <br />
                definida
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaProgressBanner({
  realizado,
  meta,
  unidade = "",
}: {
  realizado: number;
  meta: number;
  unidade?: string;
}) {
  const pct = meta > 0 ? Math.min((realizado / meta) * 100, 105) : 0;
  const color = pct >= 100 ? "#10b981" : pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  const milestones = [25, 50, 75, 100];
  const animPct = useCountUp(Math.round(pct * 10) / 10, 1200);
  return (
    <div className="px-4 py-3">
      <div className="relative h-9 bg-navy-800/80 rounded-full overflow-visible border border-navy-700/50 mb-6">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${Math.min(pct, 100)}%`,
            background: `linear-gradient(90deg, ${color}60, ${color})`,
            boxShadow: pct >= 100 ? `0 0 20px ${color}50, 0 0 40px ${color}30` : "none",
          }}
        />
        {milestones.map((m) => (
          <div
            key={m}
            className="absolute top-0 bottom-0 flex flex-col items-center"
            style={{ left: `${m}%`, transform: "translateX(-50%)" }}
          >
            <div className={`w-px h-full ${pct >= m ? "bg-white/50" : "bg-navy-600/60"}`} />
            <span
              className="absolute -bottom-5 text-[10px] font-medium"
              style={{ color: pct >= m ? "#e2e8f0" : "#64748b" }}
            >
              {m}%
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-white drop-shadow-sm">
            {meta > 0
              ? `${(animPct / 10).toFixed(1) === "NaN" ? "0" : animPct.toFixed(1)}% atingido — ${formatNum(realizado)}${unidade} de ${formatNum(meta)}${unidade}`
              : "Meta não definida — configure em /metas"}
          </span>
        </div>
      </div>
    </div>
  );
}

type RankRow = {
  corretorId: string;
  nome: string;
  foto?: string | null;
  vendas: number;
  vgv: number;
  visitas: number;
  agendamentos: number;
  documentacoes: number;
  ligacoes: number;
  whatsapp: number;
  leads: number;
  alteracoes: number;
  pontos: number;
};

function PodiumVisual({
  ranking,
  type = "vendas",
}: {
  ranking: RankRow[];
  type?: "vendas" | "pontos";
}) {
  if (ranking.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-navy-400">
        <p>Nenhum corretor no ranking</p>
      </div>
    );
  }
  const top6 = ranking.slice(0, 6);
  const podiumOrder = [
    { data: top6[3], position: 4 },
    { data: top6[1], position: 2 },
    { data: top6[0], position: 1 },
    { data: top6[2], position: 3 },
    { data: top6[4], position: 5 },
    { data: top6[5], position: 6 },
  ].filter((x) => x.data);
  const styleFor = (p: number) => {
    if (p === 1)
      return {
        size: "w-28 h-28",
        border: "border-[5px] border-yellow-400",
        glow: "shadow-[0_0_50px_rgba(250,204,21,0.5)]",
        nameColor: "text-yellow-300",
        bg: "from-yellow-500 to-amber-600",
      };
    if (p === 2)
      return {
        size: "w-24 h-24",
        border: "border-4 border-gray-300",
        glow: "shadow-[0_0_35px_rgba(209,213,219,0.4)]",
        nameColor: "text-gray-100",
        bg: "from-gray-400 to-gray-600",
      };
    if (p === 3)
      return {
        size: "w-22 h-22",
        border: "border-4 border-amber-500",
        glow: "shadow-[0_0_30px_rgba(245,158,11,0.4)]",
        nameColor: "text-amber-300",
        bg: "from-amber-600 to-orange-700",
      };
    return {
      size: "w-16 h-16",
      border: "border-2 border-blue-400/60",
      glow: "shadow-[0_0_20px_rgba(96,165,250,0.25)]",
      nameColor: "text-blue-200",
      bg: "from-blue-500 to-blue-700",
    };
  };
  return (
    <div className="relative">
      <div className="flex items-end justify-center gap-4 py-4">
        {podiumOrder.map(({ data, position }) => {
          if (!data) return null;
          const s = styleFor(position);
          const val =
            type === "vendas"
              ? `${data.vendas} venda${data.vendas === 1 ? "" : "s"}`
              : `${data.pontos} pts`;
          const badge =
            position === 1 ? "👑" : position === 2 ? "🥈" : position === 3 ? "🥉" : null;
          return (
            <div
              key={data.corretorId}
              className={`flex flex-col items-center transition-all duration-300 hover:scale-105 ${position === 1 ? "z-10" : ""}`}
            >
              {badge && <div className="mb-1 text-sm">{badge}</div>}
              <div className={`relative ${position === 1 ? "mb-3" : "mb-2"}`}>
                <div
                  className={`absolute -top-2 -right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold bg-gradient-to-br ${s.bg} text-white shadow-lg border-2 border-white/20`}
                >
                  {position}
                </div>
                <Avatar className={`${s.size} ${s.border} ${s.glow}`}>
                  <AvatarImage src={data.foto ?? undefined} />
                  <AvatarFallback className={`bg-gradient-to-br ${s.bg} text-white font-bold`}>
                    {getInitials(data.nome)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <p className={`font-bold text-sm ${s.nameColor} text-center max-w-[110px] truncate`}>
                {data.nome.split(" ")[0]}
              </p>
              <p className="text-xs text-cyan-300 font-semibold tabular-nums">{val}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankingLateral({
  ranking,
  type,
  positionChanges,
}: {
  ranking: RankRow[];
  type: "vendas" | "pontos";
  positionChanges?: Map<string, number>;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-2 text-[10px] text-navy-400 uppercase tracking-wider px-2 pb-2 border-b border-navy-700/50">
        <div className="col-span-1">#</div>
        <div className="col-span-7">Executivo</div>
        <div className="col-span-4 text-right">{type === "vendas" ? "Vendas" : "Pontos"}</div>
      </div>
      <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
        {ranking.map((item, index) => {
          const change = positionChanges?.get(item.corretorId);
          const val = type === "vendas" ? item.vendas : item.pontos;
          return (
            <div
              key={item.corretorId}
              className={`grid grid-cols-12 gap-2 items-center py-2 px-2 rounded-lg ${index < 3 ? "bg-navy-800/40" : "hover:bg-navy-800/20"} transition-colors`}
            >
              <div className="col-span-1 flex items-center gap-1">
                <span
                  className={`text-sm font-bold tabular-nums ${index === 0 ? "text-yellow-300" : index === 1 ? "text-gray-300" : index === 2 ? "text-amber-400" : "text-navy-300"}`}
                >
                  {index + 1}
                </span>
                {change !== undefined &&
                  change !== 0 &&
                  (change > 0 ? (
                    <ArrowUp className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <ArrowDown className="w-3 h-3 text-red-400" />
                  ))}
              </div>
              <div className="col-span-7 flex items-center gap-2 min-w-0">
                <Avatar className="w-7 h-7">
                  <AvatarImage src={item.foto ?? undefined} />
                  <AvatarFallback className="text-[10px] bg-navy-700 text-white">
                    {getInitials(item.nome)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-white text-xs font-medium truncate">{item.nome}</span>
              </div>
              <div className="col-span-4 text-right text-cyan-300 text-sm font-bold tabular-nums">
                {formatNum(val)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FunilConversao({
  leads,
  agendamentos,
  visitas,
  vendas,
}: {
  leads: number;
  agendamentos: number;
  visitas: number;
  vendas: number;
}) {
  const steps = [
    { label: "Leads Recebidos", value: leads, icon: "📥" },
    { label: "Agendamentos", value: agendamentos, icon: "📅" },
    { label: "Visitas Realizadas", value: visitas, icon: "👁" },
    { label: "Contratos", value: vendas, icon: "🏆" },
  ];
  const max = Math.max(leads, 1);
  const rate = (cur: number, prev: number) => (prev <= 0 ? 0 : Math.round((cur / prev) * 100));
  const barColor = (r: number) =>
    r >= 60
      ? "from-emerald-500 to-emerald-400"
      : r >= 30
        ? "from-amber-500 to-amber-400"
        : "from-red-500 to-red-400";
  const rateColor = (r: number) =>
    r >= 60 ? "text-emerald-400" : r >= 30 ? "text-amber-400" : "text-red-400";
  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const width = max > 0 ? Math.max((step.value / max) * 100, 4) : 4;
        const r = i === 0 ? 100 : rate(step.value, steps[i - 1].value);
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-navy-200 font-medium flex items-center gap-1.5">
                <span>{step.icon}</span>
                {step.label}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-white font-bold tabular-nums">{formatNum(step.value)}</span>
                {i > 0 && (
                  <span className={`font-bold tabular-nums text-xs ${rateColor(r)}`}>{r}%</span>
                )}
              </div>
            </div>
            <div className="h-7 rounded-lg overflow-hidden bg-navy-800/60">
              <div
                className={`h-full rounded-lg bg-gradient-to-r ${barColor(i === 0 ? 100 : r)} transition-all duration-700`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SalesTickerBanner({ ranking }: { ranking: RankRow[] }) {
  const items = ranking
    .filter((r) => r.vendas > 0)
    .map(
      (r) =>
        `🏆 ${r.nome.split(" ")[0]} — ${r.vendas} venda${r.vendas === 1 ? "" : "s"} · ${r.pontos} pts`,
    );
  if (items.length === 0) return null;
  const doubled = [...items, ...items];
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-navy-900/95 border-t border-navy-700/50 py-2 overflow-hidden z-40 backdrop-blur-sm">
      <div
        className="flex gap-12 whitespace-nowrap"
        style={{ animation: "ticker 40s linear infinite" }}
      >
        {doubled.map((item, i) => (
          <span key={i} className="text-xs text-cyan-300 font-mono shrink-0 px-2">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function MetaAtingidaOverlay({ show, onDone }: { show: boolean; onDone: () => void }) {
  useEffect(() => {
    if (show) {
      const t = setTimeout(onDone, 5000);
      return () => clearTimeout(t);
    }
  }, [show, onDone]);
  if (!show) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: `${6 + (i % 4) * 4}px`,
            height: `${6 + (i % 4) * 4}px`,
            background: ["#fbbf24", "#10b981", "#3b82f6", "#ec4899", "#a855f7", "#f97316"][i % 6],
            left: `${5 + ((i * 3) % 90)}%`,
            top: `${10 + ((i * 7) % 80)}%`,
            animation: `celebration ${1.5 + (i % 3) * 0.5}s ease-out ${(i % 8) * 0.15}s forwards`,
          }}
        />
      ))}
      <div className="text-center" style={{ animation: "fadeInUp .5s ease-out" }}>
        <div
          className="text-5xl font-black text-emerald-400 mb-3"
          style={{ textShadow: "0 0 40px rgba(16,185,129,0.8), 0 0 80px rgba(16,185,129,0.4)" }}
        >
          🎯 META ATINGIDA!
        </div>
        <div className="text-xl text-white font-bold">🎉 Parabéns ao time! 🎉</div>
      </div>
    </div>
  );
}

// ============================================================================
// Página principal
// ============================================================================
function RankingPanel() {
  const [activeTab, setActiveTab] = useState<TabType>("realxmeta");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [periodo, setPeriodo] = useState<PeriodOption>("this_month");
  const [selectedMes, setSelectedMes] = useState(() => new Date().getMonth() + 1);
  const [selectedAno, setSelectedAno] = useState(() => new Date().getFullYear());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationShownRef = useRef(false);
  const autoRotateRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPositionsRef = useRef<Map<string, number>>(new Map());
  const [positionChanges, setPositionChanges] = useState<Map<string, number>>(new Map());

  // Range para Vendas/Produtividade
  const dateRange = useMemo(() => getDateRange(periodo), [periodo]);
  // Range para Real x Meta (mês/ano selecionado)
  const monthRange = useMemo(
    () => ({
      from: new Date(selectedAno, selectedMes - 1, 1),
      to: endOfDay(new Date(selectedAno, selectedMes, 0)),
    }),
    [selectedMes, selectedAno],
  );

  // ===== Queries =====
  const profQ = useQuery({
    queryKey: ["tv:profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, avatar_url, foto_url, ativo")
        .eq("ativo", true);
      return data ?? [];
    },
  });
  const rankingPeriodoQ = useQuery({
    queryKey: ["ranking-periodo-v2", dateKey(dateRange.from), dateKey(dateRange.to)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ranking_periodo_v2", {
        _inicio: dateKey(dateRange.from),
        _fim: dateKey(dateRange.to),
        _limit: 50,
      });
      if (error) throw error;
      return data;
    },
  });
  const rankingMesQ = useQuery({
    queryKey: ["ranking-periodo-v2", selectedAno, selectedMes],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ranking_periodo_v2", {
        _inicio: dateKey(monthRange.from),
        _fim: dateKey(monthRange.to),
        _limit: 50,
      });
      if (error) throw error;
      return data;
    },
  });

  const prevMonthRange = useMemo(() => {
    const prevM = selectedMes === 1 ? 12 : selectedMes - 1;
    const prevA = selectedMes === 1 ? selectedAno - 1 : selectedAno;
    return { from: new Date(prevA, prevM - 1, 1), to: endOfDay(new Date(prevA, prevM, 0)) };
  }, [selectedMes, selectedAno]);
  const rankingMesPrevQ = useQuery({
    queryKey: ["ranking-periodo-v2", "anterior", selectedAno, selectedMes],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ranking_periodo_v2", {
        _inicio: dateKey(prevMonthRange.from),
        _fim: dateKey(prevMonthRange.to),
        _limit: 50,
      });
      if (error) throw error;
      return data;
    },
  });
  const metasQ = useQuery({
    queryKey: ["tv:metas", selectedMes, selectedAno],
    queryFn: async () => {
      const { data } = await supabase
        .from("metas")
        .select("corretor_id, equipe_id, meta_vendas, meta_visitas, meta_leads_atendidos, meta_gmv")
        .eq("mes", selectedMes)
        .eq("ano", selectedAno);
      return data ?? [];
    },
  });

  const isLoading =
    profQ.isLoading ||
    rankingPeriodoQ.isLoading ||
    rankingMesQ.isLoading ||
    rankingMesPrevQ.isLoading;

  const refetchAll = () => {
    profQ.refetch();
    rankingPeriodoQ.refetch();
    rankingMesQ.refetch();
    rankingMesPrevQ.refetch();
    metasQ.refetch();
    setLastUpdated(new Date());
  };

  // Refresh automático a cada 5 min
  useEffect(() => {
    const t = setInterval(refetchAll, 5 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLoading) setLastUpdated(new Date());
  }, [isLoading]);

  // Auto-rotação entre abas (30s)
  useEffect(() => {
    if (autoRotate) {
      autoRotateRef.current = setInterval(() => {
        setActiveTab((prev) => {
          const idx = TABS.indexOf(prev);
          return TABS[(idx + 1) % TABS.length];
        });
      }, 30000);
    }
    return () => {
      if (autoRotateRef.current) clearInterval(autoRotateRef.current);
    };
  }, [autoRotate]);

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // O navegador recebe no máximo 50 linhas agregadas; não baixa mais 10.000
  // leads, eventos, vendas, agendas e interações para recalcular o ranking.
  const photos = useMemo(
    () =>
      new Map(
        (profQ.data ?? []).map((profile) => [
          profile.id,
          profile.avatar_url ?? profile.foto_url ?? null,
        ]),
      ),
    [profQ.data],
  );
  const mapRanking = (rows: typeof rankingPeriodoQ.data): RankRow[] =>
    (rows ?? []).map((row) => ({
      corretorId: row.corretor_id,
      nome: row.nome,
      foto: photos.get(row.corretor_id) ?? null,
      vendas: Number(row.vendas),
      vgv: Number(row.vgv),
      visitas: Number(row.visitas),
      agendamentos: Number(row.agendamentos),
      documentacoes: Number(row.documentacoes),
      ligacoes: Number(row.ligacoes),
      whatsapp: Number(row.whatsapps),
      leads: Number(row.leads),
      alteracoes: Number(row.alteracoes),
      pontos: Number(row.pontuacao),
    }));

  const rankingProd = useMemo(
    () => mapRanking(rankingPeriodoQ.data).sort((a, b) => b.pontos - a.pontos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rankingPeriodoQ.data, photos],
  );
  const rankingMes = useMemo(
    () => mapRanking(rankingMesQ.data).sort((a, b) => b.vendas - a.vendas || b.pontos - a.pontos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rankingMesQ.data, photos],
  );
  const rankingMesPrev = useMemo(
    () => mapRanking(rankingMesPrevQ.data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rankingMesPrevQ.data, photos],
  );

  // Tracking de mudança de posição (no ranking de produtividade)
  useEffect(() => {
    if (rankingProd.length === 0) return;
    const current = new Map<string, number>(rankingProd.map((r, idx) => [r.corretorId, idx + 1]));
    if (prevPositionsRef.current.size > 0) {
      const changes = new Map<string, number>();
      current.forEach((pos, id) => {
        const prev = prevPositionsRef.current.get(id);
        if (prev !== undefined && prev !== pos) changes.set(id, prev - pos);
      });
      if (changes.size > 0) {
        setPositionChanges(changes);
        setTimeout(() => setPositionChanges(new Map()), 10000);
      }
    }
    prevPositionsRef.current = current;
  }, [rankingProd]);

  // Totais agregados
  const totaisMes = useMemo(
    () =>
      rankingMes.reduce(
        (acc, r) => ({
          vendas: acc.vendas + r.vendas,
          vgv: acc.vgv + r.vgv,
          visitas: acc.visitas + r.visitas,
          agendamentos: acc.agendamentos + r.agendamentos,
          documentacoes: acc.documentacoes + r.documentacoes,
          leads: acc.leads + r.leads,
          ligacoes: acc.ligacoes + r.ligacoes,
          whatsapp: acc.whatsapp + r.whatsapp,
          pontos: acc.pontos + r.pontos,
        }),
        {
          vendas: 0,
          vgv: 0,
          visitas: 0,
          agendamentos: 0,
          documentacoes: 0,
          leads: 0,
          ligacoes: 0,
          whatsapp: 0,
          pontos: 0,
        },
      ),
    [rankingMes],
  );

  const totaisMesPrev = useMemo(
    () =>
      rankingMesPrev.reduce(
        (acc, r) => ({
          vendas: acc.vendas + r.vendas,
          visitas: acc.visitas + r.visitas,
          leads: acc.leads + r.leads,
        }),
        { vendas: 0, visitas: 0, leads: 0 },
      ),
    [rankingMesPrev],
  );

  const totaisPeriodo = useMemo(
    () =>
      rankingProd.reduce(
        (acc, r) => ({
          vendas: acc.vendas + r.vendas,
          vgv: acc.vgv + r.vgv,
          visitas: acc.visitas + r.visitas,
          agendamentos: acc.agendamentos + r.agendamentos,
          documentacoes: acc.documentacoes + r.documentacoes,
          leads: acc.leads + r.leads,
          ligacoes: acc.ligacoes + r.ligacoes,
          whatsapp: acc.whatsapp + r.whatsapp,
          pontos: acc.pontos + r.pontos,
        }),
        {
          vendas: 0,
          vgv: 0,
          visitas: 0,
          agendamentos: 0,
          documentacoes: 0,
          leads: 0,
          ligacoes: 0,
          whatsapp: 0,
          pontos: 0,
        },
      ),
    [rankingProd],
  );

  // Metas agregadas do mês
  const metaTotais = useMemo(
    () =>
      (metasQ.data ?? []).reduce(
        (acc: any, m: any) => ({
          vendas: acc.vendas + (m.meta_vendas || 0),
          visitas: acc.visitas + (m.meta_visitas || 0),
          leads_atendidos: acc.leads_atendidos + (m.meta_leads_atendidos || 0),
          vgv: acc.vgv + (Number(m.meta_gmv) || 0),
        }),
        { vendas: 0, visitas: 0, leads_atendidos: 0, vgv: 0 },
      ),
    [metasQ.data],
  );

  const metaDefined = metaTotais.vendas > 0;
  const pctAtingimento = metaDefined ? (totaisMes.vendas / metaTotais.vendas) * 100 : 0;

  // Celebração quando bate 100%
  useEffect(() => {
    if (pctAtingimento >= 100 && !celebrationShownRef.current && totaisMes.vendas > 0) {
      celebrationShownRef.current = true;
      setShowCelebration(true);
    }
  }, [pctAtingimento, totaisMes.vendas]);

  // Tendência (projeção até fim do mês)
  const tendencia = useMemo(() => {
    const hoje = new Date();
    const totalDias = new Date(selectedAno, selectedMes, 0).getDate();
    const ehAtual = hoje.getFullYear() === selectedAno && hoje.getMonth() + 1 === selectedMes;
    const diaAtual = ehAtual ? hoje.getDate() : totalDias;
    if (diaAtual <= 0 || metaTotais.vendas <= 0) return 0;
    const proj = (totaisMes.vendas / diaAtual) * totalDias;
    return Math.round((proj / metaTotais.vendas) * 100);
  }, [totaisMes.vendas, metaTotais.vendas, selectedMes, selectedAno]);

  // Heat columns produtividade
  const heatCols = useMemo(
    () => ({
      lig: rankingProd.map((r) => r.ligacoes),
      wpp: rankingProd.map((r) => r.whatsapp),
      agd: rankingProd.map((r) => r.agendamentos),
      vis: rankingProd.map((r) => r.visitas),
      doc: rankingProd.map((r) => r.documentacoes),
      ven: rankingProd.map((r) => r.vendas),
      pts: rankingProd.map((r) => r.pontos),
    }),
    [rankingProd],
  );

  const deltaVendas = totaisMes.vendas - totaisMesPrev.vendas;

  if (
    profQ.isError ||
    rankingPeriodoQ.isError ||
    rankingMesQ.isError ||
    rankingMesPrevQ.isError ||
    metasQ.isError
  ) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/40 p-8 text-center">
        <p className="font-semibold">Não foi possível carregar o desempenho.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Os indicadores não foram substituídos por valores zerados.
        </p>
        <Button className="mt-4" variant="outline" onClick={refetchAll}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    // `dark` força tokens escuros neste subtree — a TV é escura por design,
    // independente do tema escolhido pelo usuário.
    <div
      className={`dark min-h-screen bg-gradient-to-br from-navy-950 via-navy-900 to-blue-950 text-white -m-6 ${isFullscreen ? "overflow-hidden" : "pb-14"}`}
    >
      <style>{TV_STYLES}</style>
      <MetaAtingidaOverlay show={showCelebration} onDone={() => setShowCelebration(false)} />

      {/* Header */}
      <div className="border-b border-navy-800/50 bg-gradient-to-r from-navy-900/95 via-navy-900/90 to-blue-950/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-10 h-10 rounded-lg bg-gradient-gold flex items-center justify-center shadow-glow-gold">
                <Trophy className="w-5 h-5 text-navy-900" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-white">SEU METRO QUADRADO</h1>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-400/10 border border-red-400/30 px-1.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    AO VIVO
                  </span>
                </div>
                <p className="text-[10px] text-cyan-300 uppercase tracking-wider font-medium">
                  Performance em Vendas
                </p>
              </div>
            </div>

            <div className="flex-1 flex justify-center min-w-[300px]">
              <Tabs
                value={activeTab}
                onValueChange={(v) => {
                  setActiveTab(v as TabType);
                  setAutoRotate(false);
                }}
              >
                <TabsList className="bg-navy-800/60 border border-navy-700/50">
                  <TabsTrigger
                    value="realxmeta"
                    className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-navy-200 text-xs sm:text-sm"
                  >
                    <Target className="w-4 h-4 mr-1.5" /> Real x Meta
                  </TabsTrigger>
                  <TabsTrigger
                    value="vendas"
                    className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-navy-200 text-xs sm:text-sm"
                  >
                    <Trophy className="w-4 h-4 mr-1.5" /> Vendas
                  </TabsTrigger>
                  <TabsTrigger
                    value="produtividade"
                    className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-navy-200 text-xs sm:text-sm"
                  >
                    <Activity className="w-4 h-4 mr-1.5" /> Produtividade
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden lg:flex flex-col items-end gap-0.5">
                <LiveClock />
                {lastUpdated && (
                  <span className="text-[9px] text-navy-400 tabular-nums">
                    ↻{" "}
                    {lastUpdated.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAutoRotate((v) => !v)}
                  className={`gap-1.5 border-navy-700/50 text-white hover:bg-navy-700/50 hover:text-white ${autoRotate ? "bg-cyan-900/40 border-cyan-500/50" : "bg-navy-800/50"}`}
                  title={autoRotate ? "Pausar rotação" : "Rotação automática (30s)"}
                >
                  {autoRotate ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  <span className="text-xs hidden sm:inline">{autoRotate ? "Pausar" : "Auto"}</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={refetchAll}
                  className="bg-navy-800/50 border-navy-700/50 text-white hover:bg-navy-700/50 hover:text-white"
                  title="Atualizar"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleFullscreen}
                  className="bg-navy-800/50 border-navy-700/50 text-white hover:bg-navy-700/50 hover:text-white"
                  title={isFullscreen ? "Sair" : "Tela cheia"}
                >
                  {isFullscreen ? (
                    <Minimize className="h-4 w-4" />
                  ) : (
                    <Maximize className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === "realxmeta" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="gap-2 bg-navy-800/50 border-navy-700/50 text-white hover:bg-navy-700/50 hover:text-white min-w-[160px] justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> {MESES[selectedMes - 1]} {selectedAno}
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 max-h-80 overflow-y-auto">
                  {[2026, 2025, 2024].map((ano) => (
                    <div key={ano}>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1 text-xs font-bold text-navy-400">{ano}</div>
                      {MESES.map((m, idx) => (
                        <DropdownMenuItem
                          key={`${ano}-${idx}`}
                          onClick={() => {
                            setSelectedMes(idx + 1);
                            setSelectedAno(ano);
                            celebrationShownRef.current = false;
                          }}
                          className={
                            selectedMes === idx + 1 && selectedAno === ano ? "bg-accent" : ""
                          }
                        >
                          {m} {ano}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="gap-2 bg-navy-800/50 border-navy-700/50 text-white hover:bg-navy-700/50 hover:text-white min-w-[180px] justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> {periodLabels[periodo]}
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {(Object.entries(periodLabels) as [PeriodOption, string][]).map(([k, label]) => (
                    <DropdownMenuItem
                      key={k}
                      onClick={() => setPeriodo(k)}
                      className={periodo === k ? "bg-accent" : ""}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      <div className={`px-4 py-5 ${isFullscreen ? "" : "pb-14"}`}>
        {/* ===================== ABA REAL x META ===================== */}
        {activeTab === "realxmeta" && (
          <>
            <div className="bg-navy-900/60 rounded-2xl border border-navy-800/50 mb-5">
              <MetaProgressBanner
                realizado={totaisMes.vendas}
                meta={metaTotais.vendas}
                unidade=" vendas"
              />
            </div>

            {/* VGV — Realizado x Meta x Gap */}
            <div className="bg-navy-900/60 rounded-2xl border border-navy-800/50 p-5 mb-5">
              <h3 className="text-xs text-navy-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> VGV — Realizado x Meta
              </h3>
              {(() => {
                const vgvReal = totaisMes.vgv;
                const vgvMeta = metaTotais.vgv;
                const gap = vgvMeta - vgvReal;
                const pct = vgvMeta > 0 ? (vgvReal / vgvMeta) * 100 : 0;
                const fmtBRL = (n: number) =>
                  new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0,
                  }).format(n);
                const color =
                  pct >= 100
                    ? "#10b981"
                    : pct >= 75
                      ? "#22c55e"
                      : pct >= 50
                        ? "#f59e0b"
                        : "#ef4444";
                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                      <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4">
                        <div className="text-[11px] uppercase tracking-wider text-emerald-200 mb-1">
                          VGV Realizado
                        </div>
                        <div className="text-2xl font-bold text-white tabular-nums">
                          {fmtBRL(vgvReal)}
                        </div>
                        <div className="text-[10px] text-emerald-300 mt-1">
                          {totaisMes.vendas} venda(s)
                        </div>
                      </div>
                      <div className="bg-navy-800/60 border border-navy-600/40 rounded-xl p-4">
                        <div className="text-[11px] uppercase tracking-wider text-navy-200 mb-1">
                          Meta VGV
                        </div>
                        <div className="text-2xl font-bold text-white tabular-nums">
                          {vgvMeta > 0 ? fmtBRL(vgvMeta) : "—"}
                        </div>
                        <div className="text-[10px] text-navy-300 mt-1">
                          {vgvMeta > 0 ? `${pct.toFixed(1)}% atingido` : "Meta não definida"}
                        </div>
                      </div>
                      <div
                        className={`rounded-xl p-4 border ${gap > 0 ? "bg-red-900/30 border-red-500/30" : "bg-emerald-900/30 border-emerald-500/30"}`}
                      >
                        <div className="text-[11px] uppercase tracking-wider text-navy-100 mb-1">
                          GAP VGV
                        </div>
                        <div
                          className={`text-2xl font-bold tabular-nums ${gap > 0 ? "text-red-300" : "text-emerald-300"}`}
                        >
                          {vgvMeta > 0 ? `${gap > 0 ? "-" : "+"}${fmtBRL(Math.abs(gap))}` : "—"}
                        </div>
                        <div className="text-[10px] text-navy-300 mt-1">
                          {vgvMeta > 0 ? (gap > 0 ? "falta para a meta" : "acima da meta") : ""}
                        </div>
                      </div>
                    </div>
                    {vgvMeta > 0 && (
                      <div className="relative h-3 bg-navy-800/80 rounded-full overflow-hidden border border-navy-700/50">
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            background: `linear-gradient(90deg, ${color}80, ${color})`,
                          }}
                        />
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
              {/* Gauge */}
              <div className="bg-navy-900/60 rounded-2xl border border-navy-800/50 p-5">
                <h3 className="text-xs text-navy-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-400" /> Atingimento da Meta
                </h3>
                <div className="flex flex-col items-center gap-4">
                  <GaugeChart
                    percentage={pctAtingimento}
                    label="% Atingido"
                    metaDefined={metaDefined}
                  />
                  <div className="w-full grid grid-cols-2 gap-3 text-center">
                    <div className="bg-navy-800/50 rounded-xl p-3">
                      <div className="text-xs text-navy-300 mb-1">Realizado</div>
                      <div className="text-lg font-bold text-purple-300 tabular-nums">
                        {formatNum(totaisMes.vendas)}
                      </div>
                    </div>
                    <div className="bg-navy-800/50 rounded-xl p-3">
                      <div className="text-xs text-navy-300 mb-1">Meta</div>
                      <div className="text-lg font-bold text-navy-200 tabular-nums">
                        {metaDefined ? formatNum(metaTotais.vendas) : "—"}
                      </div>
                    </div>
                    <div className="bg-navy-800/50 rounded-xl p-3">
                      <div className="text-xs text-navy-300 mb-1">Gap</div>
                      <div
                        className={`text-base font-bold tabular-nums ${metaTotais.vendas - totaisMes.vendas > 0 ? "text-red-400" : "text-emerald-400"}`}
                      >
                        {metaDefined
                          ? `${metaTotais.vendas - totaisMes.vendas > 0 ? "-" : "+"}${formatNum(Math.abs(metaTotais.vendas - totaisMes.vendas))}`
                          : "—"}
                      </div>
                    </div>
                    <div className="bg-navy-800/50 rounded-xl p-3">
                      <div className="text-xs text-navy-300 mb-1">Tendência</div>
                      <div
                        className={`text-base font-bold tabular-nums ${tendencia >= 100 ? "text-emerald-400" : tendencia >= 70 ? "text-amber-400" : "text-red-400"}`}
                      >
                        {metaDefined ? `${tendencia}%` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Indicadores do mês */}
              <div className="bg-navy-900/60 rounded-2xl border border-navy-800/50 p-5 space-y-4">
                <h3 className="text-xs text-navy-300 uppercase tracking-wider flex items-center gap-2">
                  <Star className="w-4 h-4 text-purple-400" /> Indicadores do Mês
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <KPICard
                    label="Contratos"
                    numericValue={totaisMes.vendas}
                    icon={FileCheck}
                    variant="success"
                    delta={deltaVendas}
                  />
                  <KPICard
                    label="Leads"
                    numericValue={totaisMes.leads}
                    icon={Users}
                    variant="info"
                  />
                  <KPICard
                    label="Agendamentos"
                    numericValue={totaisMes.agendamentos}
                    icon={CalendarCheck}
                    variant="accent"
                  />
                  <KPICard
                    label="Visitas"
                    numericValue={totaisMes.visitas}
                    icon={Eye}
                    variant="warning"
                  />
                </div>
              </div>

              {/* Top vendedores do mês */}
              <div className="bg-navy-900/60 rounded-2xl border border-navy-800/50 p-5">
                <h3 className="text-xs text-navy-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-purple-400" /> Top Vendedores do Mês
                </h3>
                <RankingLateral
                  ranking={rankingMes.filter((r) => r.vendas > 0 || r.pontos > 0).slice(0, 10)}
                  type="vendas"
                />
              </div>
            </div>

            {/* Faixa de corretores com meta individual */}
            <div className="bg-navy-900/60 rounded-2xl border border-navy-800/50 p-5">
              <h3 className="text-xs text-navy-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-400" /> Vendas por Corretor — Real x Meta
              </h3>
              {(() => {
                const metasMap = new Map<string, number>();
                for (const m of (metasQ.data ?? []) as any[]) {
                  if (m.corretor_id) metasMap.set(m.corretor_id, m.meta_vendas || 0);
                }
                const rows = rankingMes
                  .filter((r) => r.vendas > 0 || metasMap.has(r.corretorId))
                  .map((r) => ({ ...r, meta: metasMap.get(r.corretorId) || 0 }));
                if (rows.length === 0)
                  return (
                    <p className="text-sm text-navy-400 text-center py-6">Sem dados para o mês</p>
                  );
                const max = Math.max(...rows.map((r) => Math.max(r.vendas, r.meta)), 1);
                return (
                  <div className="space-y-3">
                    {rows.slice(0, 12).map((r) => {
                      const valW = (r.vendas / max) * 100;
                      const metaW = r.meta > 0 ? (r.meta / max) * 100 : 0;
                      return (
                        <div key={r.corretorId} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-200 font-medium truncate max-w-[200px]">
                              {r.nome}
                            </span>
                            <div className="flex items-center gap-3">
                              {r.meta > 0 && (
                                <span className="text-navy-400 tabular-nums">Meta: {r.meta}</span>
                              )}
                              <span className="text-white font-semibold tabular-nums">
                                {r.vendas}
                              </span>
                            </div>
                          </div>
                          <div className="h-5 bg-navy-800/60 rounded-md overflow-hidden relative">
                            <div
                              className="h-full rounded-md bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-700"
                              style={{ width: `${Math.max(valW, 2)}%` }}
                            />
                            {metaW > 0 && (
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-white/60"
                                style={{ left: `${metaW}%` }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-[10px] text-navy-400 mt-1 flex items-center gap-1">
                      <span className="w-3 h-px bg-white/60 inline-block" /> Linha branca = meta
                      individual
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {/* ===================== ABA VENDAS ===================== */}
        {activeTab === "vendas" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
              <KPICard
                label="Vendas"
                numericValue={totaisPeriodo.vendas}
                icon={Trophy}
                variant="success"
                highlight
              />
              <KPICard
                label="Visitas"
                numericValue={totaisPeriodo.visitas}
                icon={Eye}
                variant="warning"
              />
              <KPICard
                label="Agendamentos"
                numericValue={totaisPeriodo.agendamentos}
                icon={CalendarCheck}
                variant="accent"
              />
              <KPICard
                label="Documentação"
                numericValue={totaisPeriodo.documentacoes}
                icon={FileCheck}
                variant="info"
              />
              <KPICard
                label="Leads"
                numericValue={totaisPeriodo.leads}
                icon={Users}
                variant="default"
              />
              <KPICard
                label="Corretores"
                numericValue={rankingProd.filter((r) => r.pontos > 0).length}
                icon={Users}
                variant="default"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
              <div className="lg:col-span-2 bg-navy-900/60 rounded-2xl border border-navy-800/50 p-5">
                <h3 className="text-xs text-navy-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" /> Pódio — Vendas
                </h3>
                <PodiumVisual ranking={rankingMes.filter((r) => r.vendas > 0)} type="vendas" />
              </div>
              <div className="bg-navy-900/60 rounded-2xl border border-navy-800/50 p-5">
                <h3 className="text-xs text-navy-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Flag className="w-4 h-4 text-cyan-400" /> Ranking de Vendas
                </h3>
                <RankingLateral
                  ranking={rankingProd
                    .filter((r) => r.vendas > 0)
                    .sort((a, b) => b.vendas - a.vendas)
                    .slice(0, 15)}
                  type="vendas"
                />
              </div>
            </div>

            <div className="bg-navy-900/60 rounded-2xl border border-navy-800/50 p-5">
              <h3 className="text-xs text-navy-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" /> Funil de Conversão —{" "}
                {periodLabels[periodo]}
              </h3>
              <FunilConversao
                leads={totaisPeriodo.leads}
                agendamentos={totaisPeriodo.agendamentos}
                visitas={totaisPeriodo.visitas}
                vendas={totaisPeriodo.vendas}
              />
            </div>
          </>
        )}

        {/* ===================== ABA PRODUTIVIDADE ===================== */}
        {activeTab === "produtividade" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
              <KPICard
                label="Pontos"
                numericValue={totaisPeriodo.pontos}
                icon={Star}
                variant="accent"
                highlight
              />
              <KPICard
                label="Ligações"
                numericValue={totaisPeriodo.ligacoes}
                icon={Phone}
                variant="info"
              />
              <KPICard
                label="WhatsApp"
                numericValue={totaisPeriodo.whatsapp}
                icon={MessageSquare}
                variant="accent"
              />
              <KPICard
                label="Agendamentos"
                numericValue={totaisPeriodo.agendamentos}
                icon={CalendarCheck}
                variant="default"
              />
              <KPICard
                label="Visitas"
                numericValue={totaisPeriodo.visitas}
                icon={Eye}
                variant="warning"
              />
              <KPICard
                label="Documentação"
                numericValue={totaisPeriodo.documentacoes}
                icon={FileCheck}
                variant="info"
              />
              <KPICard
                label="Vendas"
                numericValue={totaisPeriodo.vendas}
                icon={Trophy}
                variant="success"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
              <div className="lg:col-span-2 bg-navy-900/60 rounded-2xl border border-navy-800/50 p-5">
                <h3 className="text-xs text-navy-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" /> Pódio — Pontuação
                </h3>
                <PodiumVisual ranking={rankingProd.filter((r) => r.pontos > 0)} type="pontos" />
              </div>
              <div className="bg-navy-900/60 rounded-2xl border border-navy-800/50 p-5">
                <h3 className="text-xs text-navy-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Flag className="w-4 h-4 text-cyan-400" /> Ranking
                </h3>
                <RankingLateral
                  ranking={rankingProd.filter((r) => r.pontos > 0).slice(0, 15)}
                  type="pontos"
                  positionChanges={positionChanges}
                />
              </div>
            </div>

            <div className="bg-navy-900/60 rounded-2xl border border-navy-800/50 p-5">
              <h3 className="text-xs text-navy-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" /> Desempenho Detalhado
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-navy-300 border-b border-navy-700/50 text-[11px] uppercase tracking-wider">
                      <th className="text-left py-3 px-3">#</th>
                      <th className="text-left py-3 px-3">Corretor</th>
                      <th className="text-center py-2 px-2">Lig.</th>
                      <th className="text-center py-2 px-2">WhatsApp</th>
                      <th className="text-center py-2 px-2">Agend.</th>
                      <th className="text-center py-2 px-2">Visitas</th>
                      <th className="text-center py-2 px-2">Docs</th>
                      <th className="text-center py-2 px-2">Vendas</th>
                      <th className="text-right py-2 px-3">Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingProd
                      .filter((r) => r.pontos > 0)
                      .map((r, idx) => (
                        <tr
                          key={r.corretorId}
                          className="border-b border-navy-800/30 hover:bg-navy-800/20 transition-colors"
                        >
                          <td className="py-2.5 px-3 text-navy-300 font-bold tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <Avatar className="w-7 h-7">
                                <AvatarImage src={r.foto ?? undefined} />
                                <AvatarFallback className="text-[10px] bg-navy-700 text-white">
                                  {getInitials(r.nome)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-white font-medium">{r.nome}</span>
                            </div>
                          </td>
                          <td
                            className={`text-center py-2 px-2 tabular-nums font-semibold ${getHeatColor(r.ligacoes, heatCols.lig)}`}
                          >
                            {r.ligacoes || "—"}
                          </td>
                          <td
                            className={`text-center py-2 px-2 tabular-nums font-semibold ${getHeatColor(r.whatsapp, heatCols.wpp)}`}
                          >
                            {r.whatsapp || "—"}
                          </td>
                          <td
                            className={`text-center py-2 px-2 tabular-nums font-semibold ${getHeatColor(r.agendamentos, heatCols.agd)}`}
                          >
                            {r.agendamentos || "—"}
                          </td>
                          <td
                            className={`text-center py-2 px-2 tabular-nums font-semibold ${getHeatColor(r.visitas, heatCols.vis)}`}
                          >
                            {r.visitas || "—"}
                          </td>
                          <td
                            className={`text-center py-2 px-2 tabular-nums font-semibold ${getHeatColor(r.documentacoes, heatCols.doc)}`}
                          >
                            {r.documentacoes || "—"}
                          </td>
                          <td
                            className={`text-center py-2 px-2 tabular-nums font-semibold ${getHeatColor(r.vendas, heatCols.ven)}`}
                          >
                            {r.vendas || "—"}
                          </td>
                          <td className="text-right py-2 px-3 tabular-nums font-bold text-cyan-300">
                            {formatNum(r.pontos)}
                          </td>
                        </tr>
                      ))}
                    {rankingProd.filter((r) => r.pontos > 0).length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-navy-400">
                          Sem atividade no período
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <SalesTickerBanner ranking={rankingMes} />
    </div>
  );
}

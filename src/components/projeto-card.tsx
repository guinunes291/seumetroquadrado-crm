import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Building2,
  MapPin,
  BedDouble,
  Car,
  CalendarClock,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronDown,
  Ruler,
} from "lucide-react";
import {
  formatBRL,
  formatM2Range,
  formatDormsRange,
  formatVagasRange,
  formatEntrega,
  splitTipoExtra,
  maskToken,
  webhookUrl,
} from "@/lib/projetos";
import { useState } from "react";

export type ProjetoRow = {
  id: string;
  nome: string;
  slug: string;
  construtora: string | null;
  cidade: string | null;
  regiao: string | null;
  bairro: string | null;
  endereco: string | null;
  logradouro: string | null;
  numero: string | null;
  observacoes: string | null;
  ativo: boolean;
  metragem_min: number | null;
  metragem_max: number | null;
  dorms_min: number | null;
  dorms_max: number | null;
  suites: number | null;
  tipo_extra: string | null;
  vagas_min: number | null;
  vagas_max: number | null;
  vagas_observacao: string | null;
  preco_a_partir: number | null;
  sob_consulta: boolean;
  status_entrega: string | null;
  mes_entrega: number | null;
  ano_entrega: number | null;
  fonte: string | null;
};

type Props = {
  projeto: ProjetoRow;
  canManage: boolean;
  origin: string;
  token?: string;
  revealed?: boolean;
  onToggleAtivo?: (ativo: boolean) => void;
  onEdit?: () => void;
  onLoadToken?: () => Promise<string | null>;
  onRegen?: () => void;
  onToggleReveal?: () => void;
  onCopyUrl?: () => void;
};

export function ProjetoCard({
  projeto: p,
  canManage,
  origin,
  token,
  revealed,
  onToggleAtivo,
  onEdit,
  onLoadToken,
  onRegen,
  onToggleReveal,
  onCopyUrl,
}: Props) {
  const [webhookOpen, setWebhookOpen] = useState(false);

  const precoLabel = p.sob_consulta
    ? "Sob consulta"
    : p.preco_a_partir != null
      ? formatBRL(p.preco_a_partir)
      : null;

  const local = [p.bairro, p.regiao, p.cidade].filter(Boolean).join(" · ");
  const dorms = formatDormsRange(p.dorms_min, p.dorms_max);
  const metr = formatM2Range(p.metragem_min, p.metragem_max);
  const vagas = formatVagasRange(p.vagas_min, p.vagas_max, p.vagas_observacao);
  const entrega = formatEntrega(p.status_entrega, p.mes_entrega, p.ano_entrega);
  const tipos = splitTipoExtra(p.tipo_extra);

  const isRevealed = !!revealed && !!token;
  const url = token ? webhookUrl(origin, token) : "";

  return (
    <Card className={`flex flex-col ${!p.ativo ? "opacity-60" : ""}`}>
      <CardContent className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <Link
              to="/projetos/$projetoId"
              params={{ projetoId: p.id }}
              className="font-semibold hover:underline block truncate"
            >
              {p.nome}
            </Link>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {p.construtora && (
                <Badge variant="outline" className="font-normal">
                  {p.construtora}
                </Badge>
              )}
              {tipos.map((t) => (
                <Badge key={t} variant="secondary" className="font-normal">
                  {t}
                </Badge>
              ))}
              {canManage && !p.ativo && <Badge variant="secondary">Inativo</Badge>}
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-1 shrink-0">
              <Switch
                checked={p.ativo}
                onCheckedChange={(v) => onToggleAtivo?.(v)}
                aria-label="Ativo"
              />
              <Button size="sm" variant="ghost" onClick={onEdit}>
                Editar
              </Button>
            </div>
          )}
        </div>

        {local && (
          <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{local}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {dorms && (
            <span className="inline-flex items-center gap-1.5">
              <BedDouble className="h-4 w-4 text-muted-foreground" />
              {dorms}
              {p.suites ? ` · ${p.suites} suíte${p.suites === 1 ? "" : "s"}` : ""}
            </span>
          )}
          {metr && (
            <span className="inline-flex items-center gap-1.5">
              <Ruler className="h-4 w-4 text-muted-foreground" />
              {metr}
            </span>
          )}
          {vagas && (
            <span className="inline-flex items-center gap-1.5">
              <Car className="h-4 w-4 text-muted-foreground" />
              {vagas}
            </span>
          )}
          {entrega && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {entrega}
            </span>
          )}
        </div>

        {precoLabel && (
          <div className="mt-auto">
            <p className="text-xs text-muted-foreground">A partir de</p>
            <p className="text-lg font-semibold">{precoLabel}</p>
          </div>
        )}

        {p.observacoes && (
          <p className="text-xs text-muted-foreground line-clamp-2">{p.observacoes}</p>
        )}

        <div className="pt-2 border-t flex items-center justify-between">
          <Badge variant="outline" className="font-mono text-[10px]">
            {p.slug}
          </Badge>
          <Link
            to="/projetos/$projetoId"
            params={{ projetoId: p.id }}
            className="text-sm text-primary hover:underline"
          >
            Ver detalhes →
          </Link>
        </div>

        {canManage && (
          <div className="rounded-md border bg-muted/30">
            <button
              type="button"
              onClick={async () => {
                if (!webhookOpen && !token) await onLoadToken?.();
                setWebhookOpen((o) => !o);
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 rounded-md"
            >
              <span className="uppercase tracking-wide">Webhook</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${webhookOpen ? "rotate-180" : ""}`}
              />
            </button>
            {webhookOpen && (
              <div className="p-3 pt-0 space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-background border rounded px-2 py-1.5 font-mono truncate">
                    {token
                      ? isRevealed
                        ? url
                        : webhookUrl(origin, maskToken(token))
                      : "••••••"}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      if (!token) await onLoadToken?.();
                      onToggleReveal?.();
                    }}
                    title={isRevealed ? "Ocultar" : "Mostrar"}
                  >
                    {isRevealed ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={onCopyUrl}
                    title="Copiar URL"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Regenerar token? URLs antigas pararão de funcionar.")) {
                        onRegen?.();
                      }
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    <span className="hidden sm:inline">Regenerar</span>
                  </Button>
                </div>
                <Label className="text-[10px] text-muted-foreground">
                  POST JSON: nome, telefone, email, origem, campanha, utm_source…
                </Label>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

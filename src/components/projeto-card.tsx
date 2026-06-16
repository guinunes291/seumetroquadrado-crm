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
} from "lucide-react";
import {
  formatBRL,
  maskToken,
  parsePrecoBRL,
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
  tipologia: string | null;
  vagas: string | null;
  preco_inicial: string | null;
  entrega_status: string | null;
  observacoes: string | null;
  ativo: boolean;
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
  const precoNum = parsePrecoBRL(p.preco_inicial);
  const precoLabel = precoNum != null ? formatBRL(precoNum) : p.preco_inicial || null;
  const local = [p.cidade, p.regiao, p.bairro].filter(Boolean).join(" · ");
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
          {p.tipologia && (
            <span className="inline-flex items-center gap-1.5">
              <BedDouble className="h-4 w-4 text-muted-foreground" />
              {p.tipologia}
            </span>
          )}
          {p.vagas && (
            <span className="inline-flex items-center gap-1.5">
              <Car className="h-4 w-4 text-muted-foreground" />
              {p.vagas} {Number(p.vagas) === 1 ? "vaga" : "vagas"}
            </span>
          )}
          {p.entrega_status && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {p.entrega_status}
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
                      if (
                        confirm("Regenerar token? URLs antigas pararão de funcionar.")
                      ) {
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

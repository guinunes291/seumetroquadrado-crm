import { createFileRoute } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

// Fase 0 da evolução de design: vitrine interna (só admin) dos tokens e
// componentes COMO ESTÃO HOJE. Não altera nenhuma tela.
export const Route = createFileRoute("/_authenticated/design-system")({
  head: () => ({
    meta: [
      { title: "Design System — Seu Metro Quadrado" },
      { name: "description", content: "Tokens e componentes atuais do CRM SMQ." },
      { property: "og:title", content: "Design System — Seu Metro Quadrado" },
      { property: "og:description", content: "Referência visual interna do CRM SMQ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireRole allow={["admin"]}>
      <DesignSystemPage />
    </RequireRole>
  ),
});

const CORES = [
  "background",
  "foreground",
  "card",
  "primary",
  "secondary",
  "muted",
  "muted-foreground",
  "accent",
  "destructive",
  "success",
  "warning",
  "info",
  "border",
  "navy",
  "gold",
  "surface-1",
  "surface-2",
  "surface-3",
];
const MODULOS = [
  "central",
  "prospeccao",
  "visita",
  "carteira",
  "followup",
  "projetos",
  "financeiro",
  "bi",
  "config",
  "sdr",
];
const RAIOS = ["sm", "md", "lg", "xl", "2xl", "full"];
const SOMBRAS = ["elev-1", "elev-2", "elev-3", "elev-4", "glow-gold"];

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Amostra({ nome, cssVar }: { nome: string; cssVar: string }) {
  return (
    <div className="space-y-1.5">
      <div className="h-14 rounded-lg border" style={{ background: `var(${cssVar})` }} />
      <p className="text-xs font-medium">{nome}</p>
    </div>
  );
}

function DesignSystemPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Design System"
        description="Tokens e componentes como estão hoje. Referência para as próximas fases."
      />
      <Secao titulo="Cores do tema">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {CORES.map((c) => (
            <Amostra key={c} nome={c} cssVar={`--${c}`} />
          ))}
        </div>
      </Secao>
      <Secao titulo="Cores dos módulos">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {MODULOS.map((m) => (
            <Amostra key={m} nome={m} cssVar={`--modulo-${m}`} />
          ))}
        </div>
      </Secao>
      <Secao titulo="Tipografia">
        <p className="font-display text-2xl font-semibold">Sora — títulos</p>
        <p className="text-base">Manrope — corpo de texto</p>
        <p className="text-sm text-muted-foreground">Secundário 14px</p>
        <p className="text-xs text-muted-foreground">Legenda 12px</p>
        <p className="tabular-nums">R$ 1.234.567,89 · 02:45</p>
      </Secao>
      <Secao titulo="Raios">
        <div className="flex flex-wrap gap-4">
          {RAIOS.map((r) => (
            <div key={r} className="text-center text-xs">
              <div
                className="mb-1.5 h-14 w-14 border bg-muted"
                style={{ borderRadius: r === "full" ? 9999 : `var(--radius-${r})` }}
              />
              {r}
            </div>
          ))}
        </div>
      </Secao>
      <Secao titulo="Sombras">
        <div className="flex flex-wrap gap-6">
          {SOMBRAS.map((s) => (
            <div key={s} className="text-center text-xs">
              <div
                className="mb-2 h-16 w-24 rounded-lg bg-card"
                style={{ boxShadow: `var(--${s})` }}
              />
              {s}
            </div>
          ))}
        </div>
      </Secao>
      <Secao titulo="Botões">
        <div className="flex flex-wrap gap-2">
          <Button>Principal</Button>
          <Button variant="outline">Contorno</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="destructive">Perigo</Button>
          <Button variant="link">Link</Button>
        </div>
      </Secao>
      <Secao titulo="Selos">
        <div className="flex flex-wrap gap-2">
          <Badge>Padrão</Badge>
          <Badge variant="secondary">Secundário</Badge>
          <Badge variant="outline">Contorno</Badge>
          <Badge variant="destructive">Perigo</Badge>
          <StatusBadge intent="success">Sucesso</StatusBadge>
          <StatusBadge intent="warning">Alerta</StatusBadge>
          <StatusBadge intent="danger">Crítico</StatusBadge>
          <StatusBadge intent="info">Info</StatusBadge>
        </div>
      </Secao>
      <Secao titulo="Card, campo e carregamento">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card padrão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Campo de texto" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        </div>
      </Secao>
    </div>
  );
}

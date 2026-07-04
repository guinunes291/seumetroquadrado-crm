import { Link } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Table2, MessageCircle, MapPin, ExternalLink, Building2 } from "lucide-react";
import type { ProjetoRow } from "@/components/projeto-card";
import {
  formatBRL,
  formatM2Range,
  formatDormsRange,
  formatVagasRange,
  formatEntrega,
} from "@/lib/projetos";
import { deriveSituacao } from "@/lib/vitrine/vitrine";
import { cn } from "@/lib/utils";

export type VitrineLead = {
  id: string;
  nome: string;
  telefone: string;
  projeto_nome?: string | null;
};

type Props = {
  projeto: ProjetoRow | null;
  lead: VitrineLead | null;
  onOpenChange: (open: boolean) => void;
  /** Dispara o envio no WhatsApp. Com lead em contexto o pai envia e registra
   *  direto; sem lead, o pai abre o seletor de lead. */
  onEnviar: (projeto: ProjetoRow) => void;
};

const precoLabel = (p: ProjetoRow): string =>
  p.sob_consulta ? "Sob consulta" : p.preco_a_partir != null ? formatBRL(p.preco_a_partir) : "Sob consulta";

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="mt-0.5 text-sm font-semibold">{v}</div>
    </div>
  );
}

export function VitrinePanel({ projeto: p, lead, onOpenChange, onEnviar }: Props) {
  const zona = p?.zona_smq?.trim() || null;
  const diferenciais = p ? [...(p.diferenciais ?? []), ...(p.argumentos_venda ?? [])] : [];
  // Só mostramos a linha de endereço quando há logradouro — bairro e zona já
  // aparecem no cabeçalho, então sem rua não há o que acrescentar.
  const endereco = p?.logradouro
    ? `${[p.logradouro, p.numero].filter(Boolean).join(", ")}` +
      (p.bairro ? ` — ${p.bairro}` : "") +
      (zona ? `, Zona ${zona}` : "")
    : "";
  const primeiroNome = lead?.nome?.split(" ")[0];

  return (
    <Sheet open={!!p} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        {p && (
          <>
            <SheetHeader className="space-y-2 border-b bg-primary/5 px-5 py-4 text-left">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {[zona ? `Zona ${zona}` : null, p.bairro].filter(Boolean).join(" · ") || "Localização a confirmar"}
              </div>
              <SheetTitle className="text-xl leading-tight">{p.nome}</SheetTitle>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {p.construtora && <span>por <b className="text-foreground">{p.construtora}</b></span>}
                <Badge variant="secondary">{deriveSituacao(p)}</Badge>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-auto px-5 py-4">
              <div className="rounded-lg border border-l-4 border-l-amber-400 bg-muted/40 p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Preço a partir de
                </div>
                <div className="mt-0.5 text-2xl font-extrabold tabular-nums">{precoLabel(p)}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Valor da tabela vigente da construtora
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Spec k="Dormitórios" v={formatDormsRange(p.dorms_min, p.dorms_max) ?? "—"} />
                <Spec k="Metragem" v={formatM2Range(p.metragem_min, p.metragem_max) ?? "—"} />
                <Spec
                  k="Vagas"
                  v={formatVagasRange(p.vagas_min, p.vagas_max, p.vagas_observacao) ?? "—"}
                />
                <Spec
                  k="Entrega"
                  v={formatEntrega(p.status_entrega, p.mes_entrega, p.ano_entrega) ?? deriveSituacao(p)}
                />
              </div>

              {endereco && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{endereco}</span>
                </div>
              )}

              {(p.perfil_ideal || p.observacoes) && (
                <div>
                  <SectionTitle>Sobre o empreendimento</SectionTitle>
                  <p className="text-sm leading-relaxed text-foreground/80">
                    {p.perfil_ideal || p.observacoes}
                  </p>
                </div>
              )}

              {diferenciais.length > 0 && (
                <div>
                  <SectionTitle>Diferenciais</SectionTitle>
                  <div className="flex flex-wrap gap-1.5">
                    {diferenciais.map((d, i) => (
                      <span
                        key={`${d}-${i}`}
                        className="rounded-md border bg-accent/40 px-2.5 py-1 text-xs"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <Link
                to="/projetos/$projetoId"
                params={{ projetoId: p.id }}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Building2 className="h-4 w-4" /> Ver ficha completa
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            <div className="space-y-2 border-t p-4">
              <div className="grid grid-cols-2 gap-2">
                <MaterialButton
                  icon={BookOpen}
                  label="Book"
                  hint="PDF do empreendimento"
                  url={p.book_url}
                />
                <MaterialButton
                  icon={Table2}
                  label="Tabela"
                  hint="Preços atualizados"
                  url={p.tabela_precos_url}
                />
              </div>
              <Button className="w-full gap-2" onClick={() => onEnviar(p)}>
                <MessageCircle className="h-4 w-4" />
                {primeiroNome ? `Enviar pro ${primeiroNome} (WhatsApp)` : "Enviar pro cliente (WhatsApp)"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      <span className="h-0.5 w-3.5 rounded bg-amber-400" />
      {children}
    </div>
  );
}

function MaterialButton({
  icon: Icon,
  label,
  hint,
  url,
}: {
  icon: typeof BookOpen;
  label: string;
  hint: string;
  url: string | null | undefined;
}) {
  const disabled = !url;
  return (
    <a
      href={url || undefined}
      target={url ? "_blank" : undefined}
      rel="noopener noreferrer"
      aria-disabled={disabled}
      onClick={(e) => {
        if (disabled) e.preventDefault();
      }}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:border-primary/40 hover:bg-accent",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className="text-[11px] text-muted-foreground">{url ? hint : "Sem link cadastrado"}</span>
    </a>
  );
}

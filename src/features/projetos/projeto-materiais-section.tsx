// Materiais de venda na ficha do empreendimento — a coluna que o corretor
// mais usa: book, tabela, plantas, vídeo, tour, memorial, artes, agrupados
// por tipo, cada um com "Abrir" (registra o gesto) e "Copiar link". Sem
// decisão de negócio aqui: recebe a lista já fundida por lib/projeto-materiais
// e devolve os gestos ao pai.

import { useMemo } from "react";
import { toast } from "sonner";
import {
  ArrowSquareOut,
  Blueprint,
  BookOpen,
  Copy,
  Cube,
  FileText,
  FolderOpen,
  GearSix,
  LinkSimple,
  PaintBrush,
  Presentation,
  Table,
  VideoCamera,
  WhatsappLogo,
  type Icon as IconComponent,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  agruparMateriais,
  hostLegivel,
  textoMateriaisParaWhatsApp,
  type MaterialProjeto,
  type ProjetoMaterialTipo,
} from "@/lib/projeto-materiais";
import { cn } from "@/lib/utils";

export const ICONE_MATERIAL: Record<ProjetoMaterialTipo, IconComponent> = {
  book: BookOpen,
  tabela: Table,
  planta: Blueprint,
  video: VideoCamera,
  tour: Cube,
  memorial: FileText,
  apresentacao: Presentation,
  arte: PaintBrush,
  outro: LinkSimple,
};

export type ProjetoMateriaisSectionProps = {
  nomeProjeto: string;
  materiais: readonly MaterialProjeto[];
  loading?: boolean;
  /** Gestão de materiais liberada (papel + migration aplicada). */
  podeGerir: boolean;
  /** Papel poderia gerir, mas a tabela ainda não existe neste banco. */
  gestaoIndisponivel?: boolean;
  onAbrir: (material: MaterialProjeto) => void;
  onGerir?: () => void;
  className?: string;
};

async function copiar(texto: string, ok: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(ok);
  } catch {
    toast.error("Não foi possível copiar.");
  }
}

export function ProjetoMateriaisSection({
  nomeProjeto,
  materiais,
  loading,
  podeGerir,
  gestaoIndisponivel,
  onAbrir,
  onGerir,
  className,
}: ProjetoMateriaisSectionProps) {
  const grupos = useMemo(() => agruparMateriais(materiais), [materiais]);

  const acaoGerir = podeGerir ? (
    <Button size="sm" variant="outline" onClick={onGerir}>
      <GearSix className="mr-1 h-4 w-4" /> Gerir
    </Button>
  ) : gestaoIndisponivel ? (
    <span
      className="text-xs text-muted-foreground"
      title="Aplique a migration 20260913190000_portal_projeto_materiais no Supabase para cadastrar plantas, vídeos e outros materiais."
    >
      Gestão indisponível
    </span>
  ) : null;

  return (
    <section aria-label="Materiais de venda" className={className}>
      <SectionHeader eyebrow="Munição" title="Materiais de venda" action={acaoGerir} />
      <div className="rounded-xl border border-border-subtle bg-card shadow-elev-1">
        {loading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : grupos.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="Nenhum material cadastrado ainda."
            description={
              podeGerir
                ? "Cadastre book, tabela, plantas, vídeo e tour em “Gerir” — o corretor abre tudo daqui."
                : "Peça à gestão o book e a tabela deste empreendimento."
            }
            action={
              podeGerir ? (
                <Button size="sm" onClick={onGerir}>
                  Adicionar materiais
                </Button>
              ) : undefined
            }
            className="border-0"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {grupos.map((grupo) => {
              const Icone = ICONE_MATERIAL[grupo.tipo];
              return (
                <li key={grupo.tipo} className="px-4 py-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Icone className="h-4 w-4" aria-hidden="true" />
                    {grupo.itens.length === 1
                      ? grupo.rotulo
                      : `${grupo.plural} (${grupo.itens.length})`}
                  </div>
                  <ul className="space-y-1.5">
                    {grupo.itens.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center gap-2 rounded-lg border border-border-subtle bg-background/60 py-1.5 pl-3 pr-1"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{m.titulo}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {hostLegivel(m.url)}
                            {m.descricao ? ` · ${m.descricao}` : ""}
                          </div>
                        </div>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="press-scale h-9 shrink-0"
                        >
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => onAbrir(m)}
                            aria-label={`Abrir ${m.titulo}`}
                          >
                            <ArrowSquareOut className="mr-1 h-4 w-4" /> Abrir
                          </a>
                        </Button>
                        <IconButton
                          variant="ghost"
                          label={`Copiar link de ${m.titulo}`}
                          icon={<Copy className="h-4 w-4" />}
                          className={cn("h-9 min-h-9 w-9 min-w-9 shrink-0")}
                          onClick={() =>
                            void copiar(m.url, "Link copiado — cole no WhatsApp do cliente.")
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}

        {grupos.length > 0 && (
          <div className="border-t border-border-subtle px-4 py-3">
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() =>
                void copiar(
                  textoMateriaisParaWhatsApp(nomeProjeto, materiais),
                  "Pacote de materiais copiado — cole no WhatsApp do cliente.",
                )
              }
            >
              <WhatsappLogo className="mr-1 h-4 w-4" /> Copiar todos os links para o WhatsApp
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

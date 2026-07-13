// Hero da ficha do empreendimento — a capa da "munição comercial" do corretor:
// imagem de capa sob véu navy (fallback: gradiente Comando), nome em Sora,
// chips de contexto e preço "a partir de" em dourado. O fio de luz
// (beam-border) acende SOMENTE quando o projeto está em foco — é o único hero
// desta tela.

import { toast } from "sonner";
import { CalendarClock, Copy, ExternalLink, MapPin, Star, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { montarMensagemVenda } from "@/components/projeto-comercial";
import { formatBRL } from "@/lib/unidades";
import { formatEntrega } from "@/lib/projetos";
import { cn } from "@/lib/utils";

/** Subconjunto da projeção PROJETO_CRM_SELECT usado pelo hero. */
export type ProjetoHeroData = {
  nome: string;
  construtora: string | null;
  bairro: string | null;
  regiao: string | null;
  cidade: string | null;
  zona_smq: string | null;
  status_entrega: string | null;
  mes_entrega: number | null;
  ano_entrega: number | null;
  renda_minima: number | null;
  preco_a_partir: number | null;
  sob_consulta: boolean;
  capa_url: string | null;
  book_url: string | null;
  tabela_precos_url: string | null;
  perfil_ideal: string | null;
  diferenciais: string[];
  argumentos_venda: string[];
};

const GLASS_BTN = "border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white";

function HeroChip({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
      <Icon className="h-3.5 w-3.5 text-gold-300" aria-hidden="true" />
      {children}
    </span>
  );
}

export function ProjetoHero({
  projeto,
  emFoco,
  focoMotivo,
  actions,
}: {
  projeto: ProjetoHeroData;
  /** Projeto com campanha "em foco" ativa — liga o beam-border. */
  emFoco?: boolean;
  focoMotivo?: string | null;
  /** Slot no topo direito (ex.: voltar para /projetos). */
  actions?: React.ReactNode;
}) {
  const localizacao = [projeto.bairro, projeto.regiao, projeto.cidade].filter(Boolean).join(" · ");
  const entrega = formatEntrega(projeto.status_entrega, projeto.mes_entrega, projeto.ano_entrega);
  // Mesma condição do botão "Copiar mensagem de venda" da aba Comercial.
  const temMunicao =
    projeto.renda_minima != null ||
    !!projeto.perfil_ideal ||
    projeto.diferenciais.length > 0 ||
    projeto.argumentos_venda.length > 0;

  return (
    <section
      aria-label={`Resumo do empreendimento ${projeto.nome}`}
      className={cn(
        "relative overflow-hidden rounded-xl bg-gradient-command text-white shadow-elev-2",
        emFoco && "beam-border",
      )}
    >
      {projeto.capa_url ? (
        <>
          <img
            src={projeto.capa_url}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-navy-950/65 to-navy-900/35"
          />
        </>
      ) : (
        // Luz ambiente dourada estática — mesma assinatura do shell.
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(720px 420px at 78% -8%, oklch(0.77 0.11 85 / 0.12), transparent 65%)",
          }}
        />
      )}

      <div className="relative flex min-h-[200px] flex-col justify-between gap-5 p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            {emFoco && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-500/15 px-2.5 py-1 text-xs font-medium text-gold-200">
                <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" aria-hidden="true" />
                Projeto em foco
                {focoMotivo ? ` — ${focoMotivo}` : ""}
              </span>
            )}
            <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
              {projeto.nome}
            </h1>
            {projeto.construtora && <p className="text-sm text-white/75">{projeto.construtora}</p>}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {localizacao && <HeroChip icon={MapPin}>{localizacao}</HeroChip>}
              {projeto.zona_smq && <HeroChip icon={MapPin}>Zona {projeto.zona_smq}</HeroChip>}
              {entrega && <HeroChip icon={CalendarClock}>{entrega}</HeroChip>}
              {projeto.renda_minima != null && (
                <HeroChip icon={Wallet}>
                  Renda a partir de {formatBRL(projeto.renda_minima)}
                </HeroChip>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-white/70">
              {projeto.sob_consulta ? "Preço" : "A partir de"}
            </div>
            <div className="font-display mt-0.5 text-3xl font-semibold tracking-tight text-gold-300 tabular-nums">
              {projeto.sob_consulta ? (
                "Sob consulta"
              ) : projeto.preco_a_partir != null ? (
                <AnimatedNumber value={projeto.preco_a_partir} format={formatBRL} />
              ) : (
                "—"
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {temMunicao && (
              <Button
                size="sm"
                className="bg-gradient-gold text-navy-900 press-scale hover:opacity-90"
                title="Copia uma mensagem de venda pronta (nome, preço, diferenciais e argumento) para colar no WhatsApp"
                onClick={() => {
                  navigator.clipboard.writeText(montarMensagemVenda(projeto));
                  toast.success("Mensagem de venda copiada — cole no WhatsApp e personalize.");
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" /> Copiar mensagem de venda
              </Button>
            )}
            {projeto.book_url && (
              <Button size="sm" variant="outline" className={GLASS_BTN} asChild>
                <a href={projeto.book_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Book
                </a>
              </Button>
            )}
            {projeto.tabela_precos_url && (
              <Button size="sm" variant="outline" className={GLASS_BTN} asChild>
                <a href={projeto.tabela_precos_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Tabela de preços
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

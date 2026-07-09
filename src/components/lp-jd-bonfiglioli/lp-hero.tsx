import { BadgePercent, Calculator, CheckCircle2, Ruler, Sparkles, TrainFront } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppCta } from "@/components/lp-jd-bonfiglioli/lp-whatsapp-cta";
import { formatBRL, LP_CONFIG, menorPreco, scrollToLpId } from "@/lib/lp-jd-bonfiglioli";

const PROVAS = [
  { icon: TrainFront, texto: "Próximo à Estação Vila Sônia" },
  { icon: Ruler, texto: "2 dorms · 32 a 42 m²" },
  { icon: BadgePercent, texto: "Cheque Bônus de R$ 2.000" },
];

/** Primeira dobra: headline, provas rápidas, âncora de preço e CTAs. */
export function LpHero() {
  return (
    <header className="relative isolate overflow-hidden bg-navy text-white">
      {/* Camadas de profundidade: glow, orbes gold e grade de planta baixa */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(90%_60%_at_50%_-20%,oklch(0.34_0.08_255),transparent)]"
      />
      <div
        aria-hidden
        className="absolute -right-32 top-24 -z-10 size-[28rem] rounded-full bg-gold/15 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -left-40 bottom-0 -z-10 size-[24rem] rounded-full bg-gold/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,oklch(1_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(75%_65%_at_50%_35%,black,transparent)]"
      />

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 md:pb-24 md:pt-10">
        {/* Barra de marca */}
        <div className="flex items-center justify-between gap-4 animate-in fade-in-0 duration-700">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-gold text-lg font-bold text-navy">
              m²
            </div>
            <div className="leading-tight">
              <p className="font-semibold">Seu Metro Quadrado</p>
              <p className="text-xs text-white/60">Atendimento oficial do lançamento</p>
            </div>
          </div>
          <p className="hidden text-sm text-white/60 sm:block">
            Construtora <span className="font-semibold text-white">Vibra</span>
          </p>
        </div>

        <div className="mt-12 grid items-center gap-10 md:mt-16 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Coluna de mensagem */}
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-sm font-medium text-gold animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
              <Sparkles className="size-4" />
              Lançamento em {LP_CONFIG.lancamento} · Jardim Bonfiglioli, Zona Oeste
            </span>

            <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl animate-in fade-in-0 slide-in-from-bottom-4 fill-mode-both duration-700 delay-150">
              Seu primeiro apê perto do Metrô Vila Sônia,{" "}
              <span className="text-gold">pelo menor preço da Zona Oeste*</span>
            </h1>

            <p className="mt-6 max-w-xl text-pretty text-lg text-white/70 animate-in fade-in-0 slide-in-from-bottom-4 fill-mode-both duration-700 delay-300">
              Lançamento da Vibra no Jardim Bonfiglioli: 2 dormitórios de 32 a 42 m² a partir de{" "}
              <strong className="font-semibold text-white">{formatBRL(menorPreco())}</strong>, com
              lazer completo — para quem quer trocar o aluguel por um endereço que é seu.
            </p>

            <ul className="mt-8 flex flex-wrap gap-2 animate-in fade-in-0 slide-in-from-bottom-4 fill-mode-both duration-700 delay-500">
              {PROVAS.map(({ icon: Icon, texto }) => (
                <li
                  key={texto}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/90"
                >
                  <Icon className="size-4 text-gold" />
                  {texto}
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row animate-in fade-in-0 slide-in-from-bottom-4 fill-mode-both duration-700 delay-700">
              <Button
                type="button"
                size="lg"
                className="h-13 bg-gold px-8 text-base font-semibold text-navy shadow-lg shadow-gold/20 hover:bg-gold/90"
                onClick={() => scrollToLpId("simular")}
              >
                <Calculator />
                Ver se minha renda aprova
              </Button>
              <WhatsAppCta
                size="lg"
                className="h-13 border-white/25 bg-white/5 px-8 text-base text-white hover:bg-white/10 hover:text-white"
              />
            </div>
          </div>

          {/* Card âncora de preço */}
          <aside className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-6 fill-mode-both duration-700 delay-500">
            <p className="text-sm font-medium uppercase tracking-widest text-white/60">
              Tabela do lançamento
            </p>
            <p className="mt-4 text-sm text-white/70">2 dormitórios · 32 a 42 m²</p>
            <p className="mt-1 text-sm text-white/70">A partir de</p>
            <p className="text-4xl font-bold tracking-tight text-gold">{formatBRL(menorPreco())}</p>
            <ul className="mt-5 space-y-2.5 border-t border-white/10 pt-5 text-sm text-white/85">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-gold" />
                Cheque Bônus de {formatBRL(LP_CONFIG.chequeBonus)} para usar na negociação
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-gold" />
                Planta de 41 m² inédita e exclusiva
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-gold" />
                Simulação gratuita com especialista
              </li>
            </ul>
            <Button
              type="button"
              variant="link"
              className="mt-4 h-auto p-0 text-gold underline-offset-4"
              onClick={() => scrollToLpId("plantas")}
            >
              Conferir todas as plantas e valores →
            </Button>
          </aside>
        </div>

        <p className="mt-10 max-w-2xl text-xs leading-relaxed text-white/50">
          *Menor preço da Zona Oeste: condição comercial do lançamento. Valores, condições e
          disponibilidade sujeitos à alteração sem aviso prévio.
        </p>
      </div>
    </header>
  );
}

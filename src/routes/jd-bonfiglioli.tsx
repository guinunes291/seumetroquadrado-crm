import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { LpAluguel } from "@/components/lp-jd-bonfiglioli/lp-aluguel";
import { LpBeneficios } from "@/components/lp-jd-bonfiglioli/lp-beneficios";
import { LpCondicoes } from "@/components/lp-jd-bonfiglioli/lp-condicoes";
import { LpConfianca } from "@/components/lp-jd-bonfiglioli/lp-confianca";
import { LpFaq } from "@/components/lp-jd-bonfiglioli/lp-faq";
import { LpForm } from "@/components/lp-jd-bonfiglioli/lp-form";
import { LpHero } from "@/components/lp-jd-bonfiglioli/lp-hero";
import { LpLazer } from "@/components/lp-jd-bonfiglioli/lp-lazer";
import { LpLocalizacao } from "@/components/lp-jd-bonfiglioli/lp-localizacao";
import { LpPlantas } from "@/components/lp-jd-bonfiglioli/lp-plantas";
import { LpPerfis } from "@/components/lp-jd-bonfiglioli/lp-perfis";
import { LpSimulador } from "@/components/lp-jd-bonfiglioli/lp-simulador";
import { LpStickyCta } from "@/components/lp-jd-bonfiglioli/lp-sticky-cta";
import {
  DISCLAIMER_VALORES,
  extractMarketing,
  scrollToLpId,
  type MarketingParams,
  type SimulacaoLead,
} from "@/lib/lp-jd-bonfiglioli";

const LP_TITLE = "Vibra Jardim Bonfiglioli — 2 dorms a partir de R$ 237.900 | Seu Metro Quadrado";
const LP_DESCRIPTION =
  "Lançamento Vibra no Jardim Bonfiglioli, Zona Oeste: 2 dormitórios de 32 a 42 m², próximo à Estação Vila Sônia (Linha 4-Amarela), com Cheque Bônus de R$ 2.000. Simule sua aprovação grátis.";
// Imagem provisória (logo SMQ) até o render oficial — sobrescreve o og:image
// do CRM definido no __root, que não pode vazar em compartilhamentos.
const LP_OG_IMAGE = "/icons/icon-512.png";

export const Route = createFileRoute("/jd-bonfiglioli")({
  head: () => ({
    meta: [
      { title: LP_TITLE },
      { name: "description", content: LP_DESCRIPTION },
      { property: "og:title", content: LP_TITLE },
      { property: "og:description", content: LP_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:image", content: LP_OG_IMAGE },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: LP_TITLE },
      { name: "twitter:description", content: LP_DESCRIPTION },
      { name: "twitter:image", content: LP_OG_IMAGE },
    ],
  }),
  component: LpJdBonfiglioli,
});

const MK_STORAGE_KEY = "lp_jdb_marketing";

function LpJdBonfiglioli() {
  const [selectedPlanta, setSelectedPlanta] = useState<string | null>(null);
  const [simulacao, setSimulacao] = useState<SimulacaoLead | null>(null);
  const [marketing, setMarketing] = useState<MarketingParams | null>(null);
  const [aluguel, setAluguel] = useState<number | null>(null);

  // Captura UTMs/click ids na chegada e preserva em sessionStorage para o
  // caso de a URL ser limpa antes do envio do formulário.
  useEffect(() => {
    const daUrl = extractMarketing(window.location.search);
    const temParams = Object.values(daUrl).some(Boolean);
    try {
      if (temParams) {
        sessionStorage.setItem(MK_STORAGE_KEY, JSON.stringify(daUrl));
        setMarketing(daUrl);
      } else {
        const salvo = sessionStorage.getItem(MK_STORAGE_KEY);
        setMarketing(salvo ? (JSON.parse(salvo) as MarketingParams) : daUrl);
      }
    } catch {
      setMarketing(daUrl);
    }
  }, []);

  const escolherPlanta = (plantaId: string) => {
    setSelectedPlanta(plantaId);
    scrollToLpId("form");
  };

  const garantirSimulacao = (sim: SimulacaoLead) => {
    setSimulacao(sim);
    scrollToLpId("form");
  };

  return (
    <main className="bg-background pb-20 text-foreground md:pb-0">
      <LpHero />
      <LpBeneficios />
      <LpLocalizacao />
      <LpPlantas onEscolher={escolherPlanta} />
      <LpSimulador onGarantir={garantirSimulacao} />
      <LpCondicoes />
      <LpLazer />
      <LpAluguel onAluguelChange={setAluguel} />
      <LpPerfis />
      <LpConfianca />
      <LpFaq />
      <LpForm
        selectedPlanta={selectedPlanta}
        simulacao={simulacao}
        marketing={marketing}
        aluguel={aluguel}
      />

      <footer className="bg-navy px-4 py-10 text-white/60">
        <div className="mx-auto max-w-6xl space-y-4 text-xs leading-relaxed">
          <div className="flex items-center gap-2 text-white">
            <div className="flex size-8 items-center justify-center rounded-md bg-gold text-sm font-bold text-navy">
              m²
            </div>
            <span className="font-semibold">Seu Metro Quadrado</span>
            <span className="text-white/50">· Atendimento oficial do lançamento</span>
          </div>
          <p>{DISCLAIMER_VALORES}</p>
          <p>
            Vibra Jardim Bonfiglioli — empreendimento da construtora Vibra. Imagens e informações de
            lazer, plantas e áreas comuns serão confirmadas no material oficial do lançamento.
            {/* TODO(a confirmar): incluir CRECI da Seu Metro Quadrado e razão social. */}
          </p>
        </div>
      </footer>

      <LpStickyCta />
      <Toaster richColors closeButton />
    </main>
  );
}

import type { LucideIcon } from "lucide-react";
import { Building2, FileCheck, Handshake, ShieldCheck } from "lucide-react";
import { LpSection } from "@/components/lp-jd-bonfiglioli/lp-section";

type Pilar = { icon: LucideIcon; titulo: string; texto: string };

const PILARES: Pilar[] = [
  {
    icon: FileCheck,
    titulo: "Análise de crédito guiada",
    texto: "Montamos sua simulação e organizamos a análise no banco, explicando cada etapa.",
  },
  {
    icon: ShieldCheck,
    titulo: "Documentação sem sufoco",
    texto: "Checklist claro do que você precisa e conferência dos documentos antes do envio.",
  },
  {
    icon: Handshake,
    titulo: "Do primeiro contato à assinatura",
    texto: "Um especialista acompanha sua compra até a assinatura do contrato — sem custo extra.",
  },
];

/** Prova de confiança: construtora + atendimento oficial da SMQ. */
export function LpConfianca() {
  return (
    <LpSection
      id="confianca"
      eyebrow="Compra segura"
      title="Você não faz essa compra sozinho"
      subtitle="A construção é da Vibra. O atendimento, a simulação e o acompanhamento da sua compra são da Seu Metro Quadrado, canal oficial de vendas deste lançamento."
    >
      <div className="grid gap-4 md:grid-cols-[0.9fr_2fr]">
        <div className="flex flex-col justify-center rounded-2xl border bg-navy p-6 text-white">
          <Building2 className="size-8 text-gold" />
          <h3 className="mt-4 text-xl font-bold">Vibra</h3>
          <p className="mt-1 text-sm text-white/70">Construtora responsável pelo empreendimento.</p>
          <div className="mt-6 border-t border-white/10 pt-5">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-md bg-gold text-sm font-bold text-navy">
                m²
              </div>
              <h3 className="font-semibold">Seu Metro Quadrado</h3>
            </div>
            <p className="mt-2 text-sm text-white/70">
              Atendimento oficial do lançamento — simulação gratuita e sem compromisso.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {PILARES.map(({ icon: Icon, titulo, texto }) => (
            <article key={titulo} className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex size-11 items-center justify-center rounded-xl bg-gold/15 text-navy">
                <Icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold leading-snug text-navy">{titulo}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{texto}</p>
            </article>
          ))}
        </div>
      </div>
    </LpSection>
  );
}

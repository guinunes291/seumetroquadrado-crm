import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { maskPhoneBR } from "@/lib/masks";
import { LpSection } from "@/components/lp-jd-bonfiglioli/lp-section";
import { WhatsAppCta } from "@/components/lp-jd-bonfiglioli/lp-whatsapp-cta";
import {
  buildLandingPayload,
  formatBRL,
  HORARIOS_CONTATO,
  LP_CONFIG,
  lpLeadSchema,
  menorPreco,
  PLANTAS,
  plantaLabel,
  RENDA_FAIXAS,
  type MarketingParams,
  type SimulacaoLead,
} from "@/lib/lp-jd-bonfiglioli";

const INTERESSE_INDEFINIDO = "nao-sei";

type LpFormProps = {
  selectedPlanta: string | null;
  simulacao: SimulacaoLead | null;
  marketing: MarketingParams | null;
  aluguel: number | null;
};

type FieldErrors = { nome?: string; whatsapp?: string };

/** CTA final: resumo das condições + formulário curto em 2 passos. */
export function LpForm({ selectedPlanta, simulacao, marketing, aluguel }: LpFormProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [renda, setRenda] = useState("");
  const [horario, setHorario] = useState("");
  const [interesse, setInteresse] = useState(INTERESSE_INDEFINIDO);
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  // CTA de uma planta ("Simular esta planta") pré-seleciona o interesse.
  useEffect(() => {
    if (selectedPlanta) setInteresse(selectedPlanta);
  }, [selectedPlanta]);

  const validarPasso1 = (): boolean => {
    const parsed = lpLeadSchema.safeParse({ nome, whatsapp });
    if (parsed.success) {
      setErrors({});
      return true;
    }
    const next: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0];
      if (campo === "nome" && !next.nome) next.nome = issue.message;
      if (campo === "whatsapp" && !next.whatsapp) next.whatsapp = issue.message;
    }
    setErrors(next);
    return false;
  };

  const avancar = (e: React.FormEvent) => {
    e.preventDefault();
    if (validarPasso1()) setStep(2);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarPasso1()) {
      setStep(1);
      return;
    }
    setEnviando(true);
    try {
      const sim = simulacao
        ? { ...simulacao, aluguelAtual: simulacao.aluguelAtual ?? aluguel ?? null }
        : null;
      const payload = {
        ...buildLandingPayload({
          nome,
          whatsapp,
          rendaFaixa: renda || null,
          melhorHorario: horario || null,
          interessePlanta: interesse === INTERESSE_INDEFINIDO ? null : interesse,
          marketing,
          simulacao: sim,
          pagina: window.location.pathname + window.location.search,
          referrer: document.referrer || null,
          timestampCliente: new Date().toISOString(),
        }),
        website: honeypot,
      };
      const res = await fetch("/api/public/webhooks/landing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!res.ok || !json?.ok) throw new Error("envio falhou");
      setEnviado(true);
      toast.success("Cadastro recebido!", {
        description: "Nossa equipe entra em contato no horário que você escolheu.",
      });
    } catch {
      toast.error("Não conseguimos enviar seu cadastro", {
        description: "Tente novamente em instantes — seus dados foram preservados.",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <LpSection
      id="form"
      variant="navy"
      align="center"
      eyebrow="Garanta sua condição de lançamento"
      title="Simule agora sua unidade no Vibra Jardim Bonfiglioli"
      subtitle="Deixe seus dados e receba a tabela atualizada, as condições vigentes e a sua simulação personalizada — grátis e sem compromisso."
      className="relative isolate overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(70%_50%_at_50%_110%,oklch(0.34_0.08_255),transparent)]"
      />

      {/* Resumo das condições antes do formulário */}
      <ul className="mx-auto mb-8 flex max-w-2xl flex-wrap justify-center gap-2 text-sm">
        {[
          "2 dorms · 32 a 42 m²",
          `A partir de ${formatBRL(menorPreco())}`,
          `Cheque Bônus de ${formatBRL(LP_CONFIG.chequeBonus)}`,
          `Lançamento em ${LP_CONFIG.lancamento}`,
        ].map((chip) => (
          <li
            key={chip}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-white/85"
          >
            {chip}
          </li>
        ))}
      </ul>

      <div className="mx-auto max-w-xl rounded-2xl border bg-card p-6 text-left text-card-foreground shadow-2xl md:p-8">
        {enviado ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto size-14 text-success" />
            <h3 className="mt-4 text-2xl font-bold text-navy">
              Recebemos seu cadastro, {nome.trim().split(" ")[0]}!
            </h3>
            <p className="mt-2 text-pretty text-muted-foreground">
              Um especialista da Seu Metro Quadrado vai falar com você
              {horario ? ` no período da ${horario.toLowerCase()}` : " em breve"} com a tabela
              atualizada e a sua simulação.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <WhatsAppCta
                size="default"
                className="border-navy/20 text-navy"
                fallbackLabel="Ver as plantas novamente"
              >
                Adiantar atendimento no WhatsApp
              </WhatsAppCta>
              <p className="flex items-start justify-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                Enquanto isso, visite o decorado: {LP_CONFIG.enderecoDecorado}
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={step === 1 ? avancar : enviar} noValidate>
            <p className="text-sm font-medium text-muted-foreground">
              Passo {step} de 2 · leva menos de 1 minuto
            </p>

            {step === 1 ? (
              <div className="mt-5 space-y-4">
                <div>
                  <Label htmlFor="lp-nome">Seu nome</Label>
                  <Input
                    id="lp-nome"
                    autoComplete="name"
                    placeholder="Como podemos te chamar?"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    aria-invalid={!!errors.nome}
                    className="mt-1.5 h-12 text-base"
                  />
                  {errors.nome && <p className="mt-1.5 text-sm text-destructive">{errors.nome}</p>}
                </div>
                <div>
                  <Label htmlFor="lp-whatsapp">WhatsApp (com DDD)</Label>
                  <Input
                    id="lp-whatsapp"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="(11) 98765-4321"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(maskPhoneBR(e.target.value))}
                    aria-invalid={!!errors.whatsapp}
                    className="mt-1.5 h-12 text-base"
                  />
                  {errors.whatsapp && (
                    <p className="mt-1.5 text-sm text-destructive">{errors.whatsapp}</p>
                  )}
                </div>

                {/* Honeypot anti-spam: invisível para pessoas */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  className="absolute -left-[9999px] h-0 w-0 opacity-0"
                />

                <Button
                  type="submit"
                  className="h-12 w-full bg-gold text-base font-semibold text-navy hover:bg-gold/90"
                >
                  Continuar
                  <ArrowRight />
                </Button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div>
                  <Label htmlFor="lp-renda-faixa">Renda familiar aproximada</Label>
                  <Select value={renda} onValueChange={setRenda}>
                    <SelectTrigger id="lp-renda-faixa" className="mt-1.5 h-12 w-full text-base">
                      <SelectValue placeholder="Selecione uma faixa" />
                    </SelectTrigger>
                    <SelectContent>
                      {RENDA_FAIXAS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Melhor horário para contato</Label>
                  <ToggleGroup
                    type="single"
                    value={horario}
                    onValueChange={setHorario}
                    className="mt-1.5 grid w-full grid-cols-3"
                    variant="outline"
                  >
                    {HORARIOS_CONTATO.map((h) => (
                      <ToggleGroupItem key={h} value={h} className="h-11">
                        {h}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>

                <div>
                  <Label htmlFor="lp-interesse">Planta de interesse</Label>
                  <Select value={interesse} onValueChange={setInteresse}>
                    <SelectTrigger id="lp-interesse" className="mt-1.5 h-12 w-full text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={INTERESSE_INDEFINIDO}>
                        Ainda não sei — quero orientação
                      </SelectItem>
                      {PLANTAS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {plantaLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="submit"
                  disabled={enviando}
                  className="h-12 w-full bg-gold text-base font-semibold text-navy hover:bg-gold/90"
                >
                  {enviando ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Enviando…
                    </>
                  ) : (
                    "Quero receber as condições"
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mx-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
                >
                  <ArrowLeft className="size-3.5" />
                  Voltar
                </button>
              </div>
            )}

            <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
              Seus dados são usados somente para o atendimento deste lançamento. Simulação gratuita,
              sem compromisso e sem consulta ao seu CPF nesta etapa.
            </p>
          </form>
        )}
      </div>
    </LpSection>
  );
}

// Página /manual — Manual de utilização do CRM, com capturas reais das telas.
// Identidade impressa da marca (azul-marinho, dourado, papel creme), igual ao
// PDF em public/manual/manual-crm.pdf.

import { DownloadSimple } from "@phosphor-icons/react";
import logoM2 from "@/assets/logo-m2.png.asset.json";
import { ConteudoOperacao } from "./conteudo-operacao";
import { ConteudoGestao } from "./conteudo-gestao";

const SUMARIO: { id: string; titulo: string }[] = [
  { id: "acesso", titulo: "1. Entrar no sistema" },
  { id: "mapa", titulo: "2. O mapa do sistema" },
  { id: "funil", titulo: "3. As etapas do cliente" },
  { id: "fila", titulo: "4. Fila Única, Reserva e Bolsão" },
  { id: "followup", titulo: "5. Follow-Up (13 toques)" },
  { id: "distribuicao", titulo: "6. Distribuição" },
  { id: "sdr", titulo: "7. Pré-venda (SDR)" },
  { id: "carteira", titulo: "8. Gestão de Carteira" },
  { id: "visita", titulo: "9. Modo Visita" },
  { id: "prospeccao", titulo: "10. Prospecção" },
  { id: "projetos", titulo: "11. Documentação & Projetos" },
  { id: "financeiro", titulo: "12. Assinaturas & Comissões" },
  { id: "bi", titulo: "13. Inteligência do Negócio" },
  { id: "config", titulo: "14. Configurações" },
  { id: "global", titulo: "15. Recursos do dia a dia" },
];

export function ManualPage() {
  return (
    <div className="manual-doc -mx-4 -mt-6 -mb-24 md:-mx-8 md:-mt-8">
      {/* Capa — mesma abertura do PDF da marca. */}
      <header
        className="px-6 py-12 md:px-12 md:py-16"
        style={{ background: "var(--manual-navy)", color: "var(--manual-paper)" }}
      >
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-3">
            <img src={logoM2.url} alt="Seu Metro Quadrado" className="h-12 w-auto" />
            <span className="font-display text-lg font-bold uppercase leading-tight tracking-wide">
              Seu Metro
              <br />
              Quadrado
            </span>
          </div>

          <p
            className="mt-10 text-xs font-semibold uppercase tracking-[0.22em]"
            style={{ color: "var(--manual-gold)" }}
          >
            Guia de uso
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            Manual
            <br />
            do CRM
          </h1>
          <div className="mt-6 h-px w-24" style={{ background: "var(--manual-gold)" }} />
          <p className="mt-5 max-w-md text-sm leading-relaxed opacity-85">
            Passo a passo dos módulos, ações e telas do sistema. Do primeiro acesso às rotinas do
            dia a dia.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href="/manual/manual-crm.pdf"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--manual-gold)", color: "var(--manual-navy)" }}
            >
              <DownloadSimple className="h-4 w-4" weight="bold" />
              Baixar em PDF
            </a>
            <p className="text-xs uppercase tracking-[0.18em] opacity-70">
              Corretores · Pré-vendas · Gestores · Admin
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10 md:px-12">
        {/* Sumário */}
        <nav
          className="rounded-2xl border p-5"
          style={{ borderColor: "var(--manual-line)", background: "var(--manual-paper-2)" }}
        >
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--manual-gold)" }}
          >
            Sumário
          </p>
          <ol className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {SUMARIO.map((s) => (
              <li key={s.id}>
                <a
                  className="hover:underline"
                  style={{ color: "var(--manual-navy)" }}
                  href={`#${s.id}`}
                >
                  {s.titulo}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-12">
          <ConteudoOperacao />
          <ConteudoGestao />
        </div>

        <p
          className="mt-12 border-t pt-5 text-xs"
          style={{ borderColor: "var(--manual-line)", color: "var(--manual-ink-soft)" }}
        >
          As imagens deste manual são capturas reais do CRM. Números e nomes que aparecem nelas são
          do momento da captura e mudam no dia a dia.
        </p>
      </div>
    </div>
  );
}

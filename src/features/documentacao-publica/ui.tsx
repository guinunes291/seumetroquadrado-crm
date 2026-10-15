// Peças visuais das páginas públicas do link de documentação: a moldura (logo,
// rodapé de privacidade), campos, avisos e as perguntas que montam a lista de
// documentos. Mesmo visual da página pública de agendamento.

import type { ReactNode } from "react";
import { Warning } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PERFIL_RENDA, type PerfilRenda } from "@/lib/documentacao-checklist";
import { cn } from "@/lib/utils";

export function Moldura({ subtitulo, children }: { subtitulo: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.12),_transparent_42%)] px-4 py-6 md:py-10">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl object-contain" />
          <div>
            <p className="text-sm font-semibold">Seu Metro Quadrado</p>
            <p className="text-xs text-muted-foreground">{subtitulo}</p>
          </div>
        </header>
        {children}
        <footer className="mt-10 border-t py-6 text-center text-xs text-muted-foreground">
          Seus dados e documentos ficam guardados com segurança e são usados só no seu atendimento e
          na sua análise de crédito pela Seu Metro Quadrado.
        </footer>
      </div>
    </main>
  );
}

export function Campo({
  id,
  rotulo,
  erro,
  children,
}: {
  id: string;
  rotulo: string;
  erro?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {erro && <Erro>{erro}</Erro>}
    </div>
  );
}

export function Erro({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-destructive">{children}</p>;
}

export function Alerta({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-aviso-300 bg-aviso-50 p-3 text-sm text-aviso-900"
    >
      <Warning className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </div>
  );
}

export function Aviso({
  titulo,
  texto,
  acao,
}: {
  titulo: string;
  texto: string;
  acao?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 py-12 text-center">
        <Warning className="mx-auto h-10 w-10 text-aviso-600" />
        <div>
          <h1 className="text-xl font-semibold">{titulo}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
        </div>
        {acao}
      </CardContent>
    </Card>
  );
}

export function PaginaSkeleton({ rotulo }: { rotulo: string }) {
  return (
    <div className="space-y-5" aria-label={rotulo}>
      <Skeleton className="h-36 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// As perguntas que montam a lista de documentos
// ---------------------------------------------------------------------------

export type Respostas = {
  perfil: PerfilRenda | null;
  casado: boolean | null;
  usa_fgts: boolean | null;
  declara_ir: boolean | null;
};

export const RESPOSTAS_VAZIAS: Respostas = {
  perfil: null,
  casado: null,
  usa_fgts: null,
  declara_ir: null,
};

/** Rótulo e explicação em linguagem do cliente (o CRM usa PERFIL_LABEL). */
const PERFIL_CLIENTE: Record<PerfilRenda, { titulo: string; texto: string }> = {
  clt: { titulo: "Carteira assinada", texto: "CLT, recebe holerite" },
  autonomo: { titulo: "Autônomo ou informal", texto: "Trabalha por conta, sem carteira" },
  empresario: { titulo: "Empresário", texto: "Tem empresa com CNPJ" },
  aposentado: { titulo: "Aposentado ou pensionista", texto: "Recebe benefício do INSS" },
};

const PERGUNTAS_SIM_NAO: Array<{ campo: "casado" | "usa_fgts" | "declara_ir"; texto: string }> = [
  { campo: "casado", texto: "É casado(a) ou vive em união estável?" },
  { campo: "usa_fgts", texto: "Vai usar o FGTS na compra?" },
  { campo: "declara_ir", texto: "Declara Imposto de Renda?" },
];

export function respostasCompletas(
  r: Respostas,
): r is { perfil: PerfilRenda; casado: boolean; usa_fgts: boolean; declara_ir: boolean } {
  return r.perfil !== null && r.casado !== null && r.usa_fgts !== null && r.declara_ir !== null;
}

export function PerguntasPerfil({
  valor,
  onChange,
  erro,
}: {
  valor: Respostas;
  onChange: (r: Respostas) => void;
  erro?: string;
}) {
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Como você recebe a sua renda?</legend>
        <div
          role="radiogroup"
          aria-label="Como você recebe a sua renda"
          className="grid gap-2 sm:grid-cols-2"
        >
          {PERFIL_RENDA.map((p) => {
            const ativo = valor.perfil === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => onChange({ ...valor, perfil: p })}
                className={cn(
                  "min-h-14 rounded-lg border px-3 py-2 text-left transition-colors",
                  ativo ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent",
                )}
              >
                <span className="block text-sm font-semibold">{PERFIL_CLIENTE[p].titulo}</span>
                <span className="block text-xs text-muted-foreground">
                  {PERFIL_CLIENTE[p].texto}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {PERGUNTAS_SIM_NAO.map(({ campo, texto }) => (
        <div key={campo} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{texto}</span>
          <div role="radiogroup" aria-label={texto} className="inline-flex rounded-lg border p-0.5">
            {[
              { v: true, r: "Sim" },
              { v: false, r: "Não" },
            ].map(({ v, r }) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={valor[campo] === v}
                onClick={() => onChange({ ...valor, [campo]: v })}
                className={cn(
                  "min-h-10 min-w-16 rounded-md px-3 text-sm font-medium transition-colors",
                  valor[campo] === v ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      ))}
      {erro && <Erro>{erro}</Erro>}
    </div>
  );
}

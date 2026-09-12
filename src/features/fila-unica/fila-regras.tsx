// As cinco regras da página — o rodapé do mockup aprovado, em texto. Não é
// ajuda genérica: é o contrato da Fila Única com o corretor, e fica no pé da
// página (desktop) para quem chega pela primeira vez entender por que a lista
// é uma só, por que tem teto e por que toda ação termina num desfecho.

import type { ComponentType } from "react";
import {
  ArrowsClockwise,
  CheckCircle,
  ListChecks,
  Target,
  UsersThree,
  type IconProps,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type Regra = { icon: ComponentType<IconProps>; titulo: string; texto: string };

const REGRAS_FILA: Regra[] = [
  {
    icon: ListChecks,
    titulo: "Uma lista, não seis filas",
    texto:
      "Absorve a Próxima Melhor Ação, as Missões, as seis filas de Atender, a fila do dia do Follow-Up e o Modo Foco. O corretor não escolhe a fila; a fila escolhe por ele.",
  },
  {
    icon: Target,
    titulo: "Carteira ativa limitada",
    texto:
      "Só cabem 40 leads. O resto fica na pré-venda. Sem teto, o score ordena mil leads e vira ruído. Com teto, o corretor toca todos no mesmo dia.",
  },
  {
    icon: CheckCircle,
    titulo: "Toda ação fecha com desfecho",
    texto:
      "Ligar ou WhatsApp abre “o que aconteceu?” com 3 a 5 respostas. O desfecho grava a interação, define o próximo passo com data e muda a etapa. É o que faz o relógio dizer a verdade.",
  },
  {
    icon: ArrowsClockwise,
    titulo: "A fila se esvazia sozinha",
    texto:
      "Três tentativas sem resposta devolvem o lead à pré-venda com histórico. “Perdeu” pede motivo em um toque. Nada morre em “em atendimento” para sempre.",
  },
  {
    icon: UsersThree,
    titulo: "O gestor vê a mesma fila",
    texto:
      "Agregada por corretor. Cobra fundo do funil parado e vencidos, não “quantos leads tem”. Cobrar 14 leads em análise vale mais que 900 frios.",
  },
];

export function FilaRegras({ className }: { className?: string }) {
  return (
    <section aria-label="As cinco regras da página" className={cn("space-y-3", className)}>
      <div>
        <h2 className="font-display text-base font-semibold md:text-lg">
          As cinco regras da página
        </h2>
        <p className="text-xs text-muted-foreground md:text-sm">
          Quase tudo já existe no CRM. O que muda é o fechamento do ciclo e o teto.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {REGRAS_FILA.map((r) => (
          <div
            key={r.titulo}
            data-testid="fila-regra"
            className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground shadow-elev-1 transition-transform hover:-translate-y-0.5 motion-reduce:transition-none"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-info/15 text-info">
              <r.icon className="h-4.5 w-4.5" weight="bold" aria-hidden="true" />
            </span>
            <h3 className="text-sm font-semibold">{r.titulo}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">{r.texto}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

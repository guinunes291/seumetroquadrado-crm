// Placar da Fila Única — o anel do dia (quantos leads ocupam os 65) e os três
// números que a lista responde (vencidos, vencem hoje, sem próximo passo).
// Dois desenhos, a mesma conta:
//
// - FilaCockpit: o compacto do celular (~150 px de altura), um card só.
// - FilaCartao: o card "Fila Única" do topo da Central de Comando no desktop
//   (identidade Lançamento, como no vídeo de lançamento) — título, anel
//   grande, os três números lado a lado e o "Atender agora".
//
// O anel usa a cor do módulo Central de Comando (dourado do tema).

import type { ReactNode } from "react";
import { Timer } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { CartaoPrincipal } from "@/components/ui/cartao-principal";
import { AnelNdeM, Notas, Numero } from "@/components/ui/placar";
import { LIMITE_FILA, type FilaUnica } from "@/features/fila-unica/derive";

/** A carteira ativa medida no banco (carteira_ativa_v1 + config). Quando
 *  presente, o anel para de contar candidatos recebidos e passa a mostrar a
 *  carteira de verdade — é a diferença entre "40 cards nesta tela" e "40
 *  clientes sob sua responsabilidade". Ausente (banco antigo, sem a migration
 *  da Fatia 3), o anel volta a contar o que a fila carregou. */
export type CarteiraNoCockpit = {
  ocupadas: number;
  teto: number;
  estourou: boolean;
  /** Rótulo da carteira (default "carteira ativa"). */
  rotulo?: string;
  /** Regra dos 65 (Fatia 2): o anel é o status Em atendimento, X/65. */
  fonte?: "carteira" | "em_atendimento";
};

/** Com a carteira ativa disponível, o anel é ela. Estourado, o anel enche e o
 *  excedente vira texto — nunca uma fração maior que 1, que leria como erro. */
function ocupacao(fila: FilaUnica, carteira: CarteiraNoCockpit | null | undefined) {
  const teto = carteira?.teto ?? LIMITE_FILA;
  const noDia = carteira ? Math.min(carteira.ocupadas, teto) : Math.min(fila.total, LIMITE_FILA);
  const excedente = carteira ? Math.max(0, carteira.ocupadas - teto) : fila.total - noDia;
  return { teto, noDia, excedente };
}

/** SLA correndo, excedente acima do teto e o que ficou nas filas de Atender. */
function NotasDaFila({
  fila,
  carteira,
  excedente,
  teto,
  className,
}: {
  fila: FilaUnica;
  carteira: CarteiraNoCockpit | null | undefined;
  excedente: number;
  teto: number;
  className?: string;
}) {
  const r = fila.resumo;
  if (r.slaCorrendo <= 0 && excedente <= 0 && r.ocultosInbox <= 0) return null;
  return (
    <Notas className={className}>
      {r.slaCorrendo > 0 && (
        <span className="inline-flex items-center gap-1">
          <Timer className="h-3.5 w-3.5 text-warning" />
          {r.slaCorrendo} no SLA do 1º contato
        </span>
      )}
      {excedente > 0 &&
        (carteira?.fonte === "em_atendimento" ? (
          // Acima dos 65 só quem já estava assim antes da regra: a trava
          // não deixa entrar mais ninguém, e cada desfecho abre uma vaga.
          <span className="text-warning">
            +{excedente} acima dos {teto} — saia por desfecho até caber
          </span>
        ) : carteira?.estourou ? (
          // Estourar o teto só acontece pelo fundo do funil, que nunca é
          // devolvido. Dizer "entram conforme saem" aqui seria mentira: o
          // que está travado é a ENTRADA, não a carteira.
          <span className="text-warning">
            +{excedente} acima do teto — você não recebe lead novo até desovar
          </span>
        ) : (
          <span>+{excedente} entram conforme estes saem</span>
        ))}
      {r.ocultosInbox > 0 && <span>+{r.ocultosInbox} nas filas de Atender</span>}
    </Notas>
  );
}

/** O placar compacto do celular. */
export function FilaCockpit({
  fila,
  carteira,
  className,
}: {
  fila: FilaUnica;
  carteira?: CarteiraNoCockpit | null;
  className?: string;
}) {
  const r = fila.resumo;
  const { teto, noDia, excedente } = ocupacao(fila, carteira);
  return (
    <section
      aria-label="Placar do dia"
      className={cn(
        "rounded-2xl border border-border-subtle bg-card p-3 text-card-foreground shadow-elev-1",
        className,
      )}
    >
      <div className="grid grid-cols-[72px_1fr] items-center gap-3">
        <AnelNdeM valor={noDia} teto={teto} />
        <div className="grid grid-cols-3 gap-1.5">
          <Numero valor={r.vencidos} rotulo="vencidos" cor="text-destructive" />
          <Numero valor={r.hoje} rotulo="vencem hoje" cor="text-warning" />
          <Numero valor={r.semProximoPasso} rotulo="sem próximo passo" cor="text-destructive" />
        </div>
      </div>
      <NotasDaFila
        fila={fila}
        carteira={carteira}
        excedente={excedente}
        teto={teto}
        className="mt-2 text-[11px]"
      />
    </section>
  );
}

/** O card "Fila Única" do topo da Central de Comando (desktop). */
export function FilaCartao({
  fila,
  carteira,
  dia,
  acao,
  rodape,
  className,
}: {
  fila: FilaUnica;
  carteira?: CarteiraNoCockpit | null;
  /** "Sexta-feira" — o dia da fila, no subtítulo. */
  dia: string;
  /** O botão que leva à lista ("Atender agora"). */
  acao: ReactNode;
  /** Linha extra no rodapé (o dinheiro em jogo na fila). */
  rodape?: ReactNode;
  className?: string;
}) {
  const r = fila.resumo;
  const { teto, noDia, excedente } = ocupacao(fila, carteira);
  return (
    <CartaoPrincipal
      aria-label="Fila Única — placar do dia"
      titulo="Fila Única"
      subtitulo={`${dia} · ${carteira?.rotulo ?? "sua carteira ativa"}`}
      destaque={<AnelNdeM valor={noDia} teto={teto} tamanho={172} traco={12} cartao />}
      numeros={
        // Os três números do vídeo: vencidos em vermelho, os de hoje em âmbar,
        // sem próximo passo em navy — a cor só acende quando há o que cobrar.
        <div className="grid grid-cols-3 gap-2">
          <Numero valor={r.vencidos} rotulo="vencidos" cor="text-destructive" cartao />
          <Numero valor={r.hoje} rotulo="vencem hoje" cor="text-warning" cartao />
          <Numero
            valor={r.semProximoPasso}
            rotulo="sem próximo passo"
            cor="text-foreground"
            cartao
          />
        </div>
      }
      notas={
        <NotasDaFila
          fila={fila}
          carteira={carteira}
          excedente={excedente}
          teto={teto}
          className="mt-3 text-xs"
        />
      }
      acao={acao}
      rodape={rodape}
      className={className}
    />
  );
}

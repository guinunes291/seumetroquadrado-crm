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

import { useEffect, useState, type ReactNode } from "react";
import { Timer } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { LIMITE_FILA, type FilaUnica } from "@/features/fila-unica/derive";

/** Anel "N de 65": desenha do zero até o valor no primeiro paint (draw-in do
 *  SMQ Motion); com motion-reduce o valor aparece direto. */
function AnelDoDia({
  valor,
  teto,
  tamanho = 72,
  traco = 6,
  cartao = false,
}: {
  valor: number;
  teto: number;
  tamanho?: number;
  traco?: number;
  /** O anel do card do desktop: número grande e "de 65" embaixo. */
  cartao?: boolean;
}) {
  const [desenhado, setDesenhado] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDesenhado(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const r = (tamanho - traco) / 2;
  const c = 2 * Math.PI * r;
  const fracao = teto > 0 ? Math.min(1, valor / teto) : 0;
  const cheio = (desenhado ? fracao : 0) * c;
  return (
    <span
      role="img"
      aria-label={`${valor} de ${teto} leads no dia`}
      className="relative inline-flex shrink-0 text-modulo-central"
      style={{ width: tamanho, height: tamanho }}
    >
      <svg
        width={tamanho}
        height={tamanho}
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        className="-rotate-90"
      >
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          fill="none"
          strokeWidth={traco}
          className="stroke-muted"
        />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          fill="none"
          strokeWidth={traco}
          strokeLinecap="round"
          strokeDasharray={`${cheio} ${c - cheio}`}
          className={cn(
            "stroke-current transition-[stroke-dasharray] duration-1000 ease-out motion-reduce:transition-none",
            !cartao && "drop-shadow-[0_0_8px_var(--color-modulo-central)]",
          )}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none text-foreground">
        {cartao ? (
          <>
            <span className="font-display text-5xl font-bold tracking-tight tabular-nums">
              {valor}
            </span>
            <span className="mt-1.5 text-sm text-muted-foreground">de {teto}</span>
          </>
        ) : (
          <>
            <span className="font-display text-lg font-semibold tabular-nums">{valor}</span>
            <span className="mt-0.5 text-[9.5px] font-medium text-muted-foreground">de {teto}</span>
          </>
        )}
      </span>
    </span>
  );
}

function Numero({
  valor,
  rotulo,
  cor,
  cartao = false,
}: {
  valor: number;
  rotulo: string;
  /** Cor do número quando há o que cobrar; zerado ele fica neutro. */
  cor: string;
  cartao?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border-subtle",
        cartao ? "min-h-[92px] bg-card px-3 py-3" : "bg-muted/40 px-2 py-1.5",
      )}
    >
      <div
        className={cn(
          "font-display font-semibold leading-none tabular-nums",
          cartao ? "text-[28px] font-bold tracking-tight" : "text-lg",
          valor > 0 ? cor : "text-foreground",
        )}
      >
        {valor}
      </div>
      <div
        className={cn(
          "mt-1 leading-tight text-muted-foreground",
          cartao ? "mt-2 text-xs" : "text-[10px]",
        )}
      >
        {rotulo}
      </div>
    </div>
  );
}

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
function Notas({
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
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground",
        className,
      )}
    >
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
    </div>
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
        <AnelDoDia valor={noDia} teto={teto} />
        <div className="grid grid-cols-3 gap-1.5">
          <Numero valor={r.vencidos} rotulo="vencidos" cor="text-destructive" />
          <Numero valor={r.hoje} rotulo="vencem hoje" cor="text-warning" />
          <Numero valor={r.semProximoPasso} rotulo="sem próximo passo" cor="text-destructive" />
        </div>
      </div>
      <Notas
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
    <section
      aria-label="Fila Única — placar do dia"
      className={cn(
        "flex flex-col rounded-2xl border border-border-subtle bg-card p-5 text-card-foreground",
        className,
      )}
    >
      <header>
        <h2 className="font-display text-lg font-bold">Fila Única</h2>
        <p className="text-xs text-muted-foreground">
          {dia} · {carteira?.rotulo ?? "sua carteira ativa"}
        </p>
      </header>
      <div className="flex flex-1 items-center justify-center py-6">
        <AnelDoDia valor={noDia} teto={teto} tamanho={172} traco={12} cartao />
      </div>
      {/* Os três números do vídeo: vencidos em vermelho, os de hoje em âmbar,
          sem próximo passo em navy — a cor só acende quando há o que cobrar. */}
      <div className="grid grid-cols-3 gap-2">
        <Numero valor={r.vencidos} rotulo="vencidos" cor="text-destructive" cartao />
        <Numero valor={r.hoje} rotulo="vencem hoje" cor="text-warning" cartao />
        <Numero valor={r.semProximoPasso} rotulo="sem próximo passo" cor="text-foreground" cartao />
      </div>
      <Notas
        fila={fila}
        carteira={carteira}
        excedente={excedente}
        teto={teto}
        className="mt-3 text-xs"
      />
      <div className="mt-4">{acao}</div>
      {rodape}
    </section>
  );
}

// "Incluir minha localização" (pedido do dono, 13/10/2026) — as peças de tela
// que o diálogo do check-in e o card de /presenca dividem: o painel com o
// botão (lê o GPS ANTES da escolha e mostra a distância até cada filial), os
// botões do aviso antes do check-in, o aviso do card e o resgate "você está
// na filial X". Só nos chunks lazy (diálogo e card); nunca no shell.
//
// Nada daqui grava: o painel é prévia. Quem decide é o banco (presenca_checkin),
// e a única RPC sai do toque numa filial — direto quando a mesma leitura está
// folgadamente dentro, senão pela pergunta de sempre ou pelo aviso.

import { useRef, type RefObject } from "react";
import { CheckCircle, CircleNotch, MapPinSimpleArea, Storefront } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  anuncioDaLeitura,
  textoDaLeitura,
  type Previa,
  type TextosAviso,
} from "./localizacao-previa";
import type { EstadoLocalizacao } from "./use-localizacao-incluida";

/**
 * O botão "Incluir minha localização" e a linha do que ele leu. Aparece só se
 * alguma filial tem pino (sem pino não há distância para mostrar).
 */
export function PainelIncluirLocalizacao({
  estado,
  previa,
  nomes,
  computador,
  desabilitado,
  regiaoPropria,
  anuncio,
  controlesOcultos = false,
  onIncluir,
  onCancelar,
}: {
  estado: EstadoLocalizacao;
  previa: Previa | null;
  /** slug → nome, para o anúncio ("você está na filial Barra Funda"). */
  nomes: Record<string, string>;
  computador: boolean;
  /** O diálogo/card está ocupado (relendo a presença, a RPC). */
  desabilitado: boolean;
  /**
   * O card tem a sua região viva (sempre montada) aqui; o diálogo NÃO — ele
   * tem uma região só, e o texto da leitura entra nela.
   */
  regiaoPropria: boolean;
  /** O que a região própria diz no lugar do anúncio da leitura (o título do aviso). */
  anuncio?: string;
  /** Só a região própria (o aviso do card está na tela com os seus botões). */
  controlesOcultos?: boolean;
  onIncluir: () => void;
  onCancelar: () => void;
}) {
  const lendo = estado.fase === "lendo";
  const texto = textoDaLeitura(estado, previa, { computador });
  // "Cancelar" some ao ser tocado: o foco volta ao botão (não cai no body).
  const botaoRef = useRef<HTMLButtonElement>(null);
  const regiao = regiaoPropria && (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="incluir-localizacao-anuncio"
    >
      {anuncio ?? anuncioDaLeitura(estado, previa, nomes, { computador })}
    </p>
  );
  if (controlesOcultos) return regiao || null;
  return (
    <div className="space-y-2" data-testid="incluir-localizacao">
      <div className="flex items-center gap-2">
        <Button
          ref={botaoRef}
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          // Lendo: aria-disabled (não `disabled`) para o foco não cair no
          // vazio; o clique é ignorado.
          disabled={desabilitado && !lendo}
          aria-disabled={lendo ? "true" : undefined}
          onClick={() => {
            if (!lendo) onIncluir();
          }}
        >
          {lendo ? (
            <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <MapPinSimpleArea className="mr-1.5 h-4 w-4" />
          )}
          {lendo ? "Lendo a localização…" : "Incluir minha localização"}
        </Button>
        {lendo && (
          <button
            type="button"
            // O visual de link, com o alvo de toque de 44 px no celular.
            className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground md:min-h-0"
            onClick={() => {
              onCancelar();
              botaoRef.current?.focus();
            }}
          >
            Cancelar
          </button>
        )}
      </div>
      {texto &&
        (texto.intent === "warning" ? (
          <div
            className="space-y-0.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
            data-testid="incluir-localizacao-texto"
          >
            <p className="font-semibold">{texto.titulo}</p>
            {texto.detalhe && <p className="text-foreground/80">{texto.detalhe}</p>}
          </div>
        ) : (
          <p
            className={cn(
              "flex items-start gap-1.5 text-xs",
              texto.intent === "success" ? "text-success" : "text-muted-foreground",
            )}
            data-testid="incluir-localizacao-texto"
          >
            {texto.intent === "success" && <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>
              {texto.titulo}
              {texto.detalhe && <span className="block">{texto.detalhe}</span>}
            </span>
          </p>
        ))}
      {regiao}
    </div>
  );
}

/**
 * Os botões do aviso antes do check-in (diálogo e card), nesta ordem: o
 * resgate (se a leitura diz que ele está noutra filial), Voltar, Incluir de
 * novo (volta às opções e relê — nunca faz check-in sozinho) e, discreto, o
 * check-in "assim mesmo" (lê de novo; o banco decide).
 */
export function BotoesAviso({
  variante,
  filial,
  aqui,
  escolha,
  disabled,
  onResgate,
  onVoltar,
  onIncluir,
  onAssimMesmo,
}: {
  variante: "fora" | "sem_localizacao";
  /** A filial tocada (o "assim mesmo"). */
  filial: { slug: string; nome: string };
  /** Onde a leitura diz que ele está (≠ da tocada, leitura não aproximada). */
  aqui: { slug: string; nome: string } | null;
  /** Qual opção está em andamento (gira o botão dela). */
  escolha: string | null;
  disabled: boolean;
  onResgate: () => void;
  onVoltar: () => void;
  onIncluir: () => void;
  onAssimMesmo: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {aqui && (
          <Button type="button" disabled={disabled} onClick={onResgate}>
            {escolha === aqui.slug ? (
              <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Storefront className="mr-1.5 h-4 w-4" />
            )}
            Fazer check-in na {aqui.nome}
          </Button>
        )}
        <Button type="button" variant="outline" disabled={disabled} onClick={onVoltar}>
          Voltar
        </Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={onIncluir}>
          <MapPinSimpleArea className="mr-1.5 h-4 w-4" />
          {variante === "fora" ? "Incluir minha localização de novo" : "Incluir minha localização"}
        </Button>
      </div>
      <button
        type="button"
        // Discreto (é o único caminho do aviso que grava um barrado), mas com o
        // alvo de toque de 44 px no celular, como os botões de cima.
        className="inline-flex min-h-11 items-center gap-1.5 px-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-60 md:min-h-0"
        disabled={disabled}
        onClick={onAssimMesmo}
      >
        {escolha === filial.slug && <CircleNotch className="h-3.5 w-3.5 animate-spin" />}
        Fazer o check-in na filial {filial.nome} assim mesmo
      </button>
    </div>
  );
}

/** O corpo do aviso (orientação, consequência, o que encerra, dica, resgate). */
export function CorpoAviso({ textos }: { textos: TextosAviso }) {
  return (
    <>
      {textos.encerra && (
        <p
          className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
          data-testid="aviso-checkin-encerra"
        >
          {textos.encerra}
        </p>
      )}
      {textos.dica && <p className="text-xs text-muted-foreground">{textos.dica}</p>}
      {textos.resgate && (
        <p className="flex items-start gap-1.5 text-sm font-medium text-success">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {textos.resgate}
        </p>
      )}
    </>
  );
}

/** O aviso antes do check-in no card (div, sem o título do diálogo). */
export function AvisoAntesDoCheckinInline({
  textos,
  tituloRef,
  children,
}: {
  textos: TextosAviso;
  tituloRef?: RefObject<HTMLParagraphElement | null>;
  /** Os botões (BotoesAviso). */
  children: React.ReactNode;
}) {
  return (
    <div
      className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3"
      data-testid="aviso-checkin"
    >
      <div className="space-y-1">
        <p
          ref={tituloRef}
          tabIndex={-1}
          className="flex items-start gap-1.5 font-medium outline-none"
          data-testid="aviso-checkin-titulo"
        >
          <MapPinSimpleArea className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          {textos.titulo}
        </p>
        {textos.orientacao && <p className="text-sm text-foreground/80">{textos.orientacao}</p>}
        <p className="text-sm text-foreground/80">{textos.consequencia}</p>
      </div>
      <CorpoAviso textos={textos} />
      {children}
    </div>
  );
}

/**
 * O resgate no barrado: a leitura do painel diz que ele está noutra filial
 * ("Pela localização, você está na filial Barra Funda.") — o caso do dono:
 * barrou na Liberdade estando na Barra Funda.
 */
export function ResgateAqui({
  texto,
  nome,
  carregando,
  disabled,
  onClick,
}: {
  texto: string;
  nome: string;
  carregando: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
      data-testid="resgate-aqui"
    >
      <span className="flex items-start gap-1.5">
        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        {texto}
      </span>
      <Button type="button" size="sm" className="shrink-0" disabled={disabled} onClick={onClick}>
        {carregando ? (
          <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Storefront className="mr-1.5 h-4 w-4" />
        )}
        Fazer check-in na {nome}
      </Button>
    </div>
  );
}

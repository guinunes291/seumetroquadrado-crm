// Card de check-in do corretor: "onde estou hoje?" em um toque.
//
// Filial = plantão, sempre libera a roleta. Em casa = libera só com o mínimo
// de vendas aprovadas no mês anterior (regra no banco, presenca_checkin). O
// card mostra
// a regra ANTES do clique — o corretor com 2 de 3 vendas em setembro vê, em
// outubro, que "Em casa" não libera, e por quê, antes de escolher.

import { useState } from "react";
import { CircleNotch, House, SignOut, Storefront } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { INTENT_BADGE_BORDERED } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { RoletaFechadaAviso } from "@/features/distribuicao/roleta-noite";
import { useCheckin, useEncerrarPresenca, useMinhaPresenca } from "./presenca-client";
import {
  enderecoCurto,
  localizacaoLabel,
  nomeDoMes,
  situacaoHoje,
  type FilialOpcao,
  type MinhaPresenca,
} from "./presenca-derive";

export function CheckinCard({ className }: { className?: string }) {
  const q = useMinhaPresenca();
  const checkin = useCheckin();
  const encerrar = useEncerrarPresenca();
  // Qual opção foi clicada (o GPS pode levar alguns segundos).
  const [escolha, setEscolha] = useState<string | null>(null);

  if (q.isLoading) return <Skeleton className={cn("h-72 w-full", className)} />;
  if (q.isError || !q.data) {
    return (
      <QueryErrorState
        className={className}
        title="Não foi possível carregar o seu check-in."
        error={q.error}
        onRetry={() => q.refetch()}
      />
    );
  }

  const p = q.data;
  const sit = situacaoHoje(p);
  const aberto = p.checkin && !p.checkin.encerrado_em ? p.checkin : null;
  const ocupado = checkin.isPending || encerrar.isPending;
  const evidencia =
    aberto?.modo === "loja" ? localizacaoLabel(aberto.localizacao, aberto.distancia_m) : null;

  const escolher = (modo: "loja" | "casa", filial?: string) => {
    setEscolha(filial ?? modo);
    checkin.mutate({ modo, filial }, { onSettled: () => setEscolha(null) });
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Storefront className="h-5 w-5 text-primary" /> Check-in de hoje
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="status"
          className={cn("rounded-lg border px-4 py-3", INTENT_BADGE_BORDERED[sit.intent])}
        >
          <p className="font-semibold">{sit.titulo}</p>
          {sit.detalhe && <p className="mt-0.5 text-sm text-foreground/80">{sit.detalhe}</p>}
          {evidencia && (
            <StatusBadge intent={evidencia.intent} className="mt-2">
              {evidencia.texto}
            </StatusBadge>
          )}
        </div>

        <RoletaFechadaAviso publico="corretor" />

        <div>
          <p className="mb-2 text-sm font-medium">Onde você está trabalhando hoje?</p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {p.filiais.map((f) => (
              <OpcaoFilial
                key={f.slug}
                filial={f}
                selecionada={aberto?.modo === "loja" && aberto.filial_slug === f.slug}
                carregando={escolha === f.slug}
                disabled={ocupado}
                onClick={() => escolher("loja", f.slug)}
              />
            ))}
            <OpcaoCasa
              p={p}
              selecionada={aberto?.modo === "casa"}
              carregando={escolha === "casa"}
              disabled={ocupado}
              onClick={() => escolher("casa")}
            />
          </div>
        </div>

        <RegraDasVendas p={p} />

        <div className="flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Na filial, o celular informa a localização só no momento do check-in, para confirmar o
            plantão. Em casa, a localização nunca é pedida.
          </p>
          {aberto && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={ocupado}
              onClick={() => encerrar.mutate()}
            >
              <SignOut className="mr-1.5 h-4 w-4" /> Encerrar presença
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OpcaoBotao({
  icone,
  titulo,
  detalhe,
  selecionada,
  carregando,
  disabled,
  onClick,
  aviso,
}: {
  icone: React.ReactNode;
  titulo: string;
  detalhe: string | null;
  selecionada: boolean;
  carregando: boolean;
  disabled: boolean;
  onClick: () => void;
  aviso?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selecionada}
      className={cn(
        "flex min-h-[84px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
        "hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-60",
        selecionada && "border-primary bg-primary/10 ring-1 ring-primary",
      )}
    >
      <span className="flex items-center gap-1.5 font-medium">
        {carregando ? <CircleNotch className="h-4 w-4 animate-spin" /> : icone}
        {titulo}
      </span>
      {detalhe && (
        <span className={cn("text-xs", aviso ? "text-warning" : "text-muted-foreground")}>
          {carregando ? "Confirmando…" : detalhe}
        </span>
      )}
    </button>
  );
}

function OpcaoFilial(props: {
  filial: FilialOpcao;
  selecionada: boolean;
  carregando: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <OpcaoBotao
      icone={<Storefront className="h-4 w-4 text-primary" />}
      titulo={props.filial.nome}
      detalhe={enderecoCurto(props.filial.endereco) ?? "Plantão: libera a roleta"}
      selecionada={props.selecionada}
      carregando={props.carregando}
      disabled={props.disabled}
      onClick={props.onClick}
    />
  );
}

function OpcaoCasa(props: {
  p: MinhaPresenca;
  selecionada: boolean;
  carregando: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { p } = props;
  const mes = nomeDoMes(p.mes_referencia);
  return (
    <OpcaoBotao
      icone={<House className="h-4 w-4 text-primary" />}
      titulo="Em casa"
      detalhe={
        p.casa_liberada
          ? `Libera a roleta (meta de ${mes} batida)`
          : `Não libera a roleta: ${p.vendas_mes_anterior} de ${p.vendas_minimas} vendas em ${mes}`
      }
      aviso={!p.casa_liberada}
      selecionada={props.selecionada}
      carregando={props.carregando}
      disabled={props.disabled}
      onClick={props.onClick}
    />
  );
}

/**
 * "2 de 3 vendas aprovadas em setembro" — a régua do trabalho em casa. Conta o
 * MÊS ANTERIOR: vale o mês inteiro e não zera no dia 1º.
 */
function RegraDasVendas({ p }: { p: MinhaPresenca }) {
  if (p.vendas_minimas <= 0) return null;
  const mes = nomeDoMes(p.mes_referencia);
  const pct = Math.min(100, Math.round((100 * p.vendas_mes_anterior) / p.vendas_minimas));
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>
          Vendas aprovadas em {mes}:{" "}
          <strong>
            {p.vendas_mes_anterior} de {p.vendas_minimas}
          </strong>
        </span>
        <span className="text-xs text-muted-foreground">
          {p.casa_liberada
            ? "este mês, pode receber leads de casa"
            : "este mês, só recebe leads no plantão"}
        </span>
      </div>
      <Progress
        value={pct}
        className="mt-2 h-1.5"
        aria-label={`${p.vendas_mes_anterior} de ${p.vendas_minimas} vendas em ${mes}`}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        Conta as vendas assinadas em {mes} e aprovadas no CRM (sem distrato).
      </p>
    </div>
  );
}

// Card de check-in do corretor: "onde estou hoje?" em um toque.
//
// Filial = plantão: libera a roleta (com a exigência de localização ligada,
// só de dentro da loja). Em casa = libera só com o mínimo de vendas aprovadas
// no mês anterior (regra no banco, presenca_checkin). O card mostra a regra
// ANTES do clique — o corretor com 2 de 3 vendas em setembro vê, em outubro,
// que "Em casa" não libera, e por quê, antes de escolher.
//
// As opções (OpcoesCheckin) e a régua das vendas (RegraDasVendas) também
// formam o diálogo do check-in obrigatório (checkin-obrigatorio-global.tsx).

import { useState } from "react";
import { toast } from "sonner";
import { CircleNotch, House, MapPinSimpleArea, SignOut, Storefront } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { INTENT_BADGE_BORDERED } from "@/lib/status-tones";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  ehComputador,
  useCheckin,
  useCheckinsDoDia,
  useEncerrarPresenca,
  useMinhaPresenca,
} from "./presenca-client";
import {
  avisoLocalizacao,
  barradosSemDestrave,
  DICA_FORA_DA_FILIAL,
  enderecoCurto,
  localizacaoLabel,
  nomeDoMes,
  perguntaConfirmarFilial,
  precisaRefazerCheckin,
  situacaoHoje,
  type FalhaLocalizacao,
  type FilialOpcao,
  type MinhaPresenca,
} from "./presenca-derive";

export function CheckinCard({ className }: { className?: string }) {
  const { user } = useAuth();
  const q = useMinhaPresenca();
  const checkin = useCheckin();
  const encerrar = useEncerrarPresenca();
  // Barrado hoje e trocou para "Em casa": o card avisa que o reforço não volta.
  const doDia = useCheckinsDoDia(!!q.data?.dia && !!user, {
    dia: q.data?.dia ?? "",
    corretorId: user?.id,
  });
  // Qual opção foi clicada (o GPS pode levar alguns segundos).
  const [escolha, setEscolha] = useState<string | null>(null);
  // Por que o celular não deu a localização no último check-in daqui.
  const [falha, setFalha] = useState<FalhaLocalizacao | null>(null);
  // Filial tocada esperando o "Estou na loja" (com a exigência ligada).
  const [confirmar, setConfirmar] = useState<FilialOpcao | null>(null);

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
  const computador = ehComputador();
  const barradoHoje = !!user && !!doDia.data && barradosSemDestrave(doDia.data).has(user.id);
  const sit = situacaoHoje(p, { falhaLocalizacao: falha, computador, barradoHoje });
  const aberto = p.checkin && !p.checkin.encerrado_em ? p.checkin : null;
  const ocupado = checkin.isPending || encerrar.isPending;
  const evidencia =
    aberto?.modo === "loja" ? localizacaoLabel(aberto.localizacao, aberto.distancia_m) : null;

  const registrar = (modo: "loja" | "casa", filial?: string) => {
    setEscolha(filial ?? modo);
    checkin.mutate(
      // Refazendo depois de barrado: lê a posição agora, não a de 1 min atrás.
      { modo, filial, novaLeitura: modo === "loja" && precisaRefazerCheckin(p), barradoHoje },
      {
        onSuccess: (r) => setFalha(r.falhaLocalizacao),
        onSettled: () => {
          setEscolha(null);
          setConfirmar(null);
        },
      },
    );
  };

  // Com a exigência ligada, a filial pede confirmação: um toque "para ver"
  // fora da loja vira check-in barrado e tira das roletas e do reforço.
  const escolher = (modo: "loja" | "casa", filial?: string) => {
    // Já na roleta nesta filial (GPS ou a gestão confirmando no plantão):
    // refazer só arriscaria rebaixar o check-in que vale.
    if (
      modo === "loja" &&
      aberto?.apto_roleta &&
      aberto.modo === "loja" &&
      aberto.filial_slug === filial
    ) {
      toast.info(`Você já está na roleta hoje: ${aberto.filial_nome ?? "nesta filial"}.`);
      return;
    }
    const f = modo === "loja" ? p.filiais.find((x) => x.slug === filial) : undefined;
    if (f && p.exige_localizacao) return setConfirmar(f);
    registrar(modo, filial);
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

        {confirmar ? (
          <ConfirmarFilial
            filial={confirmar}
            carregando={escolha === confirmar.slug}
            disabled={ocupado}
            computador={computador}
            onConfirmar={() => registrar("loja", confirmar.slug)}
            onVoltar={() => setConfirmar(null)}
          />
        ) : (
          <div>
            <p className="mb-2 text-sm font-medium">Onde você está trabalhando hoje?</p>
            <OpcoesCheckin
              p={p}
              escolha={escolha}
              disabled={ocupado}
              onEscolher={escolher}
              className="lg:grid-cols-4"
            />
            <p className="mt-2 text-xs text-muted-foreground">{DICA_FORA_DA_FILIAL}</p>
          </div>
        )}

        <RegraDasVendas p={p} />

        <div className="flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{avisoLocalizacao(p.exige_localizacao)}</p>
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

/**
 * "Você está dentro da loja X agora?" — o passo antes do check-in na filial
 * com a exigência ligada (no card; o diálogo tem o seu, com o título).
 */
export function ConfirmarFilial({
  filial,
  carregando,
  disabled,
  computador,
  onConfirmar,
  onVoltar,
}: {
  filial: FilialOpcao;
  carregando: boolean;
  disabled: boolean;
  computador: boolean;
  onConfirmar: () => void;
  onVoltar: () => void;
}) {
  const pergunta = perguntaConfirmarFilial(filial.nome);
  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div>
        <p className="font-medium">{pergunta.titulo}</p>
        <p className="mt-0.5 text-sm text-foreground/80">{pergunta.detalhe}</p>
        {computador && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-warning">
            <MapPinSimpleArea className="mt-0.5 h-4 w-4 shrink-0" />
            {AVISO_COMPUTADOR}
          </p>
        )}
      </div>
      <BotoesConfirmarFilial
        carregando={carregando}
        disabled={disabled}
        onConfirmar={onConfirmar}
        onVoltar={onVoltar}
      />
    </div>
  );
}

/** No computador, a localização costuma vir do Wi-Fi ou do IP (km de erro). */
export const AVISO_COMPUTADOR =
  "No computador a localização costuma falhar: se puder, faça o check-in pelo celular.";

/** [Voltar] [Estou na loja] — o card e o diálogo usam os mesmos. */
export function BotoesConfirmarFilial({
  carregando,
  disabled,
  onConfirmar,
  onVoltar,
}: {
  carregando: boolean;
  disabled: boolean;
  onConfirmar: () => void;
  onVoltar: () => void;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" disabled={disabled} onClick={onVoltar}>
        Voltar
      </Button>
      <Button type="button" disabled={disabled} onClick={onConfirmar}>
        {carregando ? (
          <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Storefront className="mr-1.5 h-4 w-4" />
        )}
        Estou na loja
      </Button>
    </div>
  );
}

/**
 * As filiais ativas e "Em casa", um toque cada. A opção do check-in aberto de
 * hoje fica marcada só se ele liberou a roleta (o barrado e o "Em casa" abaixo
 * do mínimo não aparecem como escolha feita); `escolha` = a que está
 * confirmando (o GPS leva segundos).
 */
export function OpcoesCheckin({
  p,
  escolha,
  disabled,
  onEscolher,
  className,
}: {
  p: MinhaPresenca;
  escolha: string | null;
  disabled: boolean;
  onEscolher: (modo: "loja" | "casa", filial?: string) => void;
  className?: string;
}) {
  const aberto = p.checkin && !p.checkin.encerrado_em && p.checkin.apto_roleta ? p.checkin : null;
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {p.filiais.map((f) => (
        <OpcaoFilial
          key={f.slug}
          filial={f}
          selecionada={aberto?.modo === "loja" && aberto.filial_slug === f.slug}
          carregando={escolha === f.slug}
          disabled={disabled}
          onClick={() => onEscolher("loja", f.slug)}
        />
      ))}
      <OpcaoCasa
        p={p}
        selecionada={aberto?.modo === "casa"}
        carregando={escolha === "casa"}
        disabled={disabled}
        onClick={() => onEscolher("casa")}
      />
    </div>
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
export function RegraDasVendas({ p }: { p: MinhaPresenca }) {
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
            : "este mês, a roleta só libera no plantão"}
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

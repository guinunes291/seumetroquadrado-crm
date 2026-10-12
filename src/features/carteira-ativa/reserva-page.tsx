// A Reserva — a segunda seção da Central de Comando.
//
// O par conceitual da Fila Única: lá está o que eu trabalho agora (as vagas
// da carteira ativa), aqui está o que ficou guardado esperando vaga. A página existe por
// uma razão de comportamento, não de dado: lead fora da carteira não pode
// SUMIR. Sem um lugar com nome onde o corretor busque pelo cliente e o traga
// de volta, a devolução lê como perda, e o corretor passa a esconder lead do
// CRM — o risco nº 1 do documento (§5.1).
//
// Por isso três coisas são inegociáveis nesta tela:
//   1. o motivo de cada um estar aqui aparece em texto, sempre;
//   2. a busca acha pelo telefone como o CLIENTE manda, não como está no
//      cadastro (o banco compara só dígitos);
//   3. "Trazer para a carteira" é um toque, e diz quantas vagas sobraram.
//
// Padrão Lançamento (Fase 1 das demais páginas, 12/10/2026): o "como estou
// agora" deixou de ser uma frase no cabeçalho e virou o MESMO anel da Central
// (X de 65 em atendimento) com três números; os chips por motivo filtram a
// lista; e quando o resgate não está disponível — porta fechada desde 28/09
// ou carteira sem vaga — a tela diz isso UMA vez acima da lista, em vez de
// 50 botões "Trazer" que falham no clique ou ficam cinza. A regra continua no
// banco (`carteira_resgatar`); a tela só avisa antes.
//
// Desenho e medições: docs/ops/carteira-ativa-40-fatia3.md §3.4 e §8.2.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  Archive,
  Info,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useNomeDoCorretor } from "@/hooks/use-nome-do-corretor";
import { PageHeader } from "@/components/page-header";
import { VendoDeOutro } from "@/components/vendo-de-outro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Placar, type NumeroDoPlacar } from "@/components/ui/placar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { INTENT_BADGE, type Intent } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import {
  agruparReservaPorMotivo,
  categoriaDoMotivo,
  resumoCarteira,
  type CategoriaMotivo,
  type LinhaReserva,
} from "@/features/carteira-ativa/derive";
import {
  CAP_RESGATE_PADRAO,
  TETO_PADRAO,
  useCarteiraAtiva,
  useCarteiraConfig,
  useCarteiraFormacao,
  useCarteiraReserva,
  useResgate,
} from "@/features/carteira-ativa/use-carteira";
import { useEmAtendimentoContador } from "@/features/em-atendimento/use-em-atendimento";
import {
  LOTE_STATUS_KEY,
  fetchStatusLote,
  portasLegadasFechadas,
} from "@/features/prospeccao/lote-client";

const POR_PAGINA = 50;

/** Tom do motivo: o que custa dinheiro agora pede ação; o que só espera vaga
 *  é neutro. */
const INTENT_MOTIVO: Record<CategoriaMotivo, Intent> = {
  sem_passo: "danger",
  sem_movimento: "warning",
  sem_conversa: "neutral",
  sem_vaga: "neutral",
};

function LinhaDaReserva({
  item,
  mostrarTrazer,
  resgatando,
  onResgatar,
}: {
  item: LinhaReserva;
  mostrarTrazer: boolean;
  resgatando: boolean;
  onResgatar: (id: string) => void;
}) {
  const cat = categoriaDoMotivo(item.motivo);
  return (
    <li className="flex flex-col gap-2 border-b border-border-subtle px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium text-foreground">{item.nome}</span>
          <TemperatureChip temperatura={item.temperatura} size="sm" pulse={false} />
          {item.projeto_nome && (
            <Badge variant="outline" className="max-w-[14rem] truncate font-normal">
              {item.projeto_nome}
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span
            className={cn("rounded-md px-1.5 py-0.5 font-medium", INTENT_BADGE[INTENT_MOTIVO[cat]])}
          >
            {item.motivo}
          </span>
          {item.telefone && <span className="tabular-nums">{item.telefone}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/leads/$leadId" params={{ leadId: item.lead_id }}>
            <ArrowSquareOut className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Dossiê</span>
          </Link>
        </Button>
        {mostrarTrazer && (
          <Button
            size="sm"
            variant="outline"
            disabled={resgatando}
            onClick={() => onResgatar(item.lead_id)}
            title="Trazer este cliente para a sua carteira"
          >
            <ArrowCounterClockwise className="h-4 w-4" />
            <span className="ml-1">Trazer</span>
          </Button>
        )}
      </div>
    </li>
  );
}

export function ReservaPage({ corretorId }: { corretorId?: string }) {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [motivo, setMotivo] = useState<CategoriaMotivo | null>(null);

  const { user } = useAuth();
  const { isAdmin, isGestor, isSuperintendente, isCorretor } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;

  const configQ = useCarteiraConfig();
  const ativaQ = useCarteiraAtiva(corretorId);
  const contadorQ = useEmAtendimentoContador(corretorId);
  const formacaoQ = useCarteiraFormacao(corretorId);
  const reservaQ = useCarteiraReserva({
    corretorId,
    busca,
    limite: POR_PAGINA,
    offset: pagina * POR_PAGINA,
  });
  const nomeQ = useNomeDoCorretor(corretorId);
  const { resgatar } = useResgate();

  // A mesma leitura do card de lote da Prospecção (mesma chave de cache): o
  // banco diz se as portas antigas de base nova estão abertas. Só vale para o
  // corretor olhando a própria base — a gestão o banco deixa passar.
  const statusLoteQ = useQuery({
    queryKey: [LOTE_STATUS_KEY, user?.id],
    enabled: !!user && isCorretor && !gestao && !corretorId,
    queryFn: fetchStatusLote,
  });

  const teto = configQ.data?.teto ?? TETO_PADRAO;
  const resumo = useMemo(
    () => (ativaQ.data ? resumoCarteira(ativaQ.data, teto) : null),
    [ativaQ.data, teto],
  );
  const itens = useMemo(() => reservaQ.data ?? [], [reservaQ.data]);
  // `total` é a contagem da janela inteira, repetida em cada linha pelo
  // `count(*) OVER ()`; sem linha alguma, a janela é vazia.
  const total = itens[0]?.total ?? 0;
  const grupos = useMemo(() => agruparReservaPorMotivo(itens), [itens]);
  const visiveis = motivo ? itens.filter((i) => categoriaDoMotivo(i.motivo) === motivo) : itens;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // Só própria carteira resgata: o banco recusa lead de outro corretor, e a
  // gestão vendo a Reserva de um corretor está em modo leitura.
  const propria = !corretorId;
  const portaFechada = propria && !gestao && portasLegadasFechadas(statusLoteQ.data);
  const semVaga = !!resumo && resumo.vagas === 0;
  // Enquanto o status chega, nada de botão: senão 50 "Trazer" piscam e somem
  // quando a porta está fechada. Erro no status mantém os botões (o banco
  // responde no clique) — `isLoading` é falso com a leitura desligada.
  const podeResgatar =
    propria && !statusLoteQ.isLoading && !portaFechada && (resumo?.vagas ?? 0) > 0;

  // O placar: o mesmo número do anel da Central (X de 65 em atendimento); em
  // banco antigo, sem o contador, a carteira ativa medida. "Vagas livres" vem
  // da carteira ativa — a mesma conta do botão "Trazer" e do aviso depois do
  // resgate (`vagas_agora`), para a tela não mostrar dois números diferentes.
  const c = contadorQ.data?.corretor ? contadorQ.data : null;
  const vagasLivres = resumo?.vagas ?? (c ? Math.max(0, c.teto - c.em_atendimento) : 0);
  const anel = c
    ? { valor: c.em_atendimento, teto: c.teto, rotulo: "em atendimento" }
    : resumo
      ? {
          valor: Math.min(resumo.ocupadas, resumo.teto),
          teto: resumo.teto,
          rotulo: "na carteira ativa",
        }
      : null;
  const numeros: NumeroDoPlacar[] = c
    ? [
        { valor: vagasLivres, rotulo: "vagas livres", cor: "text-foreground" },
        { valor: c.minha_base, rotulo: "na Minha base", cor: "text-foreground" },
        {
          valor: formacaoQ.data?.em_formacao ?? 0,
          rotulo: "em formação (cadência)",
          cor: "text-foreground",
        },
      ]
    : resumo
      ? [
          { valor: vagasLivres, rotulo: "vagas livres", cor: "text-foreground" },
          { valor: total, rotulo: "na Minha base", cor: "text-foreground" },
          { valor: resumo.fundo, rotulo: "no fundo do funil", cor: "text-foreground" },
        ]
      : [];

  function aoResgatar(leadId: string) {
    resgatar.mutate(leadId, {
      onSuccess: (r) => {
        if (r.ok) {
          toast.success("Trouxe para a sua carteira", {
            description:
              typeof r.vagas_agora === "number"
                ? `${r.vagas_agora} ${r.vagas_agora === 1 ? "vaga livre" : "vagas livres"}.`
                : undefined,
          });
          return;
        }
        toast.error(
          r.motivo === "cap_resgate_atingido"
            ? `Você já tem ${r.cap ?? CAP_RESGATE_PADRAO} resgates na carteira. Solte um para trazer outro.`
            : r.motivo === "porta_fechada_use_lote"
              ? "O resgate da Reserva está fechado para o corretor desde 28/09. Clientes novos chegam pelo lote de 30 na Prospecção."
              : "Não foi possível trazer este cliente.",
        );
      },
      onError: () => toast.error("Não foi possível trazer este cliente."),
    });
  }

  // Banco antigo (sem a migration): `null`, não lista vazia. Reserva vazia e
  // Reserva indisponível levam a decisões opostas — dizer a diferença.
  const semRpc = reservaQ.data === null && !reservaQ.isLoading && !reservaQ.isError;

  return (
    <div className="space-y-3 md:space-y-4">
      {corretorId && (
        <VendoDeOutro
          oQue="a base"
          nome={nomeQ.data ?? "outro corretor"}
          voltarPara="/reserva"
          data-testid="reserva-de-outro"
        />
      )}
      <PageHeader
        title="Minha base"
        description="O que é seu antes de Em atendimento — busque pelo nome ou pelo telefone."
        actions={
          <Link to="/fila" className="text-sm font-medium text-primary hover:underline">
            Ir para a Fila Única
          </Link>
        }
      />

      {anel && (
        <Placar
          data-testid="reserva-placar"
          aria-label="Placar da Minha base"
          anel={anel}
          numeros={numeros}
          notas={
            c?.lotado ? (
              <span className="text-warning">Lotado — o próximo entra quando um sair.</span>
            ) : resumo?.estourou && !c ? (
              <span className="text-warning">
                Acima do teto pelo fundo do funil — você não recebe lead novo até desovar.
              </span>
            ) : undefined
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1 sm:max-w-sm">
          <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
              setMotivo(null);
            }}
            placeholder="Buscar por nome ou telefone…"
            className="pl-8"
            aria-label="Buscar na Reserva"
          />
        </div>
        {total > 0 && (
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {total} {total === 1 ? "cliente" : "clientes"}
          </span>
        )}
      </div>

      {grupos.length > 1 && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filtrar pelo motivo"
          data-testid="reserva-motivos"
        >
          <button
            type="button"
            aria-pressed={motivo === null}
            onClick={() => setMotivo(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              motivo === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-subtle text-muted-foreground hover:text-foreground",
            )}
          >
            Todos
          </button>
          {grupos.map((g) => (
            <button
              key={g.categoria}
              type="button"
              aria-pressed={motivo === g.categoria}
              onClick={() => setMotivo(motivo === g.categoria ? null : g.categoria)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                motivo === g.categoria
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border-subtle text-muted-foreground hover:text-foreground",
              )}
            >
              {g.label} <span className="tabular-nums">{g.quantidade}</span>
            </button>
          ))}
          {paginas > 1 && <span className="text-xs text-muted-foreground">nesta página</span>}
        </div>
      )}

      {propria && (portaFechada || semVaga) && itens.length > 0 && (
        <p
          className="flex items-start gap-2 rounded-xl border border-border-subtle bg-muted/40 px-3 py-2.5 text-sm"
          data-testid="reserva-sem-resgate"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {portaFechada ? (
            <span>
              O resgate pela Minha base está fechado desde 28/09 — clientes novos chegam pelo lote
              de 30 na{" "}
              <Link to="/prospeccao" className="font-medium text-primary hover:underline">
                Prospecção
              </Link>
              .
            </span>
          ) : (
            <span>
              Sem vaga livre na carteira agora. Quando um lead sair da Fila, você traz alguém daqui.
            </span>
          )}
        </p>
      )}

      {reservaQ.isError ? (
        <QueryErrorState error={reservaQ.error} onRetry={() => void reservaQ.refetch()} />
      ) : reservaQ.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : semRpc ? (
        <EmptyState
          icon={Archive}
          title="Reserva indisponível neste ambiente"
          description="A regra da carteira ativa ainda não foi aplicada neste banco. Nenhum cliente foi perdido — a lista volta assim que a migration subir."
        />
      ) : itens.length === 0 ? (
        <EmptyState
          icon={Archive}
          title={busca ? "Ninguém com esse nome ou telefone na Reserva" : "Reserva vazia"}
          description={
            busca
              ? "Tente só os dígitos do telefone, ou parte do nome."
              : "Todo cliente vivo seu está na carteira ativa."
          }
          action={
            busca ? (
              <Button variant="outline" onClick={() => setBusca("")}>
                Limpar busca
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul
            className="overflow-hidden rounded-2xl border border-border-subtle bg-card"
            data-testid="reserva-lista"
          >
            {visiveis.map((item) => (
              <LinhaDaReserva
                key={item.lead_id}
                item={item}
                mostrarTrazer={podeResgatar}
                resgatando={resgatar.isPending}
                onResgatar={aoResgatar}
              />
            ))}
          </ul>

          {paginas > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina === 0}
                onClick={() => {
                  setPagina((p) => Math.max(0, p - 1));
                  setMotivo(null);
                }}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {pagina + 1} de {paginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina + 1 >= paginas}
                onClick={() => {
                  setPagina((p) => p + 1);
                  setMotivo(null);
                }}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

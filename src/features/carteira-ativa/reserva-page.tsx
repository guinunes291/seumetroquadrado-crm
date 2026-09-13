// A Reserva — a segunda seção da Central de Comando.
//
// O par conceitual da Fila Única: lá está o que eu trabalho agora (as 40
// vagas), aqui está o que ficou guardado esperando vaga. A página existe por
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
// Desenho e medições: docs/ops/carteira-ativa-40-fatia3.md §3.4 e §8.2.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  Archive,
  ListChecks,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { cn } from "@/lib/utils";
import {
  agruparReservaPorMotivo,
  categoriaDoMotivo,
  fraseDoPlacar,
  resumoCarteira,
  type CategoriaMotivo,
  type LinhaReserva,
} from "@/features/carteira-ativa/derive";
import {
  TETO_PADRAO,
  useCarteiraAtiva,
  useCarteiraConfig,
  useCarteiraReserva,
  useResgate,
} from "@/features/carteira-ativa/use-carteira";

const POR_PAGINA = 50;

/** Tom do chip do motivo: o que custa dinheiro agora é vermelho; o que só
 *  espera vaga é neutro. */
const TOM_MOTIVO: Record<CategoriaMotivo, string> = {
  sem_passo: "border-destructive/40 text-destructive",
  sem_movimento: "border-warning/40 text-warning",
  sem_conversa: "border-border-subtle text-muted-foreground",
  sem_vaga: "border-border-subtle text-muted-foreground",
};

function LinhaDaReserva({
  item,
  podeResgatar,
  resgatando,
  onResgatar,
}: {
  item: LinhaReserva;
  podeResgatar: boolean;
  resgatando: boolean;
  onResgatar: (id: string) => void;
}) {
  const cat = categoriaDoMotivo(item.motivo);
  return (
    <li className="flex flex-col gap-2 border-b border-border-subtle px-3 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
          <span className={cn("rounded border px-1.5 py-0.5", TOM_MOTIVO[cat])}>{item.motivo}</span>
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
        <Button
          size="sm"
          variant="outline"
          disabled={!podeResgatar || resgatando}
          onClick={() => onResgatar(item.lead_id)}
          // O motivo da trava importa mais que a trava: sem isto o corretor
          // acha que o botão está quebrado.
          title={
            podeResgatar
              ? "Trazer este cliente para a sua carteira"
              : "Sem vaga livre na carteira — desovar um lead abre espaço"
          }
        >
          <ArrowCounterClockwise className="h-4 w-4" />
          <span className="ml-1">Trazer</span>
        </Button>
      </div>
    </li>
  );
}

export function ReservaPage({ corretorId }: { corretorId?: string }) {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);

  const configQ = useCarteiraConfig();
  const ativaQ = useCarteiraAtiva(corretorId);
  const reservaQ = useCarteiraReserva({
    corretorId,
    busca,
    limite: POR_PAGINA,
    offset: pagina * POR_PAGINA,
  });
  const { resgatar } = useResgate();

  const teto = configQ.data?.teto ?? TETO_PADRAO;
  const resumo = useMemo(
    () => (ativaQ.data ? resumoCarteira(ativaQ.data, teto) : null),
    [ativaQ.data, teto],
  );
  const itens = reservaQ.data ?? [];
  // `total` é a contagem da janela inteira, repetida em cada linha pelo
  // `count(*) OVER ()`; sem linha alguma, a janela é vazia.
  const total = itens[0]?.total ?? 0;
  const grupos = useMemo(() => agruparReservaPorMotivo(itens), [itens]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // Só própria carteira resgata: o banco recusa lead de outro corretor, e a
  // gestão vendo a Reserva de um corretor está em modo leitura.
  const podeResgatar = !corretorId && (resumo?.vagas ?? 0) > 0;

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
            ? `Você já tem ${r.cap ?? 8} resgates na carteira. Solte um para trazer outro.`
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
    <div>
      <PageHeader
        title="Reserva"
        description={
          resumo
            ? fraseDoPlacar(resumo)
            : "O que está guardado esperando vaga na sua carteira ativa."
        }
        actions={
          <Button variant="outline" asChild>
            <Link to="/fila">
              <ListChecks className="h-4 w-4" />
              <span className="ml-1">Ir para a Fila Única</span>
            </Link>
          </Button>
        }
      />

      {grupos.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {grupos.map((g) => (
            <span
              key={g.categoria}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs",
                TOM_MOTIVO[g.categoria],
                "bg-muted/40",
              )}
            >
              <strong className="tabular-nums">{g.quantidade}</strong> {g.label.toLowerCase()}
            </span>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 sm:max-w-sm">
          <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
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
          <ul className="rounded-xl border border-border-subtle bg-card">
            {itens.map((item) => (
              <LinhaDaReserva
                key={item.lead_id}
                item={item}
                podeResgatar={podeResgatar}
                resgatando={resgatar.isPending}
                onResgatar={aoResgatar}
              />
            ))}
          </ul>

          {paginas > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
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
                onClick={() => setPagina((p) => p + 1)}
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

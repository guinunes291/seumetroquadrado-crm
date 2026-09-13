// O Bolsão de oportunidades — a base geral da casa, sem dono.
//
// Terceira seção da Central de Comando. A Fila Única é o que eu trabalho
// agora; a Reserva é o que ficou guardado esperando vaga; o Bolsão é o que
// não é de ninguém — matéria-prima do discador e da equipe de SDR.
//
// Esta tela é DELIBERADAMENTE incompleta: ela não tem botão de puxar. É o
// passo 2 do §9 do documento, e a ordem é a parte que importa. Antes de deixar
// alguém tirar lead do Bolsão, a casa precisa (a) ver quem busca e o quê, e
// (b) ter a regra de comissão publicada. Soltar o botão junto com a tela
// trocaria uma decisão comercial por um clique.
//
// Duas coisas são inegociáveis aqui, e as duas são sobre o que a tela NÃO
// mostra:
//   1. de quem o lead era — nem nome, nem id, nem pista. O §5.2 do documento
//      é explícito, e o motivo é operacional: a briga por lead começa quando
//      se sabe de quem ele era.
//   2. o telefone inteiro. Sai mascarado do banco. Sem isso, puxar vira
//      opcional — bastaria copiar o número e ligar por fora do CRM, que é
//      exatamente como uma carteira deixa de ser auditável.
//
// Desenho e medições: docs/ops/bolsao-oportunidades-fatia4.md §5 e §9.

import { useMemo, useState } from "react";
import { Archive, Eye, MagnifyingGlass, Phone, Users } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { cn } from "@/lib/utils";
import {
  ROTULO_FRIEZA,
  ROTULO_SINAL,
  ehEstoque,
  frasePlacar,
  friezaDoLead,
  resumoBolsao,
  sinalDoLead,
  type Frieza,
  type LinhaBolsao,
} from "@/features/bolsao/derive";
import { useBolsao, useBolsaoDiagnostico } from "@/features/bolsao/use-bolsao";

const POR_PAGINA = 50;

/** Quanto mais frio, mais apagado: numa base de mineração o que está parado
 *  há meses é o grosso, e destacar tudo é não destacar nada. */
const TOM_FRIEZA: Record<Frieza, string> = {
  recente: "border-success/40 text-success",
  morno: "border-warning/40 text-warning",
  frio: "border-border-subtle text-muted-foreground",
  esquecido: "border-border-subtle text-muted-foreground",
};

function LinhaDoBolsao({ item }: { item: LinhaBolsao }) {
  const frieza = friezaDoLead(item.dias_parado);
  const sinal = sinalDoLead(item);
  const lugar = [item.bairro, item.zona].filter(Boolean).join(" · ");

  return (
    <li className="flex flex-col gap-2 border-b border-border-subtle px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{item.nome}</span>
          {item.em_triagem_sdr && (
            <Badge variant="outline" className="border-info/40 text-info">
              com o SDR
            </Badge>
          )}
          {!ehEstoque(item.origem) && (
            <Badge variant="outline" className="border-border-subtle text-muted-foreground">
              {item.origem}
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {item.telefone_mascarado && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Phone size={12} weight="duotone" aria-hidden />
              {item.telefone_mascarado}
            </span>
          )}
          {item.projeto_nome && <span className="truncate">{item.projeto_nome}</span>}
          {lugar && <span className="truncate">{lugar}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {/* Histórico agregado, sem autor e sem texto: é o que impede o nome do
            corretor anterior de vazar pela tela (§5.2). */}
        <Badge variant="outline" className="border-border-subtle text-muted-foreground">
          {ROTULO_SINAL[sinal]}
        </Badge>
        <Badge variant="outline" className={cn(TOM_FRIEZA[frieza])}>
          {ROTULO_FRIEZA[frieza]}
        </Badge>
      </div>
    </li>
  );
}

export function BolsaoPage() {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);

  const consulta = useBolsao({
    busca,
    limite: POR_PAGINA,
    offset: pagina * POR_PAGINA,
  });
  const diagnostico = useBolsaoDiagnostico();

  const linhas = useMemo(() => consulta.data ?? [], [consulta.data]);
  const resumo = useMemo(() => resumoBolsao(linhas), [linhas]);

  // `null` do fallback = RPC ausente. Distinguir de lista vazia é o ponto:
  // "não achei nada" e "não consigo olhar" pedem ações opostas.
  const semRpc = consulta.data === null && !consulta.isLoading && !consulta.isError;
  const totalDaCasa = diagnostico.data?.bolsao_elegivel ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bolsão de oportunidades"
        description="A base geral da casa — leads sem dono, trabalhados pelo discador e pela equipe de SDR."
      />

      {/* A tela sem botão de puxar precisa dizer que isso é intencional, ou
          lê como funcionalidade quebrada. */}
      <div className="flex items-start gap-2 rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2 text-sm text-muted-foreground">
        <Eye size={16} weight="duotone" className="mt-0.5 shrink-0" aria-hidden />
        <p>
          Por enquanto o Bolsão é só consulta. Puxar lead para a sua carteira entra depois que a
          regra de comissão estiver publicada — quem puxa lead parado há mais de 7 dias fica com a
          venda inteira, e isso precisa estar escrito antes do primeiro puxão.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlass
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
            }}
            placeholder="Buscar por nome ou telefone…"
            className="pl-9"
            aria-label="Buscar no Bolsão"
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {frasePlacar(resumo, busca)}
        {totalDaCasa !== null && !busca.trim() && (
          <span className="ml-1">
            A casa tem {totalDaCasa.toLocaleString("pt-BR")} sem dono com telefone.
          </span>
        )}
      </p>

      {consulta.isError && <QueryErrorState error={consulta.error} onRetry={consulta.refetch} />}

      {semRpc && (
        <EmptyState
          icon={Archive}
          title="Bolsão indisponível neste ambiente"
          description="As funções do Bolsão ainda não foram aplicadas neste banco. Isso não quer dizer que a base está vazia."
        />
      )}

      {consulta.isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!semRpc && !consulta.isLoading && linhas.length === 0 && !consulta.isError && (
        <EmptyState
          icon={Users}
          title={busca.trim() ? "Ninguém com esse nome ou telefone" : "Bolsão vazio"}
          description={
            busca.trim()
              ? "A busca compara só os dígitos do telefone, então pode digitar como o cliente manda."
              : "Nenhum lead sem dono, com telefone e sem venda para mostrar."
          }
        />
      )}

      {linhas.length > 0 && (
        <ul className="rounded-lg border border-border-subtle bg-surface">
          {linhas.map((item) => (
            <LinhaDoBolsao key={item.lead_id} item={item} />
          ))}
        </ul>
      )}

      {(pagina > 0 || linhas.length === POR_PAGINA) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">Página {pagina + 1}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={linhas.length < POR_PAGINA}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}

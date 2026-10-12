// "Meus 65": o corretor vê quem disputa as vagas de Em atendimento, na ordem
// da regra, e escolhe quem quer manter (decisão 2.5: "nesse período o
// corretor escolhe os seus 65"). A escolha põe o lead na frente da disputa,
// mas NÃO segura o relógio (decisão do dono, 03/10/2026): escolhido sem toque
// em 5 dias desce do mesmo jeito — por isso cada escolhido mostra até quando
// precisa de um toque. A gestão abre a tela de um corretor em leitura.
//
// Padrão Lançamento (Fase 1 das demais páginas, 12/10/2026): o placar é o
// MESMO anel "X de 65" da Central de Comando — antes era o mesmo número em
// texto, outro desenho para a mesma pergunta — com três números com dono
// (escolhidos · ficam · perdem a vaga) e a nota de lotado; a regra do relógio
// vira uma linha no topo da lista; a situação de cada lead usa os tons de
// intenção do sistema.
import { AvisoViradaRegra65 } from "@/features/em-atendimento/aviso-virada";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Crosshair, UsersThree } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useNomeDoCorretor } from "@/hooks/use-nome-do-corretor";
import { PageHeader } from "@/components/page-header";
import { VendoDeOutro } from "@/components/vendo-de-outro";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Placar } from "@/components/ui/placar";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { INTENT_BADGE, type Intent } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import {
  ACAO_LABEL,
  dataCurta,
  prazoParaManter,
  tomContador,
  type LinhaMeus65,
} from "@/lib/em-atendimento";
import {
  escolherEmAtendimento,
  invalidarEmAtendimento,
  useEmAtendimentoContador,
  useMeus65,
} from "./use-em-atendimento";

/** Situação na disputa → tom de intenção: fica é bom, acima do teto pede
 *  atenção, perder a vaga é o que cobrar; a cadência é neutra. */
const ACAO_INTENT: Record<string, Intent> = {
  fica: "success",
  excedente: "warning",
  perde_vaga: "danger",
  porta_cadencia: "neutral",
};

export function Meus65Page({ corretorId }: { corretorId?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const outro = !!corretorId && corretorId !== user?.id;
  const alvo = outro ? corretorId : undefined;
  const contador = useEmAtendimentoContador(alvo);
  const meus = useMeus65(alvo);
  const nomeQ = useNomeDoCorretor(alvo);

  const escolher = useMutation({
    mutationFn: ({ leadId, sim }: { leadId: string; sim: boolean }) =>
      escolherEmAtendimento(leadId, sim),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(
          `Você já escolheu ${r.escolhidos} de ${r.teto}. Desmarque um para escolher outro.`,
        );
        return;
      }
      invalidarEmAtendimento(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = contador.data;
  const teto = c?.teto ?? 65;
  const linhas = meus.data ?? [];
  const ficam = linhas.filter((l) => l.acao === "fica").length;
  const perdemVaga = linhas.filter((l) => l.acao === "perde_vaga").length;

  return (
    <div className="space-y-3 md:space-y-4">
      {outro && (
        <VendoDeOutro
          oQue={`os ${teto}`}
          nome={nomeQ.data ?? "outro corretor"}
          voltarPara="/meus-65"
          voltarRotulo="voltar para os meus"
        />
      )}
      <PageHeader
        title={outro ? `Os ${teto} do corretor` : `Meus ${teto}`}
        description={
          outro
            ? "Quem disputa as vagas de Em atendimento deste corretor, na ordem da regra."
            : "Quem fica nas suas vagas de Em atendimento. Marque quem você quer manter."
        }
      />
      <AvisoViradaRegra65 />

      {contador.isPending || meus.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : contador.isError || meus.isError ? (
        // Erro de verdade (ex.: corretor abrindo os 65 de outro) não é "sem
        // dado": a mensagem do banco diz o que foi.
        <div data-testid="meus-65-erro">
          <QueryErrorState
            error={contador.error ?? meus.error}
            onRetry={() => {
              void contador.refetch();
              void meus.refetch();
            }}
          />
        </div>
      ) : !c || meus.data === null ? (
        <EmptyState
          icon={Crosshair}
          title="Sem dado"
          description="A regra dos 65 ainda não está disponível neste ambiente."
        />
      ) : !c.corretor ? (
        // Conta sem papel de corretor (gestão) não tem teto: os 65 são de um
        // corretor — o Painel do Gestor abre os de cada um.
        <div data-testid="meus-65-sem-teto">
          <EmptyState
            icon={UsersThree}
            title="Esta conta não tem teto de corretor"
            description={`Abra os ${teto} de um corretor pelo Painel do Gestor, aba Time.`}
          />
        </div>
      ) : (
        <>
          <Placar
            data-testid="meus-65-placar"
            aria-label={`Placar dos ${c.teto}`}
            anel={{ valor: c.em_atendimento, teto: c.teto, rotulo: "em atendimento" }}
            numeros={[
              { valor: c.escolhidos, rotulo: "escolhidos", cor: "text-foreground" },
              { valor: ficam, rotulo: `ficam nos ${c.teto}`, cor: "text-success" },
              { valor: perdemVaga, rotulo: "perdem a vaga", cor: "text-destructive" },
            ]}
            notas={
              <>
                <span>
                  Minha base: <b className="font-semibold text-foreground">{c.minha_base}</b>
                </span>
                {tomContador(c) === "lotado" && (
                  <span className="text-warning">
                    Lotado — para pôr mais um, libere uma vaga (entra um, sai um).
                  </span>
                )}
              </>
            }
          />

          {linhas.length === 0 ? (
            <EmptyState
              icon={Crosshair}
              title="Nenhum lead em Em atendimento"
              description="Quem você atender pela Fila Única entra aqui."
            />
          ) : (
            <section
              aria-label={`Em atendimento, na ordem da disputa`}
              className="overflow-hidden rounded-2xl border border-border-subtle bg-card"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border-subtle px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {c.modo === "sombra" && (
                    <span
                      className={cn(
                        "mr-2 rounded-md px-1.5 py-0.5 font-semibold",
                        INTENT_BADGE.neutral,
                      )}
                      title="Nenhum lead é movido por robô enquanto a regra está em modo sombra."
                    >
                      modo sombra
                    </span>
                  )}
                  A escolha não segura o relógio: sem ligação ou WhatsApp em {c.dias_sem_toque}{" "}
                  dias, o lead desce para a Minha base mesmo escolhido.
                </p>
                {!outro && (
                  <span className="text-xs font-semibold text-muted-foreground">Manter</span>
                )}
              </div>
              <ul className="divide-y divide-border-subtle" data-testid="meus-65-lista">
                {linhas.map((l) => (
                  <LinhaDos65
                    key={l.lead_id}
                    linha={l}
                    diasSemToque={c.dias_sem_toque}
                    somenteLeitura={outro}
                    pendente={escolher.isPending}
                    onEscolher={(sim) => escolher.mutate({ leadId: l.lead_id, sim })}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function LinhaDos65({
  linha,
  diasSemToque,
  somenteLeitura,
  pendente,
  onEscolher,
}: {
  linha: LinhaMeus65;
  diasSemToque: number;
  somenteLeitura: boolean;
  pendente: boolean;
  onEscolher: (sim: boolean) => void;
}) {
  const prazo =
    linha.escolhido && linha.acao === "fica"
      ? prazoParaManter(linha.movimento, diasSemToque)
      : null;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5" data-testid="meus-65-linha">
      <span className="w-7 shrink-0 text-right font-display text-xs font-semibold tabular-nums text-muted-foreground">
        {linha.posicao ?? "—"}
      </span>
      <div className="min-w-0 flex-1">
        <Link
          to="/leads/$leadId"
          params={{ leadId: linha.lead_id }}
          className="block truncate text-sm font-medium hover:underline"
        >
          {linha.nome}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {linha.projeto_nome ?? "sem empreendimento"}
          {linha.temperatura ? ` · ${linha.temperatura}` : ""} · {linha.dias_sem_toque}{" "}
          {linha.dias_sem_toque === 1 ? "dia" : "dias"} sem toque
          {prazo ? ` · toque até ${dataCurta(prazo)} para manter` : ""}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold",
          INTENT_BADGE[ACAO_INTENT[linha.acao] ?? "neutral"],
        )}
        title={linha.motivo ?? undefined}
      >
        {ACAO_LABEL[linha.acao] ?? linha.acao}
      </span>
      {!somenteLeitura && (
        // O rótulo "Manter" mora no cabeçalho da coluna; aqui, só a caixa —
        // com o nome acessível completo para o leitor de tela.
        <Checkbox
          checked={linha.escolhido}
          disabled={pendente}
          onCheckedChange={(v) => onEscolher(v === true)}
          aria-label={`Manter ${linha.nome} nos meus 65`}
          className="shrink-0"
        />
      )}
    </li>
  );
}

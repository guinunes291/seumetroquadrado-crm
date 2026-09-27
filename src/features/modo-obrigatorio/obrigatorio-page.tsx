// Processo Obrigatório — a única tela do corretor enquanto houver pendência.
//
// A lista e a ordem vêm do banco (modo_obrigatorio_v1): lead novo sempre
// primeiro, depois atrasados, fundo de funil parado e as etapas de hoje. Cada
// card reaproveita a ação que já existe para aquele tipo de pendência — os
// botões da cadência (Liguei, WhatsApp, Cliente respondeu) e o "o que
// aconteceu?" da Fila Única para o fundo parado —, então o que conclui uma
// pendência aqui é exatamente o que a concluiria nas outras telas.

import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle, LockSimple, Phone } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadProjetoAtalhos } from "@/components/lead-projeto-atalhos";
import {
  LeadStageModals,
  type PerdidoState,
  type StageModalState,
} from "@/components/lead-stage/lead-stage-modals";
import { leadStatusLabel, type StageLead } from "@/lib/leads";
import { cn } from "@/lib/utils";
import type { CadenciaItem } from "@/features/cadencia/client";
import { DialogRespondeu, LinhaDaFila, useAcoesCadencia } from "@/features/cadencia/fila-view";
import type { FilaUnicaItem } from "@/features/fila-unica/derive";
import { desfechoPara, type OpcaoDesfecho } from "@/features/fila-unica/desfecho";
import { FilaDesfecho } from "@/features/fila-unica/fila-desfecho";
import { useDesfecho } from "@/features/fila-unica/use-desfecho";
import { MODO_OBRIGATORIO_KEY, type ItemObrigatorio } from "@/features/modo-obrigatorio/client";
import { useModoObrigatorio } from "@/features/modo-obrigatorio/use-modo-obrigatorio";

/** O item de fundo parado no formato da Fila Única, para reaproveitar o
 *  desfecho de lá (opções por etapa, próximo passo com data, modais). */
export function paraItemFila(i: ItemObrigatorio): FilaUnicaItem {
  const l = i.lead;
  return {
    lead: {
      id: l.id,
      nome: l.nome,
      telefone: l.telefone,
      email: l.email,
      status: l.status,
      temperatura: l.temperatura,
      ultima_interacao: l.ultima_interacao,
      proximo_followup: l.proximo_followup,
      projeto_nome: l.projeto_nome,
      created_at: l.created_at,
      corretor_id: l.corretor_id,
      origem: l.origem,
      renda_informada: l.renda_informada,
      entrada_disponivel: l.entrada_disponivel,
      usa_fgts: l.usa_fgts,
      proxima_acao: l.proxima_acao,
      faixa_mcmv: l.faixa_mcmv,
    },
    bucket: "fundo",
    fonte: "inbox",
    filaInbox: null,
    motivo: i.motivo,
    score: 0,
    tier: "alta",
    diasParado: i.dias_parado,
    proximoPasso: l.proxima_acao,
    prazo: l.proximo_followup,
    vencidoMin: 0,
    venceHoje: false,
    docsPendentes: 0,
    agendamentoId: null,
    visitaEm: null,
    valorEmJogo: null,
  };
}

function toStageLead(i: ItemObrigatorio): StageLead {
  return {
    id: i.lead.id,
    nome: i.lead.nome,
    status: i.lead.status,
    corretor_id: i.lead.corretor_id,
    projeto_id: i.lead.projeto_id,
    projeto_nome: i.lead.projeto_nome,
  };
}

function Rodape({ item }: { item: ItemObrigatorio }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Badge
        variant={item.atrasado ? "destructive" : "secondary"}
        className="text-[11px] font-normal"
      >
        {item.motivo}
      </Badge>
      <LeadProjetoAtalhos leadId={item.lead_id} projetoId={item.projeto_id} />
    </div>
  );
}

function CardFundo({
  item,
  aberto,
  pendente,
  onAbrir,
  onFechar,
  onConfirmar,
}: {
  item: ItemObrigatorio;
  aberto: boolean;
  pendente: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  onConfirmar: (opcao: OpcaoDesfecho, texto: string) => void;
}) {
  const itemFila = paraItemFila(item);
  const telefone = item.lead.telefone.replace(/\D/g, "");
  return (
    <li>
      <Card className={cn(item.atrasado && "border-destructive/50")}>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <Link
                to="/leads/$leadId"
                params={{ leadId: item.lead_id }}
                className="truncate font-medium hover:underline"
              >
                {item.nome}
              </Link>
              <p className="text-sm text-muted-foreground">
                Fundo de funil · {leadStatusLabel(item.status)}
                {item.dias_parado !== null ? ` · ${item.dias_parado} d sem contato` : ""}
                {item.projeto_nome ? ` · ${item.projeto_nome}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {telefone.length >= 10 && (
                <Button asChild size="sm" variant="outline">
                  <a href={`tel:${telefone}`}>
                    <Phone size={16} weight="bold" /> Ligar
                  </a>
                </Button>
              )}
              <Button size="sm" onClick={aberto ? onFechar : onAbrir}>
                <CheckCircle size={16} weight="bold" /> Registrar o que aconteceu
              </Button>
            </div>
          </div>
          <FilaDesfecho
            item={itemFila}
            desfecho={desfechoPara(itemFila)}
            aberto={aberto}
            onFechar={onFechar}
            onConfirmar={onConfirmar}
            pendente={pendente}
          />
        </CardContent>
        <div className="border-t px-4 py-2">
          <Rodape item={item} />
        </div>
      </Card>
    </li>
  );
}

export function ObrigatorioPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const modo = useModoObrigatorio();
  const { templates, ligacao, whatsapp, invalidar } = useAcoesCadencia();
  const [respondendo, setRespondendo] = useState<CadenciaItem | null>(null);
  const [desfechoAberto, setDesfechoAberto] = useState<string | null>(null);
  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);

  const invalidarModo = () => {
    void qc.invalidateQueries({ queryKey: [MODO_OBRIGATORIO_KEY] });
  };
  const desfecho = useDesfecho({
    onRegistrado: () => {
      setDesfechoAberto(null);
      invalidarModo();
    },
  });

  const onDesfecho = (item: ItemObrigatorio, opcao: OpcaoDesfecho, texto: string) => {
    // Mesma regra da Fila Única: etapa com formulário vai para o modal da
    // casa; a perda pede motivo. O resto grava aqui.
    if (opcao.etapa?.kind === "modal") {
      setModalState({ modal: opcao.etapa.modal, lead: toStageLead(item) });
      return;
    }
    if (opcao.etapa?.kind === "perdido") {
      setPerdidoLead(toStageLead(item));
      return;
    }
    desfecho.registrar({ item: paraItemFila(item), opcao, texto });
  };

  if (modo.isLoading || !modo.data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Carregando o processo">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const m = modo.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Processo obrigatório"
        description={
          m.travado
            ? "O CRM libera quando esta lista zerar. Lead novo sempre primeiro."
            : "Sua lista de trabalho obrigatória, na ordem do processo."
        }
      />

      {m.travado && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <LockSimple className="mt-0.5 h-5 w-5 shrink-0 text-warning" weight="bold" />
          <div>
            <strong className="text-foreground">
              {m.total} pendência{m.total === 1 ? "" : "s"} obrigatória
              {m.total === 1 ? "" : "s"}.
            </strong>{" "}
            Enquanto a lista não zerar, o CRM mostra só esta tela, a ficha destes clientes e os
            projetos para consulta.
          </div>
        </div>
      )}
      {!m.travado && m.liberado_hoje && m.total > 0 && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          A gestão liberou seu CRM hoje. As pendências continuam aqui.
        </p>
      )}

      {m.total === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title="Processo concluído"
          description="Nenhuma pendência obrigatória agora. Se um lead novo chegar, ele aparece aqui na hora."
          className="py-16"
          action={
            <Button onClick={() => void navigate({ to: "/fila" })}>
              Ir para a Fila <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {m.itens.map((item) =>
            item.tipo === "cadencia" && item.cadencia ? (
              <LinhaDaFila
                key={item.lead_id}
                item={item.cadencia}
                template={templates.data?.[item.cadencia.etapa]}
                ligando={ligacao.isPending}
                enviando={whatsapp.isPending}
                onLigou={(resultado) => ligacao.mutate({ lead: item.cadencia!, resultado })}
                onEnviouWhatsApp={(templateId) =>
                  whatsapp.mutate({ lead: item.cadencia!, templateId })
                }
                onRespondeu={() => setRespondendo(item.cadencia)}
                rodape={<Rodape item={item} />}
              />
            ) : (
              <CardFundo
                key={item.lead_id}
                item={item}
                aberto={desfechoAberto === item.lead_id}
                pendente={desfecho.pendente === item.lead_id}
                onAbrir={() => setDesfechoAberto(item.lead_id)}
                onFechar={() => setDesfechoAberto(null)}
                onConfirmar={(opcao, texto) => onDesfecho(item, opcao, texto)}
              />
            ),
          )}
        </ul>
      )}

      <DialogRespondeu
        item={respondendo}
        onClose={() => setRespondendo(null)}
        onSalvo={() => {
          setRespondendo(null);
          invalidar();
        }}
      />

      <LeadStageModals
        modalState={modalState}
        onModalOpenChange={(open) => !open && setModalState(null)}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(open) => !open && setPerdidoLead(null)}
        onDone={invalidarModo}
      />
    </div>
  );
}

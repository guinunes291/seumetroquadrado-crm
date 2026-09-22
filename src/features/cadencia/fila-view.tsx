// Fila do Dia da cadência — a única lista que o corretor abre para trabalhar
// lead novo: quem vence hoje ou já venceu, na ordem que o processo manda
// (atrasado primeiro, depois D1 antes de D2 antes de D3, depois maior renda).
//
// Três botões e nada além deles. Não existe "marcar etapa como feita": a
// etapa só anda com tentativa registrada, e quem a faz andar é o motor no
// banco. Dar ao corretor um botão de concluir etapa devolveria a
// autodeclaração que a validação dos 100% existe para eliminar.

import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  carregarTemplates,
  fetchFilaCadencia,
  marcarRespondeu,
  registrarLigacao,
  registrarWhatsApp,
  type CadenciaItem,
  type ResultadoLigacao,
} from "@/features/cadencia/client";
import {
  acaoPrimaria,
  aplicarPlaceholders,
  linkWhatsApp,
  rotuloProgresso,
} from "@/features/cadencia/templates";
import { ArrowSquareOut, CheckCircle, Envelope, Phone, WhatsappLogo } from "@phosphor-icons/react";

const RESULTADOS: Array<{ valor: ResultadoLigacao; rotulo: string }> = [
  { valor: "nao_atendeu", rotulo: "Não atendeu" },
  { valor: "caixa_postal", rotulo: "Caixa postal" },
  { valor: "ocupado", rotulo: "Ocupado" },
  { valor: "atendeu", rotulo: "Atendeu" },
  { valor: "numero_invalido", rotulo: "Número inválido (encerra o lead)" },
];

export function FilaCadenciaView() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [respondendo, setRespondendo] = useState<CadenciaItem | null>(null);

  const fila = useQuery({
    queryKey: ["cadencia:fila", user?.id],
    queryFn: () => fetchFilaCadencia(),
    enabled: Boolean(user?.id),
  });

  const templates = useQuery({
    queryKey: ["cadencia:templates"],
    queryFn: carregarTemplates,
    // Os textos mudam por decisão de operação, não por interação: cache longo
    // evita reler as três linhas a cada abertura da fila.
    staleTime: 10 * 60 * 1000,
  });

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ["cadencia:fila"] });
  };

  const ligacao = useMutation({
    mutationFn: ({ lead, resultado }: { lead: CadenciaItem; resultado: ResultadoLigacao }) =>
      registrarLigacao(lead.id, resultado),
    onSuccess: (res) => {
      if (res.encerrado) {
        toast.success("Lead encerrado por número inválido.");
      } else if (res.etapa_completa) {
        toast.success(`Etapa ${res.etapa} completa — o motor avança o lead em instantes.`);
      } else {
        toast.success("Ligação registrada.");
      }
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const whatsapp = useMutation({
    mutationFn: ({ lead, templateId }: { lead: CadenciaItem; templateId: string | null }) =>
      registrarWhatsApp(lead.id, templateId),
    onSuccess: (res) => {
      toast.success(
        res.etapa_completa
          ? `Etapa ${res.etapa} completa — o lead sai da fila de hoje.`
          : "WhatsApp registrado.",
      );
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (fila.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Carregando a fila">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (fila.isError) {
    return <QueryErrorState error={fila.error as Error} onRetry={() => void fila.refetch()} />;
  }

  const itens = fila.data?.itens ?? [];

  if (itens.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle}
        title="Nada vencendo hoje"
        description="Sua cadência está em dia. Leads cujo prazo é de amanhã em diante aparecem aqui no dia certo — não antes."
        className="py-16"
      />
    );
  }

  const atrasados = itens.filter((i) => i.atrasado).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{itens.length}</strong> para hoje
        </span>
        {atrasados > 0 && (
          <Badge variant="destructive">
            {atrasados} atrasado{atrasados > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <ul className="space-y-3">
        {itens.map((item) => (
          <LinhaDaFila
            key={item.id}
            item={item}
            template={templates.data?.[item.etapa]}
            ligando={ligacao.isPending}
            enviando={whatsapp.isPending}
            onLigou={(resultado) => ligacao.mutate({ lead: item, resultado })}
            onEnviouWhatsApp={(templateId) => whatsapp.mutate({ lead: item, templateId })}
            onRespondeu={() => setRespondendo(item)}
          />
        ))}
      </ul>

      <DialogRespondeu
        item={respondendo}
        onClose={() => setRespondendo(null)}
        onSalvo={() => {
          setRespondendo(null);
          invalidar();
        }}
      />
    </div>
  );
}

function LinhaDaFila({
  item,
  template,
  ligando,
  enviando,
  onLigou,
  onEnviouWhatsApp,
  onRespondeu,
}: {
  item: CadenciaItem;
  template?: { id: string; conteudo: string };
  ligando: boolean;
  enviando: boolean;
  onLigou: (resultado: ResultadoLigacao) => void;
  onEnviouWhatsApp: (templateId: string | null) => void;
  onRespondeu: () => void;
}) {
  const primaria = acaoPrimaria(item);

  const link = useMemo(() => {
    if (!template) return null;
    const texto = aplicarPlaceholders(template.conteudo, {
      nome: item.nome,
      empreendimento: item.projeto_nome,
    });
    return linkWhatsApp(item.telefone, texto);
  }, [template, item.nome, item.projeto_nome, item.telefone]);

  // Abre a conversa e SÓ ENTÃO registra: se o wa.me não abrir (bloqueio de
  // pop-up), a tentativa não é gravada. Gravar antes de abrir contaria uma
  // mensagem que o cliente nunca recebeu — e essa mentira entraria na conta
  // dos 100% que manda o lead para a reativação.
  const enviarWhatsApp = () => {
    if (!link) return;
    const aba = window.open(link, "_blank", "noopener,noreferrer");
    if (!aba) {
      toast.error("O navegador bloqueou a janela do WhatsApp. Libere os pop-ups e tente de novo.");
      return;
    }
    onEnviouWhatsApp(template?.id ?? null);
  };

  return (
    <li>
      <Card className={cn(item.atrasado && "border-destructive/50")}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/leads/$leadId"
                params={{ leadId: item.id }}
                className="truncate font-medium hover:underline"
              >
                {item.nome}
              </Link>
              {item.reativado && <Badge variant="secondary">Reativado</Badge>}
              {item.atrasado && <Badge variant="destructive">Atrasado</Badge>}
              {item.telefone_suspeito && (
                <Badge variant="outline" className="gap-1">
                  <Envelope size={12} weight="bold" /> Só e-mail
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {rotuloProgresso(item)}
              {item.projeto_nome ? ` · ${item.projeto_nome}` : ""}
              {item.faixa_mcmv ? ` · Faixa ${item.faixa_mcmv}` : ""}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {item.telefone_suspeito ? (
              // Telefone suspeito não ganha botão de contato: gastar a cadência
              // num número que não existe enche a base de reativação de lixo.
              <span className="text-xs text-muted-foreground">
                Telefone suspeito — contate por e-mail
              </span>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant={primaria === "ligar" ? "default" : "outline"}
                      disabled={ligando}
                    >
                      <Phone size={16} weight="bold" /> Liguei
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {RESULTADOS.map((r) => (
                      <DropdownMenuItem key={r.valor} onSelect={() => onLigou(r.valor)}>
                        {r.rotulo}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  size="sm"
                  variant={primaria === "whatsapp" ? "default" : "outline"}
                  disabled={enviando || !link}
                  onClick={enviarWhatsApp}
                  title={link ? undefined : "Sem template ativo ou telefone inválido"}
                >
                  <WhatsappLogo size={16} weight="bold" /> Mandar WhatsApp
                  <ArrowSquareOut size={12} />
                </Button>
              </>
            )}

            <Button size="sm" variant="secondary" onClick={onRespondeu}>
              <CheckCircle size={16} weight="bold" /> Cliente respondeu
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

/**
 * "Cliente respondeu" abre pedindo o passo combinado E a data.
 *
 * Os dois são obrigatórios (a RPC recusa sem eles). É de propósito: o lead
 * sai da cadência aqui, e sair sem próximo passo com data é exatamente como
 * nasceram os leads parados que este projeto veio resolver.
 */
function DialogRespondeu({
  item,
  onClose,
  onSalvo,
}: {
  item: CadenciaItem | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [acao, setAcao] = useState("");
  const [data, setData] = useState("");

  const salvar = useMutation({
    mutationFn: () => {
      if (!item) throw new Error("sem lead");
      return marcarRespondeu(item.id, acao, new Date(data));
    },
    onSuccess: () => {
      toast.success("Lead na qualificação, com o próximo passo agendado.");
      setAcao("");
      setData("");
      onSalvo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dataValida = Boolean(data) && new Date(data).getTime() > Date.now();
  const podeSalvar = acao.trim().length > 0 && dataValida && !salvar.isPending;

  return (
    <Dialog open={Boolean(item)} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cliente respondeu</DialogTitle>
          <DialogDescription>
            O lead sai da cadência e vai para a qualificação. Combine o próximo passo com data — ele
            volta a aparecer na sua fila quando chegar o dia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cadencia-acao">Próximo passo combinado</Label>
            <Input
              id="cadencia-acao"
              value={acao}
              onChange={(e) => setAcao(e.target.value)}
              placeholder="Ex.: ligar quinta 18h, visita sábado 10h, enviar documentos"
              maxLength={500}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cadencia-data">Quando</Label>
            <Input
              id="cadencia-data"
              type="datetime-local"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
            {data && !dataValida && (
              <p className="text-xs text-destructive">A data precisa estar no futuro.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!podeSalvar} onClick={() => salvar.mutate()}>
            Salvar e qualificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

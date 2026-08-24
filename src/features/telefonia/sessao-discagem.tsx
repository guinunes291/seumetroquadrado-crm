// Sessão de discagem: "Iniciar agora" monta a fila SEMPRE da base do próprio
// corretor com a régua fixa da operação — leads em AGUARDANDO ATENDIMENTO ou
// com FOLLOW-UP VENCIDO (proximo_followup no passado, status ativo) — sem
// contato há mais tempo primeiro, nunca opt-out/lixeira/sem telefone — e
// entrega ao DISCADOR AUTOMÁTICO do Sonax (edge function sonax-campanha): o
// PABX disca a fila sozinho, descarta caixa postal e SÓ conecta ao ramal quem
// atende — o fluxo segue até a fila acabar ou o corretor parar. As chamadas
// conectadas chegam pelo webhook (origem campanha) e aparecem no
// histórico/timeline em tempo real.
//
// Alternativa "um a um" (click-to-call sequencial) para quem ainda não tem
// campanha/atendente configurados no PABX: disca cada lead no ramal e o
// próprio corretor avança — nada de discagem em massa paralela.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronRight,
  Pencil,
  Phone,
  PhoneForwarded,
  Play,
  Square,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import { useAuth } from "@/hooks/use-auth";
import { codigoDoErro, useLigarLead } from "@/hooks/use-ligar-lead";
import { supabase } from "@/integrations/supabase/client";
import { formatRelativeTime } from "@/lib/interacoes";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads";
import { formatPhoneBR } from "@/lib/masks";

type LeadFila = {
  id: string;
  nome: string;
  telefone: string;
  status: LeadStatus;
  corretor_id: string | null;
  projeto_nome: string | null;
  ultima_interacao: string | null;
  proximo_followup: string | null;
};

// Etapas que não fazem sentido numa fila de discagem ativa.
const ETAPAS_FORA_DA_FILA = "(perdido,contrato_fechado,pos_venda)";

const ERRO_CAMPANHA: Record<string, string> = {
  campanha_nao_configurada:
    "Sua campanha do discador ainda não foi configurada (Gestão → Corretores → PABX). Enquanto isso, use o modo um a um.",
  campanha_compartilhada:
    "Esta campanha do Sonax está cadastrada para mais de um corretor — cada corretor precisa da própria campanha (crie no painel do Sonax e ajuste em Gestão → Corretores → PABX).",
  ramal_nao_configurado:
    "Seu ramal não está cadastrado (Gestão → Corretores → PABX) — sem ele o discador não tem para onde entregar as chamadas.",
  sonax_nao_configurado: "A integração com o Sonax ainda não foi configurada (secrets).",
  nenhum_lead_discavel: "Nenhum lead da fila tem telefone válido para discar.",
  sonax_recusou: "O Sonax recusou a fila — confira a campanha no painel do PABX.",
  account_inactive: "Sua conta está inativa.",
};

export function SessaoDiscagem() {
  const { user } = useAuth();
  const { ligar, discando } = useLigarLead();

  const [quantidade, setQuantidade] = useState("25");
  // Modo automático (campanha do discador) em andamento.
  const [campanhaAtiva, setCampanhaAtiva] = useState<{ enviados: number; falhas: number } | null>(
    null,
  );
  // Modo um a um (click-to-call sequencial).
  const [autoDiscar, setAutoDiscar] = useState(true);
  const [fila, setFila] = useState<LeadFila[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [registrarAberto, setRegistrarAberto] = useState(false);

  // Fila única para os dois modos, com a régua fixa da operação: a base do
  // PRÓPRIO corretor que precisa de ligação agora — status "Aguardando
  // atendimento" (fila de entrada) OU follow-up vencido (proximo_followup no
  // passado, em etapa ativa). Sem opt-out, sem lixeira, telefone válido; quem
  // está há mais tempo sem contato primeiro.
  async function montarFila(): Promise<LeadFila[]> {
    if (!user) throw new Error("Sessão expirada — entre de novo.");
    const alvo = Number(quantidade);
    const agora = new Date().toISOString();
    // Margem de 2x: leads com telefone inválido caem no filtro do cliente.
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, nome, telefone, status, corretor_id, projeto_nome, ultima_interacao, proximo_followup",
      )
      .eq("corretor_id", user.id)
      .eq("na_lixeira", false)
      .is("deleted_at", null)
      .eq("opt_out", false)
      .or(
        `status.eq.aguardando_atendimento,and(proximo_followup.lt.${agora},status.not.in.${ETAPAS_FORA_DA_FILA})`,
      )
      .order("ultima_interacao", { ascending: true, nullsFirst: true })
      .limit(alvo * 2);
    if (error) throw error;
    return ((data ?? []) as LeadFila[])
      .filter((l) => (l.telefone ?? "").replace(/\D/g, "").length >= 10)
      .slice(0, alvo);
  }

  // ---- Modo automático: campanha do discador --------------------------------
  const iniciarDiscador = useMutation({
    mutationFn: async () => {
      const leads = await montarFila();
      if (leads.length === 0)
        throw Object.assign(new Error("fila_vazia"), { codigo: "fila_vazia" });
      const { data, error } = await supabase.functions.invoke("sonax-campanha", {
        body: { acao: "iniciar", lead_ids: leads.map((l) => l.id) },
      });
      if (error) {
        const codigo = await codigoDoErro(error);
        throw Object.assign(new Error(codigo ?? error.message), { codigo });
      }
      return data as { enviados: number; falhas: number };
    },
    onSuccess: (r) => {
      setCampanhaAtiva({ enviados: r.enviados, falhas: r.falhas ?? 0 });
      toast.success(
        `Discador rodando: ${r.enviados} lead${r.enviados > 1 ? "s" : ""} na fila. Quem atender toca no seu ramal.`,
      );
    },
    onError: (e) => {
      const codigo = (e as { codigo?: string | null }).codigo ?? null;
      if (codigo === "fila_vazia") {
        toast.info("Nenhum lead da sua carteira para discar com esses critérios.");
        return;
      }
      toast.error(
        (codigo && ERRO_CAMPANHA[codigo]) || `Não foi possível iniciar o discador (${e.message}).`,
      );
    },
  });

  const pararDiscador = useMutation({
    mutationFn: async () => {
      // limpar=true: além de pausar, esvazia o que sobrou da fila — a próxima
      // sessão começa do zero, sem restos da anterior.
      const { data, error } = await supabase.functions.invoke("sonax-campanha", {
        body: { acao: "parar", limpar: true },
      });
      if (error) {
        const codigo = await codigoDoErro(error);
        throw Object.assign(new Error(codigo ?? error.message), { codigo });
      }
      return data;
    },
    onSuccess: () => {
      setCampanhaAtiva(null);
      toast.success("Discador parado — a fila restante foi limpa.");
    },
    onError: (e) => {
      const codigo = (e as { codigo?: string | null }).codigo ?? null;
      toast.error(
        (codigo && ERRO_CAMPANHA[codigo]) || `Não foi possível parar o discador (${e.message}).`,
      );
    },
  });

  // ---- Modo um a um ---------------------------------------------------------
  const iniciarManual = useMutation({
    mutationFn: montarFila,
    onSuccess: (leads) => {
      if (leads.length === 0) {
        toast.info("Nenhum lead da sua carteira para discar com esses critérios.");
        return;
      }
      setFila(leads);
      setIndice(0);
      toast.success(`Sessão iniciada: ${leads.length} lead${leads.length > 1 ? "s" : ""} na fila.`);
      if (autoDiscar) ligar(leads[0]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leadAtual = fila?.[indice] ?? null;
  const encerrarManual = () => {
    setFila(null);
    setIndice(0);
    setRegistrarAberto(false);
  };
  const avancar = () => {
    if (!fila) return;
    const prox = indice + 1;
    if (prox >= fila.length) {
      toast.success("Fila concluída — todos os leads da sessão foram trabalhados. 🎉");
      encerrarManual();
      return;
    }
    setIndice(prox);
    if (autoDiscar) ligar(fila[prox]);
  };

  // ---- Discador automático rodando ------------------------------------------
  if (campanhaAtiva) {
    return (
      <Card className="border-primary/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
              </span>
              Discador rodando — {campanhaAtiva.enviados} lead
              {campanhaAtiva.enviados > 1 ? "s" : ""} na fila
              {campanhaAtiva.falhas > 0 ? ` (${campanhaAtiva.falhas} recusados)` : ""}
            </span>
            <Button
              size="sm"
              variant="destructive"
              disabled={pararDiscador.isPending}
              onClick={() => pararDiscador.mutate()}
            >
              <Square className="h-3.5 w-3.5 mr-1.5" />
              {pararDiscador.isPending ? "Parando…" : "Parar discador"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>
            O PABX está ligando para a fila sozinho e descartando caixa postal —{" "}
            <strong className="text-foreground">só quem atende toca no seu ramal</strong>, um de
            cada vez, até a fila acabar.
          </p>
          <p>
            Cada conexão aparece no histórico abaixo e na timeline do lead em tempo real. Deixe seu
            ramal livre para receber.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ---- Sessão um a um ativa: cockpit do lead atual --------------------------
  if (fila && leadAtual) {
    return (
      <Card className="border-primary/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" /> Discagem um a um —{" "}
              <span className="tabular-nums">
                lead {indice + 1} de {fila.length}
              </span>
            </span>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={encerrarManual}>
              <Square className="h-3.5 w-3.5 mr-1.5" /> Encerrar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              to="/leads/$leadId"
              params={{ leadId: leadAtual.id }}
              className="font-display text-lg font-semibold text-primary hover:underline"
            >
              {leadAtual.nome}
            </Link>
            <span className="tabular-nums text-muted-foreground">
              {formatPhoneBR(leadAtual.telefone)}
            </span>
            <Badge variant="secondary">{LEAD_STATUS_LABEL[leadAtual.status]}</Badge>
            {leadAtual.proximo_followup && new Date(leadAtual.proximo_followup) < new Date() && (
              <Badge variant="destructive">Follow-up vencido</Badge>
            )}
            {leadAtual.projeto_nome && (
              <span className="text-sm text-muted-foreground">{leadAtual.projeto_nome}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {leadAtual.ultima_interacao
                ? `Último contato ${formatRelativeTime(leadAtual.ultima_interacao)}`
                : "Nunca contatado"}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={discando} onClick={() => ligar(leadAtual)}>
              <Phone className="h-4 w-4 mr-2" /> {autoDiscar ? "Ligar de novo" : "Ligar"}
            </Button>
            <Button variant="outline" onClick={() => setRegistrarAberto(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Registrar resultado
            </Button>
            <Button variant="outline" onClick={avancar}>
              {indice + 1 >= fila.length ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Concluir sessão
                </>
              ) : (
                <>
                  Próximo <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {autoDiscar
              ? "Ao avançar, o próximo lead é discado automaticamente no seu ramal."
              : "Ao avançar, use o botão Ligar para discar o próximo lead."}
          </p>
        </CardContent>

        {/* Registrar resultado reaproveita o fluxo padrão (interação +
            follow-up) e, ao concluir, já avança a fila — menos cliques. */}
        <RegistrarContatoDialog
          open={registrarAberto}
          onOpenChange={setRegistrarAberto}
          lead={{ id: leadAtual.id, nome: leadAtual.nome, corretor_id: leadAtual.corretor_id }}
          defaultTipo="ligacao"
          onDone={avancar}
        />
      </Card>
    );
  }

  // ---- Estado parado: configuração + Iniciar agora --------------------------
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <PhoneForwarded className="h-4 w-4 text-primary" /> Sessão de discagem
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          A fila é sempre a sua base que precisa de ligação agora:{" "}
          <strong>leads em Aguardando atendimento</strong> e{" "}
          <strong>leads com follow-up vencido</strong> — quem está há mais tempo sem contato entra
          primeiro. O discador liga sozinho e <strong>conecta você só com quem atende</strong>.
          Leads com opt-out ficam de fora automaticamente.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Quantidade</Label>
            <Select value={quantidade} onValueChange={setQuantidade}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["10", "25", "50"].map((n) => (
                  <SelectItem key={n} value={n}>
                    {n} leads
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="bg-gradient-gold text-navy-900 hover:opacity-90"
            disabled={iniciarDiscador.isPending || iniciarManual.isPending}
            onClick={() => iniciarDiscador.mutate()}
          >
            <Play className="h-4 w-4 mr-2" />
            {iniciarDiscador.isPending ? "Montando fila…" : "Iniciar agora"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            Sem campanha configurada no PABX? Disque a mesma fila um a um pelo seu ramal:
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={iniciarDiscador.isPending || iniciarManual.isPending}
            onClick={() => iniciarManual.mutate()}
          >
            <Phone className="h-3.5 w-3.5 mr-1.5" />
            {iniciarManual.isPending ? "Montando fila…" : "Discar um a um"}
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={autoDiscar} onCheckedChange={(c) => setAutoDiscar(c === true)} />
            Discar automático ao avançar
          </label>
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => pararDiscador.mutate()}
            disabled={pararDiscador.isPending}
          >
            Parar campanha em andamento
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

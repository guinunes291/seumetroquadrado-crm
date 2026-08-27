// Sessão de discagem: "Iniciar agora" liga o DISCADOR AUTOMÁTICO do Sonax
// sobre o POOL DO CRM — toda a base em AGUARDANDO ATENDIMENTO, não só a
// carteira do corretor. A fila é montada NO SERVIDOR (sonax-campanha), que
// reserva cada lote (anti-colisão entre corretores), enfileira na campanha e
// dá play: o PABX disca sozinho, descarta caixa postal e SÓ conecta ao ramal
// quem atende. Quem atende aparece no pop-up com a ficha; a TABULAÇÃO de
// interesse no Sonax é que move o lead para a carteira do corretor
// (sonax-tabulacoes) — sem interesse/descartado não entra na base ativa.
//
// Alternativa "um a um" (click-to-call sequencial) para quem ainda não tem
// campanha/atendente configurados no PABX: disca a PRÓPRIA carteira
// (Aguardando atendimento + follow-up vencido) no ramal e o corretor avança.

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

  // Modo automático (campanha do discador) em andamento.
  const [campanhaAtiva, setCampanhaAtiva] = useState<{ enviados: number; falhas: number } | null>(
    null,
  );
  // Progresso do enfileiramento em lotes (base grande = vários lotes de 100).
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  // Modo um a um (click-to-call sequencial).
  const [autoDiscar, setAutoDiscar] = useState(true);
  const [fila, setFila] = useState<LeadFila[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [registrarAberto, setRegistrarAberto] = useState(false);

  // Fila do modo UM A UM (click-to-call na própria carteira): base completa
  // do corretor em "Aguardando atendimento" OU com follow-up vencido
  // (proximo_followup no passado, em etapa ativa). Sem teto de quantidade:
  // pagina o banco até o fim (PostgREST devolve no máx. 1000 por request).
  // Sem opt-out, sem lixeira, telefone válido; quem está há mais tempo sem
  // contato primeiro. (O modo automático NÃO usa esta fila — o pool é
  // montado no servidor pela sonax-campanha.)
  const PAGINA = 1000;
  async function montarFila(): Promise<LeadFila[]> {
    if (!user) throw new Error("Sessão expirada — entre de novo.");
    const agora = new Date().toISOString();
    const todos: LeadFila[] = [];
    for (let de = 0; ; de += PAGINA) {
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
        .range(de, de + PAGINA - 1);
      if (error) throw error;
      todos.push(...((data ?? []) as LeadFila[]));
      if ((data ?? []).length < PAGINA) break;
    }
    return todos.filter((l) => (l.telefone ?? "").replace(/\D/g, "").length >= 10);
  }

  // ---- Modo automático: campanha do discador sobre o POOL do CRM ------------
  // A fila é montada NO SERVIDOR (toda a base em Aguardando atendimento, com
  // reserva anti-colisão). O front só pilota o laço: 1º lote com acao=iniciar
  // (higiene + login + play), os seguintes com acao=adicionar, até o pool
  // zerar (restante_pool) ou o teto de segurança de lotes.
  const MAX_LOTES = 50;
  const iniciarDiscador = useMutation({
    mutationFn: async () => {
      let enviados = 0;
      let falhas = 0;
      let playDetalhe: string | null = null;
      try {
        for (let lote = 0; lote < MAX_LOTES; lote++) {
          const { data, error } = await supabase.functions.invoke("sonax-campanha", {
            body: { acao: lote === 0 ? "iniciar" : "adicionar" },
          });
          if (error) {
            const codigo = await codigoDoErro(error);
            // Falha no 1º lote = nada começou (erro de verdade). Nos
            // seguintes, o que já entrou continua discando — encerra o laço
            // e reporta o que foi.
            if (lote === 0) throw Object.assign(new Error(codigo ?? error.message), { codigo });
            break;
          }
          const r = data as {
            enviados?: number;
            falhas?: number;
            play?: string;
            restante_pool?: number;
          };
          enviados += r.enviados ?? 0;
          falhas += r.falhas ?? 0;
          // O play do 1º lote é o que LIGA o discador de fato: falha aqui
          // significa "enfileirou mas não está discando" — engolir isso
          // deixaria o corretor esperando um PABX mudo.
          if (lote === 0 && typeof r.play === "string" && r.play !== "ok") playDetalhe = r.play;
          const restante = r.restante_pool ?? 0;
          setProgresso({ feito: enviados, total: enviados + restante });
          if (restante <= 0) break;
        }
      } finally {
        setProgresso(null);
      }
      return { enviados, falhas, playDetalhe };
    },
    onSuccess: (r) => {
      setCampanhaAtiva({ enviados: r.enviados, falhas: r.falhas ?? 0 });
      if (r.playDetalhe) {
        toast.warning(
          `A fila entrou na campanha (${r.enviados} lead${r.enviados > 1 ? "s" : ""}), mas o Sonax não confirmou o play (${r.playDetalhe}). Sem o play o PABX não disca — confira a campanha no painel do Sonax.`,
          { duration: 15_000 },
        );
        return;
      }
      toast.success(
        `Discador rodando: ${r.enviados} lead${r.enviados > 1 ? "s" : ""} na fila. Quem atender toca no seu ramal.`,
      );
    },
    onError: (e) => {
      const codigo = (e as { codigo?: string | null }).codigo ?? null;
      if (codigo === "pool_vazio") {
        toast.info("Nenhum lead em Aguardando atendimento disponível na base agora.");
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
          A fila é <strong>toda a base do CRM em Aguardando atendimento</strong> — sem limite de
          quantidade, quem espera há mais tempo entra primeiro, e cada lead é reservado para um
          corretor por vez (sem colisão). O discador liga sozinho e{" "}
          <strong>conecta você só com quem atende</strong>: a ficha aparece na sua tela e, com{" "}
          <strong>tabulação de interesse</strong> no Sonax, o lead entra na sua carteira
          automaticamente — sem interesse ou descartado, não entra. Opt-out fica de fora sempre.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Button
            className="bg-gradient-gold text-navy-900 hover:opacity-90"
            disabled={iniciarDiscador.isPending || iniciarManual.isPending}
            onClick={() => iniciarDiscador.mutate()}
          >
            <Play className="h-4 w-4 mr-2" />
            {iniciarDiscador.isPending
              ? progresso
                ? `Enfileirando ${progresso.feito}/${progresso.total}…`
                : "Montando fila…"
              : "Iniciar agora"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            Sem campanha configurada no PABX? Disque a SUA carteira um a um pelo seu ramal
            (Aguardando atendimento + follow-up vencido):
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

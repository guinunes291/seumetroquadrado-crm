// Sessão de discagem sobre o BOLSÃO: a fila do discador é tudo que está fora
// da carteira ativa dos corretores — a base SEM dono (modelo em três camadas:
// carteira ativa → Reserva → Bolsão, docs/ops/bolsao-oportunidades-fatia4.md).
// Os mais frios primeiro, sem opt-out, sem quem está com o SDR, sem quem foi
// discado há pouco e sem quem o próprio corretor devolveu há pouco.
//
// A fila NÃO nasce aqui. O navegador não lê (nem deve ler) o telefone de um
// lead que não é do corretor: a edge function tcplus-campanha reserva o lote
// no servidor (RPC discador_bolsao_reservar_v1), sobe a lista para a campanha
// do 3C Plus e loga o agente; esta tela só lê a própria sessão, anonimizada
// (bolsao_discagem_minha_v1: telefone mascarado). Quem ATENDE entra na
// carteira de quem falou (webhook → discador_bolsao_assumir_v1) — só então o
// registro de resultado libera, porque só então a RLS deixa.
//
// Dois modos, uma fila: "Iniciar agora" (o 3C Plus disca a lista sozinho e
// entrega ao webphone quem atende) e "um a um" (click-to-call sequencial,
// para quem prefere ouvir chamando). Os dois sobrevivem a recarregar a
// página: a sessão vive no banco, não no estado do React.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarCheck,
  CaretRight,
  CheckCircle,
  PencilSimple,
  Phone,
  PhoneTransfer,
  Play,
  Plus,
  Square,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import { useAuth } from "@/hooks/use-auth";
import { erroDaFunction, useLigarLead } from "@/hooks/use-ligar-lead";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads";
import { NotaAtendidoDialog, useAssumirAtendido } from "./atendidos-discador";
import {
  DISCAGEM_KEY,
  indiceInicial,
  resumoDiscagem,
  useMinhaDiscagem,
  type LinhaDiscagem,
} from "./bolsao-discagem-client";

const ERRO_CAMPANHA: Record<string, string> = {
  campanha_nao_configurada:
    "Sua campanha do discador ainda não foi configurada (Gestão → Corretores → Discador).",
  campanha_compartilhada:
    "Esta campanha do 3C Plus está cadastrada para mais de um corretor — cada corretor precisa da própria campanha (crie no 3C Plus e ajuste em Gestão → Corretores → Discador).",
  token_nao_configurado:
    "Seu 3C Plus ainda não está conectado — cole seu token de agente no card 'Meu 3C Plus' desta aba.",
  tcplus_token_invalido:
    "O 3C Plus recusou seu token de agente — gere um novo no 3C Plus e cole no card 'Meu 3C Plus'.",
  tcplus_token_gestor_invalido:
    "O 3C Plus recusou o token do gestor (secret TCPLUS_API_TOKEN) — avise o admin.",
  tcplus_nao_configurado: "A integração com o 3C Plus ainda não foi configurada (secrets).",
  tcplus_indisponivel: "O 3C Plus não respondeu — tente de novo em instantes.",
  bolsao_vazio:
    "O Bolsão não tem lead discável agora: tudo que está sem dono foi discado há pouco, está com o SDR ou está reservado por outro corretor.",
  reserva_falhou: "Não foi possível reservar a fila no Bolsão.",
  tcplus_recusou: "O 3C Plus recusou a lista — confira a campanha no painel do 3C Plus.",
  account_inactive: "Sua conta está inativa.",
};

type RespostaCampanha = {
  list_id?: string;
  reservados?: number;
  enviados?: number;
  filtrados?: number;
  login?: string | null;
};

async function invocarCampanha(body: Record<string, unknown>): Promise<RespostaCampanha> {
  const { data, error } = await supabase.functions.invoke("tcplus-campanha", { body });
  if (error) {
    const { codigo, detalhe } = await erroDaFunction(error);
    throw Object.assign(new Error(codigo ?? error.message), { codigo, detalhe });
  }
  return (data ?? {}) as RespostaCampanha;
}

function mensagemDeErro(e: unknown, prefixo: string): string {
  const { codigo = null, detalhe = null } = e as {
    codigo?: string | null;
    detalhe?: string | null;
  };
  const base =
    (codigo && ERRO_CAMPANHA[codigo]) || `${prefixo} (${(e as Error).message ?? "erro"}).`;
  return detalhe ? `${base} (${detalhe})` : base;
}

export function SessaoDiscagem() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { ligar, discando } = useLigarLead();

  // A sessão vive no banco: reservas de campanha OU de um a um, anonimizadas.
  const sessaoQ = useMinhaDiscagem();
  useRealtimeInvalidate("chamadas", [[DISCAGEM_KEY]], {
    enabled: !!user,
    filter: user ? `corretor_id=eq.${user.id}` : undefined,
    debounceMs: 500,
  });
  const linhas = sessaoQ.data ?? [];
  const campanha = linhas.filter((l) => l.modo === "campanha");
  const umAUm = linhas.filter((l) => l.modo === "um_a_um");
  const indisponivel = sessaoQ.data === null;

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: [DISCAGEM_KEY] });
    qc.invalidateQueries({ queryKey: ["chamadas:discador"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
  };

  // ---- Modo automático: campanha do discador --------------------------------
  const iniciarDiscador = useMutation({
    mutationFn: () => invocarCampanha({ acao: "iniciar" }),
    onSuccess: (r) => {
      invalidar();
      const n = r.enviados ?? r.reservados ?? 0;
      if (typeof r.login === "string" && r.login !== "ok") {
        // O login do agente é o que LIGA o discador de fato: falha aqui
        // significa "a lista subiu mas ninguém vai receber" — engolir isso
        // deixaria o corretor esperando um discador mudo.
        toast.warning(
          `A fila do Bolsão subiu para a campanha (${n} lead${n === 1 ? "" : "s"}), mas o 3C Plus não confirmou o login do seu agente (${r.login}). Sem o login o discador não entrega chamadas — entre na campanha pelo webphone do 3C Plus.`,
          { duration: 15_000 },
        );
        return;
      }
      toast.success(
        `Discador rodando: ${n} lead${n === 1 ? "" : "s"} do Bolsão na fila${
          (r.filtrados ?? 0) > 0 ? ` (${r.filtrados} filtrados pelo 3C Plus)` : ""
        }. Quem atender cai no seu webphone e na sua aba Atendidos.`,
      );
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Não foi possível iniciar o discador")),
  });

  const adicionarMais = useMutation({
    mutationFn: (listId: string) => invocarCampanha({ acao: "adicionar", list_id: listId }),
    onSuccess: (r) => {
      invalidar();
      toast.success(`Mais ${r.enviados ?? r.reservados ?? 0} leads do Bolsão entraram na fila.`);
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Não foi possível adicionar leads")),
  });

  const pararDiscador = useMutation({
    // limpar=true: além de deslogar o agente, apaga as listas que o CRM subiu
    // nesta campanha e solta as reservas — a próxima sessão começa do zero.
    mutationFn: () => invocarCampanha({ acao: "parar", limpar: true }),
    onSuccess: () => {
      invalidar();
      toast.success(
        "Discador parado — seu agente foi deslogado e a fila restante voltou ao Bolsão.",
      );
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Não foi possível parar o discador")),
  });

  // ---- Modo um a um ---------------------------------------------------------
  const [autoDiscar, setAutoDiscar] = useState(true);
  const [discarAoMontar, setDiscarAoMontar] = useState(false);
  const [indice, setIndice] = useState(0);
  const [registrarAberto, setRegistrarAberto] = useState(false);
  const [notaAberta, setNotaAberta] = useState(false);
  const assumir = useAssumirAtendido();

  const iniciarUmAUm = useMutation({
    mutationFn: () => invocarCampanha({ acao: "reservar" }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: [DISCAGEM_KEY] });
      setIndice(0);
      toast.success(
        `Sessão iniciada: ${r.reservados ?? 0} lead${(r.reservados ?? 0) === 1 ? "" : "s"} do Bolsão reservados para você.`,
      );
    },
    onError: (e) => {
      // Reserva falhou: a flag de "discar ao montar" não pode sobreviver
      // para a próxima sessão.
      setDiscarAoMontar(false);
      toast.error(mensagemDeErro(e, "Não foi possível montar a fila"));
    },
  });

  const encerrarUmAUm = useMutation({
    mutationFn: () => invocarCampanha({ acao: "liberar" }),
    onSuccess: () => {
      setRegistrarAberto(false);
      setIndice(0);
      invalidar();
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Não foi possível encerrar a sessão")),
  });

  // Ao (re)carregar a sessão, o cockpit aponta para o primeiro lead ainda não
  // discado — não para o começo da lista.
  const chaveSessao = umAUm.map((l) => l.lead_id).join(",");
  useEffect(() => {
    if (umAUm.length === 0) return;
    setIndice((atual) => (atual < umAUm.length ? atual : indiceInicial(umAUm)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveSessao]);

  // O 1º disco automático do um a um: quando a sessão acabou de ser montada.
  useEffect(() => {
    if (!discarAoMontar || umAUm.length === 0) return;
    setDiscarAoMontar(false);
    const primeiro = umAUm[indiceInicial(umAUm)];
    if (primeiro) ligar({ id: primeiro.lead_id, nome: primeiro.nome, telefone: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discarAoMontar, chaveSessao]);

  const leadAtual: LinhaDiscagem | null = umAUm[indice] ?? null;
  const avancar = () => {
    const prox = indice + 1;
    if (prox >= umAUm.length) {
      toast.success("Fila concluída — todos os leads da sessão foram trabalhados. 🎉");
      encerrarUmAUm.mutate();
      return;
    }
    setIndice(prox);
    const prox_lead = umAUm[prox];
    if (autoDiscar && prox_lead)
      ligar({ id: prox_lead.lead_id, nome: prox_lead.nome, telefone: null });
  };

  if (indisponivel) {
    return (
      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="p-4 text-sm">
          A sessão de discagem depende da migration do discador sobre o Bolsão (
          <code>bolsao_discagem</code>), ainda não aplicada neste ambiente.
        </CardContent>
      </Card>
    );
  }

  // ---- Discador automático rodando ------------------------------------------
  if (campanha.length > 0) {
    const r = resumoDiscagem(campanha);
    const listId = campanha[0]?.list_id ?? null;
    return (
      <Card className="border-primary/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
              </span>
              Discador rodando no Bolsão —{" "}
              <span className="tabular-nums">
                {r.total} na fila · {r.discados} discados · {r.atendidos} atenderam · {r.naCarteira}{" "}
                na sua carteira
              </span>
            </span>
            <span className="flex flex-wrap gap-2">
              {listId && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={adicionarMais.isPending}
                  onClick={() => adicionarMais.mutate(listId)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {adicionarMais.isPending ? "Reservando…" : "Mais leads"}
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                disabled={pararDiscador.isPending}
                onClick={() => pararDiscador.mutate()}
              >
                <Square className="h-3.5 w-3.5 mr-1.5" />
                {pararDiscador.isPending ? "Parando…" : "Parar discador"}
              </Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>
            O 3C Plus está ligando para leads sem dono, os mais frios primeiro —{" "}
            <strong className="text-foreground">só quem atende cai no seu webphone</strong>, e quem
            atende entra na sua carteira. Qualifique cada chamada no 3C Plus: a qualificação move o
            lead de etapa aqui.
          </p>
          <p>
            Cada conexão aparece no histórico abaixo e na timeline do lead em tempo real. Deixe o
            webphone do 3C Plus aberto e logado para receber.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ---- Sessão um a um ativa: cockpit do lead atual --------------------------
  if (leadAtual) {
    // Posse só vem com o avanço de fase; atender vira "atendido" (sem posse).
    const naCarteira = !!leadAtual.assumido_em;
    const atendeu = leadAtual.atendido;
    return (
      <Card className="border-primary/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" /> Discagem um a um (Bolsão) —{" "}
              <span className="tabular-nums">
                lead {indice + 1} de {umAUm.length}
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={encerrarUmAUm.isPending}
              onClick={() => encerrarUmAUm.mutate()}
            >
              <Square className="h-3.5 w-3.5 mr-1.5" /> Encerrar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {naCarteira ? (
              <Link
                to="/leads/$leadId"
                params={{ leadId: leadAtual.lead_id }}
                className="font-display text-lg font-semibold text-primary hover:underline"
              >
                {leadAtual.nome}
              </Link>
            ) : (
              <span className="font-display text-lg font-semibold">{leadAtual.nome}</span>
            )}
            {/* Telefone mascarado por desenho: a discagem passa pelo CRM. */}
            <span className="tabular-nums text-muted-foreground">
              {leadAtual.telefone_mascarado ?? "—"}
            </span>
            <Badge variant="secondary">
              {LEAD_STATUS_LABEL[leadAtual.status as LeadStatus] ?? leadAtual.status}
            </Badge>
            {leadAtual.projeto_nome && (
              <span className="text-sm text-muted-foreground">{leadAtual.projeto_nome}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {leadAtual.dias_parado > 0
                ? `Parado há ${leadAtual.dias_parado} dia${leadAtual.dias_parado === 1 ? "" : "s"}`
                : "Tocado hoje"}
            </span>
            {atendeu && <Badge variant="default">Atendeu</Badge>}
            {naCarteira && <Badge variant="outline">Na sua carteira</Badge>}
            {!atendeu && leadAtual.discado && <Badge variant="outline">Já discado</Badge>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={discando}
              onClick={() => ligar({ id: leadAtual.lead_id, nome: leadAtual.nome, telefone: null })}
            >
              <Phone className="h-4 w-4 mr-2" /> {leadAtual.discado ? "Ligar de novo" : "Ligar"}
            </Button>
            {naCarteira ? (
              <Button variant="outline" onClick={() => setRegistrarAberto(true)}>
                <PencilSimple className="h-4 w-4 mr-2" /> Registrar resultado
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  disabled={!atendeu}
                  title={
                    atendeu
                      ? "Nota na timeline do cliente, sem assumir o lead."
                      : "Libera quando o cliente atender."
                  }
                  onClick={() => setNotaAberta(true)}
                >
                  <PencilSimple className="h-4 w-4 mr-2" /> Registrar contato
                </Button>
                <Button
                  variant="outline"
                  disabled={!atendeu || assumir.isPending}
                  title={
                    atendeu
                      ? "O lead entra na sua carteira; a visita é agendada no dossiê."
                      : "Libera quando o cliente atender."
                  }
                  onClick={() => assumir.mutate(leadAtual.lead_id)}
                >
                  <CalendarCheck className="h-4 w-4 mr-2" /> Assumir e agendar
                </Button>
              </>
            )}
            <Button variant="outline" onClick={avancar}>
              {indice + 1 >= umAUm.length ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" /> Concluir sessão
                </>
              ) : (
                <>
                  Próximo <CaretRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {naCarteira
              ? "O lead já é seu. Registre o resultado e siga."
              : atendeu
                ? "Atendeu: ele entrou na sua aba Atendidos, mas continua no Bolsão até alguém avançar de fase. Registre o contato ou assuma para agendar."
                : autoDiscar
                  ? "Ao avançar, o próximo lead é discado automaticamente pelo seu agente no 3C Plus. Quem não atende volta ao Bolsão."
                  : "Ao avançar, use o botão Ligar para discar o próximo lead. Quem não atende volta ao Bolsão."}
          </p>
        </CardContent>

        {/* Registrar resultado reaproveita o fluxo padrão (interação +
            follow-up) e, ao concluir, já avança a fila — só quando o lead é
            do corretor (RLS). Sem posse, a nota vai pela RPC dos atendidos. */}
        {naCarteira && user && (
          <RegistrarContatoDialog
            open={registrarAberto}
            onOpenChange={setRegistrarAberto}
            lead={{ id: leadAtual.lead_id, nome: leadAtual.nome, corretor_id: user.id }}
            defaultTipo="ligacao"
            onDone={avancar}
          />
        )}
        <NotaAtendidoDialog
          lead={{ id: leadAtual.lead_id, nome: leadAtual.nome }}
          open={notaAberta}
          onOpenChange={setNotaAberta}
          onDone={avancar}
        />
      </Card>
    );
  }

  // ---- Estado parado: explicação + Iniciar agora ----------------------------
  const ocupado = iniciarDiscador.isPending || iniciarUmAUm.isPending || sessaoQ.isLoading;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <PhoneTransfer className="h-4 w-4 text-primary" /> Sessão de discagem
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          A fila do discador é o <strong>Bolsão</strong>: tudo que está fora da carteira ativa dos
          corretores — leads sem dono, os mais frios primeiro. Ficam de fora quem pediu para não ser
          contatado, quem está com o SDR, quem foi discado há pouco e quem você mesmo devolveu há
          pouco. O discador liga sozinho, <strong>conecta você só com quem atende</strong>, e quem
          atende entra na sua carteira.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Button disabled={ocupado} onClick={() => iniciarDiscador.mutate()}>
            <Play className="h-4 w-4 mr-2" />
            {iniciarDiscador.isPending ? "Reservando a fila…" : "Iniciar agora"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            Prefere ouvir chamando? Disque a mesma fila um a um pelo seu agente:
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={ocupado}
            onClick={() => {
              setDiscarAoMontar(autoDiscar);
              iniciarUmAUm.mutate();
            }}
          >
            <Phone className="h-3.5 w-3.5 mr-1.5" />
            {iniciarUmAUm.isPending ? "Reservando…" : "Discar um a um"}
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

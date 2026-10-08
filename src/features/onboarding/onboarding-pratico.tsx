// Onboarding PRÁTICO do corretor: passo a passo com cliques obrigatórios em
// telas de treino (réplicas com clientes fictícios). Nada do que se clica
// aqui mexe em cliente real. Cada ação termina num card "o que faz / o que
// causa". Obrigatório no primeiro acesso: sem fechar até concluir.

import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  HandPointing,
  Info,
  Phone,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ESTADO_INICIAL, clicar, type EstadoPasso } from "@/features/onboarding/pratico";

type AlvoProps = { id: string; children: ReactNode; className?: string; variante?: "botao" | "card" | "chip" };
type Cena = (A: (p: AlvoProps) => ReactNode, alvo: number) => ReactNode;

type Passo = {
  tela: string;
  titulo: string;
  instrucoes: string[]; // uma por clique obrigatório
  sequencia: string[];
  cena: Cena;
  faz: string;
  causa: string;
  cuidado?: string;
};

// ---------------------------------------------------------------------------
// Peças das telas de treino
// ---------------------------------------------------------------------------

function Moldura({ tela, children }: { tela: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-gold" />
        {tela}
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          Treino
        </span>
      </div>
      <div className="space-y-3 p-3 sm:p-4">{children}</div>
    </div>
  );
}

function Cliente({ nome, linha, etapa }: { nome: string; linha: string; etapa: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="font-medium text-foreground">{nome}</p>
        <p className="text-xs text-muted-foreground">{linha}</p>
      </div>
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
        {etapa}
      </span>
    </div>
  );
}

function Linha({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

// ---------------------------------------------------------------------------
// Os passos
// ---------------------------------------------------------------------------

const PASSOS: Passo[] = [
  {
    tela: "Central de Comando › Fila Única",
    titulo: "Abra o primeiro card da fila",
    instrucoes: ["A fila escolhe por você. Clique no primeiro card: Dona Maria, que acabou de chegar."],
    sequencia: ["card_maria"],
    cena: (A) => (
      <>
        <p className="text-xs text-muted-foreground">Chegaram agora · relógio correndo</p>
        <A id="card_maria" variante="card">
          <Cliente nome="Dona Maria (fictícia)" linha="Facebook · MK2 Estação Dom Bosco" etapa="Aguardando atendimento" />
          <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
            <Clock className="h-3.5 w-3.5" /> 12 min para o repasse
          </p>
        </A>
        <div className="rounded-lg border border-border-subtle p-3 opacity-60">
          <Cliente nome="Carlos (fictício)" linha="Indicação · Parque Vila Sônia" etapa="Em atendimento" />
        </div>
      </>
    ),
    faz: "Abre o cliente mais urgente. A Fila Única ordena por dinheiro em risco: fundo do funil parado, quem acabou de chegar, quem respondeu e espera.",
    causa: "Você não perde tempo escolhendo. Pular cards deixa o relógio do lead novo correndo.",
  },
  {
    tela: "Ficha do cliente › Dona Maria",
    titulo: "Ligue para a cliente",
    instrucoes: ["Clique em Ligar."],
    sequencia: ["ligar"],
    cena: (A) => (
      <>
        <Cliente nome="Dona Maria (fictícia)" linha="Renda R$ 4.800 · FGTS sim" etapa="Aguardando atendimento" />
        <Linha>
          <A id="ligar"><Phone className="h-4 w-4" /> Ligar</A>
          <A id="whats"><WhatsappLogo className="h-4 w-4" /> WhatsApp</A>
          <A id="reg">Registrar contato</A>
        </Linha>
      </>
    ),
    faz: "Com o 3C Plus conectado, disca e grava a ligação na linha do tempo. Sem ele, abre o discador do celular.",
    causa: "Ligar NÃO registra o resultado e NÃO muda a etapa. O lead continua exposto ao repasse até você registrar.",
  },
  {
    tela: "Ficha › Registrar contato",
    titulo: "Ela não atendeu: registre",
    instrucoes: [
      "O diálogo pode vir com “Atendeu” marcado. Troque para Não atendeu.",
      "Agora clique em Registrar.",
    ],
    sequencia: ["nao_atendeu", "registrar"],
    cena: (A, alvo) => (
      <>
        <p className="text-xs text-muted-foreground">Canal: Ligação · Resultado:</p>
        <Linha>
          <span className={cn("rounded-full border px-3 py-1 text-sm", alvo === 0 ? "border-gold bg-gold/10" : "border-border opacity-60")}>
            Atendeu
          </span>
          <A id="nao_atendeu" variante="chip">Não atendeu</A>
          <A id="sem_interesse" variante="chip">Sem interesse</A>
        </Linha>
        <A id="registrar">Registrar</A>
      </>
    ),
    faz: "Grava a tentativa e move a cliente para Aguardando retorno: você tentou, agora a vez é dela.",
    causa: "Tira a cliente do repasse de 15 minutos e de 24 horas e conta como lead trabalhado.",
    cuidado: "Confirmar sem conferir o resultado põe o cliente em Em atendimento como se tivesse respondido.",
  },
  {
    tela: "Ficha › Registrar contato",
    titulo: "Ela retornou e conversou com você",
    instrucoes: ["Marque Atendeu.", "Escolha o próximo passo: Amanhã.", "Clique em Registrar."],
    sequencia: ["atendeu", "amanha", "registrar"],
    cena: (A) => (
      <>
        <p className="text-xs text-muted-foreground">Canal: Ligação · Resultado:</p>
        <Linha>
          <A id="atendeu" variante="chip">Atendeu</A>
          <A id="nao" variante="chip">Não atendeu</A>
        </Linha>
        <p className="text-xs text-muted-foreground">Próximo passo:</p>
        <Linha>
          <A id="hoje" variante="chip">Hoje</A>
          <A id="amanha" variante="chip">Amanhã</A>
          <A id="2d" variante="chip">Em 2 dias</A>
        </Linha>
        <A id="registrar">Registrar</A>
      </>
    ),
    faz: "Grava a conversa, cria a tarefa do próximo passo com data e põe a cliente em Em atendimento SOZINHO.",
    causa: "Em atendimento não se escolhe à mão: entra quando o cliente responde. Ocupa uma das suas 65 vagas.",
  },
  {
    tela: "Ficha › Desfechos de Em atendimento",
    titulo: "Ela topou visitar: Agendou",
    instrucoes: [
      "Convite em duas opções. Ela escolheu sábado de manhã. Clique em Agendou.",
      "Escolha Sábado 10h.",
      "Clique em Confirmar agendamento.",
    ],
    sequencia: ["agendou", "sab10", "confirmar"],
    cena: (A, alvo) => (
      <>
        <Linha>
          <A id="agendou">Agendou</A>
          <A id="retorno">Pediu retorno</A>
          <A id="esfriou">Esfriou</A>
          <A id="doc">Mandou doc</A>
          <A id="perdido">Perdido</A>
        </Linha>
        {alvo >= 1 && (
          <div className="space-y-2 rounded-lg border border-border-subtle p-3">
            <p className="text-xs text-muted-foreground">Visita · MK2 Estação Dom Bosco · estande</p>
            <Linha>
              <A id="sab10" variante="chip">Sábado 10h</A>
              <A id="sab15" variante="chip">Sábado 15h</A>
            </Linha>
            <A id="confirmar">Confirmar agendamento</A>
          </div>
        )}
      </>
    ),
    faz: "Cria a visita, move a cliente para Agendado e cria a tarefa “Confirmar visita” na véspera, com prioridade alta.",
    causa: "Tira a cliente da cadência, programa os lembretes de 48 h, 24 h e 10 h e soma 100 pontos no ranking.",
  },
  {
    tela: "Ficha do Carlos › Desfechos",
    titulo: "Carlos pediu para falar na sexta",
    instrucoes: ["Clique em Pediu retorno.", "Escolha a data: Sexta.", "Clique em Salvar."],
    sequencia: ["retorno", "sexta", "salvar"],
    cena: (A, alvo) => (
      <>
        <Cliente nome="Carlos (fictício)" linha="Indicação · Parque Vila Sônia" etapa="Em atendimento" />
        <Linha>
          <A id="agendou">Agendou</A>
          <A id="retorno">Pediu retorno</A>
          <A id="esfriou">Esfriou</A>
          <A id="doc">Mandou doc</A>
          <A id="perdido">Perdido</A>
        </Linha>
        {alvo >= 1 && (
          <Linha>
            <A id="amanha" variante="chip">Amanhã</A>
            <A id="sexta" variante="chip">Sexta</A>
            <A id="salvar">Salvar</A>
          </Linha>
        )}
      </>
    ),
    faz: "Move para Aguardando retorno, protegido até a data combinada + 2 dias, e cria a tarefa “Retornar como combinado” às 9h.",
    causa: "Libera a vaga dos 65 sem perder o cliente. Retorno acima de 30 dias vira perda “Retorno futuro”.",
  },
  {
    tela: "Ficha da Juliana › Desfechos",
    titulo: "Juliana sumiu, mas vale tentar",
    instrucoes: ["Clique em Esfriou.", "Aceite a sugestão de 7 dias e clique em Salvar."],
    sequencia: ["esfriou", "salvar"],
    cena: (A, alvo) => (
      <>
        <Cliente nome="Juliana (fictícia)" linha="Site · Longitude Estação Tucuruvi" etapa="Em atendimento" />
        <Linha>
          <A id="agendou">Agendou</A>
          <A id="retorno">Pediu retorno</A>
          <A id="esfriou">Esfriou</A>
          <A id="doc">Mandou doc</A>
          <A id="perdido">Perdido</A>
        </Linha>
        {alvo >= 1 && (
          <Linha>
            <span className="rounded-full border border-border px-3 py-1 text-sm">Em 7 dias</span>
            <A id="salvar">Salvar</A>
          </Linha>
        )}
      </>
    ),
    faz: "Move para Aguardando retorno com temperatura fria e cria a tarefa “Retomar o contato”.",
    causa: "É o “agora não” honesto. Não use Esfriou só para abrir vaga: retorno longo entra na revisão da gestão.",
  },
  {
    tela: "Ficha do Carlos › Desfechos",
    titulo: "Carlos mandou os documentos",
    instrucoes: ["Clique em Mandou doc.", "Situação: Enviada. Clique em Enviar para análise."],
    sequencia: ["doc", "enviar"],
    cena: (A, alvo) => (
      <>
        <Linha>
          <A id="agendou">Agendou</A>
          <A id="retorno">Pediu retorno</A>
          <A id="esfriou">Esfriou</A>
          <A id="doc">Mandou doc</A>
          <A id="perdido">Perdido</A>
        </Linha>
        {alvo >= 1 && <A id="enviar">Enviar para análise</A>}
      </>
    ),
    faz: "Move o cliente para Análise de crédito e cria a tarefa “Cobrar retorno do crédito” em 3 dias.",
    causa: "Primeira entrada em análise no mês soma 400 pontos. A resposta do banco vai no card da análise, com a carta.",
  },
  {
    tela: "Ficha › Desfechos",
    titulo: "Um cliente disse “não” definitivo",
    instrucoes: ["Clique em Perdido.", "Escolha o motivo: Comprou em outro lugar.", "Leia o aviso e clique em Confirmar perda."],
    sequencia: ["perdido", "motivo", "confirmar"],
    cena: (A, alvo) => (
      <>
        <Linha>
          <A id="agendou">Agendou</A>
          <A id="retorno">Pediu retorno</A>
          <A id="esfriou">Esfriou</A>
          <A id="doc">Mandou doc</A>
          <A id="perdido">Perdido</A>
        </Linha>
        {alvo >= 1 && (
          <div className="space-y-2 rounded-lg border border-border-subtle p-3">
            <Linha>
              <A id="motivo" variante="chip">Comprou em outro lugar</A>
              <A id="m2" variante="chip">Sem renda</A>
              <A id="m3" variante="chip">Outro</A>
            </Linha>
            {alvo >= 2 && (
              <>
                <p className="text-xs text-destructive">Aviso: o cliente será oferecido a outro corretor.</p>
                <A id="confirmar">Confirmar perda</A>
              </>
            )}
          </div>
        )}
      </>
    ),
    faz: "Exige um dos 11 motivos, carimba a data da perda e cancela as tarefas de contato abertas.",
    causa: "Hoje o Perdido OFERECE O CLIENTE A OUTRO CORRETOR. Para “agora não”, use Esfriou com data.",
  },
  {
    tela: "Portal › Seu dia",
    titulo: "Véspera: confirme a visita",
    instrucoes: ["Dona Maria confirmou pelo WhatsApp. Clique em Confirmar no card Seu dia."],
    sequencia: ["confirmar"],
    cena: (A) => (
      <div className="rounded-lg border border-border-subtle p-3">
        <p className="text-xs text-muted-foreground">Seu dia · amanhã</p>
        <Cliente nome="10:00 · Dona Maria (fictícia)" linha="Visita · MK2 Estação Dom Bosco" etapa="Agendado" />
        <Linha>
          <A id="whats"><WhatsappLogo className="h-4 w-4" /> Mensagem</A>
          <A id="confirmar">Confirmar</A>
        </Linha>
      </div>
    ),
    faz: "Marca a visita como confirmada e fecha a tarefa “Confirmar visita”.",
    causa: "Mantém o “vencidos = 0” do fim do dia. O Confirmar da Fila Única não fecha a tarefa: use sempre o Seu dia.",
  },
  {
    tela: "Portal › Seu dia",
    titulo: "Dia da visita: valide",
    instrucoes: ["Ela veio. Clique em Realizada.", "Interesse: Alto. Clique em Salvar resultado."],
    sequencia: ["realizada", "salvar"],
    cena: (A, alvo) => (
      <div className="space-y-2 rounded-lg border border-border-subtle p-3">
        <Cliente nome="10:00 · Dona Maria (fictícia)" linha="Visita · MK2 Estação Dom Bosco" etapa="Agendado" />
        <Linha>
          <A id="realizada">Realizada</A>
          <A id="naoveio">Não veio</A>
        </Linha>
        {alvo >= 1 && (
          <>
            <p className="text-xs text-muted-foreground">Interesse: Alto · Objeção: entrada · Próximo contato: amanhã 10h</p>
            <A id="salvar">Salvar resultado</A>
          </>
        )}
      </div>
    ),
    faz: "Registra a visita no dia em que aconteceu, com interesse, objeção, etapa e cria a tarefa de pós-visita.",
    causa: "Visita realizada soma 250 pontos. Não veio pede novo horário; em lead da pré-venda, devolve ao SDR.",
  },
  {
    tela: "Prospecção › Modo Foco",
    titulo: "Peça um lote de 30 da sua zona",
    instrucoes: ["Escolha a zona Leste (só aparecem as zonas liberadas para você).", "Clique em Pedir lote."],
    sequencia: ["leste", "pedir"],
    cena: (A) => (
      <>
        <p className="text-sm text-foreground">Carteira: 41 de 65 · nenhum lote em cadência</p>
        <Linha>
          <A id="leste" variante="chip">Zona Leste</A>
          <A id="sul" variante="chip">Zona Sul</A>
        </Linha>
        <A id="pedir">Pedir lote</A>
      </>
    ),
    faz: "Entrega até 30 clientes sem dono do Bolsão daquela zona, direto na sua cadência D+3.",
    causa: "O que vence na cadência volta ao Bolsão. Peça de manhã, nunca na sexta. Com carteira cheia ou lote em cadência, o botão trava.",
  },
  {
    tela: "Topo de qualquer tela › Registrar venda",
    titulo: "Carlos assinou: registre a venda",
    instrucoes: ["Clique em Registrar venda.", "Confira VGV, unidade, data de assinatura e os marcos. Clique em Enviar para aprovação."],
    sequencia: ["registrar", "enviar"],
    cena: (A, alvo) => (
      <>
        <A id="registrar">Registrar venda</A>
        {alvo >= 1 && (
          <div className="space-y-1 rounded-lg border border-border-subtle p-3 text-xs text-muted-foreground">
            <p>Parque Vila Sônia · Unidade 304 · VGV R$ 289.900 · assinatura hoje</p>
            <p>☑ Contrato assinado · ☑ Ato pago · ☐ Apto para repasse</p>
            <div className="pt-1">
              <A id="enviar">Enviar para aprovação</A>
            </div>
          </div>
        )}
      </>
    ),
    faz: "Lança a venda como PENDENTE para a gestão aprovar.",
    causa: "O cliente só vira Venda quando a gestão aprova; aí sua comissão nasce e entram 1.000 pontos. Conta no mês da data de assinatura.",
  },
  {
    tela: "Fila Única › Placar",
    titulo: "Feche o dia com os dois zeros",
    instrucoes: ["Vencidos 0 e sem próximo passo 0. Clique em Fechar o dia."],
    sequencia: ["fechar"],
    cena: (A) => (
      <>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border-subtle p-3 text-center">
            <p className="font-display text-2xl text-foreground">0</p>
            <p className="text-xs text-muted-foreground">Follow-ups vencidos</p>
          </div>
          <div className="rounded-lg border border-border-subtle p-3 text-center">
            <p className="font-display text-2xl text-foreground">0</p>
            <p className="text-xs text-muted-foreground">Sem próximo passo</p>
          </div>
        </div>
        <A id="fechar">Fechar o dia</A>
      </>
    ),
    faz: "Confirma que nenhum cliente ficou sem porta: todo mundo tem próximo passo com data, agendamento ou perda com motivo.",
    causa: "É a regra que mantém a sua carteira: cliente sem toque e sem passo volta para a roleta ou para o Bolsão.",
  },
];

// ---------------------------------------------------------------------------
// Diálogo
// ---------------------------------------------------------------------------

export function OnboardingPratico({
  open,
  obrigatorio,
  onConcluir,
  onFechar,
}: {
  open: boolean;
  /** Primeiro acesso: não deixa fechar até concluir. */
  obrigatorio: boolean;
  onConcluir: () => void;
  onFechar: () => void;
}) {
  const [indice, setIndice] = useState(0);
  const [estado, setEstado] = useState<EstadoPasso>(ESTADO_INICIAL);
  const passo = PASSOS[indice];
  const ultimo = indice === PASSOS.length - 1;

  const A = ({ id, children, className, variante = "botao" }: AlvoProps) => {
    const ativo = !estado.feito && passo.sequencia[estado.alvo] === id;
    const jaFeito = passo.sequencia.slice(0, estado.alvo).includes(id);
    return (
      <button
        type="button"
        onClick={() => setEstado((e) => clicar(e, passo.sequencia, id))}
        className={cn(
          "relative inline-flex min-h-10 items-center gap-1.5 text-sm transition",
          variante === "card" && "block w-full rounded-lg border p-3 text-left",
          variante === "chip" && "rounded-full border px-3 py-1",
          variante === "botao" && "rounded-lg border px-3 py-2 font-medium",
          ativo
            ? "animate-pulse border-gold bg-gold/15 text-foreground ring-2 ring-gold ring-offset-2 ring-offset-background"
            : jaFeito
              ? "border-success bg-success/10 text-foreground"
              : "border-border text-muted-foreground opacity-70",
          className,
        )}
      >
        {ativo && variante !== "card" && <HandPointing className="h-4 w-4 text-gold" weight="fill" />}
        {children}
      </button>
    );
  };

  const avancar = () => {
    if (ultimo) {
      onConcluir();
      setIndice(0);
    } else {
      setIndice(indice + 1);
    }
    setEstado(ESTADO_INICIAL);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !obrigatorio) onFechar();
      }}
    >
      <DialogContent
        className={cn(
          "max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto",
          obrigatorio && "[&>button:last-child]:hidden",
        )}
        onEscapeKeyDown={(e) => obrigatorio && e.preventDefault()}
        onInteractOutside={(e) => obrigatorio && e.preventDefault()}
      >
        <div className="space-y-1 pr-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
            Treino prático · ação {indice + 1} de {PASSOS.length}
          </p>
          <DialogTitle className="font-display text-xl">{passo.titulo}</DialogTitle>
          <DialogDescription>
            Clientes fictícios: nada do que você clicar aqui muda a sua carteira.
          </DialogDescription>
        </div>

        <div className="flex gap-1" aria-hidden="true">
          {PASSOS.map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full", i <= indice ? "bg-gradient-gold" : "bg-muted")} />
          ))}
        </div>

        {!estado.feito && (
          <div className="flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm text-foreground">
            <HandPointing className="mt-0.5 h-4 w-4 shrink-0 text-gold" weight="fill" />
            <span>{passo.instrucoes[estado.alvo]}</span>
          </div>
        )}
        {estado.errou && !estado.feito && (
          <p className="text-xs text-destructive">Esse não. Clique no botão destacado em dourado.</p>
        )}

        <Moldura tela={passo.tela}>{passo.cena(A, estado.alvo)}</Moldura>

        {estado.feito && (
          <div className="space-y-2 rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <CheckCircle className="h-5 w-5 text-success" weight="fill" /> Feito. Entenda o que aconteceu:
            </p>
            <p className="text-foreground"><strong>O que faz:</strong> {passo.faz}</p>
            <p className="text-foreground"><strong>O que causa:</strong> {passo.causa}</p>
            {passo.cuidado && (
              <p className="flex items-start gap-1.5 text-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> <span><strong>Cuidado:</strong> {passo.cuidado}</span>
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end border-t border-border-subtle pt-3">
          <Button className="min-h-11" disabled={!estado.feito} onClick={avancar}>
            {ultimo ? "Concluir treino" : "Próxima ação"} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default OnboardingPratico;

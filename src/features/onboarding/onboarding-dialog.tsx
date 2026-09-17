// A trilha de 6 passos do primeiro acesso do corretor.
//
// Regra de ouro: nenhum número é escrito aqui. O passo 4 lê fila_funil_v1 e o
// passo 5 lê metas_dia_taxas pelas mesmas funções que o resto do CRM usa. Se
// o dado não vier, o passo diz "sem dado no momento" e deixa avançar — nunca
// um número de mentira.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowSquareOut, CheckCircle, Circle } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BLOCOS_DO_DIA,
  ONBOARDING_TOTAL_PASSOS,
  ORIGEM_DA_VENDA,
  ORIGEM_DA_VENDA_MEDICAO,
  TELAS_QUE_IMPORTAM,
  gravarPasso,
  lerPasso,
  limparPasso,
  podeConcluir,
  type OnboardingStatus,
} from "@/features/onboarding/onboarding";
import { useConcluirOnboarding } from "@/features/onboarding/use-onboarding";
import { useFilaFunil } from "@/features/fila-unica/use-fila-funil";
import { montarFunil } from "@/features/fila-unica/funil-derive";
import { useTaxasConversao } from "@/features/metas-dia/use-metas-dia";
import {
  contatosNecessarios,
  diaSaoPaulo,
  taxasConversao,
  umACada,
} from "@/features/metas-dia/metas-dia";

function SemDado({ o }: { o: string }) {
  return (
    <p className="rounded-md border border-border-subtle bg-muted/40 p-3 text-sm text-muted-foreground">
      Sem dado no momento ({o}). Pode seguir — o número aparece quando a leitura voltar.
    </p>
  );
}

function Citacao({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="border-l-2 border-gold-500/60 pl-4 text-sm leading-relaxed text-foreground/90 space-y-3">
      {children}
    </blockquote>
  );
}

function Passo1() {
  return (
    <Citacao>
      <p className="font-medium">Você não escolhe o cliente. A fila escolhe.</p>
      <p>
        Num CRM comum você abre uma lista e decide quem chamar. Aqui o sistema decide — e decide
        melhor, porque sabe quantos dias cada cliente está parado, em que etapa está, quanto
        dinheiro está em jogo e quem prometeu voltar quando.
      </p>
      <p>
        Seu trabalho não é escolher. É <strong>executar e registrar</strong>.
      </p>
      <p>
        <strong>A regra que sustenta tudo — as três portas.</strong> Você só sai da ficha de um
        cliente por: <strong>(a)</strong> desfecho registrado, com próximo passo e data;{" "}
        <strong>(b)</strong> agendamento criado — mudar o status não é agendar; <strong>(c)</strong>{" "}
        perdido, com um dos 11 motivos.
        <br />
        <strong>Não existe a porta (d) “fechei a tela”.</strong>
      </p>
    </Citacao>
  );
}

function Passo2() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        O CRM tem dezenas de telas. Você vai viver em cinco. Toque em qualquer linha para abrir numa
        aba nova.
      </p>
      <ul className="space-y-2">
        {TELAS_QUE_IMPORTAM.map((t) => (
          <li key={t.tela}>
            <a
              href={t.to}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-start gap-3 rounded-md border border-border-subtle p-3 text-sm transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.tela}</div>
                <div className="text-muted-foreground">{t.responde}</div>
                <div className="text-xs text-muted-foreground">{t.quando}</div>
              </div>
              <ArrowSquareOut className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
      <Citacao>
        <p>
          <strong>As outras telas existem e são úteis</strong> — Reserva, Bolsão, Discador, Modo
          Visita. Você chega nelas quando a fila do dia acabar. <strong>Nunca antes.</strong>
        </p>
      </Citacao>
    </div>
  );
}

function Passo3() {
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {BLOCOS_DO_DIA.map((b) => (
          <li
            key={b.hora}
            className="flex items-start gap-3 rounded-md border border-border-subtle p-3 text-sm"
          >
            <span className="w-12 shrink-0 tabular-nums font-medium text-gold-300">{b.hora}</span>
            <span className="min-w-0">
              <span className="font-medium">{b.bloco}</span>
              <span className="block text-muted-foreground">{b.oque}</span>
            </span>
          </li>
        ))}
      </ul>
      <Citacao>
        <p>
          <strong>A única interrupção permitida:</strong> lead novo com SLA correndo. São{" "}
          <strong>15 minutos úteis</strong>, e dois estouros no mesmo dia pausam você no lead quente
          até amanhã.
        </p>
      </Citacao>
    </div>
  );
}

function Passo4() {
  const { data, isPending, isError } = useFilaFunil(30, null);
  const leitura = useMemo(() => (data ? montarFunil(data, "base") : null), [data]);

  return (
    <div className="space-y-4">
      {isPending ? (
        <p className="text-sm text-muted-foreground">Carregando os números da casa…</p>
      ) : isError || !leitura || leitura.passagens.length === 0 ? (
        <SemDado o="funil da casa" />
      ) : (
        <ul className="space-y-1.5">
          {leitura.passagens.map((p) => (
            <li
              key={`${p.de}-${p.para}`}
              className="flex items-center gap-3 rounded-md border border-border-subtle px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{p.label}</span>
              <span
                className={cn(
                  "tabular-nums font-medium",
                  p.tom === "good" && "text-success",
                  p.tom === "warn" && "text-warning",
                  p.tom === "crit" && "text-destructive",
                  p.tom === null && "text-muted-foreground",
                )}
              >
                {p.atual === null ? "—" : `${p.atual}%`}
              </span>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                meta {p.meta}%
              </span>
            </li>
          ))}
        </ul>
      )}
      <Citacao>
        <p>
          <strong>Sete das oito passagens da SMQ estão na meta ou acima</strong> — primeiro contato,
          qualificação, comparecimento, pasta, fechamento. A casa <strong>fecha bem</strong>: de
          cada 100 pessoas que visitam, 45 compram.
        </p>
        <p>
          <strong>Uma única passagem trava: transformar conversa em visita.</strong>
        </p>
        <p>É por isso que a frase abaixo vale mais que todo o resto do treinamento:</p>
        <p className="italic">
          “Separei duas opções que cabem na sua renda. Você prefere conhecer{" "}
          <strong>sábado de manhã ou sábado à tarde</strong>?”
        </p>
        <p>Duas opções de horário. Nunca “quer visitar?”.</p>
      </Citacao>
    </div>
  );
}

const CASCATA = [
  "1 VENDA POR SEMANA",
  "análises de crédito",
  "visitas realizadas",
  "agendamentos",
  "conversas",
  "leads trabalhados",
];

function Passo5() {
  const { data, isPending, isError } = useTaxasConversao(true);
  const hoje = diaSaoPaulo();
  const taxas = useMemo(() => taxasConversao(data ?? null, hoje), [data, hoje]);
  // Cálculo reverso com a meta "1 venda por semana" — as demais em zero para
  // não inventar meta de agendamento/documentação para quem acabou de chegar.
  const necessarios = useMemo(
    () =>
      contatosNecessarios(
        { meta_agendamentos: 0, meta_documentacoes: 0, meta_vendas_semana: 1 },
        taxas,
        0,
        hoje,
      ),
    [taxas, hoje],
  );

  return (
    <div className="space-y-4">
      {isPending ? (
        <p className="text-sm text-muted-foreground">Carregando a sua conversão…</p>
      ) : isError || taxas.fonte === null ? (
        <SemDado o="conversão do time" />
      ) : (
        <div className="space-y-2 rounded-md border border-border-subtle p-3 text-sm">
          {taxas.fonte === "time" && (
            <p className="text-xs text-muted-foreground">
              Calculado pela conversão do time, porque você ainda não tem histórico. Em 4 semanas
              passa a ser a sua.
            </p>
          )}
          <ul className="space-y-1">
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">Agendamento</span>
              <span className="tabular-nums">
                {umACada(taxas.agendamento_por_contato) === null
                  ? "—"
                  : `1 a cada ${umACada(taxas.agendamento_por_contato)} contatos`}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">Documentação</span>
              <span className="tabular-nums">
                {umACada(taxas.documentacao_por_contato) === null
                  ? "—"
                  : `1 a cada ${umACada(taxas.documentacao_por_contato)} contatos`}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">Venda</span>
              <span className="tabular-nums">
                {umACada(taxas.venda_por_contato) === null
                  ? "—"
                  : `1 a cada ${umACada(taxas.venda_por_contato)} contatos`}
              </span>
            </li>
            <li className="flex justify-between gap-3 border-t border-border-subtle pt-1 font-medium">
              <span>Para 1 venda por semana</span>
              <span className="tabular-nums">
                {necessarios.vendas === null
                  ? "sem dado"
                  : `${necessarios.vendas} contatos por dia útil`}
              </span>
            </li>
          </ul>
        </div>
      )}

      <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs leading-5">{`1 VENDA POR SEMANA
      ↑
   análises de crédito
      ↑
   visitas realizadas
      ↑
   agendamentos          ← a sua meta diária vive aqui
      ↑
   conversas
      ↑
   leads trabalhados`}</pre>

      <div>
        <p className="mb-2 text-sm font-medium">Onde vem a venda</p>
        <ul className="space-y-1">
          {ORIGEM_DA_VENDA.map((o) => (
            <li
              key={o.origem}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md border border-border-subtle px-3 py-2 text-sm",
                o.destaque && "border-gold-500/50 bg-gold-500/5 font-medium",
              )}
            >
              <span className="min-w-0">{o.origem}</span>
              <span className="shrink-0 tabular-nums">1 venda a cada {o.aCada}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted-foreground">{ORIGEM_DA_VENDA_MEDICAO}</p>
      </div>

      <Citacao>
        <p>
          <strong>É a mesma casa, o mesmo produto e o mesmo CRM. Muda só a origem.</strong>
        </p>
        <p>
          Por isso a meta que decide a sua semana não é quantos leads você tocou. É{" "}
          <strong>quantos clientes você trouxe</strong>: indicação, ex-cliente, porta, parceria, sua
          rede. <strong>Dois por dia útil = 1 venda por semana.</strong>
        </p>
      </Citacao>
    </div>
  );
}

function Passo6({
  status,
  onIrParaFila,
  onConcluir,
  concluindo,
}: {
  status: OnboardingStatus | null;
  onIrParaFila: () => void;
  onConcluir: () => void;
  concluindo: boolean;
}) {
  const pode = podeConcluir(status);
  const jaConcluiu = !!status?.concluido_em;
  return (
    <div className="space-y-4">
      <Citacao>
        <p>
          <strong>Abra a Fila Única e registre o desfecho do primeiro card.</strong>
        </p>
        <p>
          Não escolha. Não pule. Pegue o de cima, ligue ou mande mensagem, e clique em{" "}
          <strong>Registrar</strong>. São 3 a 5 respostas prontas, e tem desfazer de 5 segundos.
        </p>
        <p>
          É o gesto que você vai repetir 20 vezes por dia, todo dia. Faça uma vez agora e o
          onboarding está concluído.
        </p>
      </Citacao>

      {jaConcluiu ? (
        <p className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm">
          <CheckCircle className="h-4 w-4 text-success" weight="fill" />
          Onboarding concluído. Esta trilha fica sempre no menu, em “Como usar o CRM”.
        </p>
      ) : pode ? (
        <p className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm">
          <CheckCircle className="h-4 w-4 text-success" weight="fill" />
          Interação registrada. Pode concluir.
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-md border border-border-subtle bg-muted/40 p-3 text-sm text-muted-foreground">
          <Circle className="h-4 w-4" />
          Ainda sem interação registrada. O onboarding fica pendente até o primeiro desfecho.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={onIrParaFila} className="min-h-11 flex-1">
          Abrir a Fila Única
        </Button>
        <Button
          variant="outline"
          className="min-h-11 flex-1"
          disabled={!pode || concluindo || jaConcluiu}
          loading={concluindo}
          onClick={onConcluir}
        >
          Concluir onboarding
        </Button>
      </div>
    </div>
  );
}

const TITULOS = [
  "Como este CRM funciona",
  "As 5 telas que importam",
  "Seu dia",
  "Os números da casa",
  "Sua meta",
  "Faça agora",
];

export function OnboardingDialog({
  open,
  onOpenChange,
  status,
  uid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  status: OnboardingStatus | null;
  uid: string;
}) {
  const navigate = useNavigate();
  const [passo, setPasso] = useState(() => lerPasso(uid));
  const concluir = useConcluirOnboarding();

  useEffect(() => {
    if (open) gravarPasso(uid, passo);
  }, [open, passo, uid]);

  const ir = (n: number) => setPasso(Math.min(ONBOARDING_TOTAL_PASSOS, Math.max(1, n)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {passo}. {TITULOS[passo - 1]}
          </DialogTitle>
          <DialogDescription>
            Passo {passo} de {ONBOARDING_TOTAL_PASSOS} · dá para fechar e voltar depois
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: ONBOARDING_TOTAL_PASSOS }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full",
                i < passo ? "bg-gradient-gold" : "bg-muted",
              )}
            />
          ))}
        </div>

        <div className="py-2">
          {passo === 1 && <Passo1 />}
          {passo === 2 && <Passo2 />}
          {passo === 3 && <Passo3 />}
          {passo === 4 && <Passo4 />}
          {passo === 5 && <Passo5 />}
          {passo === 6 && (
            <Passo6
              status={status}
              concluindo={concluir.isPending}
              onIrParaFila={() => {
                onOpenChange(false);
                void navigate({ to: "/fila" });
              }}
              onConcluir={() => {
                concluir.mutate(undefined, {
                  onSuccess: (r) => {
                    if (r.ok) {
                      // Concluiu: some da tela e não volta a abrir sozinha.
                      limparPasso(uid);
                      setPasso(1);
                      onOpenChange(false);
                    }
                  },
                });
              }}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={passo === 1}
            onClick={() => ir(passo - 1)}
          >
            Voltar
          </Button>
          {passo < ONBOARDING_TOTAL_PASSOS ? (
            <Button className="min-h-11" onClick={() => ir(passo + 1)}>
              Continuar
            </Button>
          ) : (
            <Button variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default OnboardingDialog;

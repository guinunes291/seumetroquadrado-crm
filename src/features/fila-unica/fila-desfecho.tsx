// O painel "o que aconteceu?" — o desfecho de um toque do mockup aprovado.
// No desktop abre dentro do card (3 a 5 chips, o próximo passo sugerido, a
// etapa quando muda, "Confirmar (1 toque)"); no celular é a folha que sobe de
// baixo, com botões de 44 px em duas colunas e "Perdeu" na linha inteira.
// Só apresentação: quem grava é a página (useDesfecho).

import { useEffect, useState } from "react";
import { Microphone } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { abrirSamiQ, textoRegistrarComSami } from "@/components/samiq/abrir-samiq";
import { leadStatusLabel } from "@/lib/leads";
import { cn } from "@/lib/utils";
import {
  descreverProximo,
  rotuloDaEtapa,
  type Desfecho,
  type OpcaoDesfecho,
} from "@/features/fila-unica/desfecho";
import type { FilaUnicaItem } from "@/features/fila-unica/derive";

export type FilaDesfechoProps = {
  item: FilaUnicaItem;
  desfecho: Desfecho;
  aberto: boolean;
  onFechar: () => void;
  onConfirmar: (opcao: OpcaoDesfecho, texto: string) => void;
  pendente?: boolean;
  agora?: Date;
};

function Opcoes({
  desfecho,
  escolhida,
  onEscolher,
  celular,
}: {
  desfecho: Desfecho;
  escolhida: OpcaoDesfecho | null;
  onEscolher: (o: OpcaoDesfecho) => void;
  celular: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={desfecho.pergunta}
      className={cn(celular ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-1.5")}
    >
      {desfecho.opcoes.map((o) => {
        const ativa = escolhida?.id === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={ativa}
            data-testid="desfecho-opcao"
            onClick={() => onEscolher(o)}
            className={cn(
              "font-semibold transition-colors motion-reduce:transition-none",
              celular
                ? "min-h-11 rounded-lg border px-3 py-2 text-[13px]"
                : "rounded-full border px-3 py-1.5 text-xs",
              ativa
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted",
              celular && o.largo && "col-span-2",
            )}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

function Corpo({
  item,
  desfecho,
  escolhida,
  setEscolhida,
  texto,
  setTexto,
  celular,
  agora,
}: {
  item: FilaUnicaItem;
  desfecho: Desfecho;
  escolhida: OpcaoDesfecho | null;
  setEscolhida: (o: OpcaoDesfecho) => void;
  texto: string;
  setTexto: (t: string) => void;
  celular: boolean;
  agora: Date;
}) {
  const proximo = escolhida ? descreverProximo(escolhida, agora) : null;
  const etapa = escolhida ? rotuloDaEtapa(escolhida) : null;
  return (
    <div className="space-y-3">
      <Opcoes
        desfecho={desfecho}
        escolhida={escolhida}
        onEscolher={setEscolhida}
        celular={celular}
      />
      {escolhida?.pedeTexto && (
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={
            escolhida.pedeTexto === "objecao" ? "Qual foi a objeção?" : "O que ficou combinado?"
          }
          maxLength={200}
          aria-label={escolhida.pedeTexto === "objecao" ? "Objeção" : "Nota"}
          className="h-11 md:h-9"
        />
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          Próximo passo sugerido:{" "}
          <b className="text-foreground" data-testid="desfecho-proximo">
            {proximo ?? "escolha um resultado"}
          </b>
        </span>
        {etapa && (
          <span className="rounded-md border border-dashed px-1.5 py-0.5 text-[11px]">{etapa}</span>
        )}
        <button
          type="button"
          onClick={() =>
            abrirSamiQ({
              leadId: item.lead.id,
              leadNome: item.lead.nome,
              texto: textoRegistrarComSami(item.lead.nome),
              origem: "fila-unica",
            })
          }
          className="inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[11px] hover:bg-muted"
          title="Ditar o desfecho para a Sami"
        >
          <Microphone className="h-3 w-3" />
          pode ditar por voz para a Sami
        </button>
      </div>
    </div>
  );
}

export function FilaDesfecho({
  item,
  desfecho,
  aberto,
  onFechar,
  onConfirmar,
  pendente = false,
  agora,
}: FilaDesfechoProps) {
  const celular = useIsMobile();
  const [escolhida, setEscolhida] = useState<OpcaoDesfecho | null>(null);
  const [texto, setTexto] = useState("");
  const relogio = agora ?? new Date();

  // Fechou: a escolha some — reabrir começa do zero, como no mockup.
  useEffect(() => {
    if (!aberto) {
      setEscolhida(null);
      setTexto("");
    }
  }, [aberto]);

  const confirmar = () => {
    if (!escolhida) return;
    onConfirmar(escolhida, texto);
  };

  const corpo = (
    <Corpo
      item={item}
      desfecho={desfecho}
      escolhida={escolhida}
      setEscolhida={setEscolhida}
      texto={texto}
      setTexto={setTexto}
      celular={celular}
      agora={relogio}
    />
  );

  if (celular) {
    const dias = item.diasParado;
    return (
      <Drawer open={aberto} onOpenChange={(o) => !o && onFechar()}>
        <DrawerContent data-testid="desfecho-folha">
          <DrawerHeader className="text-left">
            <DrawerTitle>{desfecho.pergunta}</DrawerTitle>
            <DrawerDescription>
              {leadStatusLabel(item.lead.status)}
              {dias !== null && ` · ${dias} d parado`}
              {item.lead.projeto_nome && ` · ${item.lead.projeto_nome}`}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">
            {corpo}
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <Button
                className="h-12 text-sm"
                disabled={!escolhida}
                loading={pendente}
                onClick={confirmar}
              >
                Confirmar
              </Button>
              <Button
                variant="outline"
                className="h-12 gap-1.5"
                title="Ditar para a Sami"
                onClick={() =>
                  abrirSamiQ({
                    leadId: item.lead.id,
                    leadNome: item.lead.nome,
                    texto: textoRegistrarComSami(item.lead.nome),
                    origem: "fila-unica",
                  })
                }
              >
                <Microphone className="h-4 w-4" />
                ditar
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (!aberto) return null;
  return (
    <div
      data-testid="desfecho-painel"
      data-peek-ignore
      className="col-span-2 space-y-3 rounded-lg border bg-muted/30 p-3 animate-slide-fade motion-reduce:animate-none"
    >
      <div className="text-[13px] font-semibold">{desfecho.pergunta}</div>
      {corpo}
      <div className="flex justify-end">
        <Button size="sm" disabled={!escolhida} loading={pendente} onClick={confirmar}>
          Confirmar (1 toque)
        </Button>
      </div>
    </div>
  );
}

// Peças visuais da conversa de WhatsApp — usadas pela Central de Mensagens e
// pela aba WhatsApp da ficha do lead (Lote 3): UMA aparência de thread no app
// inteiro, com os mesmos rótulos de status/provedor.

import { PaperPlaneTilt, Robot } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/interacoes";
import { cn } from "@/lib/utils";
import { nomeAgente, type Mensagem } from "./derive";

/** Bolhas da thread (asc): saída à direita, entrada à esquerda. A saída de
 *  um robô (Marquinhos no 4099) leva o nome dele e borda tracejada: o
 *  corretor distingue de relance o que ele mesmo disse do que o robô disse. */
export function BolhasThread({ thread }: { thread: Mensagem[] }) {
  return (
    <>
      {thread.map((m) => {
        const robo = m.direcao === "saida" && m.agente ? nomeAgente(m.agente) : null;
        return (
          <div
            key={m.id}
            className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 text-sm",
              m.direcao !== "saida"
                ? "mr-auto bg-muted"
                : robo
                  ? "ml-auto border border-dashed border-border bg-card"
                  : "ml-auto bg-primary/10",
            )}
          >
            {robo && (
              <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <Robot className="h-3.5 w-3.5" aria-hidden /> {robo}
                {m.devolucao_id ? " · a seu pedido" : " · 4099"}
              </div>
            )}
            <div className="whitespace-pre-wrap break-words">
              {m.conteudo ?? (m.midia_url ? "[mídia]" : "[mensagem]")}
            </div>
            <div className="mt-1 text-right text-[10px] text-muted-foreground">
              {formatRelativeTime(m.criado_em)}
              {m.direcao === "saida" ? ` · ${m.status}` : ""}
              {m.provider === "simulado" ? " · via aparelho" : ""}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Campo de resposta + botão Enviar (modo simulado: registra e abre o wa.me). */
export function ComposerConversa({
  value,
  onChange,
  onEnviar,
  pending,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnviar: () => void;
  pending: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-end gap-2 border-t pt-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escreva a resposta — registra na conversa e abre o WhatsApp com o texto pronto."
        className="min-h-[44px] flex-1 resize-none"
        rows={2}
        aria-label="Mensagem"
      />
      <Button
        onClick={onEnviar}
        disabled={pending || !value.trim() || disabled}
        title="Modo simulado: registra na conversa e abre o WhatsApp com o texto pronto"
      >
        <PaperPlaneTilt className="h-4 w-4" /> Enviar
      </Button>
    </div>
  );
}

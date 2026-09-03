// Peças visuais da conversa de WhatsApp — usadas pela Central de Mensagens e
// pela aba WhatsApp da ficha do lead (Lote 3): UMA aparência de thread no app
// inteiro, com os mesmos rótulos de status/provedor.

import { PaperPlaneTilt } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/interacoes";
import { cn } from "@/lib/utils";
import type { Mensagem } from "./derive";

/** Bolhas da thread (asc): saída à direita, entrada à esquerda. */
export function BolhasThread({ thread }: { thread: Mensagem[] }) {
  return (
    <>
      {thread.map((m) => (
        <div
          key={m.id}
          className={cn(
            "max-w-[85%] rounded-lg px-3 py-2 text-sm",
            m.direcao === "saida" ? "ml-auto bg-primary/10" : "mr-auto bg-muted",
          )}
        >
          <div className="whitespace-pre-wrap break-words">
            {m.conteudo ?? (m.midia_url ? "[mídia]" : "[mensagem]")}
          </div>
          <div className="mt-1 text-right text-[10px] text-muted-foreground">
            {formatRelativeTime(m.criado_em)}
            {m.direcao === "saida" ? ` · ${m.status}` : ""}
            {m.provider === "simulado" ? " · via aparelho" : ""}
          </div>
        </div>
      ))}
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
        title="Registrar na conversa e abrir o WhatsApp"
      >
        <PaperPlaneTilt className="h-4 w-4" /> Enviar
      </Button>
    </div>
  );
}

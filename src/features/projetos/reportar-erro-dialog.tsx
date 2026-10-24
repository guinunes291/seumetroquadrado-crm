// Projetos em Foco — "Reportar erro no cadastro" de um empreendimento.
// Recortado de projetos-foco-page.tsx sem mudança de comportamento.

import { useEffect, useState } from "react";
import { Flag } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { construtoraExibida, type ItemPrateleira } from "@/lib/prateleira";

export function ReportarErroDialog({
  item,
  onClose,
  onEnviar,
}: {
  item: ItemPrateleira | null;
  onClose: () => void;
  onEnviar: (detalhe: string) => void;
}) {
  const [texto, setTexto] = useState("");
  useEffect(() => {
    if (!item) setTexto("");
  }, [item]);
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" aria-hidden="true" />
            Reportar erro no cadastro
          </DialogTitle>
          <DialogDescription>
            {item
              ? `O que está errado em "${item.nome}"${item.construtora ? ` (${construtoraExibida(item)})` : ""}? Preço, metragem, zona, link quebrado…`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="ex.: a tabela está de julho; o preço a partir de já é R$ 259 mil."
          aria-label="Descrição do erro"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onEnviar(texto.trim())} disabled={texto.trim().length < 5}>
            Enviar para a gestão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

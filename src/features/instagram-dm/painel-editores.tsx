// Formulários do painel "DM do Instagram": palavra-chave e roteiro da conversa.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TEXTOS_PADRAO, type TextosConversa } from "@/features/instagram-dm/texto";
import {
  salvarPalavraInstagram,
  salvarTextosInstagram,
  type PainelInstagramDm,
  type PalavraInput,
} from "@/lib/instagram-dm.functions";

import { CHAVE_PAINEL } from "@/features/instagram-dm/chave";
const CHAVE = CHAVE_PAINEL;
const SEM_ROLETA = "__nenhuma__";

export function EditorPalavra({
  inicial,
  roletas,
  onClose,
}: {
  inicial: PalavraInput;
  roletas: PainelInstagramDm["roletas"];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const salvar = useServerFn(salvarPalavraInstagram);
  const [f, setF] = useState<PalavraInput>(inicial);
  const linhas = f.mensagem_abertura.split("\n").length;
  const m = useMutation({
    mutationFn: () => salvar({ data: f }),
    onSuccess: () => {
      toast.success("Palavra-chave salva.");
      void qc.invalidateQueries({ queryKey: CHAVE });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não salvou."),
  });
  const set = <K extends keyof PalavraInput>(k: K, v: PalavraInput[K]) =>
    setF((x) => ({ ...x, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{f.id ? `Editar ${inicial.palavra}` : "Nova palavra-chave"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label htmlFor="pw">Palavra</Label>
            <Input
              id="pw"
              value={f.palavra}
              onChange={(e) => set("palavra", e.target.value)}
              placeholder="SIMULAR"
            />
            <p className="text-xs text-muted-foreground">
              Vale com ou sem acento, maiúscula ou minúscula, no meio da frase (como palavra
              inteira: APÊ não dispara em "apenas").
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="pa" checked={f.ativo} onCheckedChange={(v) => set("ativo", v)} />
            <Label htmlFor="pa">Ativa</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pm">Mensagem de abertura (DM)</Label>
            <Textarea
              id="pm"
              rows={5}
              value={f.mensagem_abertura}
              onChange={(e) => set("mensagem_abertura", e.target.value)}
            />
            <p className={`text-xs ${linhas > 4 ? "text-warning" : "text-muted-foreground"}`}>
              {linhas} de até 4 linhas. Use {"{nome}"} para o primeiro nome. Termine com a pergunta
              da renda: a resposta da pessoa abre a conversa. Nunca prometa preço nem prazo.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pp">Resposta pública no comentário (opcional)</Label>
            <Input
              id="pp"
              value={f.resposta_publica ?? ""}
              onChange={(e) => set("resposta_publica", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Roleta que recebe o lead</Label>
            <Select
              value={f.roleta_id ?? SEM_ROLETA}
              onValueChange={(v) => set("roleta_id", v === SEM_ROLETA ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha a roleta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_ROLETA}>Nenhuma (lead fica aguardando)</SelectItem>
                {roletas.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ps">Assunto / empreendimento anotado no lead</Label>
            <Input
              id="ps"
              value={f.assunto ?? ""}
              onChange={(e) => set("assunto", e.target.value)}
              placeholder="MCMV até R$ 13 mil"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pi">Só neste post (id da mídia, opcional)</Label>
            <Input
              id="pi"
              value={f.post_id ?? ""}
              onChange={(e) => set("post_id", e.target.value)}
              placeholder="Vazio = qualquer post"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => m.mutate()} disabled={m.isPending}>
              {m.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ROTULOS_TEXTO: Record<keyof TextosConversa, string> = {
  renda_de_novo: 'Se a pessoa só cumprimentar ("oi"), repete a pergunta da renda',
  regiao: "Depois da renda (pergunta a região)",
  prazo: "Depois da região (pergunta o prazo)",
  whatsapp: "Depois do prazo (pede o WhatsApp)",
  whatsapp_invalido: "WhatsApp não entendido (pede de novo, 1 vez)",
  fechamento: "Fechamento (lead criado)",
  sem_whatsapp: "Sem WhatsApp na 2ª tentativa",
};

export function Roteiro({ dados }: { dados: PainelInstagramDm }) {
  const qc = useQueryClient();
  const salvar = useServerFn(salvarTextosInstagram);
  const [t, setT] = useState<TextosConversa>(dados.textos);
  const m = useMutation({
    mutationFn: () => salvar({ data: t }),
    onSuccess: () => {
      toast.success("Roteiro salvo.");
      void qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não salvou."),
  });
  return (
    <Card>
      <CardContent className="space-y-3 p-4 text-sm">
        <p className="text-muted-foreground">
          A abertura é de cada palavra-chave. Daqui para frente o roteiro é o mesmo para todas.
          Renda, região e prazo aceitam qualquer resposta (sem travar a pessoa); só o WhatsApp é
          conferido, porque o CRM precisa dele para criar o lead.
        </p>
        {(Object.keys(TEXTOS_PADRAO) as Array<keyof TextosConversa>).map((k) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`t-${k}`}>{ROTULOS_TEXTO[k]}</Label>
            <Textarea
              id={`t-${k}`}
              rows={2}
              value={t[k]}
              disabled={!dados.podeEditar}
              onChange={(e) => setT((x) => ({ ...x, [k]: e.target.value }))}
            />
          </div>
        ))}
        {dados.podeEditar && (
          <div className="flex justify-end">
            <Button onClick={() => m.mutate()} disabled={m.isPending}>
              {m.isPending ? "Salvando…" : "Salvar roteiro"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

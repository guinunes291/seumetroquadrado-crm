// Dialog de criar/editar unidade — extraído da rota do projeto sem mudança de
// payload: os mesmos campos e conversões de antes, agora com um tipo de
// fronteira explícito (`UnidadePayload`) no lugar de `any`.

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UNIDADE_STATUS_LABEL, type UnidadeStatus } from "@/lib/unidades";
import { UNIDADE_STATUS_OPCOES, type UnidadeRow } from "./unidades-grid";

export type UnidadePayload = {
  identificador: string;
  bloco: string | null;
  andar: string | null;
  tipologia: string | null;
  dormitorios: number | null;
  suites: number | null;
  vagas: number | null;
  area_privativa: number | null;
  valor: number | null;
  status: UnidadeStatus;
  observacoes: string | null;
};

export function UnidadeFormDialog({
  open,
  onOpenChange,
  editing,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Unidade em edição — `null` cria uma nova. */
  editing: UnidadeRow | null;
  pending?: boolean;
  onSubmit: (payload: UnidadePayload) => void;
}) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => {
      const v = fd.get(k);
      if (v === null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    onSubmit({
      identificador: String(fd.get("identificador")),
      bloco: (fd.get("bloco") || null) as string | null,
      andar: (fd.get("andar") || null) as string | null,
      tipologia: (fd.get("tipologia") || null) as string | null,
      dormitorios: num("dormitorios"),
      suites: num("suites"),
      vagas: num("vagas"),
      area_privativa: num("area_privativa"),
      valor: num("valor"),
      status: (fd.get("status") as UnidadeStatus) || "disponivel",
      observacoes: (fd.get("observacoes") || null) as string | null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar unidade" : "Nova unidade"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="identificador">Identificador *</Label>
            <Input
              id="identificador"
              name="identificador"
              required
              defaultValue={editing?.identificador}
              placeholder="ex.: 101, Apto 12A"
            />
          </div>
          <div>
            <Label>Bloco</Label>
            <Input name="bloco" defaultValue={editing?.bloco ?? ""} />
          </div>
          <div>
            <Label>Andar</Label>
            <Input name="andar" defaultValue={editing?.andar ?? ""} />
          </div>
          <div className="col-span-2">
            <Label>Tipologia</Label>
            <Input
              name="tipologia"
              defaultValue={editing?.tipologia ?? ""}
              placeholder="ex.: 2 dorm c/ suíte"
            />
          </div>
          <div>
            <Label>Dormitórios</Label>
            <Input
              name="dormitorios"
              type="number"
              min="0"
              defaultValue={editing?.dormitorios ?? ""}
            />
          </div>
          <div>
            <Label>Suítes</Label>
            <Input name="suites" type="number" min="0" defaultValue={editing?.suites ?? ""} />
          </div>
          <div>
            <Label>Vagas</Label>
            <Input name="vagas" type="number" min="0" defaultValue={editing?.vagas ?? ""} />
          </div>
          <div>
            <Label>Área privativa (m²)</Label>
            <Input
              name="area_privativa"
              type="number"
              step="0.01"
              defaultValue={editing?.area_privativa ?? ""}
            />
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input name="valor" type="number" step="0.01" defaultValue={editing?.valor ?? ""} />
          </div>
          <div>
            <Label>Status</Label>
            <Select name="status" defaultValue={editing?.status ?? "disponivel"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIDADE_STATUS_OPCOES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {UNIDADE_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Observações</Label>
            <Input name="observacoes" defaultValue={editing?.observacoes ?? ""} />
          </div>
          <DialogFooter className="col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

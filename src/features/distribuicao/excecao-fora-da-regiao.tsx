// Exceção da gestão à zona estrita — o único jeito de entregar lead a corretor
// que não atende a zona dele (indicação, cliente que pede corretor
// específico). Desligada por padrão; ligada, exige motivo escrito, que o banco
// grava no distribution_log. Usada nos diálogos de transferência e no
// "atribuir manual" da fila de exceções.

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MOTIVO_EXCECAO_MINIMO,
  excecaoZonaValida,
  type ExcecaoForaDaRegiao,
} from "@/lib/zona-estrita";

export function ExcecaoForaDaRegiaoFields({
  value,
  onChange,
  disabled,
}: {
  value: ExcecaoForaDaRegiao;
  onChange: (v: ExcecaoForaDaRegiao) => void;
  disabled?: boolean;
}) {
  const invalida = !excecaoZonaValida(value);
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox
          checked={value.ativa}
          disabled={disabled}
          onCheckedChange={(v) => onChange({ ...value, ativa: v === true })}
          className="mt-0.5"
        />
        <span>
          Exceção da gestão: entregar mesmo se o lead for de zona que o corretor não atende
          <span className="block text-xs text-muted-foreground">
            Sem isto, o CRM recusa lead fora da região do corretor. Use só para indicação ou cliente
            que pediu o corretor — fica registrado no histórico da distribuição.
          </span>
        </span>
      </label>
      {value.ativa && (
        <div className="space-y-1">
          <Label htmlFor="motivo-fora-da-regiao">Motivo (obrigatório)</Label>
          <Textarea
            id="motivo-fora-da-regiao"
            rows={2}
            value={value.motivo}
            disabled={disabled}
            placeholder="Ex.: cliente é indicação do corretor"
            onChange={(e) => onChange({ ...value, motivo: e.target.value })}
          />
          {invalida && (
            <p className="text-xs text-warning">
              Escreva o motivo (mínimo {MOTIVO_EXCECAO_MINIMO} caracteres).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

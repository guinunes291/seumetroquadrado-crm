import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EFETIVACAO_FLAGS, type EfetivacaoFlagKey, type EfetivacaoVenda } from "@/lib/vendas";

type Props = {
  valores: EfetivacaoVenda;
  onChange: (key: EfetivacaoFlagKey, value: boolean) => void;
  disabled?: boolean;
};

export const EFETIVACAO_INICIAL: EfetivacaoVenda = {
  contrato_assinado: false,
  ato_pago: false,
  apto_repasse: false,
};

/**
 * Status do contrato no cadastro da venda: os três marcos de efetivação.
 * A venda pode ser registrada na hora da venda com tudo desligado; a
 * aprovação da gestão (que efetiva comissão/VGV/fechamento) só é liberada
 * quando os três estiverem ativos.
 */
export function EfetivacaoFlagsField({ valores, onChange, disabled }: Props) {
  return (
    <div className="space-y-1.5">
      <Label>Status do contrato</Label>
      <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-3">
        {EFETIVACAO_FLAGS.map((flag) => (
          <label key={flag.key} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={valores[flag.key]}
              disabled={disabled}
              onCheckedChange={(checked) => onChange(flag.key, checked === true)}
            />
            {flag.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Marque o que já aconteceu. A venda fica cadastrada desde já e só pode ser aprovada
        (efetivada) quando os 3 marcos estiverem ativos.
      </p>
    </div>
  );
}

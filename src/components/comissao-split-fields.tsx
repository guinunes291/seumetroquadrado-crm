import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calcularComissoes,
  validarSplit,
  parsePercent,
  parseSplit,
  formatBRL2,
  type SplitTexto,
} from "@/lib/comissoes";

type Props = {
  /** VGV já convertido (parseCurrencyBRL); null enquanto não digitado. */
  valorVenda: number | null;
  valores: SplitTexto;
  onChange: (campo: keyof SplitTexto, valor: string) => void;
};

/**
 * Campos do split de comissão usados nos dois diálogos de venda, com preview
 * em R$ por beneficiário e validação (soma das partes ≤ total, faixa 0–100).
 * A geração real acontece no banco (trigger sobre `vendas`) — o preview é
 * informativo.
 */
export function ComissaoSplitFields({ valorVenda, valores, onChange }: Props) {
  const split = parseSplit(valores);
  const validacao = split ? validarSplit(split) : null;
  const preview =
    split && validacao?.ok && valorVenda && valorVenda > 0
      ? calcularComissoes(valorVenda, split)
      : null;

  const campos: Array<{ campo: keyof SplitTexto; rotulo: string }> = [
    { campo: "total", rotulo: "Total" },
    { campo: "corretor", rotulo: "Corretor" },
    { campo: "gerente", rotulo: "Gerente" },
    { campo: "superintendente", rotulo: "Superint." },
  ];

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Comissão (%)</Label>
      <div className="grid grid-cols-4 gap-2">
        {campos.map(({ campo, rotulo }) => (
          <div key={campo} className="space-y-1">
            <Label className="text-[11px]">{rotulo}</Label>
            <Input
              inputMode="decimal"
              value={valores[campo]}
              onChange={(e) => onChange(campo, e.target.value)}
              aria-invalid={parsePercent(valores[campo]) === null}
            />
          </div>
        ))}
      </div>

      {!split && (
        <p className="text-xs text-destructive">
          Percentuais inválidos — use números como 3,50 (deixe 0 para não gerar a parte).
        </p>
      )}
      {validacao?.erros.map((erro) => (
        <p key={erro} className="text-xs text-destructive">
          {erro}
        </p>
      ))}
      {validacao?.ok &&
        validacao.avisos.map((aviso) => (
          <p key={aviso} className="text-xs text-warning">
            {aviso}
          </p>
        ))}
      {preview && (
        <p className="text-xs text-muted-foreground">
          Corretor {formatBRL2(preview.corretor)} · Gerente {formatBRL2(preview.gerente)} ·
          Superint. {formatBRL2(preview.superintendente)} · Imobiliária (total){" "}
          {formatBRL2(preview.imobiliaria)}
        </p>
      )}
    </div>
  );
}

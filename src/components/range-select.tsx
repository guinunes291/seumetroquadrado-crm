import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { RangeOption } from "@/lib/projetos";

const NULL_KEY = "__any__";

type Props = {
  label: string;
  fromOptions: RangeOption[];
  toOptions: RangeOption[];
  value: [number | null, number | null];
  onChange: (v: [number | null, number | null]) => void;
  disabled?: boolean;
  hint?: string;
};

export function RangeSelect({
  label,
  fromOptions,
  toOptions,
  value,
  onChange,
  disabled,
  hint,
}: Props) {
  const [from, to] = value;

  const keyOf = (v: number | null) => (v == null ? NULL_KEY : String(v));
  const parse = (k: string): number | null => (k === NULL_KEY ? null : Number(k));

  const handleFrom = (k: string) => {
    const next = parse(k);
    let nextTo = to;
    if (next != null && to != null && to < next) nextTo = next;
    onChange([next, nextTo]);
  };

  const handleTo = (k: string) => {
    const next = parse(k);
    let nextFrom = from;
    if (next != null && from != null && from > next) nextFrom = next;
    onChange([nextFrom, next]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={keyOf(from)} onValueChange={handleFrom} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="De" />
          </SelectTrigger>
          <SelectContent>
            {fromOptions.map((o) => (
              <SelectItem key={keyOf(o.value)} value={keyOf(o.value)}>
                {o.value == null ? "De — qualquer" : `De ${o.label}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={keyOf(to)} onValueChange={handleTo} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="Até" />
          </SelectTrigger>
          <SelectContent>
            {toOptions.map((o) => (
              <SelectItem key={keyOf(o.value)} value={keyOf(o.value)}>
                {o.value == null ? "Até — qualquer" : `Até ${o.label}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Formatação de tempo da Academia. Regra da casa: tempo aparece em hh:mm.

/** Minutos em hh:mm. 30 vira "00:30"; 95 vira "01:35"; negativo vira "00:00". */
export function formatarHhMm(minutos: number): string {
  const total = Math.max(0, Math.floor(minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Segundos em hh:mm, arredondando para cima: 1s restante ainda mostra 00:01. */
export function segundosEmHhMm(segundos: number): string {
  return formatarHhMm(Math.ceil(Math.max(0, segundos) / 60));
}

/** Data YYYY-MM-DD em dd/mm/aaaa, sem depender do fuso do navegador. */
export function dataBr(iso: string | null): string {
  if (!iso) return "";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return "";
  return `${dia}/${mes}/${ano}`;
}

/** Quantos dias faltam (negativo = venceu) entre hoje e uma data YYYY-MM-DD. */
export function diasAte(prazo: string, hoje: string): number {
  const a = Date.UTC(
    Number(prazo.slice(0, 4)),
    Number(prazo.slice(5, 7)) - 1,
    Number(prazo.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(hoje.slice(0, 4)),
    Number(hoje.slice(5, 7)) - 1,
    Number(hoje.slice(8, 10)),
  );
  return Math.round((a - b) / 86_400_000);
}

/** Lê um jsonb que deve ser array de strings, ignorando o que não for texto. */
export function listaDeTextos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((x): x is string => typeof x === "string");
}

/** Lê a rubrica da prática: [{criterio, peso}]. */
export function criteriosDaRubrica(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((x) =>
      x && typeof x === "object" && "criterio" in x
        ? String((x as { criterio: unknown }).criterio)
        : null,
    )
    .filter((x): x is string => x !== null);
}

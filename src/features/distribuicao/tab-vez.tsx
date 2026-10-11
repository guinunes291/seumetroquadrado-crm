// Aba "A vez por zona" — a mesma visão da roleta que o SDR tem na Pré-venda,
// para a gestão (pedido do dono, 11/10/2026: "cada gerente precisa visualizar
// também"). Admin, gestor e superintendente leem; o banco
// (roletas_filas_zona_v1) confere o papel. Nada se edita aqui: montar a fila
// é na aba Filas, e cada corretor vê a própria posição na Central de Comando.

import { FilaZonaCard } from "@/features/roletas/fila-zona-card";

export function TabVez() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Quem recebe o próximo lead de cada zona, roleta por roleta, na ordem em que o motor vai
        entregar — a fila do SDR em destaque e, embaixo, a roleta da zona, o Marquinhos e as
        campanhas. Quem está fora aparece com o motivo. Para mudar a fila, use a aba Filas.
      </p>
      <FilaZonaCard subtitulo="a fila de cada roleta da zona — o próximo lead vai para o 1º" />
    </div>
  );
}

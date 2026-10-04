// A janela de troca mora uma vez, no layout autenticado. São nove telas que
// mudam etapa (lista, Kanban, ficha, Fila, Blitz, peek…); cada uma renderizar
// a própria janela multiplicaria o lugar onde a regra pode ser esquecida.
// A mutação de etapa (use-lead-status) pede a abertura por este contexto;
// fora do provider (testes, telas antigas) o pedido cai no toast de sempre.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { JanelaTroca, type PedidoTroca } from "./janela-troca";

type Ctx = { abrir: (pedido: PedidoTroca) => void };

const JanelaTrocaCtx = createContext<Ctx | null>(null);

export function JanelaTrocaProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<PedidoTroca | null>(null);
  const abrir = useCallback((p: PedidoTroca) => setPedido(p), []);
  const value = useMemo(() => ({ abrir }), [abrir]);
  return (
    <JanelaTrocaCtx.Provider value={value}>
      {children}
      {pedido && (
        <JanelaTroca
          entra={pedido}
          onOpenChange={(open) => {
            if (!open) setPedido(null);
          }}
        />
      )}
    </JanelaTrocaCtx.Provider>
  );
}

/** `null` fora do provider. */
export function useJanelaTroca(): Ctx | null {
  return useContext(JanelaTrocaCtx);
}

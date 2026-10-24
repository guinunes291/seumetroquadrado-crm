"use client";
import { useActionState } from "react";
import type { Estado } from "@/app/(painel)/pedidos/actions";

// Formulário que cria um pedido na fila. Nada vai para a Meta aqui: o envio só
// grava o pedido e leva para a tela de aprovação.
export function FormPedido({
  acao,
  children,
  rotulo,
  enviandoRotulo = "Preparando o pedido...",
}: {
  acao: (estado: Estado, form: FormData) => Promise<Estado>;
  children: React.ReactNode;
  rotulo: string;
  enviandoRotulo?: string;
}) {
  const [estado, enviar, enviando] = useActionState(acao, null);
  return (
    <form action={enviar} className="space-y-5">
      {children}
      {estado?.erros.length ? (
        <ul className="space-y-1 rounded-md bg-alerta/5 p-3 text-sm text-alerta">
          {estado.erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <button
        disabled={enviando}
        className="rounded-md bg-navy px-4 py-2 font-semibold text-creme hover:bg-navy-claro disabled:opacity-60"
      >
        {enviando ? enviandoRotulo : rotulo}
      </button>
      <p className="text-xs text-cinza">
        Enviar só cria o pedido. Ele aparece em Aprovações e só chega à Meta quando você aprovar.
      </p>
    </form>
  );
}

export function Campo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-navy">{rotulo}</span>
      <div className="mt-1">{children}</div>
      {dica && <span className="mt-1 block text-xs text-cinza">{dica}</span>}
    </label>
  );
}

export const estiloEntrada = "w-full rounded-md border border-navy/20 bg-white px-3 py-2 text-sm";

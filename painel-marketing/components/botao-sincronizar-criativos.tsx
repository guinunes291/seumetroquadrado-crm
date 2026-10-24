"use client";
import { useState, useTransition } from "react";
import { acaoSincronizarCriativos } from "@/app/(painel)/criativos/actions";

export function BotaoSincronizarCriativos({ habilitado }: { habilitado: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  if (!habilitado)
    return (
      <span className="rounded-md border border-navy/20 px-3 py-1.5 text-sm text-cinza">
        Falta o token da Meta
      </span>
    );
  return (
    <div className="text-right">
      <button
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            // Se a resposta não chegar (tempo esgotado, rede), avisa sem derrubar a página.
            try {
              setMsg(await acaoSincronizarCriativos());
            } catch {
              setMsg("A leitura demorou mais que o esperado. Recarregue a página em um minuto para ver o resultado.");
            }
          })
        }
        className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-creme hover:bg-navy-claro disabled:opacity-60"
      >
        {pendente ? "Lendo todos os anúncios..." : "Atualizar da Meta"}
      </button>
      {msg && <p className="mt-1 max-w-xs text-xs text-cinza">{msg}</p>}
    </div>
  );
}

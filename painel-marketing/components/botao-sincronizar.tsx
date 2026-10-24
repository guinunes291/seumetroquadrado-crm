"use client";
import { useState, useTransition } from "react";
import { acaoSincronizarMeta } from "@/app/acoes-meta";

export function BotaoSincronizar({ habilitado }: { habilitado: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  if (!habilitado) {
    return (
      <span
        className="rounded-md border border-navy/20 px-3 py-1.5 text-sm text-cinza"
        title="Falta configurar o token do usuário do sistema da Meta no servidor."
      >
        Atualizar da Meta (falta o token)
      </span>
    );
  }
  return (
    <div className="text-right">
      <button
        disabled={pendente}
        onClick={() => iniciar(async () => setMsg(await acaoSincronizarMeta()))}
        className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-creme hover:bg-navy-claro disabled:opacity-60"
      >
        {pendente ? "Lendo a Meta..." : "Atualizar da Meta"}
      </button>
      {msg && <p className="mt-1 max-w-xs text-xs text-cinza">{msg}</p>}
    </div>
  );
}

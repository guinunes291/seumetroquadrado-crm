"use client";
import { useActionState } from "react";
import { acaoEntrar } from "./actions";

export function FormLogin() {
  const [erro, enviar, enviando] = useActionState(acaoEntrar, null);
  return (
    <form action={enviar} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">E-mail</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded-md border border-navy/20 bg-white px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Senha</span>
        <input
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-md border border-navy/20 bg-white px-3 py-2"
        />
      </label>
      {erro && <p className="text-sm text-alerta">{erro}</p>}
      <button
        disabled={enviando}
        className="w-full rounded-md bg-navy px-4 py-2 font-semibold text-creme hover:bg-navy-claro disabled:opacity-60"
      >
        {enviando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

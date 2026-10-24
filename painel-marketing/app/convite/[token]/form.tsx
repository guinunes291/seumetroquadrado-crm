"use client";
import { useActionState } from "react";
import { acaoDefinirSenha } from "./actions";

export function FormSenha({ token }: { token: string }) {
  const [erro, enviar, enviando] = useActionState(acaoDefinirSenha, null);
  return (
    <form action={enviar} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <span className="text-sm font-medium">Nova senha (12 caracteres ou mais)</span>
        <input
          name="senha"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className="mt-1 w-full rounded-md border border-navy/20 bg-white px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Repita a senha</span>
        <input
          name="confirma"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className="mt-1 w-full rounded-md border border-navy/20 bg-white px-3 py-2"
        />
      </label>
      {erro && <p className="text-sm text-alerta">{erro}</p>}
      <button
        disabled={enviando}
        className="w-full rounded-md bg-navy px-4 py-2 font-semibold text-creme hover:bg-navy-claro disabled:opacity-60"
      >
        {enviando ? "Salvando..." : "Definir senha e entrar"}
      </button>
    </form>
  );
}

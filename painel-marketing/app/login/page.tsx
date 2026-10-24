import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth";
import { FormLogin } from "./form";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (await sessaoAtual()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm ring-1 ring-navy/10">
        <p className="text-xs font-semibold tracking-widest text-aurum uppercase">
          Seu Metro Quadrado
        </p>
        <h1 className="mt-1 mb-6 text-2xl">Painel de Marketing</h1>
        <FormLogin />
      </div>
    </main>
  );
}

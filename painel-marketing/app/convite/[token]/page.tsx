import { conviteValido } from "@/lib/auth";
import { FormSenha } from "./form";

export const dynamic = "force-dynamic";

export default async function Convite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = await conviteValido(token);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm ring-1 ring-navy/10">
        <p className="text-xs font-semibold tracking-widest text-aurum uppercase">
          Primeiro acesso
        </p>
        <h1 className="mt-1 mb-2 text-2xl">Crie sua senha</h1>
        {email ? (
          <>
            <p className="mb-6 text-sm text-cinza">
              Acesso de {email}. Este link funciona uma vez só.
            </p>
            <FormSenha token={token} />
          </>
        ) : (
          <p className="text-sm text-alerta">Este link já foi usado ou expirou.</p>
        )}
      </div>
    </main>
  );
}

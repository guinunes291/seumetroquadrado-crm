import Link from "next/link";
import { exigirSessao } from "@/lib/auth";
import { contarPendentes } from "@/lib/jobs";
import { acaoSair } from "../login/actions";

export const dynamic = "force-dynamic";

// Os oito botões do Painel. Os que ainda não funcionam aparecem com a fase em
// que entram, para ninguém achar que sumiram.
const BOTOES: { rotulo: string; href?: string; fase?: number }[] = [
  { rotulo: "Diagnóstico", href: "/" },
  { rotulo: "Nova campanha", href: "/campanhas/nova" },
  { rotulo: "Ajustar campanha", href: "/campanhas/ajustar" },
  { rotulo: "Criar público", href: "/publicos/novo" },
  { rotulo: "Biblioteca de criativos", fase: 3 },
  { rotulo: "Editar vídeo", fase: 4 },
  { rotulo: "Gerar vídeo por prompt", fase: 4 },
  { rotulo: "Publicar no Instagram", fase: 5 },
];

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const sessao = await exigirSessao();
  const pendentes = await contarPendentes();
  return (
    <div className="min-h-screen">
      <header className="bg-navy text-creme">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-titulo text-lg font-bold">
            Painel de Marketing <span className="text-aurum">SMQ</span>
          </Link>
          <form action={acaoSair} className="flex items-center gap-4 text-sm">
            <Link
              href="/aprovacoes"
              className="rounded border border-aurum/60 px-3 py-1 hover:bg-navy-claro"
            >
              Aprovações
              {pendentes > 0 && (
                <span className="ml-2 rounded-full bg-aurum px-2 text-xs font-bold text-navy">
                  {pendentes}
                </span>
              )}
            </Link>
            <span className="text-creme/70">{sessao.email}</span>
            <button className="rounded border border-aurum/60 px-3 py-1 hover:bg-navy-claro">
              Sair
            </button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-2 px-6 pb-4">
          {BOTOES.map((b) =>
            b.href ? (
              <Link
                key={b.rotulo}
                href={b.href}
                className="rounded-md bg-aurum px-3 py-1.5 text-sm font-semibold text-navy"
              >
                {b.rotulo}
              </Link>
            ) : (
              <span
                key={b.rotulo}
                title={`Entra na Fase ${b.fase}`}
                className="cursor-not-allowed rounded-md border border-creme/20 px-3 py-1.5 text-sm text-creme/50"
              >
                {b.rotulo} <span className="text-xs">· Fase {b.fase}</span>
              </span>
            ),
          )}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

"use client";
import { useActionState } from "react";
import { acaoAprovar, acaoDescartar, acaoReverter } from "@/app/(painel)/pedidos/actions";

// Botões da tela de aprovação. Aprovar e reverter pedem uma confirmação
// marcada, para nenhum clique acidental mexer na conta de anúncios.
function Confirmar({
  id,
  acao,
  rotulo,
  enviando,
  aviso,
  perigo,
}: {
  id: string;
  acao: (e: string | null, f: FormData) => Promise<string | null>;
  rotulo: string;
  enviando: string;
  aviso: string;
  perigo?: boolean;
}) {
  const [msg, enviar, pendente] = useActionState(acao, null);
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmo" value="sim" className="mt-1" />
        <span>{aviso}</span>
      </label>
      <button
        disabled={pendente}
        className={`rounded-md px-4 py-2 font-semibold disabled:opacity-60 ${
          perigo ? "bg-alerta text-white" : "bg-navy text-creme hover:bg-navy-claro"
        }`}
      >
        {pendente ? enviando : rotulo}
      </button>
      {msg && <p className="rounded-md bg-creme p-3 text-sm text-navy">{msg}</p>}
    </form>
  );
}

export function Aprovar({ id, gasta }: { id: string; gasta: boolean }) {
  return (
    <Confirmar
      id={id}
      acao={acaoAprovar}
      rotulo="Aprovar e aplicar na Meta"
      enviando="Aplicando na Meta..."
      aviso={
        gasta
          ? "Confirmo que revisei os passos e sei que a partir de agora a conta pode gastar mais."
          : "Confirmo que revisei os passos acima."
      }
      perigo={gasta}
    />
  );
}

export function Reverter({ id }: { id: string }) {
  return (
    <Confirmar
      id={id}
      acao={acaoReverter}
      rotulo="Reverter"
      enviando="Revertendo..."
      aviso="Confirmo que quero desfazer o que este pedido mudou (campanhas novas são arquivadas, ajustes voltam ao valor anterior, públicos ficam)."
    />
  );
}

export function Descartar({ id }: { id: string }) {
  return (
    <form action={acaoDescartar}>
      <input type="hidden" name="id" value={id} />
      <button className="rounded-md border border-navy/20 px-4 py-2 text-sm text-navy hover:bg-creme">
        Descartar pedido
      </button>
    </form>
  );
}

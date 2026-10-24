// Aviso quando a Meta não pode ser lida (sem token ou erro traduzido).
export function AvisoMeta({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-lg bg-white p-5 text-sm ring-1 ring-alerta/30">
      <p className="font-semibold text-alerta">Não consegui ler a conta de anúncios.</p>
      <p className="mt-1 text-cinza">{mensagem}</p>
    </div>
  );
}

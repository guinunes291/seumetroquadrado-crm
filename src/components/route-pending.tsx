/**
 * Tela de carregamento de rota — o app NUNCA pode ficar num fundo vazio.
 * As rotas autenticadas têm ssr:false (o servidor entrega uma casca escura sem
 * conteúdo) e o guard faz chamadas de rede no beforeLoad; sem um pending
 * component, qualquer espera vira "tela preta" no celular.
 */
export function RoutePending({ label = "Carregando..." }: { label?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <img
          src="/icons/icon-192.png"
          alt="Seu Metro Quadrado"
          className="h-14 w-14 rounded-md bg-white object-contain shadow-elev-1"
        />
        <p className="animate-pulse text-sm text-muted-foreground">{label}</p>
      </div>
    </main>
  );
}

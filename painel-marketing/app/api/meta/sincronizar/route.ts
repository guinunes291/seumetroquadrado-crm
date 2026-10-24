import { ErroMeta, sincronizarMeta } from "@/lib/meta";

export const dynamic = "force-dynamic";

// Chamado pelo agendamento diário da Vercel (vercel.json). A Vercel manda
// "Authorization: Bearer <CRON_SECRET>"; sem esse segredo, nada roda.
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("não autorizado", { status: 401 });
  }
  if (!process.env.META_ACCESS_TOKEN)
    return Response.json({ ok: false, motivo: "sem token da Meta" });
  try {
    const r = await sincronizarMeta("agendamento");
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json(
      { ok: false, motivo: e instanceof ErroMeta ? e.traduzido : "falha" },
      { status: 502 },
    );
  }
}

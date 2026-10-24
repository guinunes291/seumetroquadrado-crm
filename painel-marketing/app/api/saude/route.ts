import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// Diz se o Painel alcança o banco. Não devolve dado nenhum.
export async function GET() {
  try {
    await sql()`select 1 from usuarios_permitidos limit 1`;
    return Response.json({ ok: true, banco: "ok" });
  } catch {
    return Response.json({ ok: false, banco: "sem conexão" }, { status: 503 });
  }
}

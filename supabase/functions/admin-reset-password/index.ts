// One-off admin utility: reset a user's password by email.
// Requires header x-admin-token matching ADMIN_RESET_TOKEN env.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Comparação de segredo em tempo constante (SHA-256 antes do XOR): não vaza
// tamanho nem prefixo do token pelo tempo de resposta.
async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// Rate limit simples por IP (em memória do isolate). Não substitui um limite de
// borda, mas dificulta força-bruta do token caso ele vaze.
const RL = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = RL.get(ip);
  if (!b || now >= b.resetAt) {
    RL.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  b.count += 1;
  return b.count > max;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (rateLimited(ip)) return new Response("Too many requests", { status: 429 });

  const token = req.headers.get("x-admin-token") ?? "";
  const expected = Deno.env.get("ADMIN_RESET_TOKEN") ?? "";
  if (!expected || !(await timingSafeEqualStr(token, expected)))
    return new Response("Forbidden", { status: 403 });

  const { email, password } = await req.json();
  if (!email || !password) return new Response("email e password obrigatórios", { status: 400 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Localiza usuário por email — paginando (o listUsers padrão via só os 200
  // primeiros, o que dava user_not_found para contas legítimas em bases maiores).
  const alvo = email.toLowerCase();
  let user: { id: string } | undefined;
  const PER_PAGE = 200;
  for (let page = 1; page <= 50 && !user; page++) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    if (listErr) return new Response(JSON.stringify({ error: listErr.message }), { status: 500 });
    user = list.users.find((u) => (u.email ?? "").toLowerCase() === alvo);
    if (list.users.length < PER_PAGE) break; // última página
  }
  if (!user) return new Response(JSON.stringify({ error: "user_not_found" }), { status: 404 });

  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ ok: true, user_id: user.id }), {
    headers: { "content-type": "application/json" },
  });
});

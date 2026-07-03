// One-off admin utility: reset a user's password by email.
// Requires header x-admin-token matching ADMIN_RESET_TOKEN env.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const token = req.headers.get("x-admin-token");
  const expected = Deno.env.get("ADMIN_RESET_TOKEN");
  if (!expected || token !== expected) return new Response("Forbidden", { status: 403 });

  const { email, password } = await req.json();
  if (!email || !password) return new Response("email e password obrigatórios", { status: 400 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Localiza usuário por email
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) return new Response(JSON.stringify({ error: listErr.message }), { status: 500 });
  const user = list.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
  if (!user) return new Response(JSON.stringify({ error: "user_not_found" }), { status: 404 });

  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ ok: true, user_id: user.id }), {
    headers: { "content-type": "application/json" },
  });
});

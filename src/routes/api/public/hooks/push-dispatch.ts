import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-driven endpoint. Reads pending rows from `push_outbox`, sends Web Push
 * to each subscription of the target user, and marks them as sent.
 * Authenticated via Supabase anon key (apikey header) — set by pg_cron.
 */
export const Route = createFileRoute("/api/public/hooks/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") || "";
        const expected =
          process.env.SUPABASE_ANON_KEY ||
          process.env.SUPABASE_PUBLISHABLE_KEY ||
          "";
        if (!expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        const [{ supabaseAdmin }, webPushMod] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("web-push"),
        ]);
        const webpush = (webPushMod as { default?: typeof import("web-push") }).default ?? webPushMod;

        const publicKey = "BLq4iOTPtY6ZOr_HyH-mv5KB9nttpHi0ewqR1jyrMnwWdeyFK2POYMf3qBzN6f3eAdNeT0hSCn-Gy0rc7ZwqqlY";
        const privateKey = process.env.VAPID_PRIVATE_KEY || "";
        const subject = process.env.VAPID_SUBJECT || "mailto:contato@seumetroquadrado.com.br";
        if (!privateKey) return new Response("missing VAPID_PRIVATE_KEY", { status: 500 });
        webpush.setVapidDetails(subject, publicKey, privateKey);

        // Pega até 100 pendentes
        const { data: pending, error: pErr } = await supabaseAdmin
          .from("push_outbox")
          .select("id, user_id, title, body, url, tag")
          .is("sent_at", null)
          .order("created_at", { ascending: true })
          .limit(100);

        if (pErr) {
          return new Response(JSON.stringify({ error: pErr.message }), { status: 500 });
        }
        if (!pending || pending.length === 0) {
          return new Response(JSON.stringify({ sent: 0 }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // Agrupa por user_id e busca subscriptions de uma vez
        const userIds = Array.from(new Set(pending.map((p) => p.user_id)));
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("user_id, endpoint, p256dh, auth")
          .in("user_id", userIds);

        const subsByUser = new Map<string, Array<{ endpoint: string; p256dh: string; auth: string }>>();
        (subs ?? []).forEach((s) => {
          const arr = subsByUser.get(s.user_id) ?? [];
          arr.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
          subsByUser.set(s.user_id, arr);
        });

        const sentIds: string[] = [];
        const deadEndpoints: string[] = [];
        let sentCount = 0;

        for (const item of pending) {
          const userSubs = subsByUser.get(item.user_id) ?? [];
          const payload = JSON.stringify({
            title: item.title,
            body: item.body,
            url: item.url,
            tag: item.tag,
          });
          for (const s of userSubs) {
            try {
              await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                payload,
                { TTL: 60 * 60 * 24 },
              );
              sentCount++;
            } catch (err: unknown) {
              const status = (err as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) deadEndpoints.push(s.endpoint);
              else console.warn("[push] send error", status, (err as Error).message);
            }
          }
          sentIds.push(item.id);
        }

        if (sentIds.length) {
          await supabaseAdmin
            .from("push_outbox")
            .update({ sent_at: new Date().toISOString() })
            .in("id", sentIds);
        }
        if (deadEndpoints.length) {
          await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
        }

        return new Response(
          JSON.stringify({ processed: pending.length, sent: sentCount, dead: deadEndpoints.length }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});

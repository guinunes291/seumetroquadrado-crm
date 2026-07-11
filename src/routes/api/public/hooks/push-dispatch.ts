import { createFileRoute } from "@tanstack/react-router";
import { rateLimit } from "@/lib/rate-limit";
import { checkPushDispatchAuth } from "@/lib/push/dispatch-auth";
import { decidirDisposicao } from "@/lib/push/outbox";
import type { Database } from "@/integrations/supabase/types";

type PushOutboxUpdate = Database["public"]["Tables"]["push_outbox"]["Update"];

/**
 * Cron-driven endpoint. Claims pending rows from `push_outbox`, sends Web Push
 * to each subscription of the target user, and persists the disposition while
 * the worker still owns the lease.
 *
 * Auth: header `x-push-secret` == PUSH_DISPATCH_SECRET (segredo dedicado).
 * Chaves anon/publishable nunca autenticam este endpoint.
 */
export const Route = createFileRoute("/api/public/hooks/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const pushSecret = process.env.PUSH_DISPATCH_SECRET;
        if (!pushSecret) {
          return new Response("missing PUSH_DISPATCH_SECRET", { status: 500 });
        }

        // Rate limit por origem (o endpoint é chamado pelo cron; limite generoso).
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("x-real-ip") ||
          "cron";
        const rl = rateLimit(`push-dispatch:${ip}`, 30, 60_000);
        if (!rl.allowed) {
          return new Response("rate_limited", {
            status: 429,
            headers: { "Retry-After": String(rl.retryAfterS) },
          });
        }

        if (checkPushDispatchAuth(request, pushSecret) !== "authorized") {
          return new Response("unauthorized", { status: 401 });
        }

        const [{ supabaseAdmin }, webPushMod] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("web-push"),
        ]);
        const webpush =
          (webPushMod as { default?: typeof import("web-push") }).default ?? webPushMod;

        const publicKey =
          "BLq4iOTPtY6ZOr_HyH-mv5KB9nttpHi0ewqR1jyrMnwWdeyFK2POYMf3qBzN6f3eAdNeT0hSCn-Gy0rc7ZwqqlY";
        const privateKey = process.env.VAPID_PRIVATE_KEY || "";
        const subject = process.env.VAPID_SUBJECT || "mailto:contato@seumetroquadrado.com.br";
        if (!privateKey) return new Response("missing VAPID_PRIVATE_KEY", { status: 500 });
        webpush.setVapidDetails(subject, publicKey, privateKey);

        // Claim atômico: workers concorrentes recebem lotes distintos. A lease
        // de 10 min libera o item automaticamente se este processo cair.
        const { data: pending, error: pErr } = await supabaseAdmin.rpc("claim_push_outbox", {
          _limit: 100,
          _lease_seconds: 600,
        });

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

        const subsByUser = new Map<
          string,
          Array<{ endpoint: string; p256dh: string; auth: string }>
        >();
        (subs ?? []).forEach((s) => {
          const arr = subsByUser.get(s.user_id) ?? [];
          arr.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
          subsByUser.set(s.user_id, arr);
        });

        const deadEndpoints = new Set<string>();
        let sentCount = 0;
        let deliveredItemCount = 0;
        let retryCount = 0;
        let discardCount = 0;
        let persistenceErrors = 0;
        const nowMs = Date.now();

        async function persistDisposition(
          id: string,
          leaseToken: string,
          patch: PushOutboxUpdate,
        ): Promise<boolean> {
          const { data, error } = await supabaseAdmin
            .from("push_outbox")
            .update(patch)
            .eq("id", id)
            .eq("lease_token", leaseToken)
            .select("id")
            .maybeSingle();
          if (error) {
            console.error("[push] falha ao persistir disposição", id, error.message);
            persistenceErrors++;
            return false;
          }
          if (!data) {
            console.warn("[push] lease perdida antes de persistir disposição", id);
            persistenceErrors++;
            return false;
          }
          return true;
        }

        for (const item of pending) {
          const userSubs = subsByUser.get(item.user_id) ?? [];
          const payload = JSON.stringify({
            title: item.title,
            body: item.body,
            url: item.url,
            tag: item.tag,
          });
          let delivered = 0;
          for (const s of userSubs) {
            try {
              await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                payload,
                { TTL: 60 * 60 * 24 },
              );
              delivered++;
              sentCount++;
            } catch (err: unknown) {
              const status = (err as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) deadEndpoints.add(s.endpoint);
              else console.warn("[push] send error", status, (err as Error).message);
            }
          }

          const disp = decidirDisposicao(
            { attempts: item.attempts ?? 0 },
            { delivered, subscriptions: userSubs.length },
            nowMs,
          );
          if (disp.acao === "sent") {
            const persisted = await persistDisposition(item.id, item.lease_token, {
              sent_at: new Date().toISOString(),
              last_error: null,
              lease_token: null,
              lease_expires_at: null,
            });
            if (persisted) deliveredItemCount++;
          } else if (disp.acao === "retry") {
            const persisted = await persistDisposition(item.id, item.lease_token, {
              attempts: disp.attempts,
              next_attempt_at: disp.nextAttemptAt,
              last_error: disp.lastError,
              lease_token: null,
              lease_expires_at: null,
            });
            if (persisted) retryCount++;
          } else {
            // discard: para de tentar (marca sent_at) e registra o motivo.
            console.warn("[push] descartado", item.id, disp.lastError);
            const persisted = await persistDisposition(item.id, item.lease_token, {
              sent_at: new Date().toISOString(),
              attempts: disp.attempts,
              last_error: disp.lastError,
              lease_token: null,
              lease_expires_at: null,
            });
            if (persisted) discardCount++;
          }
        }

        if (deadEndpoints.size) {
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .in("endpoint", Array.from(deadEndpoints));
        }

        return new Response(
          JSON.stringify({
            processed: pending.length,
            sent: sentCount,
            delivered_items: deliveredItemCount,
            retried: retryCount,
            discarded: discardCount,
            dead: deadEndpoints.size,
            persistence_errors: persistenceErrors,
          }),
          {
            status: persistenceErrors > 0 ? 500 : 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    },
  },
});

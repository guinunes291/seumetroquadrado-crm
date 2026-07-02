// Client-side function middleware: attaches a fresh Supabase bearer token to
// every serverFn RPC. Unlike the generated `attachSupabaseAuth`, this version
// proactively refreshes tokens that are expired (or about to expire), which
// eliminates the intermittent "Unauthorized" 500s that show the "This page
// didn't load" fallback and force users to retry every action.
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const REFRESH_LEEWAY_SECONDS = 60;

async function getFreshAccessToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return undefined;

  const expiresAt = session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec > REFRESH_LEEWAY_SECONDS) {
    return session.access_token;
  }

  // Token expired or within leeway — force a refresh.
  try {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error) {
      // Fall back to whatever we have; server will reject and client can react.
      return session.access_token;
    }
    return refreshed.session?.access_token ?? session.access_token;
  } catch {
    return session.access_token;
  }
}

export const attachSupabaseAuthFresh = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = await getFreshAccessToken();
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);

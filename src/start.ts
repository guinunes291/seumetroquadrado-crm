import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuthFresh } from "@/lib/supabase-auth-attach";

function isUnauthorizedError(error: unknown): boolean {
  if (!error) return false;
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /^Unauthorized/i.test(msg);
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // Auth failures should not render the full-page "This page didn't load"
    // HTML fallback — return a proper 401 JSON so the client (React Query,
    // route boundaries) can handle it gracefully and retry after refresh.
    if (isUnauthorizedError(error)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuthFresh],
  requestMiddleware: [errorMiddleware],
}));

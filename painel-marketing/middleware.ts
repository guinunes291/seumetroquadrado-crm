import { NextResponse, type NextRequest } from "next/server";

// Barreira rápida: sem cookie de sessão, vai para o login. A sessão em si é
// conferida no banco em cada página (lib/auth.ts), não aqui.
const LIVRES = ["/login", "/convite", "/api/saude", "/api/meta/sincronizar"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LIVRES.some((p) => pathname === p || pathname.startsWith(p + "/")))
    return NextResponse.next();
  if (!req.cookies.get("painel_sessao")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };

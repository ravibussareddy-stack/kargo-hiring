import { NextResponse, type NextRequest } from "next/server";

// Single-user HTTP Basic Auth. The dashboard shows candidate PII and can send
// email, so it must never be reachable without a password in production.
export function proxy(req: NextRequest) {
  const user = process.env.DASHBOARD_USER || "arjun";
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!pass) {
    if (process.env.NODE_ENV === "production") return new NextResponse("Set DASHBOARD_PASSWORD to enable the dashboard.", { status: 503 });
    return NextResponse.next();
  }
  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, ...rest] = atob(encoded).split(":");
    if (u === user && rest.join(":") === pass) return NextResponse.next();
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Kargo hiring"' } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

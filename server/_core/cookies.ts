import type { Request } from "express";

export function getSessionCookieOptions(req: Request) {
  const isProduction = process.env.NODE_ENV === "production";
  const hasManusOAuth = Boolean(process.env.OAUTH_SERVER_URL && process.env.VITE_APP_ID);
  const useManusProductionCookieScope = isProduction && hasManusOAuth;
  
  // In Manus production the container host is internal; the reverse proxy
  // supplies the public browser domain in x-forwarded-host. Railway uses
  // same-origin local email/password authentication, so it must retain a
  // host-only cookie rather than inheriting Manus proxy cookie attributes.
  const forwardedHost = typeof req.get === "function"
    ? req.get("x-forwarded-host")?.split(",")[0]?.trim()
    : undefined;
  const host = forwardedHost || (typeof req.get === "function" ? req.get("host") : req.headers.host) || "";
  const domain = host.includes(':') ? host.split(':')[0] : host;
  
  return {
    httpOnly: true,
    sameSite: useManusProductionCookieScope ? ("none" as const ) : ("lax" as const),
    secure: isProduction,
    path: "/",
    domain: useManusProductionCookieScope ? domain : undefined,
  };
}

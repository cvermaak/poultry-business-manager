import type { Request } from "express";

export function getSessionCookieOptions(req: Request) {
  const isProduction = process.env.NODE_ENV === "production";
  
  // Extract domain from request host
  const host = req.get('host') || '';
  const domain = host.includes(':') ? host.split(':')[0] : host;
  
  return {
    httpOnly: true,
    sameSite: isProduction ? ("none" as const ) : ("lax" as const),
    secure: isProduction,
    path: "/",
    domain: isProduction ? domain : undefined,
  };
}

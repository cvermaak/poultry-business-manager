import type { Request } from "express";

export function getSessionCookieOptions(req: Request) {
  const isProd = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,        // Railway = HTTPS
    path: "/",
  };
}

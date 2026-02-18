import type { Request } from "express";

export function getSessionCookieOptions(req: Request) {
  const isProduction = process.env.NODE_ENV === "production";
  
  return {
    httpOnly: true,
    sameSite: isProduction ? ("none" as const ) : ("lax" as const),
    secure: isProduction,
    path: "/",
  };
}

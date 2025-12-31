import type { Request } from "express";

export function getSessionCookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: "none" as const,
    secure: true,
    path: "/",
  };
}


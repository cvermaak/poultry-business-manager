import jwt from "jsonwebtoken";
import type { Request } from "express";
import { parse } from "cookie";
import * as db from "../db";

const { verify, sign } = jwt;

const COOKIE_NAME = "session";

export const sdk = {
  // 🔐 Used by TRPC context for every request
  async authenticateRequest(req: Request) {
    const cookies = parse(req.headers.cookie || "");
    const token = cookies[COOKIE_NAME];

    if (!token) return null;

    try {
      const payload = verify(token, process.env.JWT_SECRET!) as any;
      const user = await db.getUserById(payload.userId);

      if (!user || !user.isActive) return null;
      return user;
    } catch {
      return null;
    }
  },

  // 🔑 Used by login to create cookie session
  async createSessionToken(userIdOrKey: number | string, options?: { name?: string; expiresInMs?: number }) {
    // Support "email:<id>" string format used by the login mutation
    const userId =
      typeof userIdOrKey === "string" && userIdOrKey.startsWith("email:")
        ? parseInt(userIdOrKey.slice("email:".length), 10)
        : (userIdOrKey as number);

    const expiresIn = options?.expiresInMs
      ? Math.floor(options.expiresInMs / 1000) // jsonwebtoken accepts seconds when a number is given
      : "30d";

    return sign(
      { userId, ...(options?.name !== undefined ? { name: options.name } : {}) },
      process.env.JWT_SECRET!,
      { expiresIn }
    );
  }
};

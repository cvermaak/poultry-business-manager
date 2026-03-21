import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { extractTokenFromHeader, verifyJWT } from "./jwt";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // Try JWT token first (from Authorization header)
    const token = extractTokenFromHeader(opts.req.headers.authorization);
    if (token) {
      const payload = verifyJWT(token);
      if (payload) {
        // Fetch full user data from database
        user = await db.getUserById(payload.userId) || null;
      }
    }
    
    // Fallback to SDK authentication (Manus OAuth)
    if (!user) {
      user = await sdk.authenticateRequest(opts.req);
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}

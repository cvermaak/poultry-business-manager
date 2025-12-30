import { verify } from "jsonwebtoken";
import type { Request } from "express";
import * as db from "../db";

export const sdk = {
  async authenticateRequest(req: Request) {
    const auth = req.headers.authorization;
    if (!auth) return null;

    const token = auth.replace("Bearer ", "");

    try {
      const payload: any = verify(token, process.env.JWT_SECRET!);
      const user = await db.getUserById(payload.userId);

      if (!user || !user.isActive) return null;
      return user;
    } catch {
      return null;
    }
  }
};

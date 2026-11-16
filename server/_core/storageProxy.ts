import type { Express, Request, Response } from "express";
import { storageGet } from "../storage";

/** Authentication-neutral file gate: uses this deployment's existing storage helper. */
export function registerStorageProxy(app: Express, access: {
  isPublicKey: (key: string) => boolean | Promise<boolean>;
  authorize: (req: Request, res: Response) => boolean | Promise<boolean>;
}) {
  app.get("/manus-storage/*", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const key = (req.params as Record<string, string | undefined>)["0"];
    if (!key) { res.status(400).send("Missing storage key"); return; }
    try {
      if (!await access.isPublicKey(key) && !await access.authorize(req, res)) {
        res.status(403).send("File access is restricted."); return;
      }
    } catch { res.status(403).send("File access is restricted."); return; }
    try {
      const { url } = await storageGet(key);
      if (!url) { res.status(502).send("Storage backend error"); return; }
      res.redirect(307, url);
    } catch { res.status(502).send("Storage backend error"); }
  });
}

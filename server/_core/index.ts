import { canReadFinancialData } from "../business-permission-service";
import { getCompanySettings } from "../db";
import { registerStorageProxy } from "./storageProxy";
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  app.enable("trust proxy");
  app.set("trust proxy", 1);   // 👈 CRITICAL
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app, {
    async isPublicKey(key) {
      if (key === 'afgro-dashboard-commercial-chicken-houses_846bfbcf.png') return true;
      const settings = await getCompanySettings();
      return typeof settings?.logoUrl === 'string' && settings.logoUrl === '/manus-storage/' + key;
    },
    async authorize(req, res) {
      const context = await createContext({ req, res } as Parameters<typeof createContext>[0]);
      return !!context.user && await canReadFinancialData(context.user.id);
    },
  });
  // OAuth callback under /api/oauth/callback. The route registers only when
  // Manus-specific OAuth environment settings are present.
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

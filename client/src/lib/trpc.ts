import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";
import { getJWTToken } from "./jwt";

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      headers() {
        const token = getJWTToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

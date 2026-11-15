/** PREPARATION ONLY: unmounted lab router. createCaller context is NOT authentication transport. */
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createSupplierPermissionAdapter, supplierPermissionAdapterErrorCode,
} from "./supplier-permission-adapter";
import type {
  SupplierPermissionAdapterContext, SupplierPermissionAdapterDependencies,
} from "./supplier-permission-adapter";

const t = initTRPC.context<SupplierPermissionAdapterContext>().create();
/** Map only adapter-owned errors by identity; helper errors remain the helper's ordinary outcome. */
async function businessResult(operation: () => Promise<unknown>): Promise<unknown> {
  try { return await operation(); }
  catch (error) {
    const code = supplierPermissionAdapterErrorCode(error);
    if (!code) throw error;
    const transportCode = code === "UNAUTHENTICATED" ? "UNAUTHORIZED"
      : code === "INVALID_INPUT" ? "BAD_REQUEST"
      : code === "POLICY_UNAVAILABLE" || code === "SAVE_FAILED" ? "INTERNAL_SERVER_ERROR" : "FORBIDDEN";
    throw new TRPCError({ code: transportCode, message: code });
  }
}
export function createSupplierPermissionAdapterRouter(dependencies: SupplierPermissionAdapterDependencies) {
  const adapter = createSupplierPermissionAdapter(dependencies);
  // unknown parsers retain undefined, perform no coercion and defer exact validation to the service.
  // publicProcedure here is only an unmounted local harness; a live identity binding is NOT supplied.
  const publicProcedure = t.procedure;
  return t.router({
    supplierPermissions: t.router({
      load: publicProcedure.input(z.unknown()).query(({ ctx, input }) => adapter.supplierPermissions.load(ctx, input)),
      save: publicProcedure.input(z.unknown()).mutation(({ ctx, input }) => adapter.supplierPermissions.save(ctx, input)),
    }),
    suppliers: t.router({
      list: publicProcedure.input(z.unknown().optional()).query(({ ctx, input }) => businessResult(() => adapter.suppliers.list(ctx, input))),
      getById: publicProcedure.input(z.unknown()).query(({ ctx, input }) => businessResult(() => adapter.suppliers.getById(ctx, input))),
      create: publicProcedure.input(z.unknown()).mutation(({ ctx, input }) => businessResult(() => adapter.suppliers.create(ctx, input))),
      update: publicProcedure.input(z.unknown()).mutation(({ ctx, input }) => businessResult(() => adapter.suppliers.update(ctx, input))),
      delete: publicProcedure.input(z.unknown()).mutation(({ ctx, input }) => businessResult(() => adapter.suppliers.delete(ctx, input))),
    }),
  });
}
export type SupplierPermissionAdapterRouter = ReturnType<typeof createSupplierPermissionAdapterRouter>;

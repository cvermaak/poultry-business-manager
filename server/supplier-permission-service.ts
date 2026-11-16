import { createPool } from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import { PREPARED_PERMISSION_CATALOGUE } from "../shared/role-permission-catalogue.generated";
import { createSupplierPermissionAdapter, supplierPermissionAdapterErrorCode } from "./supplier-permission-adapter";
import { createSupplierPermissionDb } from "./supplier-permission-db";
import * as db from "./db";

/** Reuses the configured database identity, not an authentication transport.
 * No URL/credential leaves server code; no global/grant/auth setting is changed.
 */
let service: ReturnType<typeof createSupplierPermissionAdapter> | undefined;
export function getSupplierPermissionService() {
  if (service) return service;
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Role permissions are unavailable." });
  const url = new URL(uri);
  const expectedDatabase = decodeURIComponent(url.pathname.slice(1));
  if (!expectedDatabase) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Role permissions are unavailable." });
  const pool = createPool({ uri, connectionLimit: 4, waitForConnections: true, queueLimit: 32,
    supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, timezone: "Z", multipleStatements: false });
  const repository = createSupplierPermissionDb({ pool, expectedDatabase, catalogue: PREPARED_PERMISSION_CATALOGUE, clock: Date.now });
  service = createSupplierPermissionAdapter({ catalogue: PREPARED_PERMISSION_CATALOGUE,
    resolveActor: repository.resolveActor, repository,
    business: { listSuppliers: db.listSuppliers, getSupplierById: db.getSupplierById,
      createSupplier: db.createSupplier, updateSupplier: db.updateSupplier, deleteSupplier: db.deleteSupplier } });
  return service;
}

export async function authorizeSupplierAction(actorId: number, method: "list" | "getById" | "create" | "update" | "delete", input: unknown) {
  try { await getSupplierPermissionService().authorizeSupplier({ actorId }, method, input); }
  catch (error) {
    const code = supplierPermissionAdapterErrorCode(error);
    if (!code) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Supplier permissions could not be checked. Please try again." });
    throw new TRPCError({ code: code === "UNAUTHENTICATED" ? "UNAUTHORIZED" : code === "POLICY_UNAVAILABLE" ? "INTERNAL_SERVER_ERROR" : "FORBIDDEN",
      message: code === "POLICY_UNAVAILABLE" ? "Supplier permissions could not be checked. Please try again." : "Your role does not allow this Supplier Management action." });
  }
}

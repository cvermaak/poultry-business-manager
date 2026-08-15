export type SupplierOption = {
  id: number;
  supplierNumber: string | null;
  name: string;
};

type SupplierCandidate = {
  id?: unknown;
  supplierNumber?: unknown;
  name?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function resolveSupplierOptions(payload: unknown): SupplierOption[] {
  const candidates: unknown[] = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.suppliers)
      ? payload.suppliers
      : [];

  return candidates.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const supplier = candidate as SupplierCandidate;
    const id = Number(supplier.id);
    const name = typeof supplier.name === "string" ? supplier.name.trim() : "";

    if (!Number.isInteger(id) || id <= 0 || !name) return [];

    return [{
      id,
      name,
      supplierNumber:
        typeof supplier.supplierNumber === "string" && supplier.supplierNumber.trim()
          ? supplier.supplierNumber.trim()
          : null,
    }];
  });
}

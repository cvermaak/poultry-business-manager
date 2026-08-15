export type SupplierDropdownOption = {
  id: number;
  label: string;
};

type SupplierLike = {
  id?: unknown;
  name?: unknown;
  supplierNumber?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSupplierRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload) && Array.isArray(payload.suppliers)) return payload.suppliers;
  return [];
}

/**
 * Normalizes direct and wrapped supplier-list responses for a Radix Select.
 * Invalid rows are deliberately excluded because SelectItem values must be non-empty.
 */
export function resolveSupplierOptions(payload: unknown): SupplierDropdownOption[] {
  return getSupplierRows(payload).flatMap((row) => {
    if (!isRecord(row)) return [];

    const supplier = row as SupplierLike;
    const id = Number(supplier.id);
    const name = typeof supplier.name === "string" ? supplier.name.trim() : "";

    if (!Number.isSafeInteger(id) || id <= 0 || !name) return [];

    const supplierNumber = typeof supplier.supplierNumber === "string"
      ? supplier.supplierNumber.trim()
      : "";

    return [{
      id,
      label: supplierNumber ? `${supplierNumber} — ${name}` : name,
    }];
  });
}

// Inventory Edit only. Creation and the existing per-location list total are unchanged.
// Mirrors inventory_stock DECIMAL(10, 2); never rounds an entered quantity.
const MAX_QUANTITY_CENTS = 9_999_999_999;

export type StockAdjustment = {
  locationId: number;
  quantity: number;
  expectedQuantity: number;
  reason?: string;
};

export type StockEditDraft = {
  itemId: number | null;
  locationId: string;
  quantity: string;
  reason: string;
  quantityEdited: boolean;
  snapshot: { itemId: number; locationId: number; expectedQuantity: number } | null;
};

export type StockQuerySnapshot = {
  data: unknown;
  isSuccess: boolean;
  isError: boolean;
  isFetching: boolean;
  isStale: boolean;
  dataUpdatedAt: number;
};

export type StockEditContext = {
  stockQuery: StockQuerySnapshot;
  locations: readonly { id: number }[];
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function emptyStockEdit(itemId: number | null = null): StockEditDraft {
  return { itemId, locationId: "", quantity: "", reason: "", quantityEdited: false, snapshot: null };
}

export function parseStockEditQuantity(value: unknown): Result<number> {
  if (typeof value !== "number" && typeof value !== "string") {
    return { ok: false, error: "Enter a valid non-negative quantity with at most 2 decimal places." };
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return { ok: false, error: "Quantity must be finite." };
  }
  const text = String(value).trim();
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) {
    return { ok: false, error: "Enter a valid non-negative quantity with at most 2 decimal places." };
  }
  const [whole = "0", fraction = ""] = text.split(".");
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_QUANTITY_CENTS) {
    return { ok: false, error: "Quantity exceeds the supported stock precision (99999999.99)." };
  }
  return { ok: true, value: cents / 100 };
}

function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function selectedLocation(value: string, locations: StockEditContext["locations"]): Result<number> {
  if (!/^[1-9]\d*$/.test(value)) return { ok: false, error: "Choose a stock location before entering a new quantity." };
  const id = Number(value);
  if (!validId(id) || locations.filter(location => location.id === id).length !== 1) {
    return { ok: false, error: "Choose a valid available stock location." };
  }
  return { ok: true, value: id };
}

function readItemBalances(itemId: number, context: StockEditContext): Result<Map<number, number>> {
  const query = context.stockQuery;
  if (!validId(itemId) || query.isSuccess !== true || query.isError !== false || query.isFetching !== false || query.isStale !== false ||
      !Number.isFinite(query.dataUpdatedAt) || query.dataUpdatedAt <= 0 || !Array.isArray(query.data)) {
    return { ok: false, error: "Stock quantities are not confirmed. Refresh stock and wait for a successful load." };
  }
  const balances = new Map<number, number>();
  const seen = new Set<string>();
  for (const row of query.data) {
    if (!row || typeof row !== "object" || !validId(row.itemId)) {
      return { ok: false, error: "Stock data contains an invalid item. Refresh stock before adjusting." };
    }
    const key = `${row.itemId}:${row.locationId}`;
    if (!validId(row.locationId) || seen.has(key)) {
      return { ok: false, error: "Stock data contains an invalid or duplicate location. Refresh stock before adjusting." };
    }
    const quantity = parseStockEditQuantity(row.quantity);
    if (!quantity.ok) return { ok: false, error: "Stock data contains an invalid quantity. Refresh stock before adjusting." };
    seen.add(key);
    if (row.itemId === itemId) balances.set(row.locationId, quantity.value);
  }
  return { ok: true, value: balances };
}

export function readStockEditTotal(itemId: number, context: StockEditContext): Result<number> {
  const balances = readItemBalances(itemId, context);
  if (!balances.ok) return balances;
  // Sum stored location balances only; never read inventory_items.currentStock.
  return { ok: true, value: Array.from(balances.value.values()).reduce((sum, quantity) => sum + quantity, 0) };
}

export function selectStockEditLocation(
  itemId: number,
  locationId: string,
  context: StockEditContext,
): Result<StockEditDraft> {
  if (!locationId) return { ok: true, value: emptyStockEdit(itemId) };
  const location = selectedLocation(locationId, context.locations);
  if (!location.ok) return location;
  const balances = readItemBalances(itemId, context);
  if (!balances.ok) return balances;
  // An absent row is zero ONLY after a confirmed, valid complete stock query.
  const expectedQuantity = balances.value.get(location.value) ?? 0;
  return {
    ok: true,
    value: {
      ...emptyStockEdit(itemId), locationId, quantity: String(expectedQuantity),
      snapshot: { itemId, locationId: location.value, expectedQuantity },
    },
  };
}

export function buildStockEditAdjustment(
  itemId: number,
  draft: StockEditDraft,
  context: StockEditContext,
): Result<StockAdjustment | undefined> {
  if (!validId(itemId) || draft.itemId !== itemId) {
    return { ok: false, error: "This stock draft belongs to a different item. Reopen Edit." };
  }
  // Unedited stock controls are metadata-only, even if stock is loading or a reason is present.
  if (!draft.quantityEdited) return { ok: true, value: undefined };
  const location = selectedLocation(draft.locationId, context.locations);
  if (!location.ok) return location;
  const quantity = parseStockEditQuantity(draft.quantity);
  if (!quantity.ok) return quantity;
  const snapshot = draft.snapshot;
  if (!snapshot || snapshot.itemId !== itemId || snapshot.locationId !== location.value) {
    return { ok: false, error: "Select the location again to load its actual stock quantity." };
  }
  const expected = parseStockEditQuantity(snapshot.expectedQuantity);
  if (!expected.ok) return { ok: false, error: "The observed stock quantity is invalid. Select the location again." };
  // A typed-but-unchanged quantity requires no adjustment, reason, stock write or audit.
  if (quantity.value === expected.value) return { ok: true, value: undefined };
  // Adjustment history uses the existing DECIMAL(10,4) base-quantity column.
  // Leave large unchanged balances alone; never truncate a changed audit value.
  if (quantity.value > 999999.99) {
    return { ok: false, error: "The new location quantity exceeds the existing adjustment-history limit (999999.99)." };
  }
  const balances = readItemBalances(itemId, context);
  if (!balances.ok) return balances;
  // Deliberately do not replace expectedQuantity with any background-query balance.
  // The atomic backend stale gate must reject a changed snapshot, not rebase the user's intent.
  const reason = draft.reason.trim();
  if (!reason || reason.length > 500) {
    return { ok: false, error: "Enter a reason for the quantity change (1–500 characters after trimming)." };
  }
  return { ok: true, value: { locationId: location.value, quantity: quantity.value, expectedQuantity: expected.value, reason } };
}

// The existing updateItem result contract is a boolean. Truthy objects are not confirmation.
export function isConfirmedInventoryUpdate(result: unknown): result is true {
  return result === true;
}

// Per-flock operator planning only. These kg/bird values are never breeder
// intake objectives and never follow the flock's body-weight display unit.
export const feedAllocationFields = [
  "starterAllocationKgPerBird",
  "growerAllocationKgPerBird",
  "finisherAllocationKgPerBird",
] as const;
export type FeedAllocationField = typeof feedAllocationFields[number];
export type FeedAllocationForm = Record<FeedAllocationField, string>;
export type FeedAllocationStored = Partial<Record<FeedAllocationField, string | number | null | undefined>>;
export type FeedAllocationCreatePayload = Record<FeedAllocationField, string | null>;
export type FeedAllocationEditPayload = Partial<Record<FeedAllocationField, string>>;
export const FEED_ALLOCATION_HINT = "Planning allocation; not breeder intake objective. Blank new flock = not specified; blank during edit preserves saved allocation";

/** Validate decimal(6,3), then serialize exactly by padding, never rounding. */
export function parseFeedAllocation(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Feed allocation must be a decimal kg/bird value.");
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) throw new Error("Feed allocation must be finite and nonnegative.");
  const text = String(value).trim();
  if (!text) return null;
  // Plain decimal notation only; reject malformed numbers and excess precision.
  if (!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(text)) throw new Error("Feed allocation must be nonnegative with at most 3 decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const integer = (whole || "0").replace(/^0+(?=\d)/, "");
  if (integer.length > 3) throw new Error("Feed allocation cannot exceed 999.999 kg/bird (decimal column precision).");
  return `${integer}.${fraction.padEnd(3, "0")}`;
}

export function blankFeedAllocationForm(): FeedAllocationForm {
  return { starterAllocationKgPerBird: "", growerAllocationKgPerBird: "", finisherAllocationKgPerBird: "" };
}

/** Preserve the exact stored representation and intentional zero; no defaults. */
export function hydrateFeedAllocationForm(stored: FeedAllocationStored): FeedAllocationForm {
  return Object.fromEntries(feedAllocationFields.map(field => [field, stored[field] == null ? "" : String(stored[field])])) as FeedAllocationForm;
}

export function parseFeedAllocationForm(form: FeedAllocationForm): FeedAllocationCreatePayload {
  return Object.fromEntries(feedAllocationFields.map(field => [field, parseFeedAllocation(form[field])])) as FeedAllocationCreatePayload;
}

export function allocationPayload(form: FeedAllocationForm, mode: "create"): FeedAllocationCreatePayload;
export function allocationPayload(form: FeedAllocationForm, mode: "edit"): FeedAllocationEditPayload;
export function allocationPayload(form: FeedAllocationForm, mode: "create" | "edit"): FeedAllocationCreatePayload | FeedAllocationEditPayload {
  const parsed = parseFeedAllocationForm(form);
  return mode === "create" ? parsed : Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== null)) as FeedAllocationEditPayload;
}

/** SSR-safe display, independent of settings, body-weight units or breed data. */
export function displayFeedAllocation(value: unknown): string {
  try {
    const allocation = parseFeedAllocation(value);
    return allocation === null ? "Not specified" : `${allocation} kg/bird`;
  } catch { return "Invalid allocation"; }
}

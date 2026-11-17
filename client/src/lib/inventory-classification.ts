type Status = "active" | "inactive" | "discontinued" | "obsolete";
type ItemType = "stocked_item" | "non_stocked" | "service" | "raw_material" | "finished_good" | "consumable";

/** A legacy NULL is unknown, not a business default. */
export function hydrateInventoryClassification(item: { itemStatus?: Status | null; itemType?: ItemType | null }): { itemStatus: Status | ""; itemType: ItemType | "" } {
  return { itemStatus: item.itemStatus ?? "", itemType: item.itemType ?? "" };
}

/** Blank selectors omit fields, so unrelated edits leave legacy NULL unchanged.
 * Existing known classifications are preserved; selecting a value is explicit.
 * This does not introduce a new classification policy or a clear-to-NULL action.
 */
export function inventoryClassificationUpdate(form: { itemStatus: Status | ""; itemType: ItemType | "" }) {
  return {
    ...(form.itemStatus ? { itemStatus: form.itemStatus } : {}),
    ...(form.itemType ? { itemType: form.itemType } : {}),
  };
}

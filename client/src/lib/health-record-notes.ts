/**
 * Converts the controlled Health Record notes field into the canonical API value.
 * A blank field is an intentional clear, not an omitted update property.
 */
export function normalizeHealthRecordNotes(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

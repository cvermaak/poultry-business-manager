export type EffectiveDatedRecord = {
  id: number;
  effectiveDate: string | null;
};

/**
 * Returns the newest record active on the requested date. ISO yyyy-mm-dd dates
 * are intentionally compared lexically so no local-time conversion changes the
 * business-effective date.
 */
export function selectEffectiveDatedRecord<T extends EffectiveDatedRecord>(
  records: T[],
  asOfDate: string,
): T | null {
  const asOf = asOfDate.slice(0, 10);
  return records
    .filter((record) => Boolean(record.effectiveDate) && record.effectiveDate!.slice(0, 10) <= asOf)
    .sort((left, right) => {
      const dateComparison = right.effectiveDate!.slice(0, 10).localeCompare(left.effectiveDate!.slice(0, 10));
      return dateComparison || right.id - left.id;
    })[0] ?? null;
}

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableCell } from "@/components/ui/table";
import { describeDailyLosses } from "@shared/daily-losses";
import {
  changeDailyLossField,
  MAX_CULL_REASON_LENGTH,
  MAX_DAILY_LOSSES,
  parseDailyLossCount,
  recordedLossBasedPreview,
  validateDailyLossForm,
  type DailyLossField,
  type DailyLossForm,
} from "@/lib/daily-loss-form";

export const LEGACY_LOSS_LABEL = "Combined losses — breakdown unavailable";

export function DailyLossFields({ value, onChange, currentCount, idPrefix }: {
  value: DailyLossForm;
  onChange: (value: DailyLossForm) => void;
  currentCount: number;
  idPrefix: string;
}) {
  const validation = validateDailyLossForm(value);
  const total = validation.ok ? validation.totalLosses : null;
  const preview = recordedLossBasedPreview(currentCount, total, value.mode === "create" ? 0 : value.snapshot?.mortality ?? null);
  const errors = validation.ok ? {} : validation.errors;
  const disabled = value.mode === "invalid";
  const update = (field: DailyLossField, text: string) => onChange(changeDailyLossField(value, field, text));
  const countField = (field: "foundDead" | "culls" | "combinedTotal", label: string) => (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-${field}`}>{label}</Label>
      <Input
        id={`${idPrefix}-${field}`}
        type="number"
        inputMode="numeric"
        min="0"
        max={MAX_DAILY_LOSSES}
        step="1"
        required={!disabled}
        disabled={disabled}
        value={value[field]}
        placeholder={disabled ? "Unavailable" : "Enter count, including 0"}
        aria-invalid={Boolean(errors[field])}
        aria-describedby={`${idPrefix}-${field}-help`}
        onChange={event => update(field, event.target.value)}
      />
      <p id={`${idPrefix}-${field}-help`} className={`text-xs ${errors[field] ? "text-destructive" : "text-muted-foreground"}`}>
        {errors[field] || (field === "culls" ? "Birds euthanised on farm; not sales, harvests or transfers." : "Explicit non-negative whole number; enter 0 for none.")}
      </p>
    </div>
  );

  return (
    <section className="border-t pt-4 space-y-3" aria-label="Daily losses">
      <h4 className="font-medium">Total losses & recorded-loss-based bird count</h4>
      {value.mode === "legacy" ? (
        <>
          <p className="text-sm text-muted-foreground">Combined losses — mortality/cull breakdown unavailable. Historical totals, including zero, do not imply a known split.</p>
          {countField("combinedTotal", LEGACY_LOSS_LABEL)}
        </>
      ) : (
        <>
          {disabled && (
            <p className="text-sm text-destructive" role="status">
              Stored loss breakdown is invalid. Loss controls are disabled; unrelated feed, weight and notes edits remain available. {value.issue}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            {countField("foundDead", "Found dead")}
            {countField("culls", "Culls")}
          </div>
          {!disabled && (parseDailyLossCount(value.culls) ?? 0) > 0 && (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-cullReason`}>Culling reason (optional)</Label>
              <Textarea
                id={`${idPrefix}-cullReason`}
                value={value.cullReason}
                maxLength={MAX_CULL_REASON_LENGTH}
                rows={2}
                aria-invalid={Boolean(errors.cullReason)}
                aria-describedby={`${idPrefix}-reason-help`}
                onChange={event => update("cullReason", event.target.value)}
              />
              {value.mode === "split" && value.snapshot?.cullReason != null
                && !value.cullReason.trim() && !value.reasonDirty && (
                  <Button type="button" variant="outline" size="sm" onClick={() => update("cullReason", "")}>
                    Clear reason
                  </Button>
                )}
              <p id={`${idPrefix}-reason-help`} className="text-xs text-muted-foreground">
                {errors.cullReason || `Daily record note only, up to ${MAX_CULL_REASON_LENGTH} characters; not a diagnosis.`}
              </p>
            </div>
          )}
        </>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-total`}>Total losses (mortality & culls)</Label>
          <output id={`${idPrefix}-total`} className="block text-lg font-medium p-2 bg-muted rounded" aria-live="polite">
            {disabled ? value.combinedTotal || "Unavailable" : total === null ? "Awaiting valid counts" : total.toLocaleString()}
          </output>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-preview`}>Recorded-loss-based count after saving</Label>
          <output id={`${idPrefix}-preview`} className="block text-lg font-medium p-2 bg-muted rounded" aria-live="polite">
            {preview === null ? "Preview unavailable" : `${preview.toLocaleString()} birds`}
          </output>
        </div>
      </div>
      {!validation.ok && !disabled && <p className="text-xs text-destructive">{validation.issue}</p>}
      <p className="text-xs text-muted-foreground">This count deducts recorded combined losses once. It is not verified physical stock and does not deduct harvest removals.</p>
    </section>
  );
}

export function DailyLossHistoryCells({ record }: {
  record: { mortality: unknown; culls?: unknown; cullReason?: unknown };
}) {
  const losses = describeDailyLosses(record);
  return (
    <>
      <TableCell>
        <span className={losses.totalLosses !== null && losses.totalLosses > 0 ? "text-red-600 font-medium" : ""}>
          {losses.totalLosses ?? "Unavailable"}
        </span>
      </TableCell>
      <TableCell>{losses.mode === "split" ? losses.foundDead : "Unavailable"}</TableCell>
      <TableCell>{losses.mode === "split" ? losses.culls : "Unavailable"}</TableCell>
      <TableCell className="min-w-[180px]" title={losses.issue || undefined}>
        {losses.mode === "split" ? "Separately recorded" : losses.mode === "legacy" ? "Combined losses — mortality/cull breakdown unavailable" : "Invalid stored losses — review required"}
      </TableCell>
      <TableCell className="max-w-[200px] break-words" title={losses.cullReason || undefined}>
        {losses.mode === "split" ? losses.cullReason || "—" : "Unavailable"}
      </TableCell>
    </>
  );
}

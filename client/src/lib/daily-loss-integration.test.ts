import { readFileSync } from "node:fs";
import React from "react";
import { describe, expect, it } from "vitest";
import { DailyLossFields } from "../components/DailyLossFields";
import { buildDailyLossUpdate, hydrateDailyLossForm } from "./daily-loss-form";

const page = readFileSync("client/src/pages/FlockDetail.tsx", "utf8");
const section = (start: string, end: string) => page.slice(page.indexOf(start), page.indexOf(end, page.indexOf(start)));

describe("FlockDetail daily-loss capture integration", () => {
  it("uses shared pure validation and components, with no old mortality-coercing form state", () => {
    expect(page).toContain('from "@/components/DailyLossFields"');
    expect(page).toContain('useState(emptyDailyLossForm)');
    expect(page.match(/<DailyLossFields/g)?.length).toBe(2);
    expect(page).toContain('<DailyLossHistoryCells record={record} />');
    expect(page).not.toContain("dailyRecordForm.mortality");
    expect(page).not.toContain('id="mortality"');
    expect(page).not.toContain('id="edit-mortality"');
  });
  it("create sends only coherent losses and preserves all unrelated daily input behavior", () => {
    const create = section("const handleSubmitDailyRecord", "const handleEditDailyRecord");
    expect(create).toContain("validateDailyLossForm(dailyLossForm)");
    expect(create).toContain('dailyLossForm.mode !== "create"');
    expect(create).toContain("losses: validated.losses");
    expect(create).not.toContain("mortality:");
    expect(create).not.toContain("expectedLosses");
    expect(create).toContain("recordDate = getFlockPlacementDate(dailyRecordForm.recordDate)");
    expect(create).toContain("recordDate: new Date(`${recordDate}T00:00:00.000Z`)");
    expect(create).toContain("dayNumber = getFlockRecordDay(flock!.placementDate, recordDate)");
    expect(create).toContain("dayNumber,");
    for (const field of ["feedConsumed", "feedType", "waterConsumed", "averageWeight", "weightSamples", "temperature", "humidity", "notes"]) {
      expect(create).toContain(`${field}: dailyRecordForm.${field}`);
    }
  });
  it("edit hydrates only from the opened record and sends loss fields only via change helper", () => {
    const hydrate = section("const handleEditDailyRecord", "const handleUpdateDailyRecord");
    expect(hydrate).toContain("setDailyLossForm(hydrateDailyLossForm(record))");
    expect(hydrate).toContain("getFlockPlacementDate(record.recordDate)");
    const update = section("const handleUpdateDailyRecord", "const handleDeleteDailyRecord");
    expect(update).toContain("buildDailyLossUpdate(dailyLossForm)");
    expect(update).toContain("...lossUpdate.fields");
    expect(update).not.toContain("mortality:");
    expect(update).not.toContain("losses:");
    expect(update).not.toContain("recordDate:");
    expect(update).not.toContain("dayNumber:");
    expect(update).not.toContain("dailyRecords");
    expect(page).not.toContain("useEffect");
  });
  it("clears loss state on Add open/dismiss and explicit Add cancellation", () => {
    const add = section("<Dialog open={dailyRecordDialogOpen}", "{/* Edit Daily Record Dialog */}");
    expect(add).toMatch(/setDailyRecordDialogOpen\(open\);[\s\S]*?setDailyLossForm\(emptyDailyLossForm\(\)\);[\s\S]*?if \(open\)/);
    expect(add).toMatch(/setDailyRecordDialogOpen\(false\);\s+setDailyLossForm\(emptyDailyLossForm\(\)\);/);
    expect(section("const resetDailyRecordForm", "const resetHealthRecordForm")).toContain("setDailyLossForm(emptyDailyLossForm())");
  });
  it("resets edit state on dialog dismissal and explicit cancellation", () => {
    const edit = section("{/* Edit Daily Record Dialog */}", "{/* Delete Confirmation Dialog */}");
    expect(edit).toMatch(/if \(!open\) \{\s+setEditingRecordId\(null\);\s+resetDailyRecordForm\(\);/);
    expect(edit).toMatch(/setEditDailyRecordDialogOpen\(false\);\s+setEditingRecordId\(null\);\s+resetDailyRecordForm\(\);/);
    expect(edit).toContain("!buildDailyLossUpdate(dailyLossForm).ok");
  });
  it("keeps stale/error edits open with existing error toast and snapshot state", () => {
    const mutation = section("const updateDailyRecord =", "const deleteDailyRecord =");
    const error = mutation.slice(mutation.indexOf("onError:"));
    expect(error).toContain("toast.error(`Failed to update daily record: ${error.message}`)");
    expect(error).not.toContain("setEditDailyRecordDialogOpen");
    expect(error).not.toContain("resetDailyRecordForm");
    expect(error).not.toContain("setDailyLossForm");
  });
  it("invalidates detail/list/loss-dependent metrics/activity on successful create/update/delete", () => {
    const invalidation = section("const invalidateDailyRecordCaches", "// Mutations");
    for (const route of ["getDailyRecords", "getById", "getPerformanceMetrics", "list", "getAdvancedGrowthMetrics", "getFeedEfficiencyMetrics", "getActivityLogs"]) {
      expect(invalidation).toContain(`utils.flocks.${route}.invalidate(`);
    }
    for (const [start, end] of [["const createDailyRecord =", "const updateDailyRecord ="], ["const updateDailyRecord =", "const deleteDailyRecord ="], ["const deleteDailyRecord =", "const createHealthRecord ="]]) {
      expect(section(start, end)).toContain("onSuccess: () => {\n      invalidateDailyRecordCaches();");
    }
  });
  it("relabels total compatibility metrics but does not add cull subtraction or partial summaries", () => {
    expect(page).toContain("Total losses (mortality & culls)");
    expect(page).toContain("% total loss rate");
    expect(page).toContain("{performanceMetrics?.mortalityRate || 0}%");
    expect(page).toContain("sum + (r.mortality || 0)");
    expect(page).not.toContain("sum + (r.culls");
    expect(page).not.toContain("flock.currentCount -");
    expect(page).not.toContain("Total Mortality");
    for (const label of ["Total losses", "Found dead", "Culls", "Split status", "Culling reason"]) {
      expect(page).toContain(`<TableHead>${label}</TableHead>`);
    }
  });
  it("preserves auth, activity timezone, health-note normalization, and date controls", () => {
    expect(page).toContain("const { user } = useAuth()");
    expect(page).toContain('import { useAuth } from "@/_core/hooks/useAuth"');
    expect(page).toContain("deleteDailyRecord.mutate({ id: recordToDelete.id, flockId })");
    expect(page).toContain("trpc.system.getDisplayTimezone.useQuery()");
    expect(page).toContain("<AuditTimestamp value={log.createdAt}");
    expect(page).toContain("normalizeHealthRecordNotes(healthRecordForm.notes)");
    expect(page).toContain('format(new Date(), "yyyy-MM-dd\'T\'HH:mm")');
    expect(page).toContain('type="date" value={dailyRecordForm.recordDate} disabled');
    expect(page).toContain("scheduledDate: new Date(vaccinationForm.scheduledDate)");
    expect(page).toContain("recordDate: new Date(healthRecordForm.recordDate)");
  });
});

// Walk the component's elements to invoke its actual callbacks without a DOM
// or mounting the page (which would require auth/query/network providers).
function findControl(node: React.ReactNode, matches: (element: React.ReactElement<Record<string, unknown>>) => boolean): React.ReactElement<Record<string, unknown>> | undefined {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement<Record<string, unknown>>(child)) continue;
    if (matches(child)) return child;
    const nested = findControl(child.props.children as React.ReactNode, matches);
    if (nested) return nested;
  }
}

function editFields(cullReason: string | null) {
  let form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason });
  const view = () => DailyLossFields({ value: form, onChange: next => { form = next; }, currentCount: 100, idPrefix: "integration-losses" });
  return {
    form: () => form,
    edit(field: string, value: string) {
      const control = findControl(view(), element => element.props.id === `integration-losses-${field}`);
      if (!control) throw new Error(`Missing field: ${field}`);
      (control.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    },
    clearReason() {
      const button = findControl(view(), element => element.props.children === "Clear reason");
      if (!button) throw new Error("Missing explicit clear action");
      expect(button.props.type).toBe("button");
      (button.props.onClick as () => void)();
    },
  };
}

describe("daily loss field callback integration", () => {
  it.each(["  note  ", "   "])("count-only input preserves raw reason %j through omission", cullReason => {
    const fields = editFields(cullReason);
    fields.edit("foundDead", "4");
    expect(fields.form().reasonDirty).toBe(false);
    expect(buildDailyLossUpdate(fields.form())).toEqual({
      ok: true, fields: { losses: { foundDead: 4, culls: 2 }, expectedLosses: { mortality: 5, culls: 2, cullReason } },
    });
  });
  it("blank-display clear callback sends NULL with unchanged counts and the original raw snapshot", () => {
    const fields = editFields("   ");
    fields.clearReason();
    expect(fields.form().reasonDirty).toBe(true);
    expect(buildDailyLossUpdate(fields.form())).toEqual({
      ok: true, fields: { losses: { foundDead: 3, culls: 2, cullReason: null }, expectedLosses: { mortality: 5, culls: 2, cullReason: "   " } },
    });
  });
  it("reason textarea callback explicitly owns trimming and clearing", () => {
    const fields = editFields("  note  ");
    fields.edit("cullReason", "  new reason  ");
    expect(fields.form().reasonDirty).toBe(true);
    expect(buildDailyLossUpdate(fields.form())).toMatchObject({ fields: { losses: { cullReason: "new reason" }, expectedLosses: { cullReason: "  note  " } } });
    fields.edit("cullReason", "");
    expect(buildDailyLossUpdate(fields.form())).toMatchObject({ fields: { losses: { cullReason: null } } });
  });
  it("count spelling and normalized canonical reason callbacks are semantic no-ops", () => {
    const fields = editFields("note");
    fields.edit("foundDead", "003");
    fields.edit("culls", "02");
    fields.edit("cullReason", "  note  ");
    expect(fields.form().reasonDirty).toBe(true);
    expect(buildDailyLossUpdate(fields.form())).toEqual({ ok: true, fields: {} });
  });
  it("zero-cull callback clears even an untouched whitespace reason", () => {
    const fields = editFields("   ");
    fields.edit("culls", "0");
    expect(fields.form().reasonDirty).toBe(false);
    expect(buildDailyLossUpdate(fields.form())).toEqual({
      ok: true, fields: { losses: { foundDead: 3, culls: 0, cullReason: null }, expectedLosses: { mortality: 5, culls: 2, cullReason: "   " } },
    });
  });
});

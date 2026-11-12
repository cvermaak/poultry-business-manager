import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DailyLossFields, DailyLossHistoryCells } from "../components/DailyLossFields";
import { changeDailyLossField, emptyDailyLossForm, hydrateDailyLossForm, type DailyLossForm } from "./daily-loss-form";

function fields(form: DailyLossForm, currentCount = 100) {
  return renderToStaticMarkup(React.createElement(DailyLossFields, {
    value: form, onChange: () => {}, currentCount, idPrefix: "test-losses",
  }));
}
function history(record: { mortality: unknown; culls?: unknown; cullReason?: unknown }) {
  return renderToStaticMarkup(React.createElement("table", null,
    React.createElement("tbody", null, React.createElement("tr", null,
      React.createElement(DailyLossHistoryCells, { record }),
    )),
  ));
}
function cellText(markup: string) {
  return [...markup.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(match => match[1].replace(/<[^>]+>/g, ""));
}

describe("daily loss form SSR", () => {
  it("renders explicit blank required fields, not implicit zero and not an invented preview", () => {
    const markup = fields(emptyDailyLossForm());
    expect(markup).toContain('id="test-losses-foundDead"');
    expect(markup).toContain('id="test-losses-culls"');
    expect(markup.match(/value=""/g)?.length).toBe(2);
    expect(markup.match(/required=""/g)?.length).toBe(2);
    expect(markup).toContain('step="1"');
    expect(markup).toContain('max="2147483647"');
    expect(markup).toContain("Awaiting valid counts");
    expect(markup).toContain("Preview unavailable");
    expect(markup).not.toContain('id="test-losses-cullReason"');
  });
  it.each(["create", "split"] as const)("renders the shortened red messages in %s while retaining the input maximum", mode => {
    const markup = fields({ ...emptyDailyLossForm(), mode });
    for (const field of ["foundDead", "culls"]) {
      expect(markup).toContain(`<p id="test-losses-${field}-help" class="text-xs text-destructive">Enter an explicit non-negative whole number (0 is allowed)</p>`);
    }
    expect(markup.match(/max="2147483647"/g)?.length).toBe(2);
    expect(markup).not.toContain("up to 2147483647.");
  });
  it("renders valid explicit zero and retains current count", () => {
    const markup = fields({ ...emptyDailyLossForm(), foundDead: "0", culls: "0" });
    expect(markup.match(/value="0"/g)?.length).toBe(2);
    expect(markup).toContain("100 birds");
    expect(markup).not.toContain("Awaiting valid counts");
    expect(markup).toContain("not verified physical stock");
    expect(markup).toContain("does not deduct harvest removals");
  });
  it("renders positive-cull optional bounded reason with proper escaping", () => {
    const markup = fields({ ...emptyDailyLossForm(), foundDead: "3", culls: "2", cullReason: "<script>welfare</script>" });
    expect(markup).toContain('id="test-losses-cullReason"');
    expect(markup).toContain('maxLength="1000"');
    expect(markup).toContain("&lt;script&gt;welfare&lt;/script&gt;");
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("95 birds");
  });
  it.each(["   ", ""])("renders an explicit non-submitting clear action for raw non-NULL blank reason %j", cullReason => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason });
    const markup = fields(form);
    expect(markup).toContain('id="test-losses-cullReason"');
    expect(markup).toMatch(/<textarea[^>]*><\/textarea>/);
    expect(markup).toMatch(/<button[^>]*type="button"[^>]*>Clear reason<\/button>/);
    expect(markup).toContain("100 birds");
    expect(fields(changeDailyLossField(form, "cullReason", ""))).not.toContain("Clear reason");
  });
  it.each([null, "note", "  note  "])("does not offer the blank-reason clear action for %j", cullReason => {
    expect(fields(hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason }))).not.toContain("Clear reason");
  });
  it("hides the reason and clear action when culls are explicitly zero", () => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: "   " });
    const markup = fields(changeDailyLossField(form, "culls", "0"));
    expect(markup).not.toContain('id="test-losses-cullReason"');
    expect(markup).not.toContain("Clear reason");
    expect(markup).toContain("102 birds");
  });
  it.each([0, 5])("renders legacy NULL total %s with only combined-total controls", mortality => {
    const markup = fields(hydrateDailyLossForm({ mortality, culls: null, cullReason: null }));
    expect(markup).toContain("Combined losses — breakdown unavailable");
    expect(markup).toContain("mortality/cull breakdown unavailable");
    expect(markup).toContain('id="test-losses-combinedTotal"');
    expect(markup).not.toContain('id="test-losses-foundDead"');
    expect(markup).not.toContain('id="test-losses-culls"');
    expect(markup).not.toContain('id="test-losses-cullReason"');
    expect(markup).toContain("100 birds");
  });
  it("renders replacement Edit preview without double-subtracting the original total", () => {
    const form = hydrateDailyLossForm({ mortality: 5, culls: 2, cullReason: null });
    expect(fields({ ...form, foundDead: "6" })).toContain("97 birds");
    expect(fields(form)).toContain("100 birds");
  });
  it("renders invalid stored losses as disabled blank controls with unrelated edits explained", () => {
    const markup = fields(hydrateDailyLossForm({ mortality: 2, culls: 3, cullReason: null }));
    expect(markup.match(/disabled=""/g)?.length).toBe(2);
    expect(markup.match(/value=""/g)?.length).toBe(2);
    expect(markup).toContain("Loss controls are disabled");
    expect(markup).toContain("unrelated feed, weight and notes edits remain available");
    expect(markup).toContain("Preview unavailable");
    expect(markup).not.toContain("100 birds");
  });
  it.each([
    { mortality: 5, culls: 0, cullReason: "   " },
    { mortality: 5, culls: null, cullReason: "   " },
    { mortality: 5, culls: 2, cullReason: ` ${"a".repeat(1000)} ` },
  ])("disables malformed raw reason rows instead of deriving a valid split for %j", record => {
    const markup = fields(hydrateDailyLossForm(record));
    expect(markup.match(/disabled=""/g)?.length).toBe(2);
    expect(markup).toContain("Loss controls are disabled");
    expect(markup).not.toContain('id="test-losses-cullReason"');
    expect(markup).not.toContain("Clear reason");
    expect(markup).not.toContain('id="test-losses-combinedTotal"');
  });
  it("exposes invalid fractions/overflow and blanks instead of presenting zero totals", () => {
    for (const form of [
      { ...emptyDailyLossForm(), foundDead: "1.5", culls: "0" },
      { ...emptyDailyLossForm(), foundDead: "2147483647", culls: "1" },
      { ...emptyDailyLossForm(), foundDead: "", culls: "0" },
    ]) {
      const markup = fields(form);
      expect(markup).toContain('aria-invalid="true"');
      expect(markup).toContain("Awaiting valid counts");
      expect(markup).toContain("Preview unavailable");
    }
  });
});

describe("daily-loss history SSR", () => {
  it.each([0, 5])("keeps legacy NULL total %s and both unknown counts unavailable", mortality => {
    const cells = cellText(history({ mortality, culls: null, cullReason: null }));
    expect(cells).toEqual([String(mortality), "Unavailable", "Unavailable", "Combined losses — mortality/cull breakdown unavailable", "Unavailable"]);
  });
  it.each([
    { mortality: 0, culls: 0, foundDead: 0 },
    { mortality: 3, culls: 0, foundDead: 3 },
    { mortality: 3, culls: 3, foundDead: 0 },
    { mortality: 5, culls: 2, foundDead: 3 },
  ])("displays recorded split including explicit zero %j", ({ mortality, culls, foundDead }) => {
    expect(cellText(history({ mortality, culls, cullReason: null }))).toEqual([String(mortality), String(foundDead), String(culls), "Separately recorded", "—"]);
  });
  it("shows record reason without HTML injection", () => {
    const markup = history({ mortality: 3, culls: 2, cullReason: "<b>daily welfare note</b>" });
    expect(markup).toContain("&lt;b&gt;daily welfare note&lt;/b&gt;");
    expect(markup).not.toContain("<b>");
  });
  it("does not derive a negative found-dead count from invalid culls", () => {
    const cells = cellText(history({ mortality: 2, culls: 3, cullReason: "untrusted reason" }));
    expect(cells).toEqual(["2", "Unavailable", "Unavailable", "Invalid stored losses — review required", "Unavailable"]);
    expect(cells.join(" ")).not.toContain("-1");
  });
  it.each([0, null])("does not present raw whitespace with culls %j as valid historical losses", culls => {
    expect(cellText(history({ mortality: 5, culls, cullReason: "   " }))).toEqual([
      "5", "Unavailable", "Unavailable", "Invalid stored losses — review required", "Unavailable",
    ]);
  });
});

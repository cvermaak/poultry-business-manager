import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DailyRecordText } from "@/components/DailyRecordText";

const render = (text: string | null | undefined, emptyText?: string) => renderToStaticMarkup(
  <DailyRecordText text={text} label="Notes · Day 7" emptyText={emptyText} />,
);

describe("Daily history text previews (offline SSR; browser interaction checked separately)", () => {
  it.each([null, undefined, "", "  \n\t "])("renders %j as a simple empty state without a dialog trigger", text => {
    const html = render(text);
    expect(html).toBe("<span>—</span>");
    expect(html).not.toContain("button");
  });

  it("preserves the notes-specific empty marker", () => {
    expect(render(null, "-")).toBe("<span>-</span>");
  });

  it.each(["Short note", "Long sentence ".repeat(200), "A".repeat(3000), "  First line\n\nSecond line\t  "])("retains the complete original %s text in a bounded preview", text => {
    const html = render(text);
    expect(html).toContain(text);
    expect(html).toContain('data-daily-text-preview=""');
    expect(html).toContain("line-clamp-2 max-h-10 overflow-hidden whitespace-normal leading-5 [overflow-wrap:anywhere]");
    expect(html).toContain('aria-label="View full text: Notes · Day 7"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-daily-text-full');
    expect(html).not.toContain("textarea");
  });

  it("renders HTML-like and special-character notes as text, never markup", () => {
    const html = render('<script>alert("x")</script> & <img src=x onerror=alert(1)>');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });
});

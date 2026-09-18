import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const invoicePagePath = resolve(process.cwd(), "client/src/pages/Invoices.tsx");

describe("invoice status tabs", () => {
  it("keeps the selected status as the single controlled tab value", () => {
    const invoicePageSource = readFileSync(invoicePagePath, "utf8");

    expect(invoicePageSource).toContain(
      '<Tabs value={selectedStatus} onValueChange={setSelectedStatus} className="w-full">'
    );
    expect(invoicePageSource).not.toContain(
      '<Tabs defaultValue="all" onValueChange={setSelectedStatus} className="w-full">'
    );
    expect(invoicePageSource).toContain('<TabsContent value={selectedStatus}');
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const changed = ["Customers", "SalesOrders", "Inventory", "Suppliers", "PurchaseOrders", "FeedOrders", "FeedOrderDetail", "FlockDetail", "HealthManagement", "Harvests"];
const source = (file: string) => readFileSync(resolve(root, file), "utf8");
const money = /\b(?:unit\s*cost|total\s*cost|unit\s*price|price\s*per|revenue|credit\s*limit|payment\s*terms|tax\s*(?:number|\/)|bank\s*(?:name|account)|cost\s*\(R\)|cost\s*per\s*kg|cost)\b|formatCurrency\(|formatRand\(/i;

function hasAllowedBoundary(node: ts.Node, file: ts.SourceFile): boolean {
  for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxExpression(parent) && parent.expression && /\ballowed\s*&&/.test(parent.expression.getText(file))) return true;
    if (ts.isFunctionDeclaration(parent) && /if\s*\(!allowed\)\s*return null/.test(parent.getText(file))) return true;
  }
  return false;
}

describe("financial visibility in mixed operational pages (source-only; no API calls)", () => {
  for (const page of changed) {
    it(`${page}: dynamic hook and all monetary table/form primitives have an allowed boundary`, () => {
      const text = source(`pages/${page}.tsx`);
      expect(text).toContain('import { useFinancialVisibility } from "@/hooks/useFinancialVisibility"');
      expect(text).toContain("const { allowed } = useFinancialVisibility();");
      expect(text).not.toMatch(/role\s*===?\s*["'](?:farm|Farm)/);
      const file = ts.createSourceFile(`${page}.tsx`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      expect(file.parseDiagnostics).toHaveLength(0);
      const unguarded: string[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node) && ["TableHead", "TableCell", "th", "td", "Label"].includes(node.openingElement.tagName.getText(file))) {
          const body = node.getText(file);
          if (money.test(body) && !hasAllowedBoundary(node, file)) unguarded.push(body);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      expect(unguarded).toEqual([]);
    });
  }

  it("optional inputs omit financial keys rather than sending hidden zero/default values", () => {
    expect(source("pages/Customers.tsx")).toMatch(/\.\.\.\(allowed \? \{ creditLimit:/);
    expect(source("pages/Suppliers.tsx")).toContain("const payload = allowed ? form : contact;");
    expect(source("pages/Inventory.tsx")).toMatch(/\.\.\.\(allowed \? \{ unitCost:/);
    expect(source("pages/FeedOrders.tsx")).toMatch(/\.\.\.\(allowed \? \{ transportCostPerTon:/);
    expect(source("pages/FeedOrders.tsx")).toMatch(/\.\.\.\(allowed \? \{ pricePerTon:/);
    expect(source("pages/FeedOrderDetail.tsx")).toMatch(/\.\.\.\(allowed \? \{ unitPricePerKg:/);
    expect(source("pages/FlockDetail.tsx")).toMatch(/\.\.\.\(allowed \? \{ cost:/);
    expect(source("pages/HealthManagement.tsx")).toContain("const payload = allowed ? result.data : operational;");
    expect(source("pages/Harvests.tsx")).toContain("allowed ? formData : operational");
  });

  it("required-price forms are hidden while status and receipt paths remain", () => {
    expect(source("pages/SalesOrders.tsx")).toContain("{allowed && (<Dialog open={createOpen}");
    expect(source("pages/SalesOrders.tsx")).toContain("{allowed && (<Dialog open={!!editOrder}");
    expect(source("pages/SalesOrders.tsx")).toContain("statusMut.mutate({ id: order.id, status: next })");
    expect(source("pages/PurchaseOrders.tsx")).toContain("{allowed && (<Dialog open={formOpen}");
    expect(source("pages/PurchaseOrders.tsx")).toContain("receiveMutation.mutate({ id: order.id, actualDeliveryDate:");
    expect(source("pages/Harvests.tsx")).toContain("if (editingHarvest && !allowed) return;");
    expect(source("pages/Harvests.tsx")).toContain("{allowed && (<Button variant=\"ghost\" size=\"sm\" onClick={() => handleEdit(harvest)}>");
  });

  it("inventory CSV excludes monetary columns and unsanitized notes when blocked", () => {
    const text = source("pages/Inventory.tsx");
    expect(text).toContain('...(allowed ? ["Unit Cost (R)", "Total Cost (R)"] : [])');
    expect(text).toContain('...(allowed ? ["Notes"] : [])');
    expect(text).toContain('...(allowed ? [transaction.notes || ""] : [])');
    expect(text).toContain("fmtNum(parseFloat(transaction.quantity");
    expect(text).toContain('reorderPoint: itemForm.reorderPoint ? parseFloat(itemForm.reorderPoint) : undefined');
  });

  it("historical harvest comparison money is guarded independently of operational metrics", () => {
    const text = source("components/HarvestHistoryComparison.tsx");
    expect(text).toContain("const { allowed } = useFinancialVisibility();");
    expect(text).toContain('{allowed && (<TableHead className="text-right">Total Revenue');
    expect(text).toContain("{formatRand(flock.totalRevenue)}");
    expect(text).toContain("Best Delivered Weight");
    expect(text).toContain("Lowest Shrinkage");
  });

  it("physical reports and formulation/mapping views are not mistaken for financial data", () => {
    for (const name of ["HarvestReport", "FeedReport", "FlockPerformanceReport", "HarvestPerformanceChart"]) {
      expect(source(`components/${name}.tsx`)).not.toMatch(/formatRand|formatCurrency|\b(?:unitCost|unitPrice|totalRevenue|pricePerKg|costPerKg)\b/);
    }
    for (const name of ["FeedFormulations", "AdditiveInventorySettings"]) {
      expect(source(`pages/${name}.tsx`)).not.toMatch(/formatRand|formatCurrency|\b(?:unitCost|unitPrice|totalRevenue|pricePerKg|costPerKg)\b/);
    }
    for (const name of ["harvest-report-csv", "feed-report-csv"]) {
      expect(source(`lib/${name}.ts`)).not.toMatch(/\b(?:unitCost|unitPrice|totalRevenue|pricePerKg|costPerKg|bankAccountNumber)\b/);
    }
  });
});

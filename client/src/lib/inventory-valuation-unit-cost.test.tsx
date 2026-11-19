import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatCents, formatRand } from "./format";

const require = createRequire(import.meta.url);
const sourcePath = path.resolve(process.cwd(), "client/src/pages/Inventory.tsx");
const source = fs.readFileSync(sourcePath, "utf8");
const parsed = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const valuationExpressions: ts.JsxExpression[] = [];
function visit(node: ts.Node): void {
  if (ts.isJsxExpression(node) && node.expression && ts.isConditionalExpression(node.expression) &&
      node.expression.condition.getText(parsed) === "item.unitCost") {
    let parent: ts.Node | undefined = node.parent;
    while (parent && !(ts.isJsxElement(parent) && parent.openingElement.tagName.getText(parsed) === "Card")) parent = parent.parent;
    if (parent?.getText(parsed).includes("Top Items by Value")) valuationExpressions.push(node);
  }
  ts.forEachChild(node, visit);
}
visit(parsed);

// Extract and render the real JSX cell expression, not a second copy of its formatter.
// Only react/jsx-runtime is allowed; no app/router/database module is imported or run.
function renderCell(unitCost: string | null | undefined): string {
  if (valuationExpressions.length !== 1) throw new Error("Expected exactly one valuation unit-cost cell");
  const expression = valuationExpressions[0].getText(parsed);
  const compiled = ts.transpileModule(`export function Cell({ item }: any) { return <>${expression}</>; }`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
  });
  if (compiled.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw new Error("Cell JSX did not compile");
  const module = { exports: {} as { Cell?: React.ComponentType<{ item: { unitCost: typeof unitCost } }> } };
  const limitedRequire = (name: string) => {
    if (name !== "react/jsx-runtime") throw new Error("Unexpected cell dependency: " + name);
    return require(name);
  };
  new Function("module", "exports", "require", "formatCents", "formatCurrency", compiled.outputText)(
    module, module.exports, limitedRequire, formatCents, formatRand,
  );
  return renderToStaticMarkup(React.createElement(module.exports.Cell!, { item: { unitCost } }));
}

describe("Inventory valuation raw-cent unit-cost display", () => {
  it("uses the existing cents helper in the real valuation cell", () => {
    expect(valuationExpressions).toHaveLength(1);
    expect(valuationExpressions[0].expression!.getText(parsed)).toBe('item.unitCost ? formatCents(item.unitCost) : "-"');
  });
  it.each([
    ["98800", "R988.00"],
    ["98801", "R988.01"],
    ["1", "R0.01"],
    ["0", "R0.00"],
    ["123456789", "R1 234 567.89"],
    [null, "-"],
    [undefined, "-"],
  ])("renders raw cents %s as %s", (value, expected) => {
    expect(renderCell(value)).toBe(expected);
  });
  it("keeps the already-rand total value cell unchanged", () => {
    expect(source).toMatch(/\{formatCurrency\(item\.totalValue\)\}/);
    expect(formatRand(34 * (98800 / 100))).toBe("R33 592.00");
    expect(formatCents("98800")).toBe("R988.00");
  });
  it("preserves the page's existing cents conversion for item and history costs", () => {
    expect(source).toContain("formatCurrency(item.unitCost / 100)");
    expect(source).toContain("formatCurrency(parseFloat(String(transaction.unitCost)) / 100)");
    expect(source).toContain("formatCurrency(parseFloat(String(transaction.totalCost)) / 100)");
  });
});

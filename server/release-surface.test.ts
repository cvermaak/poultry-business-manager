import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const appSource = readFileSync(resolve(projectRoot, "client/src/App.tsx"), "utf8");
const salesSource = readFileSync(resolve(projectRoot, "client/src/pages/Sales.tsx"), "utf8");
const catchSource = readFileSync(resolve(projectRoot, "server/procedures/catch.ts"), "utf8");

describe("release surface integrity", () => {
  it("does not ship the dormant slaughter route without its schema and router", () => {
    expect(appSource).not.toContain("SlaughterManagement");
    expect(appSource).not.toContain('path="/flocks/:flockId/slaughter"');
    expect(existsSync(resolve(projectRoot, "server/procedures/slaughter.ts"))).toBe(false);
    expect(existsSync(resolve(projectRoot, "server/helpers/slaughter-db.ts"))).toBe(false);
  });

  it("does not expose the unsupported multi-session invoice control", () => {
    expect(salesSource).not.toContain("createMultipleMutation");
    expect(salesSource).not.toContain("createMultiple.useMutation");
    expect(salesSource).not.toContain("Select multiple catch sessions");
  });

  it("persists catch-session aggregate fields that exist in the active schema", () => {
    expect(catchSource).toContain("updatedSession.totalNetWeight");
    expect(catchSource).not.toContain("updatedSession.totalWeightCaught");
    expect(catchSource).toContain("totalBirdsCaught: currentBirdsCaught");
    expect(catchSource).toContain("totalNetWeight: currentWeightCaught.toString()");
    expect(catchSource).toContain("Array.from(sessionIds)");
  });
});

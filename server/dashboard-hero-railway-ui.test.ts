import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const homePath = resolve(projectRoot, "client/src/pages/Home.tsx");
const heroAssetPath = resolve(projectRoot, "client/public/afgro-dashboard-commercial-chicken-houses_846bfbcf.png");

describe("Railway dashboard hero", () => {
  it("ships the selected commercial chicken-house image locally without Manus storage", () => {
    const homeSource = readFileSync(homePath, "utf8");

    expect(existsSync(heroAssetPath)).toBe(true);
    expect(homeSource).toContain('src="/afgro-dashboard-commercial-chicken-houses_846bfbcf.png"');
    expect(homeSource).toContain("aspectRatio: '18/5'");
    expect(homeSource).toContain("object-[center_40%]");
    expect(homeSource).not.toContain("/manus-storage/");
    expect(homeSource).not.toContain("files.manuscdn.com");
  });
});

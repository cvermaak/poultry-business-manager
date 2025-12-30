import { describe, it, expect } from "vitest";
import { getDb } from "./db";
import { reminderTemplates } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Drizzle JSON Reading Test", () => {
  it("should correctly read isBundle and bundleConfig from custom template", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [template] = await db.select().from(reminderTemplates).where(eq(reminderTemplates.id, 120002));
    
    console.log("Template:", template.name);
    console.log("isBundle:", template.isBundle, "(type:", typeof template.isBundle, ")");
    console.log("bundleConfig:", template.bundleConfig ? "present" : "null");
    
    if (template.bundleConfig) {
      const config = template.bundleConfig as any[];
      console.log("bundleConfig is array:", Array.isArray(config));
      console.log("bundleConfig length:", config.length);
      
      config.forEach((cat, i) => {
        console.log(`  [${i}] ${cat.category}: enabled=${cat.enabled}, reminders=${cat.reminders?.length || 0}`);
      });
    }
    
    expect(template.isBundle).toBe(true);
    expect(template.bundleConfig).toBeTruthy();
    expect(Array.isArray(template.bundleConfig)).toBe(true);
  });
});

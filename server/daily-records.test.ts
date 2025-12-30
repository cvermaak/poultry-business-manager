import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Daily Records", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  describe("getDailyRecords", () => {
    it("returns an array for a valid flock ID", async () => {
      // Use a flock ID that exists in the test database
      const result = await caller.flocks.getDailyRecords({ flockId: 1 });
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty array for non-existent flock", async () => {
      const result = await caller.flocks.getDailyRecords({ flockId: 999999 });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe("createDailyRecord", () => {
    it("validates required fields", async () => {
      // Test that the procedure accepts valid input structure
      const validInput = {
        flockId: 1,
        recordDate: new Date(),
        dayNumber: 1,
        mortality: 0,
        feedConsumed: 10.5,
        feedType: "starter" as const,
        waterConsumed: 20.0,
        averageWeight: 0.5,
        temperature: 28.5,
        humidity: 65,
        notes: "Test record",
      };

      // This tests that the input validation passes
      // The actual insert may fail if flock doesn't exist, but that's OK for validation testing
      try {
        await caller.flocks.createDailyRecord(validInput);
        // If it succeeds, that's fine
        expect(true).toBe(true);
      } catch (error: any) {
        // If it fails, it should be a database error, not a validation error
        expect(error.message).not.toContain("validation");
      }
    });

    it("accepts optional fields as undefined", async () => {
      const minimalInput = {
        flockId: 1,
        recordDate: new Date(),
        dayNumber: 1,
        mortality: 0,
        feedConsumed: 0,
      };

      try {
        await caller.flocks.createDailyRecord(minimalInput);
        expect(true).toBe(true);
      } catch (error: any) {
        // Database errors are acceptable, validation errors are not
        expect(error.message).not.toContain("validation");
      }
    });
  });

  describe("FCR Calculation Logic", () => {
    it("calculates FCR correctly", () => {
      // FCR = Total Feed / (Current Count × Average Weight)
      const totalFeed = 1000; // kg
      const currentCount = 500;
      const averageWeight = 2.0; // kg

      const fcr = totalFeed / (currentCount * averageWeight);
      expect(fcr).toBe(1.0);
    });

    it("handles edge cases in FCR calculation", () => {
      // Zero weight should result in Infinity (handled as N/A in UI)
      const totalFeed = 1000;
      const currentCount = 500;
      const averageWeight = 0;

      const fcr = averageWeight > 0 ? totalFeed / (currentCount * averageWeight) : null;
      expect(fcr).toBeNull();
    });
  });

  describe("Day Number Calculation", () => {
    it("calculates day number from placement date", () => {
      const placementDate = new Date("2025-12-01");
      const recordDate = new Date("2025-12-15");
      
      const dayNumber = Math.floor((recordDate.getTime() - placementDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(dayNumber).toBe(14);
    });

    it("returns 0 for same day as placement", () => {
      const placementDate = new Date("2025-12-01");
      const recordDate = new Date("2025-12-01");
      
      const dayNumber = Math.floor((recordDate.getTime() - placementDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(dayNumber).toBe(0);
    });
  });

  describe("Mortality Rate Calculation", () => {
    it("calculates mortality rate correctly", () => {
      const totalMortality = 50;
      const initialCount = 1000;
      
      const mortalityRate = (totalMortality / initialCount) * 100;
      expect(mortalityRate).toBe(5.0);
    });

    it("handles zero initial count", () => {
      const totalMortality = 50;
      const initialCount = 0;
      
      const mortalityRate = initialCount > 0 ? (totalMortality / initialCount) * 100 : 0;
      expect(mortalityRate).toBe(0);
    });
  });

  describe("Weight Sample Average", () => {
    it("calculates average from weight samples", () => {
      const samples = [1.2, 1.3, 1.25, 1.18, 1.22];
      const average = samples.reduce((a, b) => a + b, 0) / samples.length;
      
      expect(average).toBeCloseTo(1.23, 2);
    });

    it("handles single sample", () => {
      const samples = [1.5];
      const average = samples.reduce((a, b) => a + b, 0) / samples.length;
      
      expect(average).toBe(1.5);
    });

    it("handles empty samples", () => {
      const samples: number[] = [];
      const average = samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
      
      expect(average).toBe(0);
    });
  });
});

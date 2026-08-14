import { describe, expect, it } from "vitest";
import { calculatePreTransportSchedule } from "./pre-transport-protocol";

describe("pre-transport protocol scheduling", () => {
  it("calculates SAST collection, withdrawal, and three-day stress-support milestones", () => {
    expect(calculatePreTransportSchedule({
      collectionDate: "2026-08-20",
      collectionTime: "06:00",
      feedWithdrawalHours: 8,
    })).toEqual({
      collectionAt: "2026-08-20 04:00:00",
      feedWithdrawalAt: "2026-08-19 20:00:00",
      stressSupportAt: "2026-08-17 04:00:00",
    });
  });

  it("supports a different withdrawal period without shifting the collection milestone", () => {
    const plan = calculatePreTransportSchedule({ collectionDate: "2026-08-20", collectionTime: "14:30", feedWithdrawalHours: 6 });
    expect(plan.collectionAt).toBe("2026-08-20 12:30:00");
    expect(plan.feedWithdrawalAt).toBe("2026-08-20 06:30:00");
  });

  it("rejects unsafe withdrawal periods", () => {
    expect(() => calculatePreTransportSchedule({ collectionDate: "2026-08-20", collectionTime: "06:00", feedWithdrawalHours: 0 })).toThrow();
  });
});

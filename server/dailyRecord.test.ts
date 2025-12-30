import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  updateFlockDailyRecord: vi.fn(),
  getFlockDailyRecordById: vi.fn(),
  getFlockDailyRecords: vi.fn(),
  createFlockDailyRecord: vi.fn(),
  deleteFlockDailyRecord: vi.fn(),
  logUserActivity: vi.fn(),
}));

import * as db from "./db";

describe("Daily Record Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateFlockDailyRecord", () => {
    it("should update a daily record with new values", async () => {
      const mockUpdate = vi.mocked(db.updateFlockDailyRecord);
      mockUpdate.mockResolvedValue({ success: true });

      const result = await db.updateFlockDailyRecord(1, {
        mortality: 5,
        feedConsumed: "150.5",
        feedType: "grower",
        waterConsumed: "200",
        averageWeight: "1.250",
        temperature: "28.5",
        humidity: "65",
        notes: "Updated record",
      });

      expect(mockUpdate).toHaveBeenCalledWith(1, {
        mortality: 5,
        feedConsumed: "150.5",
        feedType: "grower",
        waterConsumed: "200",
        averageWeight: "1.250",
        temperature: "28.5",
        humidity: "65",
        notes: "Updated record",
      });
      expect(result).toEqual({ success: true });
    });

    it("should handle partial updates", async () => {
      const mockUpdate = vi.mocked(db.updateFlockDailyRecord);
      mockUpdate.mockResolvedValue({ success: true });

      const result = await db.updateFlockDailyRecord(1, {
        mortality: 10,
      });

      expect(mockUpdate).toHaveBeenCalledWith(1, {
        mortality: 10,
      });
      expect(result).toEqual({ success: true });
    });

    it("should throw error when database is not available", async () => {
      const mockUpdate = vi.mocked(db.updateFlockDailyRecord);
      mockUpdate.mockRejectedValue(new Error("Database not available"));

      await expect(db.updateFlockDailyRecord(1, { mortality: 5 })).rejects.toThrow(
        "Database not available"
      );
    });
  });

  describe("getFlockDailyRecordById", () => {
    it("should return a daily record by id", async () => {
      const mockRecord = {
        id: 1,
        flockId: 1,
        recordDate: new Date("2024-01-15"),
        dayNumber: 10,
        mortality: 5,
        feedConsumed: "150.5",
        feedType: "grower",
        waterConsumed: "200",
        averageWeight: "1.250",
        temperature: "28.5",
        humidity: "65",
        notes: "Test record",
      };

      const mockGet = vi.mocked(db.getFlockDailyRecordById);
      mockGet.mockResolvedValue(mockRecord);

      const result = await db.getFlockDailyRecordById(1);

      expect(mockGet).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockRecord);
    });

    it("should return null for non-existent record", async () => {
      const mockGet = vi.mocked(db.getFlockDailyRecordById);
      mockGet.mockResolvedValue(null);

      const result = await db.getFlockDailyRecordById(999);

      expect(result).toBeNull();
    });
  });

  describe("getFlockDailyRecords", () => {
    it("should return all daily records for a flock", async () => {
      const mockRecords = [
        { id: 1, flockId: 1, dayNumber: 1, mortality: 2 },
        { id: 2, flockId: 1, dayNumber: 2, mortality: 1 },
        { id: 3, flockId: 1, dayNumber: 3, mortality: 0 },
      ];

      const mockGetAll = vi.mocked(db.getFlockDailyRecords);
      mockGetAll.mockResolvedValue(mockRecords as any);

      const result = await db.getFlockDailyRecords(1);

      expect(mockGetAll).toHaveBeenCalledWith(1);
      expect(result).toHaveLength(3);
      expect(result[0].dayNumber).toBe(1);
    });

    it("should return empty array for flock with no records", async () => {
      const mockGetAll = vi.mocked(db.getFlockDailyRecords);
      mockGetAll.mockResolvedValue([]);

      const result = await db.getFlockDailyRecords(999);

      expect(result).toEqual([]);
    });
  });

  describe("deleteFlockDailyRecord", () => {
    it("should delete a daily record by id", async () => {
      const mockDelete = vi.mocked(db.deleteFlockDailyRecord);
      mockDelete.mockResolvedValue({ success: true });

      const result = await db.deleteFlockDailyRecord(1);

      expect(mockDelete).toHaveBeenCalledWith(1);
      expect(result).toEqual({ success: true });
    });

    it("should throw error when database is not available", async () => {
      const mockDelete = vi.mocked(db.deleteFlockDailyRecord);
      mockDelete.mockRejectedValue(new Error("Database not available"));

      await expect(db.deleteFlockDailyRecord(1)).rejects.toThrow(
        "Database not available"
      );
    });
  });
});

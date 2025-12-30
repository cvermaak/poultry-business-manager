import { describe, expect, it } from "vitest";
import { getTargetWeight, getTargetGrowthCurve, calculatePerformanceDeviation, getPerformanceStatus } from "./db";

describe("Breed-Specific Growth Curves", () => {
  describe("Ross 308", () => {
    it("should return correct target weights for key days", () => {
      expect(getTargetWeight(0, 'ross_308')).toBe(0.042);
      expect(getTargetWeight(7, 'ross_308')).toBe(0.170);
      expect(getTargetWeight(14, 'ross_308')).toBe(0.465);
      expect(getTargetWeight(21, 'ross_308')).toBe(0.925);
      expect(getTargetWeight(28, 'ross_308')).toBe(1.505);
      expect(getTargetWeight(35, 'ross_308')).toBe(2.180);
      expect(getTargetWeight(42, 'ross_308')).toBe(2.950);
      expect(getTargetWeight(49, 'ross_308')).toBe(3.790);
    });

    it("should interpolate weights for intermediate days", () => {
      const day10 = getTargetWeight(10, 'ross_308');
      expect(day10).toBeGreaterThan(0.170); // After day 7
      expect(day10).toBeLessThan(0.465); // Before day 14
    });
  });

  describe("Cobb 500", () => {
    it("should return correct target weights for key days", () => {
      expect(getTargetWeight(0, 'cobb_500')).toBe(0.042);
      expect(getTargetWeight(7, 'cobb_500')).toBe(0.175);
      expect(getTargetWeight(14, 'cobb_500')).toBe(0.480);
      expect(getTargetWeight(21, 'cobb_500')).toBe(0.950);
      expect(getTargetWeight(28, 'cobb_500')).toBe(1.540);
      expect(getTargetWeight(35, 'cobb_500')).toBe(2.215);
      expect(getTargetWeight(42, 'cobb_500')).toBe(2.970);
      expect(getTargetWeight(49, 'cobb_500')).toBe(3.800);
    });

    it("should have higher targets than Ross 308 at day 42", () => {
      const cobb42 = getTargetWeight(42, 'cobb_500');
      const ross42 = getTargetWeight(42, 'ross_308');
      expect(cobb42).toBeGreaterThan(ross42);
    });
  });

  describe("Arbor Acres", () => {
    it("should return correct target weights for key days", () => {
      expect(getTargetWeight(0, 'arbor_acres')).toBe(0.042);
      expect(getTargetWeight(7, 'arbor_acres')).toBe(0.168);
      expect(getTargetWeight(14, 'arbor_acres')).toBe(0.458);
      expect(getTargetWeight(21, 'arbor_acres')).toBe(0.910);
      expect(getTargetWeight(28, 'arbor_acres')).toBe(1.480);
      expect(getTargetWeight(35, 'arbor_acres')).toBe(2.145);
      expect(getTargetWeight(42, 'arbor_acres')).toBe(2.900);
      expect(getTargetWeight(49, 'arbor_acres')).toBe(3.720);
    });

    it("should have lower targets than Cobb 500 at day 42", () => {
      const arbor42 = getTargetWeight(42, 'arbor_acres');
      const cobb42 = getTargetWeight(42, 'cobb_500');
      expect(arbor42).toBeLessThan(cobb42);
    });
  });

  describe("Growth Curve Generation", () => {
    it("should generate correct number of data points", () => {
      const curve = getTargetGrowthCurve(0, 42, 'ross_308');
      expect(curve).toHaveLength(43); // Days 0-42 inclusive
    });

    it("should generate breed-specific curves", () => {
      const rossCurve = getTargetGrowthCurve(0, 42, 'ross_308');
      const cobbCurve = getTargetGrowthCurve(0, 42, 'cobb_500');
      
      // At day 42, Cobb should be heavier
      const rossDay42 = rossCurve.find(p => p.day === 42);
      const cobbDay42 = cobbCurve.find(p => p.day === 42);
      
      expect(cobbDay42!.targetWeight).toBeGreaterThan(rossDay42!.targetWeight);
    });
  });

  describe("Performance Deviation Calculation", () => {
    it("should calculate positive deviation when ahead of target", () => {
      const deviation = calculatePerformanceDeviation(3.0, 42, 'ross_308');
      expect(deviation).toBeGreaterThan(0);
      expect(deviation).toBeCloseTo(1.7, 1); // ~1.7% ahead
    });

    it("should calculate negative deviation when behind target", () => {
      const deviation = calculatePerformanceDeviation(2.8, 42, 'ross_308');
      expect(deviation).toBeLessThan(0);
      expect(deviation).toBeCloseTo(-5.1, 1); // ~5.1% behind
    });

    it("should be breed-specific", () => {
      const actualWeight = 2.9;
      const day = 42;
      
      const rossDeviation = calculatePerformanceDeviation(actualWeight, day, 'ross_308');
      const cobbDeviation = calculatePerformanceDeviation(actualWeight, day, 'cobb_500');
      
      // Same actual weight but different targets means different deviations
      expect(rossDeviation).not.toBe(cobbDeviation);
      expect(rossDeviation).toBeGreaterThan(cobbDeviation); // Ross target is lower, so deviation is more positive
    });
  });

  describe("Performance Status", () => {
    it("should return 'ahead' for +5% or more", () => {
      expect(getPerformanceStatus(5)).toBe('ahead');
      expect(getPerformanceStatus(10)).toBe('ahead');
    });

    it("should return 'on-track' for ±5%", () => {
      expect(getPerformanceStatus(4)).toBe('on-track');
      expect(getPerformanceStatus(0)).toBe('on-track');
      expect(getPerformanceStatus(-4)).toBe('on-track');
    });

    it("should return 'behind' for -5% to -10%", () => {
      expect(getPerformanceStatus(-6)).toBe('behind');
      expect(getPerformanceStatus(-9)).toBe('behind');
    });

    it("should return 'critical' for -10% or worse", () => {
      expect(getPerformanceStatus(-10)).toBe('critical');
      expect(getPerformanceStatus(-15)).toBe('critical');
    });
  });

  describe("Breed Comparison at Day 42", () => {
    it("should rank breeds by target weight correctly", () => {
      const ross = getTargetWeight(42, 'ross_308');
      const cobb = getTargetWeight(42, 'cobb_500');
      const arbor = getTargetWeight(42, 'arbor_acres');
      
      // Cobb 500 > Ross 308 > Arbor Acres
      expect(cobb).toBeGreaterThan(ross);
      expect(ross).toBeGreaterThan(arbor);
    });

    it("should show realistic weight differences", () => {
      const ross = getTargetWeight(42, 'ross_308');
      const cobb = getTargetWeight(42, 'cobb_500');
      const arbor = getTargetWeight(42, 'arbor_acres');
      
      // Differences should be in grams range (0.02-0.07 kg)
      expect(cobb - ross).toBeLessThan(0.1);
      expect(ross - arbor).toBeLessThan(0.1);
    });
  });
});

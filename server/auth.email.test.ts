import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashPassword, verifyPassword, generateTemporaryPassword } from "./password";

describe("Password utilities", () => {
  describe("hashPassword", () => {
    it("should hash a password", async () => {
      const password = "testPassword123";
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should produce different hashes for same password", async () => {
      const password = "testPassword123";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      // bcrypt produces different hashes due to random salt
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword", () => {
    it("should verify correct password", async () => {
      const password = "testPassword123";
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should reject incorrect password", async () => {
      const password = "testPassword123";
      const wrongPassword = "wrongPassword";
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });
  });

  describe("generateTemporaryPassword", () => {
    it("should generate a password of specified length", () => {
      const password = generateTemporaryPassword(12);
      expect(password.length).toBe(12);
    });

    it("should generate different passwords each time", () => {
      const password1 = generateTemporaryPassword();
      const password2 = generateTemporaryPassword();
      
      expect(password1).not.toBe(password2);
    });

    it("should default to 12 characters", () => {
      const password = generateTemporaryPassword();
      expect(password.length).toBe(12);
    });
  });
});

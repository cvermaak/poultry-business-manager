import { describe, expect, it, vi } from "vitest";
import { canShowPermissionTab, getPermissionTabViewer } from "./user-management-permission-tabs";

const admin = () => ({ id: 13, role: "admin", isActive: 1 });

describe("permission-tab exact active-admin projection (pure UI gate)", () => {
  it("accepts only a safe positive integer ID, exact admin role and numeric active flag", () => {
    expect(canShowPermissionTab(admin())).toBe(true);
    expect(canShowPermissionTab({ ...admin(), id: Number.MAX_SAFE_INTEGER })).toBe(true);
    expect(canShowPermissionTab(Object.assign(Object.create(null), admin()))).toBe(true);
  });
  it("returns a detached frozen projection, never the original viewer", () => {
    const input = admin();
    const projected = getPermissionTabViewer(input);
    expect(projected).toEqual(input); expect(projected).not.toBe(input); expect(Object.isFrozen(projected)).toBe(true);
    input.id = 21; input.role = "accountant";
    expect(projected).toEqual({ id: 13, role: "admin", isActive: 1 });
  });
  it.each(["farm_manager", "accountant", "sales_staff", "production_worker", "chicken_house_operator"])("hides all editable permission UI for %s", role => {
    expect(canShowPermissionTab({ ...admin(), role })).toBe(false);
  });
  it.each(["", "Admin", "ADMIN", " admin", "admin ", "unknown", null, undefined, 1, true])("rejects malformed/unknown role %s", role => {
    expect(canShowPermissionTab({ ...admin(), role })).toBe(false);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "13", null, undefined, true])("rejects unsafe or coerced ID %s", id => {
    expect(canShowPermissionTab({ ...admin(), id })).toBe(false);
  });
  it.each([0, -1, 2, true, false, "1", null, undefined])("requires exactly numeric isActive=1, rejects %s", isActive => {
    expect(canShowPermissionTab({ ...admin(), isActive })).toBe(false);
  });
  it.each([undefined, null, 1, "admin", true, [], new Date(0), () => admin()])("rejects non-plain principal %s", value => {
    expect(canShowPermissionTab(value)).toBe(false);
  });
  it("requires exactly three own fields and rejects extras including symbols", () => {
    expect(canShowPermissionTab({ id: 13, role: "admin" })).toBe(false);
    expect(canShowPermissionTab({ ...admin(), extra: true })).toBe(false);
    expect(canShowPermissionTab({ ...admin(), [Symbol("extra")]: true })).toBe(false);
    expect(canShowPermissionTab(Object.create(admin()))).toBe(false);
    class Principal { id = 13; role = "admin"; isActive = 1; }
    expect(canShowPermissionTab(new Principal())).toBe(false);
  });
  it.each(["id", "role", "isActive"])("denies own %s getter without invoking it", key => {
    const getter = vi.fn(() => { throw new Error("not evaluated"); });
    const input = admin(); Object.defineProperty(input, key, { enumerable: true, get: getter });
    expect(canShowPermissionTab(input)).toBe(false); expect(getter).not.toHaveBeenCalled();
  });
  it("rejects non-enumerable fields and own setters", () => {
    const hidden = admin(); Object.defineProperty(hidden, "id", { enumerable: false });
    expect(canShowPermissionTab(hidden)).toBe(false);
    const setter = vi.fn(); const input = admin(); Object.defineProperty(input, "role", { enumerable: true, set: setter });
    expect(canShowPermissionTab(input)).toBe(false); expect(setter).not.toHaveBeenCalled();
  });
  it("fails closed on throwing reflection proxies and a revoked proxy", () => {
    const deny = () => { throw new Error("not exposed"); };
    for (const proxy of [new Proxy(admin(), { getPrototypeOf: deny }), new Proxy(admin(), { ownKeys: deny }),
      new Proxy(admin(), { getOwnPropertyDescriptor: deny })]) expect(canShowPermissionTab(proxy)).toBe(false);
    const revoked = Proxy.revocable(admin(), {}); revoked.revoke();
    expect(canShowPermissionTab(revoked.proxy)).toBe(false);
  });
  it("never reads ordinary properties through a proxy get trap", () => {
    const get = vi.fn(() => { throw new Error("not evaluated"); });
    expect(canShowPermissionTab(new Proxy(admin(), { get }))).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });
});

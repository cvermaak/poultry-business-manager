import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ get: vi.fn(async () => ({ key: "private", url: "https://synthetic.invalid/file" })) }));
vi.mock("./storage", () => ({ storageGet: state.get }));
import { registerStorageProxy } from "./_core/storageProxy";
function fixture(publicKey: boolean | (() => Promise<boolean>), allowed: boolean) {
  let handle: any;
  const app = { get: vi.fn((_path: string, callback: any) => { handle = callback; }) };
  const authorize = vi.fn(async () => allowed);
  registerStorageProxy(app as any, { isPublicKey: typeof publicKey === "function" ? publicKey : async () => publicKey, authorize });
  const res = { set: vi.fn(), status: vi.fn(), send: vi.fn(), redirect: vi.fn() };
  res.status.mockReturnValue(res);
  return { handle, res, authorize, app };
}
beforeEach(() => state.get.mockClear());
describe("Railway storage permission merge", () => {
  it("registers only the existing managed-file namespace", () => { const f = fixture(false, false); expect(f.app.get).toHaveBeenCalledWith("/manus-storage/*", expect.any(Function)); });
  it("denies private files before the unchanged backend storage helper", async () => { const f = fixture(false, false); await f.handle({ params: { 0: "private" } }, f.res); expect(f.res.status).toHaveBeenCalledWith(403); expect(f.res.set).toHaveBeenCalledWith("Cache-Control", "no-store"); expect(state.get).not.toHaveBeenCalled(); });
  it("allows a permission-authorized file using the unchanged storage helper", async () => { const f = fixture(false, true); await f.handle({ params: { 0: "private" } }, f.res); expect(state.get).toHaveBeenCalledWith("private"); expect(f.res.redirect).toHaveBeenCalledWith(307, "https://synthetic.invalid/file"); });
  it("allows existing public branding without changing login/session", async () => { const f = fixture(true, false); await f.handle({ params: { 0: "branding" } }, f.res); expect(f.authorize).not.toHaveBeenCalled(); expect(state.get).toHaveBeenCalledWith("branding"); });
  it("fails closed when the public-key lookup fails", async () => { const f = fixture(async () => { throw Error("synthetic"); }, true); await f.handle({ params: { 0: "private" } }, f.res); expect(f.res.status).toHaveBeenCalledWith(403); expect(state.get).not.toHaveBeenCalled(); });
  it("rejects missing storage keys without backend work", async () => { const f = fixture(false, true); await f.handle({ params: {} }, f.res); expect(f.res.status).toHaveBeenCalledWith(400); expect(state.get).not.toHaveBeenCalled(); });
});

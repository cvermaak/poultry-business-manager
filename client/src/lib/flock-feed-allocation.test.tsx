import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { allocationPayload, blankFeedAllocationForm, displayFeedAllocation, feedAllocationFields, FEED_ALLOCATION_HINT, hydrateFeedAllocationForm, parseFeedAllocationForm } from "@shared/flock-feed-allocation";
const h = vi.hoisted(() => ({ states: [] as any[], cursor: 0, payload: null as any, flocks: [] as any[], messages: [] as string[], vacFetch: vi.fn(), stressFetch: vi.fn(), templatesFetch: vi.fn(), remindersFetch: vi.fn(), mutationOptions: {} as Record<string, any> }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useRef(initial: any) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = { current: initial };
    return h.states[index];
  }, useState(initial: any) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = typeof initial === "function" ? initial() : initial;
    return [h.states[index], (value: any) => { h.states[index] = typeof value === "function" ? value(h.states[index]) : value; }];
  } };
});
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 9001, role: "admin" } }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (message: string) => h.messages.push(message) } }));
vi.mock("@/lib/trpc", () => {
  const query = (name: string) => ({ useQuery: () => ({ data: name === "flocks.list" ? h.flocks : name === "houses.list" ? [{ id: 9, name: "Synthetic house" }] : name === "system.getDisplayTimezone" ? { timezone: "Africa/Johannesburg" } : [], isLoading: false, refetch: vi.fn(), isError: false }), useMutation: (options: any) => {
    h.mutationOptions[name] = options;
    return { mutate: (payload: any) => { h.payload = payload; }, isPending: false };
  } });
  const utils = { flocks: { list: { invalidate: vi.fn() }, getVaccinationSchedules: { fetch: h.vacFetch }, getStressPackSchedules: { fetch: h.stressFetch } }, reminderTemplates: { getAppliedTemplates: { fetch: h.templatesFetch } }, reminders: { list: { fetch: h.remindersFetch } }, health: { listProtocolTemplates: { invalidate: vi.fn() } } };
  return { trpc: new Proxy({}, { get: (_, module: string) => module === "useUtils" ? () => utils : new Proxy({}, { get: (_, method: string) => query(`${module}.${method}`) }) }) };
});
import Flocks from "../pages/Flocks";
function tree(): any { h.cursor = 0; return Flocks(); }
function elements(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !node.props) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: any): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node?.props ? text(node.props.children) : "";
}
function input(id: string) { const result = elements(tree()).find(node => node.props.id === id); expect(result).toBeTruthy(); return result; }
function change(id: string, value: string) { input(id).props.onChange({ target: { value } }); }
function click(label: string, index = 0) {
  const button = elements(tree()).filter(node => typeof node.props.onClick === "function" && text(node) === label)[index];
  expect(button).toBeTruthy(); return button.props.onClick();
}
function fill() {
  tree(); change("flockNumber", "Allocation-synthetic"); change("placementDate", "2026-11-12"); change("initialCount", "100");
  elements(tree()).find(node => node.props.required && typeof node.props.onValueChange === "function").props.onValueChange("9");
}
function submit() { elements(tree()).find(node => node.type === "form").props.onSubmit({ preventDefault: vi.fn() }); return h.payload; }
function selectUnit(unit: "grams" | "kg") { elements(tree()).find(node => node.props.value === "kg" || node.props.value === "grams").props.onValueChange(unit); }
const plan = { starterAllocationKgPerBird: "0.123", growerAllocationKgPerBird: "2.345", finisherAllocationKgPerBird: "0.000" };
const flock = (extra: Record<string, unknown> = {}) => ({ id: 42, flockNumber: "Allocation-synthetic", houseId: 9, placementDate: "2026-11-01 00:00:00", initialCount: 100, currentCount: 100, status: "planned", growingPeriod: 42, ...extra });
function allocations(payload: any) { return Object.fromEntries(feedAllocationFields.filter(field => Object.hasOwn(payload, field)).map(field => [field, payload[field]])); }
beforeEach(() => {
  vi.clearAllMocks(); h.states = []; h.cursor = 0; h.payload = null; h.flocks = []; h.messages = []; h.mutationOptions = {};
  h.vacFetch.mockResolvedValue([]); h.stressFetch.mockResolvedValue([]); h.templatesFetch.mockResolvedValue([]); h.remindersFetch.mockResolvedValue([]);
  vi.stubGlobal("window", { confirm: vi.fn().mockReturnValue(true), location: { search: "" } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in offline form tests"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("Shared allocation helpers, no inferred targets or unit settings", () => {
  it("initial/reset helper always returns fresh blank fields", () => {
    const a = blankFeedAllocationForm(); a.starterAllocationKgPerBird = "9.876";
    expect(blankFeedAllocationForm()).toEqual({ starterAllocationKgPerBird: "", growerAllocationKgPerBird: "", finisherAllocationKgPerBird: "" });
  });
  it("hydrate preserves exact per-flock strings, zero, null and missing fields", () => {
    expect(hydrateFeedAllocationForm(plan)).toEqual(plan);
    expect(hydrateFeedAllocationForm({ starterAllocationKgPerBird: 0, growerAllocationKgPerBird: null })).toEqual({ starterAllocationKgPerBird: "0", growerAllocationKgPerBird: "", finisherAllocationKgPerBird: "" });
  });
  it("create blanks are explicit null while edit blanks are fully omitted", () => {
    expect(allocationPayload(blankFeedAllocationForm(), "create")).toEqual({ starterAllocationKgPerBird: null, growerAllocationKgPerBird: null, finisherAllocationKgPerBird: null });
    expect(allocationPayload(blankFeedAllocationForm(), "edit")).toEqual({});
    expect(allocationPayload({ ...blankFeedAllocationForm(), starterAllocationKgPerBird: "0" }, "edit")).toEqual({ starterAllocationKgPerBird: "0.000" });
  });
  it("form parsing pads exactly and does not introduce rounding", () => {
    expect(parseFeedAllocationForm({ starterAllocationKgPerBird: "1.2", growerAllocationKgPerBird: "999.999", finisherAllocationKgPerBird: "0" })).toEqual({ starterAllocationKgPerBird: "1.200", growerAllocationKgPerBird: "999.999", finisherAllocationKgPerBird: "0.000" });
    expect(() => allocationPayload({ ...blankFeedAllocationForm(), starterAllocationKgPerBird: "0.1234" }, "create")).toThrow();
  });
  it.each([undefined, null, "", "   "])("display absent %j as Not specified, not a static plan", value => { expect(displayFeedAllocation(value)).toBe("Not specified"); });
  it.each([[0, "0.000 kg/bird"], ["0.900", "0.900 kg/bird"], ["1.750", "1.750 kg/bird"], ["0.350", "0.350 kg/bird"], ["9.876", "9.876 kg/bird"]])("display stored %j in kg/bird", (value, expected) => { expect(displayFeedAllocation(value)).toBe(expected); });
  it.each([NaN, Infinity, "0.1234", "-1", "1000"])("display invalid %j explicitly rather than evaluating/falling back", value => { expect(displayFeedAllocation(value)).toBe("Invalid allocation"); });
});

describe("Actual Flocks form input props, callbacks and SSR", () => {
  it("all three controls start blank, are optional and advertise decimal column limits", () => {
    for (const [index, field] of Array.from(feedAllocationFields.entries())) {
      const control = input(field);
      expect(control.props).toMatchObject({ type: "number", value: "", step: "0.001", min: "0", max: "999.999", "aria-describedby": "feed-allocation-hint" });
      expect(control.props.required).toBeUndefined();
      const html = renderToStaticMarkup(control);
      expect(html).toContain('value=""'); expect(html).toContain('step="0.001"'); expect(html).toContain('max="999.999"');
      const label = elements(tree()).find(node => node.props.htmlFor === field);
      expect(renderToStaticMarkup(label)).toContain(`${["Starter", "Grower", "Finisher"][index]} allocation (kg per bird)`);
    }
    const hint = elements(tree()).find(node => node.props.id === "feed-allocation-hint");
    expect(renderToStaticMarkup(hint)).toContain(FEED_ALLOCATION_HINT);
  });
  it("blank new flock payload is explicit null and preserves other existing create defaults", () => {
    fill(); const payload = submit();
    expect(allocations(payload)).toEqual({ starterAllocationKgPerBird: null, growerAllocationKgPerBird: null, finisherAllocationKgPerBird: null });
    expect(payload).toMatchObject({ growingPeriod: 42, starterToDay: 10, growerFromDay: 11, growerToDay: 24, finisherFromDay: 25, targetSlaughterWeight: 1.7, starterFromDay: 0, vaccinationProtocol: "standard" });
  });
  it.each(["kg", "grams"] as const)("create explicit plan in %s body-weight mode remains kg unchanged", unit => {
    fill(); for (const field of feedAllocationFields) change(field, plan[field]); selectUnit(unit);
    expect(allocations(submit())).toEqual(plan); expect(h.payload.weightUnit).toBe(unit);
    for (const field of feedAllocationFields) expect(input(field).props.value).toBe(plan[field]);
  });
  it("specific zero and highest representable value are transported, never treated as absent", () => {
    fill(); change("starterAllocationKgPerBird", "0"); change("growerAllocationKgPerBird", "999.999");
    expect(allocations(submit())).toEqual({ starterAllocationKgPerBird: "0.000", growerAllocationKgPerBird: "999.999", finisherAllocationKgPerBird: null });
  });
  it.each(["invalid", "NaN", "Infinity", "-0.001", "1000", "0.1234", "1.0000", "1e2", "0x10"])("actual submit rejects invalid allocation %s before transport", value => {
    fill(); change("starterAllocationKgPerBird", value); expect(submit()).toBeNull(); expect(h.messages.length).toBeGreaterThan(0);
  });
  it("edit hydrates exact saved per-flock plan and SSR renders intentional zero", async () => {
    h.flocks = [flock({ ...plan, weightUnit: "grams" })]; await click("Edit");
    for (const field of feedAllocationFields) expect(input(field).props.value).toBe(plan[field]);
    expect(renderToStaticMarkup(input("finisherAllocationKgPerBird"))).toContain('value="0.000"');
    expect(allocations(submit())).toEqual(plan); expect(h.payload).toMatchObject({ id: 42, weightUnit: "grams" });
    for (const key of ["vaccinationProtocol", "vaccinationSchedules", "stressPackSchedules", "selectedTemplateIds", "scheduleRemovalConfirmed"]) expect(h.payload).not.toHaveProperty(key);
  });
  it("edit null/missing allocations hydrate blank, with no fallback", async () => {
    h.flocks = [flock({ starterAllocationKgPerBird: null, growerAllocationKgPerBird: 0 })]; await click("Edit");
    expect(input("starterAllocationKgPerBird").props.value).toBe(""); expect(input("growerAllocationKgPerBird").props.value).toBe("0"); expect(input("finisherAllocationKgPerBird").props.value).toBe("");
    expect(allocations(submit())).toEqual({ growerAllocationKgPerBird: "0.000" });
  });
  it("clearing all edit allocation controls omits their payload keys to preserve saved values", async () => {
    h.flocks = [flock(plan)]; await click("Edit"); for (const field of feedAllocationFields) change(field, ""); change("notes", "notes only");
    expect(allocations(submit())).toEqual({}); expect(h.payload).toMatchObject({ id: 42, notes: "notes only" });
    for (const field of feedAllocationFields) expect(h.payload).not.toHaveProperty(field);
  });
  it("explicit edited zero is retained while cleared phases are omitted", async () => {
    h.flocks = [flock(plan)]; await click("Edit"); change("starterAllocationKgPerBird", "0"); change("growerAllocationKgPerBird", "");
    expect(allocations(submit())).toEqual({ starterAllocationKgPerBird: "0.000", finisherAllocationKgPerBird: "0.000" });
  });
  it("invalid edited precision blocks the update; grams toggle does not convert allocations", async () => {
    h.flocks = [flock(plan)]; await click("Edit"); selectUnit("grams"); change("finisherAllocationKgPerBird", "0.1234");
    expect(submit()).toBeNull(); expect(input("starterAllocationKgPerBird").props.value).toBe("0.123");
  });
  it("copy uses selected flock B's exact plan rather than last edited flock A", async () => {
    const second = { starterAllocationKgPerBird: "9.876", growerAllocationKgPerBird: null, finisherAllocationKgPerBird: "0.000" };
    h.flocks = [flock(plan), flock({ id: 43, flockNumber: "B", weightUnit: "grams", ...second })]; await click("Edit", 0); click("Copy", 1);
    expect(input("starterAllocationKgPerBird").props.value).toBe("9.876"); expect(input("growerAllocationKgPerBird").props.value).toBe(""); expect(input("finisherAllocationKgPerBird").props.value).toBe("0.000");
    change("placementDate", "2026-11-15");
    expect(allocations(submit())).toEqual(second); expect(h.payload).toMatchObject({ flockNumber: "B-COPY", weightUnit: "grams" }); expect(h.payload).not.toHaveProperty("id");
  });
  it("copy of unspecified allocations stays unspecified including numeric zero preservation", () => {
    h.flocks = [flock({ starterAllocationKgPerBird: null, growerAllocationKgPerBird: 0 })]; click("Copy"); change("placementDate", "2026-11-15");
    expect(allocations(submit())).toEqual({ starterAllocationKgPerBird: null, growerAllocationKgPerBird: "0.000", finisherAllocationKgPerBird: null });
  });
  it.each(["Edit", "Copy"])("Add/reset after %s discards previous flock allocations", async mode => {
    h.flocks = [flock(plan)]; await click(mode); click("Cancel"); click("Add Flock");
    for (const field of feedAllocationFields) expect(input(field).props.value).toBe("");
    fill(); expect(allocations(submit())).toEqual({ starterAllocationKgPerBird: null, growerAllocationKgPerBird: null, finisherAllocationKgPerBird: null }); expect(h.payload).not.toHaveProperty("id");
  });
  it.each(["flocks.create", "flocks.update"])("successful %s reset leaves no previous plan", async mutation => {
    h.flocks = [flock(plan)]; await click(mutation === "flocks.create" ? "Copy" : "Edit");
    await h.mutationOptions[mutation].onSuccess({ flockId: 44 });
    for (const field of feedAllocationFields) expect(input(field).props.value).toBe("");
  });
  it("late edit hydration cannot resurrect an old plan after reset/create", async () => {
    let resolve!: (value: any[]) => void;
    h.flocks = [flock(plan)]; h.vacFetch.mockImplementationOnce(() => new Promise<any[]>(accept => { resolve = accept; }));
    const oldEdit = click("Edit"); click("Cancel"); click("Add Flock"); fill(); resolve([]); await oldEdit;
    for (const field of feedAllocationFields) expect(input(field).props.value).toBe("");
    expect(allocations(submit())).toEqual({ starterAllocationKgPerBird: null, growerAllocationKgPerBird: null, finisherAllocationKgPerBird: null });
  });
  it("existing failed schedule hydration still blocks allocation edits until retry", async () => {
    h.flocks = [flock(plan)]; h.remindersFetch.mockRejectedValueOnce(new Error("Synthetic load failure")); await click("Edit");
    expect(elements(tree()).find(node => node.props.type === "submit").props.disabled).toBe(true); expect(submit()).toBeNull();
    await click("Retry loading saved schedules"); expect(allocations(submit())).toEqual(plan);
  });
});

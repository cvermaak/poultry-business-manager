import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getFlockPlacementDate, getFlockAgeDays, getFlockRecordDay } from '@shared/flock-placement';
const h = vi.hoisted(() => ({ states: [] as any[], cursor: 0, payload: null as any,
  flocks: [] as any[], vacFetch: vi.fn(), stressFetch: vi.fn(), templatesFetch: vi.fn(), remindersFetch: vi.fn(), messages: [] as string[], timezone: 'Africa/Johannesburg',
  vaccines: [{ id: 1, name: 'Synthetic vaccine', diseaseType: 'newcastle_disease' }],
  detail: null as any,
}));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useRef(initial: any) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = { current: initial };
    return h.states[index];
  }, useState(initial: any) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = typeof initial === 'function' ? initial() : initial;
    return [h.states[index], (value: any) => { h.states[index] = typeof value === 'function' ? value(h.states[index]) : value; }];
  } };
});
vi.mock('@/_core/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 42, role: 'admin' } }) }));
vi.mock('@/hooks/useFinancialVisibility', () => ({ useFinancialVisibility: () => ({ allowed: false }) }));
vi.mock('wouter', () => ({ useLocation: () => ['/', vi.fn()], useRoute: () => [true, { id: '42' }] }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (msg: string) => h.messages.push(msg) } }));
vi.mock('@/lib/trpc', () => {
  const query = (name: string) => ({ useQuery: () => ({
    data: name === 'flocks.list' ? h.flocks : name === 'flocks.getById' ? h.detail :
      name === 'houses.list' ? [{ id: 9, name: 'Synthetic House' }] :
      name === 'system.getDisplayTimezone' ? { timezone: h.timezone } :
      ['flocks.getPerformanceMetrics', 'flocks.getAdvancedGrowthMetrics', 'flocks.getFeedEfficiencyMetrics', 'houses.getById', 'catch.getCatchPlan'].includes(name) ? undefined :
      name === 'health.listVaccines' ? h.vaccines : name === 'reminderTemplates.list' ? [{ id: 7, name: 'Synthetic reminder template' }] : [],
    isLoading: false, refetch: vi.fn(), isError: false,
  }), useMutation: () => ({ mutate: (payload: any) => { h.payload = payload; }, isPending: false }) });
  const utils = {
    flocks: { list: { invalidate: vi.fn() }, getVaccinationSchedules: { fetch: h.vacFetch }, getStressPackSchedules: { fetch: h.stressFetch } },
    reminderTemplates: { getAppliedTemplates: { fetch: h.templatesFetch } }, reminders: { list: { fetch: h.remindersFetch } },
    health: { listProtocolTemplates: { invalidate: vi.fn() } },
  };
  return { trpc: new Proxy({}, { get: (_, module: string) => module === 'useUtils' ? () => utils : new Proxy({}, { get: (_, method: string) => query(`${module}.${method}`) }) }) };
});
import Flocks from '../pages/Flocks';
import FlockDetail from '../pages/FlockDetail';
function tree(): any { h.cursor = 0; return Flocks(); }
function detailTree(): any { h.cursor = 0; return FlockDetail(); }
function elements(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [node, ...elements(node.props.children)];
}
function input(id: string) { const result = elements(tree()).find(n => n.props.id === id); expect(result).toBeTruthy(); return result; }
function fill() {
  tree();
  for (const [id, value] of [['flockNumber', 'SYNTHETIC-ONLY'], ['placementDate', '2026-11-12'], ['initialCount', '100']]) input(id).props.onChange({ target: { value } });
  elements(tree()).find(n => n.props.required && typeof n.props.onValueChange === 'function').props.onValueChange('9');
}
function formState(): any { return h.states.find(v => v && typeof v === 'object' && 'flockNumber' in v); }
function submit() { elements(tree()).find(n => n.type === 'form').props.onSubmit({ preventDefault: vi.fn() }); return h.payload; }
function text(node: any): string { if (Array.isArray(node)) return node.map(text).join(''); if (typeof node === 'string' || typeof node === 'number') return String(node); return node?.props ? text(node.props.children) : ''; }
function click(label: string, nodes = tree()) { const el = elements(nodes).find(n => typeof n.props.onClick === 'function' && text(n) === label); expect(el).toBeTruthy(); return el.props.onClick(); }
function flock(placementDate: any = '2026-11-01 00:00:00') { return { id: 42, flockNumber: 'SYNTHETIC-ONLY', houseId: 9, placementDate, initialCount: 100, currentCount: 100, status: 'planned', growingPeriod: 42 }; }
beforeEach(() => {
  vi.clearAllMocks(); h.states = []; h.cursor = 0; h.payload = null; h.flocks = []; h.messages = []; h.timezone = 'Africa/Johannesburg';
  h.vacFetch.mockResolvedValue([]); h.stressFetch.mockResolvedValue([]); h.templatesFetch.mockResolvedValue([]); h.remindersFetch.mockResolvedValue([]);
  vi.stubGlobal('window', { confirm: vi.fn().mockReturnValue(true), location: { search: '' } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Logical placement/calendar controls', () => {
  it.each(['2026-11-01', '2026-11-01 00:00:00', '2026-11-01T23:45:00+02:00', new Date('2026-11-01T00:00:00Z')])('preserves stored logical date %s', value => { expect(getFlockPlacementDate(value)).toBe('2026-11-01'); });
  it.each(['', 'bad', '2026-02-30', new Date(NaN)])('rejects invalid placement %s without today fallback', value => { expect(() => getFlockPlacementDate(value)).toThrow('Invalid flock placement'); });
  it('uses SAST today at early midnight; placement remains Day 0', () => {
    const now = new Date('2026-11-01T22:30:00Z');
    expect(getFlockAgeDays('2026-11-01 18:00:00', now)).toBe(1);
    expect(getFlockAgeDays('2026-11-01 18:00:00', now, 'UTC')).toBe(0);
    expect(getFlockRecordDay('2026-11-01 18:00:00', '2026-11-01')).toBe(0);
    expect(getFlockRecordDay('2026-11-01 18:00:00', '2026-11-02')).toBe(1);
  });
});
describe('Actual form callbacks and SSR date inputs', () => {
  it('blank optional numeric controls use verified defaults and no NaN; blank weights/notes remain undefined', () => {
    fill(); input('growingPeriod').props.onChange({ target: { value: '' } });
    for (const value of ['10', '24']) elements(tree()).find(n => n.props.type === 'number' && n.props.value === value).props.onChange({ target: { value: '' } });
    const payload = submit(); expect(payload).toMatchObject({ growingPeriod: 42, finisherToDay: 42, starterToDay: 10, growerFromDay: 11, growerToDay: 24, finisherFromDay: 25 });
    expect(payload.notes).toBeUndefined(); expect(payload.targetDeliveredWeight).toBeUndefined(); expect(payload.targetCatchingWeight).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('NaN'); expect(Object.values(payload).some(value => typeof value === 'number' && !Number.isFinite(value))).toBe(false);
  });
  it('required input flags and callback validation remain; malformed optional number blocks transport', () => {
    for (const id of ['flockNumber', 'placementDate', 'initialCount']) expect(input(id).props.required).toBe(true);
    submit(); expect(h.payload).toBeNull(); fill(); input('growingPeriod').props.onChange({ target: { value: 'invalid' } }); submit(); expect(h.payload).toBeNull(); expect(h.messages.length).toBeGreaterThan(0);
  });
  it('no-change Edit hydrates original day and saved templates/custom summaries; omits all schedule replacements', async () => {
    h.flocks = [flock()]; h.templatesFetch.mockResolvedValue([7]);
    h.vacFetch.mockResolvedValue([{ vaccineId: 1, scheduledDay: 7, status: 'administered' }]);
    h.stressFetch.mockResolvedValue([{ stressPackId: 3, startDay: 0, endDay: 3, dosageStrength: 'single', status: 'administered' }]);
    h.remindersFetch.mockResolvedValue([{ id: 91, templateId: null, title: 'Custom fixed-date reminder', dueDate: '2026-12-03 09:00:00', status: 'pending' }]);
    await click('Edit'); expect(formState().placementDate).toBe('2026-11-01'); expect(formState().selectedTemplateIds).toEqual([7]);
    const html = renderToStaticMarkup(input('placementDate')); expect(html).toContain('value="2026-11-01"'); expect(html).toContain('type="date"');
    expect(text(tree())).toContain('Custom fixed-date reminder — 2026-12-03 (pending)');
    expect(elements(tree()).filter(n => n.props.id?.startsWith('template-')).map(n => n.props.id)).toEqual(['template-7']);
    input('notes').props.onChange({ target: { value: 'Basic edit only' } });
    const payload = submit(); expect(payload.placementDate.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    for (const key of ['selectedTemplateIds', 'reminderTemplateIds', 'vaccinationProtocol', 'vaccinationProtocolId', 'vaccinationSchedules', 'stressPackSchedules', 'stressPacks', 'scheduleRemovalConfirmed']) expect(payload).not.toHaveProperty(key);
    expect(window.confirm).not.toHaveBeenCalled();
  });
  it.each(['vacFetch', 'stressFetch', 'templatesFetch', 'remindersFetch'] as const)('failed %s blocks saving until successful retry', async key => {
    h.flocks = [flock()]; h[key].mockRejectedValueOnce(new Error('Synthetic load failure')); await click('Edit');
    expect(elements(tree()).find(n => n.props.type === 'submit').props.disabled).toBe(true);
    submit(); expect(h.payload).toBeNull(); expect(text(tree())).toContain('Saving is blocked');
    await click('Retry loading saved schedules'); submit(); expect(h.payload).not.toBeNull();
  });
  it('invalid saved placement blocks Edit and cannot be submitted as today', async () => {
    h.flocks = [flock('invalid')]; await click('Edit'); submit(); expect(h.payload).toBeNull(); expect(h.messages).toContain('Invalid flock placement date.');
  });
  it('template removal asks UI confirmation and sends explicit confirmation only after acceptance', async () => {
    h.flocks = [flock()]; h.templatesFetch.mockResolvedValue([7]); await click('Edit');
    elements(tree()).find(n => n.props.id === 'template-7').props.onCheckedChange(false);
    vi.mocked(window.confirm).mockReturnValueOnce(false); submit(); expect(h.payload).toBeNull();
    submit(); expect(h.payload).toMatchObject({ selectedTemplateIds: [], scheduleRemovalConfirmed: true }); expect(h.payload).not.toHaveProperty('vaccinationSchedules');
  });
  it('unchanged selection after toggling back does not send replacements', async () => {
    h.flocks = [flock()]; h.templatesFetch.mockResolvedValue([7]); await click('Edit');
    elements(tree()).find(n => n.props.id === 'template-7').props.onCheckedChange(false);
    elements(tree()).find(n => n.props.id === 'template-7').props.onCheckedChange(true);
    expect(submit()).not.toHaveProperty('selectedTemplateIds'); expect(window.confirm).not.toHaveBeenCalled();
  });
  it('health edit snapshot is immutable and removal/change is confirmed rather than mistaken for no-change', async () => {
    h.flocks = [flock()]; h.vacFetch.mockResolvedValue([{ vaccineId: 1, scheduledDay: 7 }]); await click('Edit');
    elements(tree()).find(n => n.props.type === 'number' && n.props.value === 7).props.onChange({ target: { value: '8' } });
    expect(submit()).toMatchObject({ vaccinationSchedules: [{ vaccineId: 1, scheduledDay: 8 }], scheduleRemovalConfirmed: true });
  });
});
describe('Actual detail daily controls', () => {
  it('list and detail age use the selected company timezone, not host UTC today', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T22:30:00Z'));
    h.flocks = [flock()]; h.detail = flock();
    expect(elements(tree()).some(n => n.props.children === 1)).toBe(true);
    expect(text(detailTree())).toContain('Day 1');
    h.timezone = 'UTC';
    expect(text(detailTree())).toContain('Day 0');
  });
  it('actual daily submit derives Day 0 from logical record date and serializes UTC midnight', () => {
    h.detail = flock('2026-11-01 18:00:00'); detailTree();
    const dialog = elements(detailTree()).find(n => n.props.open === false && typeof n.props.onOpenChange === 'function' && text(n).includes('Add Daily Record'));
    dialog.props.onOpenChange(true);
    elements(detailTree()).find(n => n.props.id === 'recordDate').props.onChange({ target: { value: '2026-11-01' } });
    const losses = elements(detailTree()).find(n => n.props.idPrefix === 'add-losses');
    expect(losses).toBeTruthy();
    losses.props.onChange({ ...losses.props.value, foundDead: '0', culls: '0' });
    click('Save Record', detailTree());
    expect(h.payload).toMatchObject({ flockId: 42, dayNumber: 0 });
    expect(h.payload.recordDate.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
  it('SAST early-midnight Add uses company day and logical placement; choosing date keeps Day 0', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T22:30:00Z')); h.detail = flock('2026-11-01 18:00:00');
    const dialog = elements(detailTree()).find(n => n.props.open === false && typeof n.props.onOpenChange === 'function' && text(n).includes('Add Daily Record'));
    expect(dialog).toBeTruthy(); dialog.props.onOpenChange(true);
    const nodes = elements(detailTree()); const date = nodes.find(n => n.props.id === 'recordDate');
    expect(date.props.value).toBe('2026-11-02'); expect(nodes.find(n => n.props.id === 'dayNumber').props.value).toBe(1);
    date.props.onChange({ target: { value: '2026-11-01' } });
    expect(elements(detailTree()).find(n => n.props.id === 'dayNumber').props.value).toBe(0);
    expect(renderToStaticMarkup(elements(detailTree()).find(n => n.props.id === 'recordDate'))).toContain('value="2026-11-01"');
  });
  it('invalid placement renders explicit error instead of age zero/today fallback', () => {
    h.detail = flock('invalid'); expect(text(detailTree())).toContain('Invalid flock placement date.');
  });
});

describe('Edit request lifetime prevents wrong-flock hydration', () => {
  it('ignores late flock A schedules after flock B has become the current edit', async () => {
    let resolveA!: (value: any[]) => void;
    const lateA = new Promise<any[]>(resolve => { resolveA = resolve; });
    h.flocks = [{ ...flock(), flockNumber: 'FLOCK-A' }, { ...flock('2026-11-08 00:00:00'), id: 43, flockNumber: 'FLOCK-B' }];
    h.vacFetch.mockImplementation(({ flockId }: { flockId: number }) => flockId === 42 ? lateA : Promise.resolve([]));
    const edits = () => elements(tree()).filter(n => typeof n.props.onClick === 'function' && text(n) === 'Edit');
    const pendingA = edits()[0].props.onClick();
    await edits()[1].props.onClick();
    expect(formState().flockNumber).toBe('FLOCK-B');
    resolveA([{ vaccineId: 1, scheduledDay: 99 }]); await pendingA;
    expect(formState().flockNumber).toBe('FLOCK-B'); expect(formState().placementDate).toBe('2026-11-08'); expect(formState().vaccinationSchedules).toEqual([]);
    expect(submit()).toMatchObject({ id: 43, flockNumber: 'FLOCK-B' });
  });
  it('ignores an old edit response after cancellation and Create reset', async () => {
    let resolveA!: (value: any[]) => void;
    h.flocks = [{ ...flock(), flockNumber: 'OLD-FLOCK' }];
    h.vacFetch.mockImplementationOnce(() => new Promise<any[]>(resolve => { resolveA = resolve; }));
    const oldEdit = click('Edit');
    click('Cancel'); click('Add Flock'); fill();
    resolveA([{ vaccineId: 1, scheduledDay: 99 }]); await oldEdit;
    expect(formState().flockNumber).toBe('SYNTHETIC-ONLY'); expect(formState().vaccinationSchedules).toEqual([]);
    expect(submit()).not.toHaveProperty('id'); expect(h.payload.placementDate.toISOString()).toBe('2026-11-12T00:00:00.000Z');
  });
});

describe('Existing feed start days are not silently normalized by ordinary Edit', () => {
  it('a notes-only save preserves stored noncontiguous grower and finisher start days', async () => {
    h.flocks = [{ ...flock(), starterToDay: 10, growerFromDay: 12, growerToDay: 24, finisherFromDay: 27 }];
    await click('Edit'); input('notes').props.onChange({ target: { value: 'Notes-only update' } });
    expect(submit()).toMatchObject({ growerFromDay: 12, finisherFromDay: 27, starterToDay: 10, growerToDay: 24 });
  });
  it('a deliberately changed end-day control derives its corresponding next start day', async () => {
    h.flocks = [{ ...flock(), starterToDay: 10, growerFromDay: 12, growerToDay: 24, finisherFromDay: 27 }];
    await click('Edit'); elements(tree()).find(n => n.props.type === 'number' && n.props.value === '10').props.onChange({ target: { value: '14' } });
    expect(submit()).toMatchObject({ starterToDay: 14, growerFromDay: 15, finisherFromDay: 27 });
  });
});

it('an obsolete edit failure does not overwrite the newer ready state', async () => {
  let rejectA!: (error: Error) => void;
  const oldFailure = new Promise<any[]>((_resolve, reject) => { rejectA = reject; });
  h.flocks = [{ ...flock(), flockNumber: 'FLOCK-A' }, { ...flock(), id: 43, flockNumber: 'FLOCK-B' }];
  h.vacFetch.mockImplementation(({ flockId }: { flockId: number }) => flockId === 42 ? oldFailure : Promise.resolve([]));
  const edits = () => elements(tree()).filter(n => typeof n.props.onClick === 'function' && text(n) === 'Edit');
  const pendingA = edits()[0].props.onClick(); await edits()[1].props.onClick();
  rejectA(new Error('Obsolete request failure')); await pendingA;
  expect(elements(tree()).find(n => n.props.type === 'submit').props.disabled).toBe(false);
  expect(formState().flockNumber).toBe('FLOCK-B'); expect(submit()).toMatchObject({ id: 43 });
});

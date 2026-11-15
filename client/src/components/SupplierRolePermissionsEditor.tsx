/** Isolated Module4 preparation. Not mounted; only a trusted, later-bound client is injected. */
import React, { useEffect, useId, useRef, useState } from "react";
import {
  SUPPLIER_EDITOR_ACTION_KEYS, SUPPLIER_EDITOR_ROLES, SUPPLIER_EDITOR_ROLE_LABELS,
  type SupplierEditorAction, type SupplierEditorChoice, type SupplierEditorClient,
  type SupplierEditorPendingChange, type SupplierEditorRole, type SupplierPolicySaveRequest,
} from "@shared/supplier-permission-editor-contract";
import {
  EDITOR_ACTIONS, actionChoice, chooseAction, createEditorDraft, describeChoice, isEditorDirty,
  isSupplierEditorRole, pendingChanges, prepareSaveRequest, setEditorReason, validateLoadResult,
  validateSaveResult, type SupplierEditorDraft,
} from "@/lib/supplier-permission-editor-model";

const ACTION_LABELS: Record<SupplierEditorAction, string> = { view: "View", create: "Create", edit: "Edit", delete: "Delete" };
const buttonClass = "rounded-md border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Pure, data-free permission rows exported solely for focused SSR inspection. */
export function SupplierEditorPolicyFields({ draft, disabled, onPick }: {
  draft: SupplierEditorDraft; disabled: boolean;
  onPick: (action: SupplierEditorAction, choice: SupplierEditorChoice) => void;
}) {
  const prefix = useId();
  return <div className="overflow-x-auto rounded-md border border-border">
    <table className="w-full min-w-[960px] text-left text-sm">
      <caption className="sr-only">Supplier permission choices, source defaults, and effective role gates</caption>
      <thead className="bg-muted text-muted-foreground"><tr>
        <th scope="col" className="p-3">Module</th>
        {EDITOR_ACTIONS.map(action => <th scope="col" className="p-3" key={action}>{ACTION_LABELS[action]}</th>)}
        <th scope="col" className="p-3">Export</th>
      </tr></thead>
      <tbody><tr className="border-t border-border align-top">
        <th scope="row" className="p-3 font-medium">Supplier</th>
        {EDITOR_ACTIONS.map(action => {
        const choice = actionChoice(draft.grants, action);
        const id = `${prefix}-${action}`;
        return <td key={action} className="p-3">
          {action === "view" && <p className="mb-2 text-xs text-muted-foreground">List and detail (getById)</p>}
          {action === "delete" && <p className="mb-2 text-xs text-muted-foreground">Includes soft deactivation</p>}
          {draft.snapshot.protectedAdmin ? <span>Use source — protected Admin</span> : <>
            <label className="sr-only" htmlFor={id}>{ACTION_LABELS[action]} permission choice</label>
            <select id={id} className={inputClass} value={choice} disabled={disabled} onChange={event => {
              const value = event.target.value;
              if (value === "default" || value === "allow" || value === "block") onPick(action, value);
            }}>
              {choice === "mixed" && <option value="mixed" disabled>Mixed existing overrides — preserved</option>}
              <option value="default">Use default</option><option value="allow">Allow</option><option value="block">Block</option>
            </select>
            {choice === "mixed" && <p className="mt-1 text-xs text-muted-foreground">Existing list/detail choices stay unchanged until you explicitly choose View.</p>}
          </>}
          <div className="mt-3 space-y-2 text-xs">
          <div><strong>Source default</strong>{SUPPLIER_EDITOR_ACTION_KEYS[action].map(key => <span key={key} className="block text-muted-foreground">
            {action === "view" ? (key.endsWith(".list") ? "List: " : "Detail: ") : ""}{draft.snapshot.defaults[key] ? "Allow" : "Block"}
          </span>)}</div>
          <div><strong>Effective role gate</strong>{SUPPLIER_EDITOR_ACTION_KEYS[action].map(key => <span key={key} className="block">
            {action === "view" ? (key.endsWith(".list") ? "List: " : "Detail: ") : ""}
            {(Object.prototype.hasOwnProperty.call(draft.grants, key) ? draft.grants[key] : draft.snapshot.defaults[key]) ? "Allow" : "Block"}
          </span>)}</div>
          </div>
        </td>;
      })}
        <td className="p-3 text-muted-foreground">Unavailable — no implemented supplier export permission. Not editable.</td>
      </tr></tbody>
    </table>
  </div>;
}
function ChangeSummary({ changes }: { changes: readonly SupplierEditorPendingChange[] }) {
  return <ul className="space-y-2 text-sm">{changes.map(change => <li key={change.action}>
    <strong>{ACTION_LABELS[change.action]}</strong>: {change.before} → {change.after}
    <span className="block break-all text-xs text-muted-foreground">{change.keys.join(", ")}</span>
  </li>)}</ul>;
}
interface Review {
  readonly request: SupplierPolicySaveRequest;
  readonly before: SupplierEditorDraft["snapshot"];
  readonly changes: readonly SupplierEditorPendingChange[];
}
export interface SupplierRolePermissionsEditorProps { client: SupplierEditorClient }
export function SupplierRolePermissionsEditor({ client }: SupplierRolePermissionsEditorProps) {
  const prefix = useId();
  const [role, setRole] = useState<SupplierEditorRole>("farm_manager");
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState<SupplierEditorDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [navigation, setNavigation] = useState<{ role: SupplierEditorRole; reload: boolean } | null>(null);
  const sequence = useRef(0);
  const saveLock = useRef(false);
  const currentRole = useRef<SupplierEditorRole>(role);
  const currentClient = useRef(client);
  currentClient.current = client;

  useEffect(() => {
    const token = ++sequence.current;
    currentRole.current = role;
    let active = true;
    setDraft(null); setLoading(true); setBlocked(false); setError(null); setNotice(null); setReview(null); setNavigation(null);
    const load = async () => {
      try {
        const result = validateLoadResult(await client.load(role), role);
        if (!active || sequence.current !== token || currentRole.current !== role || currentClient.current !== client) return;
        if (result.ok) setDraft(createEditorDraft(result.snapshot));
        else setError(`Policy could not be loaded (${result.code}). No editable defaults are available. Reload to try again.`);
      } catch {
        if (active && sequence.current === token && currentRole.current === role && currentClient.current === client)
          setError("Policy could not be safely loaded. No editable defaults are available. Reload to try again.");
      } finally {
        if (active && sequence.current === token && currentRole.current === role && currentClient.current === client) setLoading(false);
      }
    };
    void load();
    return () => { active = false; ++sequence.current; };
  }, [client, role, reloadKey]);

  const applyNavigation = (target: { role: SupplierEditorRole; reload: boolean }) => {
    if (saveLock.current) return;
    ++sequence.current; currentRole.current = target.role;
    setDraft(null); setReview(null); setNavigation(null); setError(null); setNotice(null); setBlocked(false); setLoading(true);
    setRole(target.role);
    if (target.reload) setReloadKey(value => value + 1);
  };
  const requestNavigation = (targetRole: SupplierEditorRole, reload: boolean) => {
    if (saveLock.current || review || navigation) return;
    if (!reload && targetRole === role) return;
    const target = { role: targetRole, reload };
    if (blocked || (draft && isEditorDirty(draft))) setNavigation(target); else applyNavigation(target);
  };
  const startReview = () => {
    if (!draft || blocked || saveLock.current || review || navigation) return;
    try {
      const request = prepareSaveRequest(draft);
      setReview(Object.freeze({ request, before: draft.snapshot, changes: pendingChanges(draft) }));
      setError(null);
    } catch { setError("A changed permission and an audit reason are required. Reason must be 1–500 trimmed characters, with no line breaks or control characters (raw limit 4096)."); }
  };
  const confirmSave = async () => {
    if (!review || saveLock.current || blocked || review.request.role !== currentRole.current) return;
    saveLock.current = true; setSaving(true); setError(null); setNotice(null);
    const captured = review, capturedClient = client, token = sequence.current;
    const isCurrent = () => sequence.current === token && currentRole.current === captured.request.role && currentClient.current === capturedClient;
    try {
      const result = validateSaveResult(await capturedClient.save(captured.request), captured.request, captured.before);
      if (!isCurrent()) return;
      if (result.ok) {
        setDraft(createEditorDraft(result.snapshot)); setReview(null);
        setNotice(result.changed ? `Saved ${SUPPLIER_EDITOR_ROLE_LABELS[result.snapshot.role]} permissions at version ${result.snapshot.version}.` : "No server change was needed.");
      } else {
        setReview(null); setBlocked(true);
        setError(result.code === "STALE_VERSION" || result.code === "CATALOGUE_MISMATCH"
          ? `Policy is stale (${result.code}). No merge or automatic save was performed. Explicitly reload, discard this old draft, and review the current policy before making new changes.`
          : result.code === "COMMIT_OUTCOME_UNKNOWN"
            ? "Commit outcome is unknown. Do not retry. Explicitly reload to check the current version and manually review it before any new save."
            : `Save was not confirmed (${result.code}). Retry is blocked until you explicitly reload and manually review the current policy.`);
      }
    } catch {
      if (isCurrent()) {
        setReview(null); setBlocked(true);
        setError("Save response could not be safely confirmed; commit outcome may be unknown. Do not retry. Explicitly reload and manually review the current version before any new save.");
      }
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };
  const changes = draft ? pendingChanges(draft) : [];
  const controlsDisabled = loading || saving || blocked || !!review || !!navigation;

  return <section aria-labelledby={`${prefix}-title`} className="space-y-5 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-6" aria-busy={loading || saving}>
    <header><p className="text-xs font-semibold uppercase tracking-wide text-primary">Supplier management · isolated preparation</p>
      <h2 id={`${prefix}-title`} className="mt-1 text-xl font-semibold">Supplier role permissions</h2>
      <p className="mt-2 text-sm text-muted-foreground">Admin-only editor design. One role at a time; no business data. Authentication and authorization belong to the trusted server adapter.</p>
    </header>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="w-full sm:max-w-sm"><label htmlFor={`${prefix}-role`} className="mb-1 block text-sm font-medium">Role to edit</label>
        <select id={`${prefix}-role`} className={inputClass} value={role} disabled={saving || !!review || !!navigation} onChange={event => {
          if (isSupplierEditorRole(event.target.value)) requestNavigation(event.target.value, false);
        }}>{SUPPLIER_EDITOR_ROLES.map(item => <option key={item} value={item}>{SUPPLIER_EDITOR_ROLE_LABELS[item]}{item === "admin" ? " (protected)" : ""}</option>)}</select>
      </div>
      <button type="button" className={`${buttonClass} bg-background text-foreground`} disabled={loading || saving || !!review || !!navigation} onClick={() => requestNavigation(role, true)}>Reload policy</button>
    </div>
    <p className="rounded-md border border-border bg-muted p-3 text-sm">An Allow only passes the role gate, never ownership, stock, state, or other existing safeguards. Ordinary edits and reactivation require Edit. Setting inactive requires both Edit and Delete. Delete also covers soft deactivation.</p>
    {navigation && <div role="alertdialog" aria-labelledby={`${prefix}-discard-title`} aria-describedby={`${prefix}-discard-description`} className="space-y-3 rounded-md border border-destructive p-4">
      <h3 id={`${prefix}-discard-title`} className="font-semibold">Discard this draft?</h3>
      <p id={`${prefix}-discard-description`} className="text-sm">{navigation.reload ? "Reloading" : `Switching to ${SUPPLIER_EDITOR_ROLE_LABELS[navigation.role]}`} discards all pending choices and the reason. Old pending changes will not be merged into the fresh policy. If a save outcome is unknown, check the loaded version and manually review before saving again.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={`${buttonClass} bg-destructive text-destructive-foreground`} disabled={saving} onClick={() => applyNavigation(navigation)}>Discard and {navigation.reload ? "reload" : "switch role"}</button>
        <button type="button" className={buttonClass} disabled={saving} onClick={() => setNavigation(null)}>Cancel discard</button></div>
    </div>}
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-md border border-primary bg-primary/5 p-3 text-sm">{notice}</p>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading current policy for {SUPPLIER_EDITOR_ROLE_LABELS[role]}…</p>}
    {!loading && draft && <>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>Role: {SUPPLIER_EDITOR_ROLE_LABELS[draft.snapshot.role]}</span><span>Version: {draft.snapshot.version}</span><span className="break-all">Catalogue: {draft.snapshot.catalogueRevision}</span></div>
      {draft.snapshot.protectedAdmin && <p role="status" className="rounded-md border border-border bg-muted p-3 text-sm">Admin is protected and read-only. All five gates use the source Allow; no Admin overrides or saves exist.</p>}
      <SupplierEditorPolicyFields draft={draft} disabled={controlsDisabled} onPick={(action, choice) => {
        if (!saveLock.current && !controlsDisabled) { setDraft(value => value ? chooseAction(value, action, choice) : value); setError(null); setNotice(null); }
      }} />
      {!draft.snapshot.protectedAdmin && <>
        <div><label htmlFor={`${prefix}-reason`} className="mb-1 block text-sm font-medium">Audit reason (required)</label>
          <textarea id={`${prefix}-reason`} className={inputClass} rows={3} maxLength={4096} value={draft.reason} disabled={controlsDisabled} aria-describedby={`${prefix}-reason-help`} onChange={event => {
            const value = event.target.value;
            if (!saveLock.current && !controlsDisabled) { setDraft(current => current ? setEditorReason(current, value) : current); setError(null); }
          }} />
          <p id={`${prefix}-reason-help`} className="mt-1 text-xs text-muted-foreground">1–500 trimmed characters; no line breaks or control characters. The reason is included in the audited, version-checked save. Nothing is saved until confirmation.</p>
        </div>
        <div className="space-y-2 rounded-md border border-border p-3"><h3 className="font-semibold">Pending changes for {SUPPLIER_EDITOR_ROLE_LABELS[role]}</h3>
          {changes.length ? <ChangeSummary changes={changes} /> : <p className="text-sm text-muted-foreground">No permission changes.</p>}
        </div>
        {!review && <button type="button" className={`${buttonClass} bg-primary text-primary-foreground`} disabled={controlsDisabled || changes.length === 0} onClick={startReview}>Review changes before save</button>}
      </>}
    </>}
    {review && <div role="dialog" aria-labelledby={`${prefix}-review-title`} aria-describedby={`${prefix}-review-description`} className="space-y-3 rounded-md border border-primary bg-primary/5 p-4">
      <h3 id={`${prefix}-review-title`} className="font-semibold">Confirm save for {SUPPLIER_EDITOR_ROLE_LABELS[review.request.role]}</h3>
      <p id={`${prefix}-review-description`} className="text-sm">Review before → after. Save replaces only this role's five supplier grants, using expected version {review.request.expectedVersion}. A stale version requires an explicit reload; there is no automatic merge.</p>
      <ChangeSummary changes={review.changes} />
      <p className="break-words text-sm"><strong>Audit reason:</strong> {review.request.reason}</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={`${buttonClass} bg-primary text-primary-foreground`} disabled={saving} onClick={() => { void confirmSave(); }}>{saving ? "Saving…" : "Confirm save"}</button>
        <button type="button" className={buttonClass} disabled={saving} onClick={() => { if (!saveLock.current) setReview(null); }}>Cancel review</button></div>
    </div>}
  </section>;
}
export default SupplierRolePermissionsEditor;

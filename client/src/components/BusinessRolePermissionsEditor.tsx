/** Frontend-only business editor; only trusted static definitions and scoped clients are injected. */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BUSINESS_EDITOR_ROLES,
  BUSINESS_EDITOR_ROLE_LABELS,
  type BusinessEditorAction,
  type BusinessEditorChoice,
  type BusinessEditorClient,
  type BusinessEditorPendingChange,
  type BusinessEditorRole,
  type BusinessPolicySaveRequest,
  type BusinessEditorDefinition,
} from "@shared/business-permission-editor-contract";
import {
  EDITOR_ACTIONS,
  createBusinessEditorModel,
  isBusinessEditorRole,
  type BusinessEditorDraft,
  type BusinessEditorModel,
} from "@/lib/business-permission-editor-model";

const ACTION_LABELS: Record<BusinessEditorAction, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  export: "Export",
};
const buttonClass =
  "rounded-md border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Pure, data-free permission rows exported solely for focused SSR inspection. */
export function BusinessEditorPolicyFields({
  model,
  draft,
  disabled,
  onPick,
}: {
  model: BusinessEditorModel;
  draft: BusinessEditorDraft;
  disabled: boolean;
  onPick: (action: BusinessEditorAction, choice: BusinessEditorChoice) => void;
}) {
  const prefix = useId();
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[960px] text-left text-sm">
        <caption className="sr-only">
          {model.label} permission choices, source defaults, and effective role
          gates
        </caption>
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="p-3">
              Module
            </th>
            {EDITOR_ACTIONS.map((action) => (
              <th scope="col" className="p-3" key={action}>
                {ACTION_LABELS[action]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border align-top">
            <th scope="row" className="p-3 font-medium">
              {model.label}
            </th>
            {EDITOR_ACTIONS.map((action) => {
              if (model.isFinancialRestricted(draft.snapshot.role))
                return (
                  <td key={action} className="p-3 text-muted-foreground">
                    Unavailable for{" "}
                    {BUSINESS_EDITOR_ROLE_LABELS[draft.snapshot.role]} —
                    financial data is restricted.
                    <span className="mt-3 block text-xs">
                      <strong>Source default:</strong> Block
                    </span>
                    <span className="mt-2 block text-xs">
                      <strong>Effective role gate:</strong> Block — nondelegable
                    </span>
                  </td>
                );
              const keys = model.actionKeys[action];
              if (!keys.length)
                return (
                  <td key={action} className="p-3 text-muted-foreground">
                    Unavailable — no implemented ordinary{" "}
                    {ACTION_LABELS[action].toLowerCase()} permission. Not
                    editable.
                  </td>
                );
              const choice = model.actionChoice(draft.grants, action),
                id = `${prefix}-${action}`;
              return (
                <td key={action} className="p-3">
                  {draft.snapshot.protectedAdmin ? (
                    <span>Use source — protected Admin</span>
                  ) : (
                    <>
                      <label className="sr-only" htmlFor={id}>
                        {ACTION_LABELS[action]} permission choice
                      </label>
                      <select
                        id={id}
                        className={inputClass}
                        value={choice}
                        disabled={disabled}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (
                            value === "default" ||
                            value === "allow" ||
                            value === "block"
                          )
                            onPick(action, value);
                        }}
                      >
                        {choice === "mixed" && (
                          <option value="mixed" disabled>
                            Mixed existing overrides — preserved
                          </option>
                        )}
                        <option value="default">Use default</option>
                        <option value="allow">Allow</option>
                        <option value="block">Block</option>
                      </select>
                      {choice === "mixed" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Existing API-method choices stay unchanged until you
                          explicitly choose this action.
                        </p>
                      )}
                    </>
                  )}
                  <div className="mt-3 space-y-2 text-xs">
                    <div>
                      <strong>Source default</strong>
                      {keys.map((key) => (
                        <span key={key} className="block text-muted-foreground">
                          {key.split(".").pop()}:{" "}
                          {draft.snapshot.defaults[key] ? "Allow" : "Block"}
                        </span>
                      ))}
                    </div>
                    <div>
                      <strong>Effective role gate</strong>
                      {keys.map((key) => (
                        <span key={key} className="block">
                          {key.split(".").pop()}:{" "}
                          {(
                            Object.prototype.hasOwnProperty.call(
                              draft.grants,
                              key,
                            )
                              ? draft.grants[key]
                              : draft.snapshot.defaults[key]
                          )
                            ? "Allow"
                            : "Block"}
                        </span>
                      ))}
                    </div>
                  </div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
function ChangeSummary({
  changes,
}: {
  changes: readonly BusinessEditorPendingChange[];
}) {
  return (
    <ul className="space-y-2 text-sm">
      {changes.map((change) => (
        <li key={change.action}>
          <strong>{ACTION_LABELS[change.action]}</strong>: {change.before} →{" "}
          {change.after}
          <span className="block break-all text-xs text-muted-foreground">
            {change.keys.join(", ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
interface Review {
  readonly request: BusinessPolicySaveRequest;
  readonly before: BusinessEditorDraft["snapshot"];
  readonly changes: readonly BusinessEditorPendingChange[];
}
export interface BusinessRolePermissionsEditorProps {
  client: BusinessEditorClient;
  definition: BusinessEditorDefinition;
}
/** A changed trusted definition/client removes the old subtree synchronously; effect remounts it.
 * No render-time state mutation and no old draft can appear under a new scope. */
export function BusinessRolePermissionsEditor({
  client,
  definition,
}: BusinessRolePermissionsEditorProps) {
  const model = useMemo(
    () => createBusinessEditorModel(definition),
    [definition, client],
  );
  const [session, setSession] = useState(() => ({
    model,
    client,
    generation: 0,
  }));
  useEffect(() => {
    setSession((current) =>
      current.model === model && current.client === client
        ? current
        : { model, client, generation: current.generation + 1 },
    );
  }, [model, client]);
  if (session.model !== model || session.client !== client) return null;
  return (
    <ScopedBusinessRolePermissionsEditor
      key={session.generation}
      model={model}
      client={client}
    />
  );
}
function ScopedBusinessRolePermissionsEditor({
  client,
  model,
}: {
  client: BusinessEditorClient;
  model: BusinessEditorModel;
}) {
  const {
    actionChoice,
    chooseAction,
    createEditorDraft,
    isEditorDirty,
    pendingChanges,
    prepareSaveRequest,
    setEditorReason,
    validateLoadResult,
    validateSaveResult,
  } = model;
  const prefix = useId();
  const [role, setRole] = useState<BusinessEditorRole>("farm_manager");
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState<BusinessEditorDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [navigation, setNavigation] = useState<{
    role: BusinessEditorRole;
    reload: boolean;
  } | null>(null);
  const sequence = useRef(0);
  const saveLock = useRef(false);
  const currentRole = useRef<BusinessEditorRole>(role);
  const currentClient = useRef(client);
  currentClient.current = client;

  useEffect(() => {
    const token = ++sequence.current;
    currentRole.current = role;
    let active = true;
    setDraft(null);
    setLoading(true);
    setBlocked(false);
    setError(null);
    setNotice(null);
    setReview(null);
    setNavigation(null);
    const load = async () => {
      try {
        const result = validateLoadResult(await client.load(role), role);
        if (
          !active ||
          sequence.current !== token ||
          currentRole.current !== role ||
          currentClient.current !== client
        )
          return;
        if (result.ok) setDraft(createEditorDraft(result.snapshot));
        else
          setError(
            `Policy could not be loaded (${result.code}). No editable defaults are available. Reload to try again.`,
          );
      } catch {
        if (
          active &&
          sequence.current === token &&
          currentRole.current === role &&
          currentClient.current === client
        )
          setError(
            "Policy could not be safely loaded. No editable defaults are available. Reload to try again.",
          );
      } finally {
        if (
          active &&
          sequence.current === token &&
          currentRole.current === role &&
          currentClient.current === client
        )
          setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
      ++sequence.current;
    };
  }, [client, role, reloadKey]);

  const applyNavigation = (target: {
    role: BusinessEditorRole;
    reload: boolean;
  }) => {
    if (saveLock.current) return;
    ++sequence.current;
    currentRole.current = target.role;
    setDraft(null);
    setReview(null);
    setNavigation(null);
    setError(null);
    setNotice(null);
    setBlocked(false);
    setLoading(true);
    setRole(target.role);
    if (target.reload) setReloadKey((value) => value + 1);
  };
  const requestNavigation = (
    targetRole: BusinessEditorRole,
    reload: boolean,
  ) => {
    if (saveLock.current || review || navigation) return;
    if (!reload && targetRole === role) return;
    const target = { role: targetRole, reload };
    if (blocked || (draft && isEditorDirty(draft))) setNavigation(target);
    else applyNavigation(target);
  };
  const startReview = () => {
    if (!draft || blocked || saveLock.current || review || navigation) return;
    try {
      const request = prepareSaveRequest(draft);
      setReview(
        Object.freeze({
          request,
          before: draft.snapshot,
          changes: pendingChanges(draft),
        }),
      );
      setError(null);
    } catch {
      setError(
        "A changed permission and an audit reason are required. Reason must be 1–500 trimmed characters, with no line breaks or control characters (raw limit 4096).",
      );
    }
  };
  const confirmSave = async () => {
    if (
      !review ||
      saveLock.current ||
      blocked ||
      review.request.role !== currentRole.current
    )
      return;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    const captured = review,
      capturedClient = client,
      token = sequence.current;
    const isCurrent = () =>
      sequence.current === token &&
      currentRole.current === captured.request.role &&
      currentClient.current === capturedClient;
    try {
      const result = validateSaveResult(
        await capturedClient.save(captured.request),
        captured.request,
        captured.before,
      );
      if (!isCurrent()) return;
      if (result.ok) {
        setDraft(createEditorDraft(result.snapshot));
        setReview(null);
        setNotice(
          result.changed
            ? `Saved ${BUSINESS_EDITOR_ROLE_LABELS[result.snapshot.role]} permissions at version ${result.snapshot.version}.`
            : "No server change was needed.",
        );
      } else {
        setReview(null);
        setBlocked(true);
        setError(
          result.code === "STALE_VERSION" ||
            result.code === "CATALOGUE_MISMATCH"
            ? `Policy is stale (${result.code}). No merge or automatic save was performed. Explicitly reload, discard this old draft, and review the current policy before making new changes.`
            : result.code === "COMMIT_OUTCOME_UNKNOWN"
              ? "Commit outcome is unknown. Do not retry. Explicitly reload to check the current version and manually review it before any new save."
              : `Save was not confirmed (${result.code}). Retry is blocked until you explicitly reload and manually review the current policy.`,
        );
      }
    } catch {
      if (isCurrent()) {
        setReview(null);
        setBlocked(true);
        setError(
          "Save response could not be safely confirmed; commit outcome may be unknown. Do not retry. Explicitly reload and manually review the current version before any new save.",
        );
      }
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };
  const changes = draft ? pendingChanges(draft) : [];
  const financialRestricted = model.isFinancialRestricted(role);
  const controlsDisabled =
    loading ||
    saving ||
    blocked ||
    financialRestricted ||
    !!review ||
    !!navigation;

  return (
    <section
      aria-labelledby={`${prefix}-title`}
      className="space-y-5 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-6"
      aria-busy={loading || saving}
    >
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {model.label} management
        </p>
        <h2 id={`${prefix}-title`} className="mt-1 text-xl font-semibold">
          {model.label} role permissions
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin-only editor design. One role at a time; no business data.
          Authentication and authorization belong to the trusted server adapter.
        </p>
      </header>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-sm">
          <label
            htmlFor={`${prefix}-role`}
            className="mb-1 block text-sm font-medium"
          >
            Role to edit
          </label>
          <select
            id={`${prefix}-role`}
            className={inputClass}
            value={role}
            disabled={saving || !!review || !!navigation}
            onChange={(event) => {
              if (isBusinessEditorRole(event.target.value))
                requestNavigation(event.target.value, false);
            }}
          >
            {BUSINESS_EDITOR_ROLES.map((item) => (
              <option key={item} value={item}>
                {BUSINESS_EDITOR_ROLE_LABELS[item]}
                {item === "admin" ? " (protected)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={`${buttonClass} bg-background text-foreground`}
          disabled={loading || saving || !!review || !!navigation}
          onClick={() => requestNavigation(role, true)}
        >
          Reload policy
        </button>
      </div>
      <p className="rounded-md border border-border bg-muted p-3 text-sm">
        An ordinary Allow only passes the role gate. It never grants payment,
        posting, or financial-status transition permissions, and never bypasses
        ownership, stock, state, accounting-period or other existing safeguards.
        Financial posting and payment permissions are excluded from these ordinary controls.
      </p>
      {model.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {model.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      )}
      {navigation && (
        <div
          role="alertdialog"
          aria-labelledby={`${prefix}-discard-title`}
          aria-describedby={`${prefix}-discard-description`}
          className="space-y-3 rounded-md border border-destructive p-4"
        >
          <h3 id={`${prefix}-discard-title`} className="font-semibold">
            Discard this draft?
          </h3>
          <p id={`${prefix}-discard-description`} className="text-sm">
            {navigation.reload
              ? "Reloading"
              : `Switching to ${BUSINESS_EDITOR_ROLE_LABELS[navigation.role]}`}{" "}
            discards all pending choices and the reason. Old pending changes
            will not be merged into the fresh policy. If a save outcome is
            unknown, check the loaded version and manually review before saving
            again.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${buttonClass} bg-destructive text-destructive-foreground`}
              disabled={saving}
              onClick={() => applyNavigation(navigation)}
            >
              Discard and {navigation.reload ? "reload" : "switch role"}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={saving}
              onClick={() => setNavigation(null)}
            >
              Cancel discard
            </button>
          </div>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-md border border-primary bg-primary/5 p-3 text-sm"
        >
          {notice}
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading current policy for {BUSINESS_EDITOR_ROLE_LABELS[role]}…
        </p>
      )}
      {!loading && draft && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Role: {BUSINESS_EDITOR_ROLE_LABELS[draft.snapshot.role]}
            </span>
            <span>Version: {draft.snapshot.version}</span>
            <span className="break-all">
              Catalogue: {draft.snapshot.catalogueRevision}
            </span>
          </div>
          {draft.snapshot.protectedAdmin && (
            <p
              role="status"
              className="rounded-md border border-border bg-muted p-3 text-sm"
            >
              Admin is protected and read-only. All ordinary gates use the
              source Allow; no Admin overrides or saves exist.
            </p>
          )}
          {financialRestricted && (
            <p
              role="status"
              className="rounded-md border border-border bg-muted p-3 text-sm"
            >
              Financial data is restricted for{" "}
              {BUSINESS_EDITOR_ROLE_LABELS[role]}. This source rule cannot be
              changed by Admin overrides or ordinary permissions.
            </p>
          )}
          <BusinessEditorPolicyFields
            model={model}
            draft={draft}
            disabled={controlsDisabled}
            onPick={(action, choice) => {
              if (!saveLock.current && !controlsDisabled) {
                setDraft((value) =>
                  value ? chooseAction(value, action, choice) : value,
                );
                setError(null);
                setNotice(null);
              }
            }}
          />
          {!draft.snapshot.protectedAdmin && !financialRestricted && (
            <>
              <div>
                <label
                  htmlFor={`${prefix}-reason`}
                  className="mb-1 block text-sm font-medium"
                >
                  Audit reason (required)
                </label>
                <textarea
                  id={`${prefix}-reason`}
                  className={inputClass}
                  rows={3}
                  maxLength={4096}
                  value={draft.reason}
                  disabled={controlsDisabled}
                  aria-describedby={`${prefix}-reason-help`}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!saveLock.current && !controlsDisabled) {
                      setDraft((current) =>
                        current ? setEditorReason(current, value) : current,
                      );
                      setError(null);
                    }
                  }}
                />
                <p
                  id={`${prefix}-reason-help`}
                  className="mt-1 text-xs text-muted-foreground"
                >
                  1–500 trimmed characters; no line breaks or control
                  characters. The reason is included in the audited,
                  version-checked save. Nothing is saved until confirmation.
                </p>
              </div>
              <div className="space-y-2 rounded-md border border-border p-3">
                <h3 className="font-semibold">
                  Pending changes for {BUSINESS_EDITOR_ROLE_LABELS[role]}
                </h3>
                {changes.length ? (
                  <ChangeSummary changes={changes} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No permission changes.
                  </p>
                )}
              </div>
              {!review && (
                <button
                  type="button"
                  className={`${buttonClass} bg-primary text-primary-foreground`}
                  disabled={controlsDisabled || changes.length === 0}
                  onClick={startReview}
                >
                  Review changes before save
                </button>
              )}
            </>
          )}
        </>
      )}
      {review && (
        <div
          role="dialog"
          aria-labelledby={`${prefix}-review-title`}
          aria-describedby={`${prefix}-review-description`}
          className="space-y-3 rounded-md border border-primary bg-primary/5 p-4"
        >
          <h3 id={`${prefix}-review-title`} className="font-semibold">
            Confirm save for {BUSINESS_EDITOR_ROLE_LABELS[review.request.role]}
          </h3>
          <p id={`${prefix}-review-description`} className="text-sm">
            Review before → after. Save replaces only this role's {model.label}{" "}
            ordinary grants, using expected version{" "}
            {review.request.expectedVersion}. A stale version requires an
            explicit reload; there is no automatic merge.
          </p>
          <ChangeSummary changes={review.changes} />
          <p className="break-words text-sm">
            <strong>Audit reason:</strong> {review.request.reason}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${buttonClass} bg-primary text-primary-foreground`}
              disabled={saving}
              onClick={() => {
                void confirmSave();
              }}
            >
              {saving ? "Saving…" : "Confirm save"}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={saving}
              onClick={() => {
                if (!saveLock.current) setReview(null);
              }}
            >
              Cancel review
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
export default BusinessRolePermissionsEditor;

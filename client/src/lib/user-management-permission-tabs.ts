/** MODULE5 preparation only. UI visibility, never server authorization. */
export interface PermissionTabViewer {
  readonly id: number;
  readonly role: "admin";
  readonly isActive: 1;
}

/** Detached projection: exact own enumerable data fields; no property getters read. */
export function getPermissionTabViewer(viewer: unknown): PermissionTabViewer | null {
  try {
    if (!viewer || typeof viewer !== "object" || Array.isArray(viewer)) return null;
    const prototype = Object.getPrototypeOf(viewer);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(viewer);
    const fields = ["id", "role", "isActive"];
    if (keys.length !== fields.length || !keys.every(key => typeof key === "string" && fields.indexOf(key) >= 0)) return null;
    const descriptors = fields.map(key => Object.getOwnPropertyDescriptor(viewer, key));
    if (!descriptors.every(descriptor => descriptor && descriptor.enumerable && "value" in descriptor)) return null;
    const id = descriptors[0]!.value;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0
      || descriptors[1]!.value !== "admin" || descriptors[2]!.value !== 1) return null;
    return Object.freeze({ id, role: "admin" as const, isActive: 1 as const });
  } catch {
    // Revoked/throwing proxies and malformed reflection fail closed; no raw error.
    return null;
  }
}

export function canShowPermissionTab(viewer: unknown): boolean {
  return getPermissionTabViewer(viewer) !== null;
}

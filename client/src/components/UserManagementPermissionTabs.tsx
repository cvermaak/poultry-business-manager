import type { BusinessEditorClients } from "@shared/business-permission-editor-contract";
import { RolePermissionsModulePanel } from "@/components/RolePermissionsModulePanel";
/** MODULE5 preparation only. No default client, auth methods, or live API binding. */
import React, { useEffect, useState, type ReactNode } from "react";
import type { SupplierEditorClient } from "@shared/supplier-permission-editor-contract";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SupplierRolePermissionsEditor } from "@/components/SupplierRolePermissionsEditor";
import { getPermissionTabViewer } from "@/lib/user-management-permission-tabs";

export interface UserManagementPermissionTabsProps {
  viewer: unknown;
  permissionClient?: SupplierEditorClient;
  businessClients?: BusinessEditorClients;
  children: ReactNode;
}

type Selection = "UserAccounts" | "RolePermissions";

function AuthorizedTabs({ permissionClient, businessClients, children }: Omit<UserManagementPermissionTabsProps, "viewer">) {
  const [selection, setSelection] = useState<Selection>("UserAccounts");
  const [visitedPermissions, setVisitedPermissions] = useState(false);
  const select = (value: string) => {
    if (value !== "UserAccounts" && value !== "RolePermissions") return;
    if (value === "RolePermissions") setVisitedPermissions(true);
    setSelection(value);
  };
  return <Tabs value={selection} onValueChange={select} activationMode="manual" className="space-y-4">
    <TabsList aria-label="User management sections">
      <TabsTrigger value="UserAccounts">User Accounts</TabsTrigger>
      <TabsTrigger value="RolePermissions">Role Permissions</TabsTrigger>
    </TabsList>
    {/* No forceMount: existing account Dialog portals cannot leak onto permissions. */}
    <TabsContent value="UserAccounts" className="space-y-4">
      <Button type="button" variant="outline" onClick={() => select("RolePermissions")}>Manage role permissions</Button>
      {children}
    </TabsContent>
    <TabsContent value="RolePermissions" forceMount hidden={selection !== "RolePermissions"}
      style={selection !== "RolePermissions" ? { display: "none" } : undefined} className="space-y-4">
      <header><h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">Manage user accounts and assign roles</p></header>
      <h2 className="text-2xl font-semibold">Role Permissions</h2>
      {!permissionClient
        ? <p role="status" className="rounded-md border border-border bg-muted p-4 text-sm">Prepared but not connected; no policies loaded or saved</p>
        : visitedPermissions && (businessClients ? <RolePermissionsModulePanel supplierClient={permissionClient} businessClients={businessClients} /> : <SupplierRolePermissionsEditor client={permissionClient} />)}
    </TabsContent>
  </Tabs>;
}

export function UserManagementPermissionTabs({ viewer, permissionClient, businessClients, children }: UserManagementPermissionTabsProps) {
  // A mismatched client removes the authorized subtree immediately. The effect
  // advances its opaque key before a fresh subtree can render; no old draft is shown.
  const [session, setSession] = useState(() => ({ client: permissionClient, generation: 0 }));
  useEffect(() => {
    setSession(current => current.client === permissionClient ? current
      : { client: permissionClient, generation: current.generation + 1 });
  }, [permissionClient]);
  const principal = getPermissionTabViewer(viewer);
  if (!principal) return <>{children}</>;
  if (session.client !== permissionClient) return null;
  return <AuthorizedTabs key={`${principal.id}:${session.generation}`} permissionClient={permissionClient} businessClients={businessClients}>
    {children}
  </AuthorizedTabs>;
}

export default UserManagementPermissionTabs;

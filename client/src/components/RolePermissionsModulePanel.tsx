/** Frontend-only module composition; authorization and scoped transport belong to its parent. */
import React, { useState } from "react";
import { BUSINESS_PERMISSION_DEFINITIONS } from "@shared/business-permission-definitions";
import type {
  BusinessEditorClients,
  BusinessScope,
} from "@shared/business-permission-editor-contract";
import type { SupplierEditorClient } from "@shared/supplier-permission-editor-contract";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SupplierRolePermissionsEditor } from "@/components/SupplierRolePermissionsEditor";
import { BusinessRolePermissionsEditor } from "@/components/BusinessRolePermissionsEditor";

const MODULES = Object.freeze([
  { scope: "suppliers", label: "Suppliers" },
  { scope: "customers", label: "Customers" },
  { scope: "sales_orders", label: "Sales Orders" },
  { scope: "invoices", label: "Invoices" },
  { scope: "financial_data", label: "Financial Data" },
  { scope: "feed_management", label: "Feed Management" },
] as const);
type Module = "suppliers" | BusinessScope;
export interface RolePermissionsModulePanelProps {
  supplierClient: SupplierEditorClient;
  businessClients: BusinessEditorClients;
}
/** Editors use only inline dialogs: hidden panels cannot leak review portals. Module
 * navigation intentionally does not discard or cancel drafts, review or in-flight saves. */
export function RolePermissionsModulePanel({
  supplierClient,
  businessClients,
}: RolePermissionsModulePanelProps) {
  const [selection, setSelection] = useState<Module>("suppliers");
  const [visited, setVisited] = useState<readonly Module[]>(["suppliers"]);
  const select = (value: string) => {
    if (!MODULES.some((module) => module.scope === value)) return;
    const scope = value as Module;
    setVisited((current) =>
      current.includes(scope) ? current : [...current, scope],
    );
    setSelection(scope);
  };
  return (
    <Tabs
      value={selection}
      onValueChange={select}
      activationMode="manual"
      className="space-y-4"
    >
      <TabsList
        aria-label="Role permission modules"
        className="h-auto max-w-full flex-wrap"
      >
        {MODULES.map((module) => (
          <TabsTrigger key={module.scope} value={module.scope}>
            {module.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {MODULES.map((module) => (
        <TabsContent
          key={module.scope}
          value={module.scope}
          forceMount
          hidden={selection !== module.scope}
          style={selection !== module.scope ? { display: "none" } : undefined}
          className="space-y-4"
        >
          {visited.includes(module.scope) &&
            (module.scope === "suppliers" ? (
              <SupplierRolePermissionsEditor client={supplierClient} />
            ) : (
              <BusinessRolePermissionsEditor
                definition={BUSINESS_PERMISSION_DEFINITIONS[module.scope]}
                client={businessClients[module.scope]}
              />
            ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}
export default RolePermissionsModulePanel;

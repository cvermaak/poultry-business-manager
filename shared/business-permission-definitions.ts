import type { PermissionCatalogue } from './role-permission-types';
export type BusinessScope = 'customers' | 'sales_orders' | 'invoices' | 'financial_data' | 'feed_management';
export type BusinessAction = 'view' | 'create' | 'edit' | 'delete' | 'export';
export interface BusinessPermissionDefinition {
 readonly scope: BusinessScope; readonly label: string; readonly catalogue: PermissionCatalogue;
 readonly actions: Readonly<Record<BusinessAction, readonly string[]>>;
 readonly notes: readonly string[]; readonly financialRestrictedRoles: readonly string[];
}
/** Verified ordinary API mappings. Unsupported and financial methods are intentionally absent. */
export const BUSINESS_PERMISSION_DEFINITIONS = {
  "customers": {
    "scope": "customers",
    "label": "Customers",
    "catalogue": {
      "revision": "business-permissions-2026-11-14-v1-customers",
      "capabilities": [
        {
          "key": "customers.records.view.list",
          "module": "Customers",
          "resource": "Customers records",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1179-1191",
                "server/db.ts:888-902"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1179-1191",
                "server/db.ts:888-902"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1179-1191",
                "server/db.ts:888-902"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1179-1191",
                "server/db.ts:888-902"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1179-1191",
                "server/db.ts:888-902"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1179-1191",
                "server/db.ts:888-902"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; no procedure-local role guard. Customer list read."
          ],
          "endpointRefs": [
            "customers.list"
          ],
          "consumerRefs": []
        },
        {
          "key": "customers.records.view.getbyid",
          "module": "Customers",
          "resource": "Customers records",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1192-1194",
                "server/db.ts:904-910"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1192-1194",
                "server/db.ts:904-910"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1192-1194",
                "server/db.ts:904-910"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1192-1194",
                "server/db.ts:904-910"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1192-1194",
                "server/db.ts:904-910"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1192-1194",
                "server/db.ts:904-910"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; read customer by id."
          ],
          "endpointRefs": [
            "customers.getById"
          ],
          "consumerRefs": []
        },
        {
          "key": "customers.records.create.create",
          "module": "Customers",
          "resource": "Customers records",
          "action": "Create",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1196-1219",
                "server/db.ts:912-918"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1196-1219",
                "server/db.ts:912-918"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1196-1219",
                "server/db.ts:912-918"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1196-1219",
                "server/db.ts:912-918"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1196-1219",
                "server/db.ts:912-918"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1196-1219",
                "server/db.ts:912-918"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only. Inserts customer and logs actor; credit limit/payment terms are master-data fields, not accounting posting. Preserve all existing Zod validation."
          ],
          "endpointRefs": [
            "customers.create"
          ],
          "consumerRefs": []
        },
        {
          "key": "customers.records.view.getaddresses",
          "module": "Customers",
          "resource": "Customers records",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1220-1222",
                "server/db.ts:920-925"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1220-1222",
                "server/db.ts:920-925"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1220-1222",
                "server/db.ts:920-925"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1220-1222",
                "server/db.ts:920-925"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1220-1222",
                "server/db.ts:920-925"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1220-1222",
                "server/db.ts:920-925"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; address lookup, not address CRUD."
          ],
          "endpointRefs": [
            "customers.getAddresses"
          ],
          "consumerRefs": []
        },
        {
          "key": "customers.records.create.getnextnumber",
          "module": "Customers",
          "resource": "Customers records",
          "action": "Create",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1224-1226",
                "server/db.ts:927-940"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1224-1226",
                "server/db.ts:927-940"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1224-1226",
                "server/db.ts:927-940"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1224-1226",
                "server/db.ts:927-940"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1224-1226",
                "server/db.ts:927-940"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1224-1226",
                "server/db.ts:927-940"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; computes next customer number without insertion or reservation. Proposed Create gate for create-form auxiliary, not a financial transition."
          ],
          "endpointRefs": [
            "customers.getNextNumber"
          ],
          "consumerRefs": []
        },
        {
          "key": "customers.records.edit.update",
          "module": "Customers",
          "resource": "Customers records",
          "action": "Edit",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1228-1253",
                "server/db.ts:942-970"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1228-1253",
                "server/db.ts:942-970"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1228-1253",
                "server/db.ts:942-970"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1228-1253",
                "server/db.ts:942-970"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1228-1253",
                "server/db.ts:942-970"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1228-1253",
                "server/db.ts:942-970"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; updates master data and optional isActive, then logs actor. Keep nullable/optional/email/minimum-length caller validation unchanged."
          ],
          "endpointRefs": [
            "customers.update"
          ],
          "consumerRefs": []
        },
        {
          "key": "customers.records.delete.delete",
          "module": "Customers",
          "resource": "Customers records",
          "action": "Delete",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1254-1260",
                "server/db.ts:972-978"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1254-1260",
                "server/db.ts:972-978"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1254-1260",
                "server/db.ts:972-978"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1254-1260",
                "server/db.ts:972-978"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1254-1260",
                "server/db.ts:972-978"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1254-1260",
                "server/db.ts:972-978"
              ]
            }
          },
          "ordinaryDeleteDelegation": true,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; deactivates isActive=0, does not physically remove customer or post accounting entries."
          ],
          "endpointRefs": [
            "customers.delete"
          ],
          "consumerRefs": []
        }
      ]
    },
    "actions": {
      "view": [
        "customers.records.view.list",
        "customers.records.view.getbyid",
        "customers.records.view.getaddresses"
      ],
      "create": [
        "customers.records.create.create",
        "customers.records.create.getnextnumber"
      ],
      "edit": [
        "customers.records.edit.update"
      ],
      "delete": [
        "customers.records.delete.delete"
      ],
      "export": []
    },
    "notes": [
      "Ordinary permissions never grant financial posting, payment or invoice status transitions.",
      "Farm Manager visibility is separately controlled by Financial Data \u2192 View.",
      "Customer deactivation requires Edit and Delete; monetary fields are unavailable to Farm Manager."
    ],
    "financialRestrictedRoles": []
  },
  "sales_orders": {
    "scope": "sales_orders",
    "label": "Sales Orders",
    "catalogue": {
      "revision": "business-permissions-2026-11-14-v1-sales_orders",
      "capabilities": [
        {
          "key": "sales_orders.records.create.getnextnumber",
          "module": "Sales Orders",
          "resource": "Sales Orders records",
          "action": "Create",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3106-3108",
                "server/db.ts:6441"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3106-3108",
                "server/db.ts:6441"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3106-3108",
                "server/db.ts:6441"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3106-3108",
                "server/db.ts:6441"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3106-3108",
                "server/db.ts:6441"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3106-3108",
                "server/db.ts:6441"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; next-number lookup for order creation. No order insert or posting in this procedure."
          ],
          "endpointRefs": [
            "salesOrders.getNextNumber"
          ],
          "consumerRefs": []
        },
        {
          "key": "sales_orders.records.view.list",
          "module": "Sales Orders",
          "resource": "Sales Orders records",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3110-3120"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3110-3120"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3110-3120"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3110-3120"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3110-3120"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3110-3120"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; order list with existing customer/status/date filters."
          ],
          "endpointRefs": [
            "salesOrders.list"
          ],
          "consumerRefs": []
        },
        {
          "key": "sales_orders.records.view.getbyid",
          "module": "Sales Orders",
          "resource": "Sales Orders records",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3121-3126"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3121-3126"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3121-3126"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3121-3126"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3121-3126"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3121-3126"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; order header read."
          ],
          "endpointRefs": [
            "salesOrders.getById"
          ],
          "consumerRefs": []
        },
        {
          "key": "sales_orders.records.view.getitems",
          "module": "Sales Orders",
          "resource": "Sales Orders records",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3127-3132"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3127-3132"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3127-3132"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3127-3132"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3127-3132"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3127-3132"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; order item read."
          ],
          "endpointRefs": [
            "salesOrders.getItems"
          ],
          "consumerRefs": []
        },
        {
          "key": "sales_orders.records.view.getstats",
          "module": "Sales Orders",
          "resource": "Sales Orders records",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3133-3135",
                "server/db.ts:6675-6691"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3133-3135",
                "server/db.ts:6675-6691"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3133-3135",
                "server/db.ts:6675-6691"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3133-3135",
                "server/db.ts:6675-6691"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3133-3135",
                "server/db.ts:6675-6691"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3133-3135",
                "server/db.ts:6675-6691"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; aggregates operational order statuses/value; no accounting journal/payment records."
          ],
          "endpointRefs": [
            "salesOrders.getStats"
          ],
          "consumerRefs": []
        },
        {
          "key": "sales_orders.records.create.create",
          "module": "Sales Orders",
          "resource": "Sales Orders records",
          "action": "Create",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3137-3174",
                "server/db.ts:6532-6588"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3137-3174",
                "server/db.ts:6532-6588"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3137-3174",
                "server/db.ts:6532-6588"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3137-3174",
                "server/db.ts:6532-6588"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3137-3174",
                "server/db.ts:6532-6588"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3137-3174",
                "server/db.ts:6532-6588"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; creates order header/items and logs actor. Caller may supply an operational order status; helper inserts only salesOrders/salesOrderItems, no ledger posting, invoice creation, payment or stock write."
          ],
          "endpointRefs": [
            "salesOrders.create"
          ],
          "consumerRefs": []
        },
        {
          "key": "sales_orders.records.edit.update",
          "module": "Sales Orders",
          "resource": "Sales Orders records",
          "action": "Edit",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3175-3211",
                "server/db.ts:6591-6617",
                "server/db.ts:6636-6673"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3175-3211",
                "server/db.ts:6591-6617",
                "server/db.ts:6636-6673"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3175-3211",
                "server/db.ts:6591-6617",
                "server/db.ts:6636-6673"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3175-3211",
                "server/db.ts:6591-6617",
                "server/db.ts:6636-6673"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3175-3211",
                "server/db.ts:6591-6617",
                "server/db.ts:6636-6673"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3175-3211",
                "server/db.ts:6591-6617",
                "server/db.ts:6636-6673"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; replaces items and updates order data/totals/optional operational status. No accounting posting; preserve existing numeric, enum, nullable and optional caller validations without adding status restrictions."
          ],
          "endpointRefs": [
            "salesOrders.update"
          ],
          "consumerRefs": []
        },
        {
          "key": "sales_orders.records.edit.updatestatus",
          "module": "Sales Orders",
          "resource": "Sales Orders records",
          "action": "Edit",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3212-3221",
                "server/db.ts:6619-6627"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3212-3221",
                "server/db.ts:6619-6627"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3212-3221",
                "server/db.ts:6619-6627"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3212-3221",
                "server/db.ts:6619-6627"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3212-3221",
                "server/db.ts:6619-6627"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3212-3221",
                "server/db.ts:6619-6627"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; writes order status and timestamp, reads order back. Operational order status is not an invoice accounting/status transition; no posting or invoice generation call."
          ],
          "endpointRefs": [
            "salesOrders.updateStatus"
          ],
          "consumerRefs": []
        },
        {
          "key": "sales_orders.records.edit.cancel",
          "module": "Sales Orders",
          "resource": "Sales Orders records",
          "action": "Edit",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3222-3227",
                "server/db.ts:6629-6634"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3222-3227",
                "server/db.ts:6629-6634"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3222-3227",
                "server/db.ts:6629-6634"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3222-3227",
                "server/db.ts:6629-6634"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3222-3227",
                "server/db.ts:6629-6634"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:3222-3227",
                "server/db.ts:6629-6634"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; sets order status=cancelled and logs actor. No record delete, invoice cancellation, stock movement, accounting reversal or posting. Conservative Edit classification, not a newly invented Delete capability."
          ],
          "endpointRefs": [
            "salesOrders.cancel"
          ],
          "consumerRefs": []
        }
      ]
    },
    "actions": {
      "view": [
        "sales_orders.records.view.list",
        "sales_orders.records.view.getbyid",
        "sales_orders.records.view.getitems",
        "sales_orders.records.view.getstats"
      ],
      "create": [
        "sales_orders.records.create.getnextnumber",
        "sales_orders.records.create.create"
      ],
      "edit": [
        "sales_orders.records.edit.update",
        "sales_orders.records.edit.updatestatus",
        "sales_orders.records.edit.cancel"
      ],
      "delete": [],
      "export": []
    },
    "notes": [
      "Ordinary permissions never grant financial posting, payment or invoice status transitions.",
      "Farm Manager visibility is separately controlled by Financial Data \u2192 View."
    ],
    "financialRestrictedRoles": []
  },
  "invoices": {
    "scope": "invoices",
    "label": "Invoices",
    "catalogue": {
      "revision": "business-permissions-2026-11-14-v1-invoices",
      "capabilities": [
        {
          "key": "invoices.records.create.create",
          "module": "Invoices",
          "resource": "Invoices records",
          "action": "Create",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1917-2024",
                "server/db.ts:4081-4133",
                "server/db.ts:1090-1120",
                "server/invoice-money.ts:30-62"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1917-2024",
                "server/db.ts:4081-4133",
                "server/db.ts:1090-1120",
                "server/invoice-money.ts:30-62"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1917-2024",
                "server/db.ts:4081-4133",
                "server/db.ts:1090-1120",
                "server/invoice-money.ts:30-62"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1917-2024",
                "server/db.ts:4081-4133",
                "server/db.ts:1090-1120",
                "server/invoice-money.ts:30-62"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1917-2024",
                "server/db.ts:4081-4133",
                "server/db.ts:1090-1120",
                "server/invoice-money.ts:30-62"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:1917-2024",
                "server/db.ts:4081-4133",
                "server/db.ts:1090-1120",
                "server/invoice-money.ts:30-62"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only. Catch-session existence check when supplied; calculates totals; createInvoice inserts status=draft, paidAmount=0, header only; createInvoiceLineItem inserts draft lines. Neither helper calls journal, general ledger, markInvoiceAsSent or payment posting. Create may authorize this draft path only, not posting/status transitions."
          ],
          "endpointRefs": [
            "invoices.create"
          ],
          "consumerRefs": []
        },
        {
          "key": "invoices.records.view.list",
          "module": "Invoices",
          "resource": "Invoices records",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2025-2033",
                "server/db.ts:984-1008"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2025-2033",
                "server/db.ts:984-1008"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2025-2033",
                "server/db.ts:984-1008"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2025-2033",
                "server/db.ts:984-1008"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2025-2033",
                "server/db.ts:984-1008"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2025-2033",
                "server/db.ts:984-1008"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; invoice/customer/order list read, not accounting posting detail. Current list is not restricted to non-feed invoices."
          ],
          "endpointRefs": [
            "invoices.list"
          ],
          "consumerRefs": []
        },
        {
          "key": "invoices.records.view.getbyid",
          "module": "Invoices",
          "resource": "Invoices records",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2034-2039",
                "server/db.ts:1010"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2034-2039",
                "server/db.ts:1010"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2034-2039",
                "server/db.ts:1010"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2034-2039",
                "server/db.ts:1010"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2034-2039",
                "server/db.ts:1010"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2034-2039",
                "server/db.ts:1010"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; invoice header read."
          ],
          "endpointRefs": [
            "invoices.getById"
          ],
          "consumerRefs": []
        },
        {
          "key": "invoices.records.view.getitems",
          "module": "Invoices",
          "resource": "Invoices records",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2052-2057",
                "server/db.ts:1028-1088"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2052-2057",
                "server/db.ts:1028-1088"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2052-2057",
                "server/db.ts:1028-1088"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2052-2057",
                "server/db.ts:1028-1088"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2052-2057",
                "server/db.ts:1028-1088"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2052-2057",
                "server/db.ts:1028-1088"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; stored invoice item read, no posting."
          ],
          "endpointRefs": [
            "invoices.getItems"
          ],
          "consumerRefs": []
        },
        {
          "key": "invoices.records.export.generatepdf",
          "module": "Invoices",
          "resource": "Invoices records",
          "action": "Export",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2058-2187",
                "server/pdf-generator-premium.ts:492",
                "client/src/pages/Invoices.tsx:64-85"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2058-2187",
                "server/pdf-generator-premium.ts:492",
                "client/src/pages/Invoices.tsx:64-85"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2058-2187",
                "server/pdf-generator-premium.ts:492",
                "client/src/pages/Invoices.tsx:64-85"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2058-2187",
                "server/pdf-generator-premium.ts:492",
                "client/src/pages/Invoices.tsx:64-85"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2058-2187",
                "server/pdf-generator-premium.ts:492",
                "client/src/pages/Invoices.tsx:64-85"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2058-2187",
                "server/pdf-generator-premium.ts:492",
                "client/src/pages/Invoices.tsx:64-85"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; reads invoice/items/customer/addresses/company settings including issuer bank details; requires invoice existence and company name/address completeness; returns base64 PDF. Existing server export must require BOTH Invoice View and Export in addition to original guard. Generation does not post or mutate invoice status."
          ],
          "endpointRefs": [
            "invoices.generatePDF"
          ],
          "consumerRefs": []
        },
        {
          "key": "invoices.records.create.generatefromorder",
          "module": "Invoices",
          "resource": "Invoices records",
          "action": "Create",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2323-2338",
                "server/db.ts:6735-6814",
                "server/db.ts:6700-6729",
                "server/db.ts:2035-2045"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2323-2338",
                "server/db.ts:6735-6814",
                "server/db.ts:6700-6729",
                "server/db.ts:2035-2045"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2323-2338",
                "server/db.ts:6735-6814",
                "server/db.ts:6700-6729",
                "server/db.ts:2035-2045"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2323-2338",
                "server/db.ts:6735-6814",
                "server/db.ts:6700-6729",
                "server/db.ts:2035-2045"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2323-2338",
                "server/db.ts:6735-6814",
                "server/db.ts:6700-6729",
                "server/db.ts:2035-2045"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2323-2338",
                "server/db.ts:6735-6814",
                "server/db.ts:6700-6729",
                "server/db.ts:2035-2045"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only. Positive integer order id; helper rejects duplicate invoice and missing order, reads items/number, inserts status=draft/paidAmount=0 plus copied invoice items; no journal/ledger/source posting/markAsSent/payment call. Gate rowInvoices.Create, optionally AND SalesOrders.View; generated invoice record is not PDF Export nor accounting posting."
          ],
          "endpointRefs": [
            "invoices.generateFromOrder"
          ],
          "consumerRefs": []
        },
        {
          "key": "invoices.records.view.checkorderinvoice",
          "module": "Invoices",
          "resource": "Invoices records",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2339-2343",
                "server/db.ts:6700-6709"
              ]
            },
            "farm_manager": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2339-2343",
                "server/db.ts:6700-6709"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2339-2343",
                "server/db.ts:6700-6709"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2339-2343",
                "server/db.ts:6700-6709"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2339-2343",
                "server/db.ts:6700-6709"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "server/routers.ts:2339-2343",
                "server/db.ts:6700-6709"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Original input, ownership, status, period, stock and other business safeguards remain",
            "Financial Data \u2192 View remains a separate gate; visibility is not posting authorization"
          ],
          "notes": [
            "protectedProcedure only; positive integer order id; existing invoice-by-order lookup, not generation/payment/posting."
          ],
          "endpointRefs": [
            "invoices.checkOrderInvoice"
          ],
          "consumerRefs": []
        }
      ]
    },
    "actions": {
      "view": [
        "invoices.records.view.list",
        "invoices.records.view.getbyid",
        "invoices.records.view.getitems",
        "invoices.records.view.checkorderinvoice"
      ],
      "create": [
        "invoices.records.create.create",
        "invoices.records.create.generatefromorder"
      ],
      "edit": [],
      "delete": [],
      "export": [
        "invoices.records.export.generatepdf"
      ]
    },
    "notes": [
      "Ordinary permissions never grant financial posting, payment or invoice status transitions.",
      "Farm Manager visibility is separately controlled by Financial Data \u2192 View."
    ],
    "financialRestrictedRoles": []
  },
  "financial_data": {
    "scope": "financial_data",
    "label": "Financial Data",
    "catalogue": {
      "revision": "business-permissions-2026-11-14-v1-financial_data",
      "capabilities": [
        {
          "key": "financial_data.records.view.visibility",
          "module": "Financial Data",
          "resource": "Financial data visibility",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "User 2026-11-14 21:00:17 approved Financial Data View initial Farm Block, other role visibility defaults unchanged"
              ]
            },
            "farm_manager": {
              "allowed": false,
              "evidence": [
                "User 2026-11-14 21:00:17 approved Financial Data View initial Farm Block, other role visibility defaults unchanged"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "User 2026-11-14 21:00:17 approved Financial Data View initial Farm Block, other role visibility defaults unchanged"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "User 2026-11-14 21:00:17 approved Financial Data View initial Farm Block, other role visibility defaults unchanged"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "User 2026-11-14 21:00:17 approved Financial Data View initial Farm Block, other role visibility defaults unchanged"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "User 2026-11-14 21:00:17 approved Financial Data View initial Farm Block, other role visibility defaults unchanged"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Financial visibility does not grant payment, posting or period reopening permissions"
          ],
          "notes": [
            "Applies to APIs, dashboard cards, financial areas and monetary fields across operational screens"
          ],
          "endpointRefs": [],
          "consumerRefs": []
        }
      ]
    },
    "actions": {
      "view": [
        "financial_data.records.view.visibility"
      ],
      "create": [],
      "edit": [],
      "delete": [],
      "export": []
    },
    "notes": [
      "Controls financial data visibility separately from ordinary business module permissions.",
      "Farm Manager starts with financial visibility blocked. Admin may change this in an audited save.",
      "Payment, posting and period reopening rights remain separately protected."
    ],
    "financialRestrictedRoles": []
  },
  "feed_management": {
    "scope": "feed_management",
    "label": "Feed Management",
    "catalogue": {
      "revision": "business-permissions-2026-11-14-v1-feed_management",
      "capabilities": [
        {
          "key": "feed.management.view.module",
          "module": "Feed Management",
          "resource": "Feed Management and all child screens/APIs",
          "action": "View",
          "support": "implemented",
          "control": "editable_ordinary",
          "baseline": {
            "admin": {
              "allowed": true,
              "evidence": [
                "User confirmed 2026-11-14 22:03 SAST: Farm Manager Feed Management Block; other role defaults retained"
              ]
            },
            "farm_manager": {
              "allowed": false,
              "evidence": [
                "User confirmed 2026-11-14 22:03 SAST: Farm Manager Feed Management Block; other role defaults retained"
              ]
            },
            "accountant": {
              "allowed": true,
              "evidence": [
                "User confirmed 2026-11-14 22:03 SAST: Farm Manager Feed Management Block; other role defaults retained"
              ]
            },
            "sales_staff": {
              "allowed": true,
              "evidence": [
                "User confirmed 2026-11-14 22:03 SAST: Farm Manager Feed Management Block; other role defaults retained"
              ]
            },
            "production_worker": {
              "allowed": true,
              "evidence": [
                "User confirmed 2026-11-14 22:03 SAST: Farm Manager Feed Management Block; other role defaults retained"
              ]
            },
            "chicken_house_operator": {
              "allowed": true,
              "evidence": [
                "User confirmed 2026-11-14 22:03 SAST: Farm Manager Feed Management Block; other role defaults retained"
              ]
            }
          },
          "ordinaryDeleteDelegation": false,
          "residualGuards": [
            "Every existing authentication, financial visibility, posting/payment, input, stock and business safeguard remains",
            "This module gate does not grant any additional mutation or financial permissions"
          ],
          "notes": [
            "One module View gate denies every feed child query and mutation when blocked; flock daily feed quantities, feed efficiency and Production Reports remain separate"
          ],
          "endpointRefs": [
            "feedManagement.listFormulations",
            "feedManagement.getFormulation",
            "feedManagement.createFormulation",
            "feedManagement.deactivateFormulation",
            "feedManagement.listMillCosts",
            "feedManagement.createMillCost",
            "feedManagement.updateMillCost",
            "feedManagement.deleteMillCost",
            "feedManagement.listCustomerPrices",
            "feedManagement.createCustomerPrice",
            "feedManagement.updateCustomerPrice",
            "feedManagement.deleteCustomerPrice",
            "feedManagement.getCustomerFeedPrice",
            "feedManagement.getMillCostForDate",
            "feedOrders.listOrders",
            "feedOrders.getOrder",
            "feedOrders.createOrder",
            "feedOrders.updateStatus",
            "feedOrders.recordMillInvoice",
            "feedOrders.markMillInvoicePaid",
            "feedOrders.listDeliveries",
            "feedOrders.addDelivery",
            "feedOrders.updateDeliveryStatus",
            "feedOrders.listAdditivePOs",
            "feedOrders.updateAdditivePO",
            "feedOrders.getAlerts",
            "feedOrders.getAdditiveMappings",
            "feedOrders.setAdditiveMapping",
            "feedOrders.checkAdditiveStock",
            "invoices.createFeedDeliveryInvoice",
            "invoices.listFeedDeliveryInvoices",
            "invoices.listMillInvoices",
            "invoices.createMillInvoice",
            "invoices.recordMillInvoicePayment",
            "invoices.getMillInvoiceAccountingPosting",
            "invoices.getMillInvoicePaymentPostings",
            "invoices.postMillInvoiceToPayables"
          ],
          "consumerRefs": [
            "client/src/pages/FeedManagement.tsx",
            "client/src/pages/FeedFormulations.tsx",
            "client/src/pages/FeedOrders.tsx",
            "client/src/pages/FeedOrderDetail.tsx",
            "client/src/pages/AdditiveInventorySettings.tsx",
            "client/src/pages/MillCosts.tsx",
            "client/src/pages/CustomerFeedPrices.tsx",
            "client/src/pages/FeedInvoices.tsx",
            "client/src/pages/MillInvoices.tsx",
            "client/src/components/FeedAlertsWidget.tsx"
          ]
        }
      ]
    },
    "actions": {
      "view": [
        "feed.management.view.module"
      ],
      "create": [],
      "edit": [],
      "delete": [],
      "export": []
    },
    "notes": [
      "Farm Manager initially blocked; all other role module defaults remain Allow subject to original safeguards.",
      "Does not change existing Customers, Suppliers, Sales Orders, Invoices or Financial Data revisions."
    ],
    "financialRestrictedRoles": []
  }
} as unknown as Readonly<Record<BusinessScope, BusinessPermissionDefinition>>;
export const BUSINESS_PERMISSION_ROUTES = {
  "customers": {
    "namespace": "customers",
    "methods": {
      "list": [
        "customers.records.view.list"
      ],
      "getById": [
        "customers.records.view.getbyid"
      ],
      "create": [
        "customers.records.create.create"
      ],
      "getAddresses": [
        "customers.records.view.getaddresses"
      ],
      "getNextNumber": [
        "customers.records.create.getnextnumber"
      ],
      "update": [
        "customers.records.edit.update"
      ],
      "delete": [
        "customers.records.delete.delete"
      ]
    }
  },
  "sales_orders": {
    "namespace": "salesOrders",
    "methods": {
      "getNextNumber": [
        "sales_orders.records.create.getnextnumber"
      ],
      "list": [
        "sales_orders.records.view.list"
      ],
      "getById": [
        "sales_orders.records.view.getbyid"
      ],
      "getItems": [
        "sales_orders.records.view.getitems"
      ],
      "getStats": [
        "sales_orders.records.view.getstats"
      ],
      "create": [
        "sales_orders.records.create.create"
      ],
      "update": [
        "sales_orders.records.edit.update"
      ],
      "updateStatus": [
        "sales_orders.records.edit.updatestatus"
      ],
      "cancel": [
        "sales_orders.records.edit.cancel"
      ]
    }
  },
  "invoices": {
    "namespace": "invoices",
    "methods": {
      "create": [
        "invoices.records.create.create"
      ],
      "list": [
        "invoices.records.view.list"
      ],
      "getById": [
        "invoices.records.view.getbyid"
      ],
      "getItems": [
        "invoices.records.view.getitems"
      ],
      "generatePDF": [
        "invoices.records.view.list",
        "invoices.records.view.getbyid",
        "invoices.records.view.getitems",
        "invoices.records.view.checkorderinvoice",
        "invoices.records.export.generatepdf"
      ],
      "generateFromOrder": [
        "invoices.records.create.generatefromorder"
      ],
      "checkOrderInvoice": [
        "invoices.records.view.checkorderinvoice"
      ]
    }
  },
  "financial_data": {
    "namespace": "financialVisibility",
    "methods": {}
  },
  "feed_management": {
    "namespace": "feedManagement",
    "methods": {
      "feedManagement.listFormulations": [
        "feed.management.view.module"
      ],
      "feedManagement.getFormulation": [
        "feed.management.view.module"
      ],
      "feedManagement.createFormulation": [
        "feed.management.view.module"
      ],
      "feedManagement.deactivateFormulation": [
        "feed.management.view.module"
      ],
      "feedManagement.listMillCosts": [
        "feed.management.view.module"
      ],
      "feedManagement.createMillCost": [
        "feed.management.view.module"
      ],
      "feedManagement.updateMillCost": [
        "feed.management.view.module"
      ],
      "feedManagement.deleteMillCost": [
        "feed.management.view.module"
      ],
      "feedManagement.listCustomerPrices": [
        "feed.management.view.module"
      ],
      "feedManagement.createCustomerPrice": [
        "feed.management.view.module"
      ],
      "feedManagement.updateCustomerPrice": [
        "feed.management.view.module"
      ],
      "feedManagement.deleteCustomerPrice": [
        "feed.management.view.module"
      ],
      "feedManagement.getCustomerFeedPrice": [
        "feed.management.view.module"
      ],
      "feedManagement.getMillCostForDate": [
        "feed.management.view.module"
      ],
      "feedOrders.listOrders": [
        "feed.management.view.module"
      ],
      "feedOrders.getOrder": [
        "feed.management.view.module"
      ],
      "feedOrders.createOrder": [
        "feed.management.view.module"
      ],
      "feedOrders.updateStatus": [
        "feed.management.view.module"
      ],
      "feedOrders.recordMillInvoice": [
        "feed.management.view.module"
      ],
      "feedOrders.markMillInvoicePaid": [
        "feed.management.view.module"
      ],
      "feedOrders.listDeliveries": [
        "feed.management.view.module"
      ],
      "feedOrders.addDelivery": [
        "feed.management.view.module"
      ],
      "feedOrders.updateDeliveryStatus": [
        "feed.management.view.module"
      ],
      "feedOrders.listAdditivePOs": [
        "feed.management.view.module"
      ],
      "feedOrders.updateAdditivePO": [
        "feed.management.view.module"
      ],
      "feedOrders.getAlerts": [
        "feed.management.view.module"
      ],
      "feedOrders.getAdditiveMappings": [
        "feed.management.view.module"
      ],
      "feedOrders.setAdditiveMapping": [
        "feed.management.view.module"
      ],
      "feedOrders.checkAdditiveStock": [
        "feed.management.view.module"
      ],
      "invoices.createFeedDeliveryInvoice": [
        "feed.management.view.module"
      ],
      "invoices.listFeedDeliveryInvoices": [
        "feed.management.view.module"
      ],
      "invoices.listMillInvoices": [
        "feed.management.view.module"
      ],
      "invoices.createMillInvoice": [
        "feed.management.view.module"
      ],
      "invoices.recordMillInvoicePayment": [
        "feed.management.view.module"
      ],
      "invoices.getMillInvoiceAccountingPosting": [
        "feed.management.view.module"
      ],
      "invoices.getMillInvoicePaymentPostings": [
        "feed.management.view.module"
      ],
      "invoices.postMillInvoiceToPayables": [
        "feed.management.view.module"
      ]
    }
  }
} as Readonly<Record<BusinessScope,{namespace:string;methods:Readonly<Record<string,readonly string[]>>}>>;
// Freeze static configuration recursively so app code cannot mutate role defaults.
function freezeDeep(value: unknown): void {
 if(value && typeof value==='object'){Object.values(value).forEach(freezeDeep);Object.freeze(value);}
}
freezeDeep(BUSINESS_PERMISSION_DEFINITIONS);freezeDeep(BUSINESS_PERMISSION_ROUTES);
export function isBusinessScope(value: unknown): value is BusinessScope {
 return typeof value==='string' && Object.prototype.hasOwnProperty.call(BUSINESS_PERMISSION_DEFINITIONS,value);
}

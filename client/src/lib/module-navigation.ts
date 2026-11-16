export type NavigationModuleKey = "feed-management";

export type NavigationRole =
  | "admin"
  | "farm_manager"
  | "accountant"
  | "sales_staff"
  | "production_worker"
  | "chicken_house_operator";

export type NavigationIcon =
  | "financial-reports"
  | "harvest-analytics"
  | "catch-reports"
  | "formulations"
  | "mill-costs"
  | "customer-prices"
  | "feed-orders"
  | "additive-inventory";

export interface NavigationModuleLink {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly icon: NavigationIcon;
  readonly roles: readonly NavigationRole[];
  readonly requiresFinancialAccess?: boolean;
}

export interface NavigationModule {
  readonly key: NavigationModuleKey;
  readonly title: string;
  readonly description: string;
  readonly roles: readonly NavigationRole[];
  readonly links: readonly NavigationModuleLink[];
}

/** Navigation only: destination pages retain their existing authorization. */
export const NAVIGATION_MODULES = {
  "feed-management": {
    key: "feed-management",
    title: "Feed Management",
    description:
      "Navigate to existing feed formulations, mill costs, customer prices, feed orders, and additive inventory tools.",
    roles: ["admin", "farm_manager"],
    links: [
      {
        id: "formulations",
        title: "Formulations",
        description: "View and manage existing feed formulations and ingredients.",
        href: "/feed-management/formulations",
        icon: "formulations",
        roles: ["admin", "farm_manager"],
      },
      {
        id: "mill-costs",
        title: "Mill Costs",
        description: "View and maintain mill costs by feed range and type.",
        href: "/feed-management/mill-costs",
        icon: "mill-costs",
        roles: ["admin", "farm_manager"],
        requiresFinancialAccess: true,
      },
      {
        id: "customer-prices",
        title: "Customer Prices",
        description: "View and manage existing customer feed pricing.",
        href: "/feed-management/customer-pricing",
        icon: "customer-prices",
        roles: ["admin", "farm_manager"],
        requiresFinancialAccess: true,
      },
      {
        id: "feed-orders",
        title: "Feed Orders",
        description: "Open the existing feed order workflow to view and manage orders.",
        href: "/feed-orders",
        icon: "feed-orders",
        roles: ["admin", "farm_manager"],
      },
      {
        id: "additive-inventory",
        title: "Additive Inventory",
        description: "Open existing additive inventory mappings and settings.",
        href: "/feed-management/additive-inventory",
        icon: "additive-inventory",
        roles: ["admin", "farm_manager"],
      },
    ],
  },
} as const satisfies Readonly<Record<NavigationModuleKey, NavigationModule>>;

export function getNavigationModule(
  moduleKey: NavigationModuleKey,
): NavigationModule {
  return NAVIGATION_MODULES[moduleKey];
}

export function canAccessNavigationModule(
  moduleKey: NavigationModuleKey,
  role?: string,
): boolean {
  return getNavigationModule(moduleKey).roles.some(
    allowedRole => allowedRole === role,
  );
}

/** Parent access is required even if a destination is accessible elsewhere. */
export function getVisibleModuleLinks(
  moduleKey: NavigationModuleKey,
  role?: string,
  financialAllowed = true,
): readonly NavigationModuleLink[] {
  if (!canAccessNavigationModule(moduleKey, role)) return [];

  return getNavigationModule(moduleKey).links.filter(link =>
    link.roles.some(allowedRole => allowedRole === role) &&
    (!link.requiresFinancialAccess || financialAllowed),
  );
}

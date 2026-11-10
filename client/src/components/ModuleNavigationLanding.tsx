import React from "react";
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  Factory,
  FileText,
  FlaskConical,
  Loader2,
  LockKeyhole,
  Package,
  ShoppingCart,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  canAccessNavigationModule,
  getNavigationModule,
  getVisibleModuleLinks,
  type NavigationIcon,
  type NavigationModuleKey,
} from "@/lib/module-navigation";

const linkIcons: Readonly<Record<NavigationIcon, LucideIcon>> = {
  "financial-reports": FileText,
  "harvest-analytics": BarChart3,
  "catch-reports": ClipboardList,
  formulations: FlaskConical,
  "mill-costs": Factory,
  "customer-prices": Tag,
  "feed-orders": ShoppingCart,
  "additive-inventory": Package,
};

export interface ModuleNavigationLandingProps {
  moduleKey: NavigationModuleKey;
  role?: string;
  loading?: boolean;
}

/** Presentational navigation only; authentication is supplied by page wrappers. */
export function ModuleNavigationLanding({
  moduleKey,
  role,
  loading = false,
}: ModuleNavigationLandingProps) {
  const module = getNavigationModule(moduleKey);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {module.title}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {module.description}
        </p>
      </header>

      {loading ? (
        <Card>
          <CardContent
            className="flex items-center gap-3 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Loader2
              className="h-5 w-5 animate-spin text-primary motion-reduce:animate-none"
              aria-hidden="true"
            />
            Loading navigation…
          </CardContent>
        </Card>
      ) : !canAccessNavigationModule(moduleKey, role) ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <LockKeyhole className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <CardTitle>
                <h2 className="text-lg">Access unavailable</h2>
              </CardTitle>
            </div>
            <CardDescription>
              This module is not available for your current account. Contact an
              administrator if you believe you should have access.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <nav aria-label={`${module.title} destinations`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {getVisibleModuleLinks(moduleKey, role).map(link => {
              const Icon = linkIcons[link.icon];
              return (
                <Link
                  key={link.id}
                  href={link.href}
                  className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Card className="h-full gap-4 group-hover:border-primary/50 group-hover:shadow-md group-focus-visible:border-primary">
                    <CardHeader>
                      <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <CardTitle>
                        <h2 className="text-lg leading-snug">{link.title}</h2>
                      </CardTitle>
                      <CardDescription className="leading-relaxed">
                        {link.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                        Open {link.title}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export default ModuleNavigationLanding;

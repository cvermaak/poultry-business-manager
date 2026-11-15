import { ModuleViewAccessGuard } from "@/hooks/useModuleViewAccess";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import type { ComponentType } from "react";
import { FinancialAccessGuard } from "@/hooks/useFinancialVisibility";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";

// Pages
import Home from "@/pages/Home";
import AllReminders from "./pages/AllReminders";
import AuditLogs from "./pages/AuditLogs";
import Inventory from "./pages/Inventory";
import Houses from "./pages/Houses";
import Flocks from "./pages/Flocks";
import FlockDetail from "./pages/FlockDetail";
import Harvests from "./pages/Harvests";
import Processors from "./pages/Processors";
import CrateTypes from "./pages/CrateTypes";
import CatchOperations from "./pages/CatchOperations";
import Customers from "./pages/Customers";
import Sales from "./pages/Sales";
import SalesOrders from "./pages/SalesOrders";
import Suppliers from "./pages/Suppliers";
import PurchaseOrders from "./pages/PurchaseOrders";
import Users from "./pages/Users";
import UserManagement from "./pages/UserManagement";
import HealthManagement from "./pages/HealthManagement";
import ReminderTemplates from "./pages/ReminderTemplates";
import ChangePassword from "./pages/ChangePassword";
import LoginPage from "./pages/Login";
import { Invoices } from "./pages/Invoices";
import { CreateInvoice } from "./pages/CreateInvoice";
import { CompanySettings } from "./pages/CompanySettings";
import Finance from "./pages/Finance";
import Expenses from "./pages/Expenses";
import CashFlow from "./pages/CashFlow";
import FeedFormulations from "./pages/FeedFormulations";
import FeedManagement from "./pages/FeedManagement";
import Reports from "./pages/Reports";
import MillCosts from "./pages/MillCosts";
import CustomerFeedPrices from "./pages/CustomerFeedPrices";
import FeedOrders from "./pages/FeedOrders";
import FeedOrderDetail from "./pages/FeedOrderDetail";
import AdditiveInventorySettings from "./pages/AdditiveInventorySettings";
import FeedInvoices from "./pages/FeedInvoices";
import MillInvoices from "./pages/MillInvoices";

// Stable component identities: the guard resolves before a page's hooks mount.
function withFinancialAccess(Page: ComponentType) {
  return function FinancialPage() {
    return <FinancialAccessGuard><Page /></FinancialAccessGuard>;
  };
}
const FinancialSales = withFinancialAccess(Sales);
const FinancialInvoices = withFinancialAccess(Invoices);
const FinancialCreateInvoice = withFinancialAccess(CreateInvoice);
const FinancialAuditLogs = withFinancialAccess(AuditLogs);
const FinancialCompanySettings = withFinancialAccess(CompanySettings);
const FinancialFinance = withFinancialAccess(Finance);
const FinancialExpenses = withFinancialAccess(Expenses);
const FinancialCashFlow = withFinancialAccess(CashFlow);
const FinancialMillCosts = withFinancialAccess(MillCosts);
const FinancialCustomerFeedPrices = withFinancialAccess(CustomerFeedPrices);
const FinancialFeedInvoices = withFinancialAccess(FeedInvoices);
const FinancialMillInvoices = withFinancialAccess(MillInvoices);

function Router() {
  return (
    <Switch>
      {/* Dashboard routes with sidebar layout */}
      <Route path="/">
        <DashboardLayout>
          <Home />
        </DashboardLayout>
      </Route>

      <Route path="/reminders">
        <DashboardLayout>
          <AllReminders />
        </DashboardLayout>
      </Route>

      <Route path="/houses">
        <DashboardLayout>
          <Houses />
        </DashboardLayout>
      </Route>

      <Route path="/flocks">
        <DashboardLayout>
          <Flocks />
        </DashboardLayout>
      </Route>

      <Route path="/flocks/:id">
        <DashboardLayout>
          <FlockDetail />
        </DashboardLayout>
      </Route>

      <Route path="/harvests">
        <DashboardLayout>
          <Harvests />
        </DashboardLayout>
      </Route>

      <Route path="/processors">
        <DashboardLayout>
          <Processors />
        </DashboardLayout>
      </Route>

      <Route path="/crate-types">
        <DashboardLayout>
          <CrateTypes />
        </DashboardLayout>
      </Route>

      <Route path="/catch-operations">
        <DashboardLayout>
          <CatchOperations />
        </DashboardLayout>
      </Route>

      <Route path="/customers">
        <DashboardLayout>
          <ModuleViewAccessGuard scope="customers"><Customers /></ModuleViewAccessGuard>
        </DashboardLayout>
      </Route>

      <Route path="/sales">
        <DashboardLayout>
          <FinancialSales />
        </DashboardLayout>
      </Route>

      <Route path="/sales/orders">
        <DashboardLayout>
          <SalesOrders />
        </DashboardLayout>
      </Route>

      <Route path="/sales/invoices">
        <DashboardLayout>
          <FinancialInvoices />
        </DashboardLayout>
      </Route>

      <Route path="/sales/invoices/create">
        <DashboardLayout>
          <FinancialCreateInvoice />
        </DashboardLayout>
      </Route>

      <Route path="/suppliers">
        <DashboardLayout>
          <ModuleViewAccessGuard scope="suppliers"><Suppliers /></ModuleViewAccessGuard>
        </DashboardLayout>
      </Route>

      <Route path="/purchase-orders">
        <DashboardLayout>
          <PurchaseOrders />
        </DashboardLayout>
      </Route>

      <Route path="/users">
        <DashboardLayout>
          <Users />
        </DashboardLayout>
      </Route>

      <Route path="/user-management">
        <DashboardLayout>
          <UserManagement />
        </DashboardLayout>
      </Route>

      <Route path="/health">
        <DashboardLayout>
          <HealthManagement />
        </DashboardLayout>
      </Route>

      <Route path="/reminder-templates">
        <DashboardLayout>
          <ReminderTemplates />
        </DashboardLayout>
      </Route>

      <Route path="/audit-logs">
        <DashboardLayout>
          <FinancialAuditLogs />
        </DashboardLayout>
      </Route>

      <Route path="/inventory">
        <DashboardLayout>
          <Inventory />
        </DashboardLayout>
      </Route>

      <Route path="/settings/company">
        <DashboardLayout>
          <FinancialCompanySettings />
        </DashboardLayout>
      </Route>

      <Route path="/reports">
        <DashboardLayout>
          <Reports />
        </DashboardLayout>
      </Route>

      <Route path="/finance">
        <DashboardLayout>
          <FinancialFinance />
        </DashboardLayout>
      </Route>

      <Route path="/finance/expenses">
        <DashboardLayout>
          <FinancialExpenses />
        </DashboardLayout>
      </Route>

      <Route path="/finance/cash-flow">
        <DashboardLayout>
          <FinancialCashFlow />
        </DashboardLayout>
      </Route>

      <Route path="/feed-management">
        <DashboardLayout>
          <ModuleViewAccessGuard scope="feed_management"><FeedManagement /></ModuleViewAccessGuard>
        </DashboardLayout>
      </Route>

      <Route path="/feed-management/formulations">
        <DashboardLayout>
          <ModuleViewAccessGuard scope="feed_management"><FeedFormulations /></ModuleViewAccessGuard>
        </DashboardLayout>
      </Route>

      <Route path="/feed-management/mill-costs">
        <DashboardLayout>
          <ModuleViewAccessGuard scope="feed_management"><FinancialMillCosts /></ModuleViewAccessGuard>
        </DashboardLayout>
      </Route>

      <Route path="/feed-management/customer-pricing">
        <DashboardLayout>
          <ModuleViewAccessGuard scope="feed_management"><FinancialCustomerFeedPrices /></ModuleViewAccessGuard>
        </DashboardLayout>
      </Route>

      <Route path="/feed-orders/:id">
        <ModuleViewAccessGuard scope="feed_management"><FeedOrderDetail /></ModuleViewAccessGuard>
      </Route>

      <Route path="/feed-orders">
        <ModuleViewAccessGuard scope="feed_management"><FeedOrders /></ModuleViewAccessGuard>
      </Route>

      <Route path="/feed-management/additive-inventory">
        <ModuleViewAccessGuard scope="feed_management"><AdditiveInventorySettings /></ModuleViewAccessGuard>
      </Route>

      <Route path="/invoicing/feed-invoices">
        <DashboardLayout>
          <ModuleViewAccessGuard scope="feed_management"><FinancialFeedInvoices /></ModuleViewAccessGuard>
        </DashboardLayout>
      </Route>

      <Route path="/invoicing/mill-invoices">
        <DashboardLayout>
          <ModuleViewAccessGuard scope="feed_management"><FinancialMillInvoices /></ModuleViewAccessGuard>
        </DashboardLayout>
      </Route>

      <Route path="/change-password">
        <ChangePassword />
      </Route>

      <Route path="/login">
        <LoginPage />
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

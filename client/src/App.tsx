import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
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
import SlaughterManagement from "./pages/SlaughterManagement";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import Users from "./pages/Users";
import UserManagement from "./pages/UserManagement";
import HealthManagement from "./pages/HealthManagement";
import ReminderTemplates from "./pages/ReminderTemplates";
import ChangePassword from "./pages/ChangePassword";
import LoginPage from "./pages/Login";

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

      <Route path="/flocks/:flockId/slaughter">
        <DashboardLayout>
          <SlaughterManagement />
        </DashboardLayout>
      </Route>

      <Route path="/customers">
        <DashboardLayout>
          <Customers />
        </DashboardLayout>
      </Route>

      <Route path="/suppliers">
        <DashboardLayout>
          <Suppliers />
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
          <AuditLogs />
        </DashboardLayout>
      </Route>

      <Route path="/inventory">
        <DashboardLayout>
          <Inventory />
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

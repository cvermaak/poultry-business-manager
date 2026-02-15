import AuthGate from "./AuthGate";
import { trpc } from "@/lib/trpc";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";

// Pages
import Home from "./pages/Home";
import Houses from "./pages/Houses";
import Flocks from "./pages/Flocks";
import FlockDetail from "./pages/FlockDetail";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import Users from "./pages/Users";
import HealthManagement from "./pages/HealthManagement";
import ReminderTemplates from "./pages/ReminderTemplates";
import ChangePassword from "./pages/ChangePassword";
import LoginPage from "./pages/Login";

// New Manus Features
import Harvests from "./pages/Harvests";
import Processors from "./pages/Processors";
import CrateTypes from "./pages/CrateTypes";
import SlaughterManagement from "./pages/SlaughterManagement";
import CatchOperations from "./pages/CatchOperations";

function Router() {
  return (
    <Switch>
      {/* Dashboard routes with sidebar layout */}
      <Route path="/">
        <DashboardLayout>
          <Home />
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

      {/* New Manus Features */}
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

      <Route path="/slaughter-management">
        <DashboardLayout>
          <SlaughterManagement />
        </DashboardLayout>
      </Route>

      <Route path="/catch-operations">
        <DashboardLayout>
          <CatchOperations />
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
          <AuthGate>
            <Router />
          </AuthGate>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

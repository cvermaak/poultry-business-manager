import { trpc } from "@/lib/trpc";
import LoginPage from "./pages/Login";
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

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const me = trpc.auth.me.useQuery();

  if (me.isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!me.data) {
    return <LoginPage />;
  }

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

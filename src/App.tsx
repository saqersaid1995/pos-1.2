import { lazy, Suspense, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { NetworkProvider } from "@/contexts/NetworkContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppSidebar from "@/components/AppSidebar";

const Login = lazy(() => import("./pages/Login.tsx"));
const Index = lazy(() => import("./pages/Index.tsx"));
const Workflow = lazy(() => import("./pages/Workflow.tsx"));
const OrderDetails = lazy(() => import("./pages/OrderDetails.tsx"));
const Customers = lazy(() => import("./pages/Customers.tsx"));
const CustomerProfile = lazy(() => import("./pages/CustomerProfile.tsx"));
const Reports = lazy(() => import("./pages/Reports.tsx"));
const Expenses = lazy(() => import("./pages/Expenses.tsx"));
const ServicesPricing = lazy(() => import("./pages/ServicesPricing.tsx"));
const StaffManagement = lazy(() => import("./pages/StaffManagement.tsx"));
const LoyaltySettings = lazy(() => import("./pages/LoyaltySettings.tsx"));
const ComplaintsCenter = lazy(() => import("./pages/ComplaintsCenter.tsx"));
const Cashflow = lazy(() => import("./pages/Cashflow.tsx"));
const CashManagement = lazy(() => import("./pages/CashManagement.tsx"));
const Accounting = lazy(() => import("./pages/Accounting.tsx"));
const Loans = lazy(() => import("./pages/Loans.tsx"));
const ScanLite = lazy(() => import("./pages/ScanLite.tsx"));
const Backup = lazy(() => import("./pages/Backup.tsx"));
const License = lazy(() => import("./pages/License.tsx"));
const Printer = lazy(() => import("./pages/Printer.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const PageLoader = () => (
  <div
    className="min-h-screen flex items-center justify-center"
    style={{ background: "var(--bg-base)" }}
  >
    <div
      className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
      style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
    />
  </div>
);

/** Wraps all authenticated pages — adds sidebar + scrollable main area */
function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isLogin = location.pathname === "/login";

  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem("sidebar-collapsed") === "true"
  );

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  if (isLogin) return <>{children}</>;

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      <AppSidebar collapsed={collapsed} onToggle={handleToggle} />
      <main
        className="flex-1 overflow-y-auto"
        style={{
          marginLeft: collapsed ? "64px" : "240px",
          transition: "margin-left 200ms ease-out",
        }}
      >
        {children}
      </main>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <NetworkProvider>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                  <Route path="/workflow" element={<ProtectedRoute><Workflow /></ProtectedRoute>} />
                  <Route path="/order/:orderId" element={<ProtectedRoute><OrderDetails /></ProtectedRoute>} />
                  <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
                  <Route path="/customer/:customerId" element={<ProtectedRoute><CustomerProfile /></ProtectedRoute>} />
                  <Route path="/reports" element={<ProtectedRoute allowedRoles={["admin"]}><Reports /></ProtectedRoute>} />
                  <Route path="/expenses" element={<ProtectedRoute allowedRoles={["admin"]}><Expenses /></ProtectedRoute>} />
                  <Route path="/services" element={<ProtectedRoute allowedRoles={["admin"]}><ServicesPricing /></ProtectedRoute>} />
                  <Route path="/staff" element={<ProtectedRoute allowedRoles={["admin"]}><StaffManagement /></ProtectedRoute>} />
                  <Route path="/loyalty" element={<ProtectedRoute allowedRoles={["admin"]}><LoyaltySettings /></ProtectedRoute>} />
                  <Route path="/complaints" element={<ProtectedRoute allowedRoles={["admin"]}><ComplaintsCenter /></ProtectedRoute>} />
                  <Route path="/cashflow" element={<ProtectedRoute allowedRoles={["admin"]}><Cashflow /></ProtectedRoute>} />
                  <Route path="/cash-management" element={<ProtectedRoute allowedRoles={["admin"]}><CashManagement /></ProtectedRoute>} />
                  <Route path="/accounting" element={<ProtectedRoute allowedRoles={["admin"]}><Accounting /></ProtectedRoute>} />
                  <Route path="/loans" element={<ProtectedRoute allowedRoles={["admin"]}><Loans /></ProtectedRoute>} />
                  <Route path="/scan-lite" element={<ProtectedRoute><ScanLite /></ProtectedRoute>} />
                  <Route path="/backup" element={<ProtectedRoute allowedRoles={["admin"]}><Backup /></ProtectedRoute>} />
                  <Route path="/license" element={<ProtectedRoute allowedRoles={["admin"]}><License /></ProtectedRoute>} />
                  <Route path="/printer" element={<ProtectedRoute allowedRoles={["admin"]}><Printer /></ProtectedRoute>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AppLayout>
          </NetworkProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

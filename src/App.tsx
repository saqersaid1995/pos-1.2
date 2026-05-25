import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { NetworkProvider } from "@/contexts/NetworkContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Loader2 } from "lucide-react";

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
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <NetworkProvider>
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
          </NetworkProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

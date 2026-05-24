import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { NetworkProvider } from "@/contexts/NetworkContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "./pages/Login.tsx";
import Index from "./pages/Index.tsx";
import Workflow from "./pages/Workflow.tsx";
import OrderDetails from "./pages/OrderDetails.tsx";
import Customers from "./pages/Customers.tsx";
import CustomerProfile from "./pages/CustomerProfile.tsx";
import Reports from "./pages/Reports.tsx";
import Expenses from "./pages/Expenses.tsx";

import ServicesPricing from "./pages/ServicesPricing.tsx";
import WhatsAppSettings from "./pages/WhatsAppSettings.tsx";
import WhatsAppInbox from "./pages/WhatsAppInbox.tsx";
import StaffManagement from "./pages/StaffManagement.tsx";
import LoyaltySettings from "./pages/LoyaltySettings.tsx";
import OfflineMode from "./pages/OfflineMode.tsx";
import ComplaintsCenter from "./pages/ComplaintsCenter.tsx";
import Cashflow from "./pages/Cashflow.tsx";
import CashManagement from "./pages/CashManagement.tsx";
import Accounting from "./pages/Accounting.tsx";
import Loans from "./pages/Loans.tsx";
import ScanLite from "./pages/ScanLite.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <NetworkProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/workflow" element={<ProtectedRoute><Workflow /></ProtectedRoute>} />
            <Route path="/order/:orderId" element={<ProtectedRoute><OrderDetails /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
            <Route path="/customer/:customerId" element={<ProtectedRoute><CustomerProfile /></ProtectedRoute>} />
            
            <Route path="/offline" element={<ProtectedRoute><OfflineMode /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute allowedRoles={["admin"]}><Reports /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute allowedRoles={["admin"]}><Expenses /></ProtectedRoute>} />
            <Route path="/services" element={<ProtectedRoute allowedRoles={["admin"]}><ServicesPricing /></ProtectedRoute>} />
            <Route path="/whatsapp" element={<ProtectedRoute allowedRoles={["admin"]}><WhatsAppSettings /></ProtectedRoute>} />
            <Route path="/inbox" element={<ProtectedRoute><WhatsAppInbox /></ProtectedRoute>} />
            <Route path="/staff" element={<ProtectedRoute allowedRoles={["admin"]}><StaffManagement /></ProtectedRoute>} />
            <Route path="/loyalty" element={<ProtectedRoute allowedRoles={["admin"]}><LoyaltySettings /></ProtectedRoute>} />
            <Route path="/complaints" element={<ProtectedRoute allowedRoles={["admin"]}><ComplaintsCenter /></ProtectedRoute>} />
            <Route path="/cashflow" element={<ProtectedRoute allowedRoles={["admin"]}><Cashflow /></ProtectedRoute>} />
            <Route path="/cash-management" element={<ProtectedRoute allowedRoles={["admin"]}><CashManagement /></ProtectedRoute>} />
            <Route path="/accounting" element={<ProtectedRoute allowedRoles={["admin"]}><Accounting /></ProtectedRoute>} />
            <Route path="/loans" element={<ProtectedRoute allowedRoles={["admin"]}><Loans /></ProtectedRoute>} />
            <Route path="/scan-lite" element={<ProtectedRoute><ScanLite /></ProtectedRoute>} />
            <Route path="/wa-menu" element={<ProtectedRoute allowedRoles={["admin"]}><WhatsAppSettings /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </NetworkProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

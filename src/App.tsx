import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { CustomCursor } from "@/components/CustomCursor";
import Landing from "./pages/Landing";
import IntakeSession from "./pages/IntakeSession";
import AutoFillForm from "./pages/AutoFillForm";
import ReviewApproval from "./pages/ReviewApproval";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CustomCursor />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Header />
        <main className="min-h-[calc(100vh-4rem)]">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/intake" element={<IntakeSession />} />
            <Route path="/form" element={<AutoFillForm />} />
            <Route path="/review" element={<ReviewApproval />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

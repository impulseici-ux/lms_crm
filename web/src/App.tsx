import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Leads } from "@/pages/Leads";
import { NewLead } from "@/pages/NewLead";
import { LeadProfile } from "@/pages/LeadProfile";
import { Reports } from "@/pages/Reports";
import { Admin } from "@/pages/Admin";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/leads" element={<Leads />} />
            <Route
              path="/leads/new"
              element={
                <ProtectedRoute roles={["admin", "counsellor"]}>
                  <NewLead />
                </ProtectedRoute>
              }
            />
            <Route path="/leads/:leadId" element={<LeadProfile />} />
            <Route path="/reports" element={<Reports />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <Admin />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

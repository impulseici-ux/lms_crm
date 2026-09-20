import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import EmployeeHome from "./pages/EmployeeHome";
import History from "./pages/History";
import Notes from "./pages/Notes";
import Reminders from "./pages/Reminders";
import Profile from "./pages/Profile";
import ManagerDashboard from "./pages/ManagerDashboard";
import ManagerEmployeeDetail from "./pages/ManagerEmployeeDetail";
import ManagerEmployees from "./pages/ManagerEmployees";

export default function App() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-900 dark:text-slate-100">
        Loading…
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (profile.role === "manager") {
    return (
      <Layout>
        <Routes>
          <Route path="/" element={<ManagerDashboard />} />
          <Route path="/employees" element={<ManagerEmployees />} />
          <Route path="/employees/:uid" element={<ManagerEmployeeDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<EmployeeHome />} />
        <Route path="/history" element={<History />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import { useAuth } from "./context/useAuth";
import PlaceholderPage from "./pages/PlaceholderPage";
import LoginPage from "./pages/auth/LoginPage";
import ChangePasswordPage from "./pages/employee/ChangePasswordPage";
import ProfilePage from "./pages/employee/ProfilePage";
import ProtectedRoute from "./routes/ProtectedRoute";
import { roleDashboard } from "./routes/roleDashboard";
import EmployeeLeavePage from "./pages/employee/EmployeeLeavePage";
import AdminLeavePage from "./pages/admin/AdminLeavePage";
import EmployeeDashboardPage from "./pages/employee/EmployeeDashboardPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";

function HomeRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-600">
        Loading…
      </div>
    );
  }

  return <Navigate to={user ? roleDashboard(user.role) : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
        <Route element={<AppLayout />}>
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route
            path="/admin/employees"
            element={<PlaceholderPage title="Employee Management" />}
          />
          <Route
            path="/admin/departments"
            element={<PlaceholderPage title="Department Management" />}
          />
          <Route
            path="/admin/attendance"
            element={<PlaceholderPage title="Attendance Management" />}
          />
          <Route path="/admin/leave" element={<AdminLeavePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["employee"]} />}>
        <Route element={<AppLayout />}>
          <Route
            path="/employee/dashboard"
            element={<EmployeeDashboardPage />}
          />
          <Route path="/employee/profile" element={<ProfilePage />} />
          <Route
            path="/employee/profile/password"
            element={<ChangePasswordPage />}
          />
          <Route
            path="/employee/attendance"
            element={<PlaceholderPage title="My Attendance" />}
          />
          <Route path="/employee/leave" element={<EmployeeLeavePage />} />{" "}
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

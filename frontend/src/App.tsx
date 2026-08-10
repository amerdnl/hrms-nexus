import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import { useAuth } from "./context/useAuth";
import LoginPage from "./pages/auth/LoginPage";
import ChangePasswordPage from "./pages/employee/ChangePasswordPage";
import ProfilePage from "./pages/employee/ProfilePage";
import ProtectedRoute from "./routes/ProtectedRoute";
import { roleDashboard } from "./routes/roleDashboard";
import EmployeeLeavePage from "./pages/employee/EmployeeLeavePage";
import AdminLeavePage from "./pages/admin/AdminLeavePage";
import EmployeeDashboardPage from "./pages/employee/EmployeeDashboardPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminAttendancePage from "./pages/admin/AdminAttendancePage";
import EmployeeAttendancePage from "./pages/employee/EmployeeAttendancePage";
import EmployeeListPage from "./pages/admin/EmployeeListPage";
import DepartmentListPage from "./pages/admin/DepartmentListPage";
import DepartmentFormPage from "./pages/admin/DepartmentFormPage";
import DepartmentDetailsPage from "./pages/admin/DepartmentDetailsPage";
import DepartmentEditPage from "./pages/admin/DepartmentEditPage";
import EmployeeDetailsPage from "./pages/admin/EmployeeDetailsPage";
import EmployeeEditPage from "./pages/admin/EmployeeEditPage";
import EmployeeFormPage from "./pages/admin/EmployeeFormPage";

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
          <Route path="/admin/employees" element={<EmployeeListPage />} />
          <Route path="/admin/employees/new" element={<EmployeeFormPage />} />
          <Route
            path="/admin/employees/:id/edit"
            element={<EmployeeEditPage />}
          />
          <Route
            path="/admin/employees/:id"
            element={<EmployeeDetailsPage />}
          />
          <Route path="/admin/departments" element={<DepartmentListPage />} />
          <Route
            path="/admin/departments/new"
            element={<DepartmentFormPage />}
          />
          <Route
            path="/admin/departments/:id/edit"
            element={<DepartmentEditPage />}
          />
          <Route
            path="/admin/departments/:id"
            element={<DepartmentDetailsPage />}
          />
          <Route path="/admin/attendance" element={<AdminAttendancePage />} />
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
            element={<EmployeeAttendancePage />}
          />
          <Route path="/employee/leave" element={<EmployeeLeavePage />} />
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

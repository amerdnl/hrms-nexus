import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import { useAuth } from "./context/useAuth";
import LoginPage from "./pages/auth/LoginPage";
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
import CompanySettingsPage from "./pages/admin/CompanySettingsPage";
import ImportPage from "./pages/admin/ImportPage";
import AdminPayrollPage from "./pages/admin/AdminPayrollPage";
import AdminAuditPage from "./pages/admin/AdminAuditPage";
import AdminDataExportPage from "./pages/admin/AdminDataExportPage";
import AdminReportsPage from "./pages/admin/AdminReportsPage";
import EmployeePayslipsPage from "./pages/employee/EmployeePayslipsPage";

function HomeRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas text-sm text-fg-muted">
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
          <Route path="/admin/import" element={<ImportPage />} />
          <Route path="/admin/payroll" element={<AdminPayrollPage />} />
          <Route path="/admin/reports" element={<AdminReportsPage />} />
          <Route path="/admin/audit" element={<AdminAuditPage />} />
          <Route path="/admin/export" element={<AdminDataExportPage />} />
          <Route path="/admin/settings" element={<CompanySettingsPage />} />
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
            element={<Navigate to="/employee/profile" replace />}
          />
          <Route
            path="/employee/attendance"
            element={<EmployeeAttendancePage />}
          />
          <Route path="/employee/leave" element={<EmployeeLeavePage />} />
          <Route path="/employee/payroll" element={<EmployeePayslipsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

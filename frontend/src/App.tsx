import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import SessionLoader from "./components/common/SessionLoader";
import { ScreenFallback } from "./components/common/RouteFallback";
import { useAuth } from "./context/useAuth";
import ProtectedRoute from "./routes/ProtectedRoute";
import { FORCED_PASSWORD_PATH } from "./routes/forcedPassword";
import { roleDashboard } from "./routes/roleDashboard";

/*
 * Every page is its own chunk.
 *
 * V2 imported all twenty-five pages eagerly, so the first visit to the sign-in
 * screen downloaded the payroll, reports and import code too - a 570 kB entry
 * over Vite's 500 kB advisory. The shell (layout, route guards, session loader)
 * stays in the entry because it renders on every route; the pages load when
 * they are first visited. V3 adds many pages, and this is what keeps them from
 * making the first load heavier.
 */
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const ForcedPasswordChangePage = lazy(() => import("./pages/auth/ForcedPasswordChangePage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage"));
const EmployeeListPage = lazy(() => import("./pages/admin/EmployeeListPage"));
const EmployeeFormPage = lazy(() => import("./pages/admin/EmployeeFormPage"));
const EmployeeDetailsPage = lazy(() => import("./pages/admin/EmployeeDetailsPage"));
const EmployeeEditPage = lazy(() => import("./pages/admin/EmployeeEditPage"));
const DepartmentListPage = lazy(() => import("./pages/admin/DepartmentListPage"));
const DepartmentFormPage = lazy(() => import("./pages/admin/DepartmentFormPage"));
const DepartmentDetailsPage = lazy(() => import("./pages/admin/DepartmentDetailsPage"));
const DepartmentEditPage = lazy(() => import("./pages/admin/DepartmentEditPage"));
const AdminAttendancePage = lazy(() => import("./pages/admin/AdminAttendancePage"));
const AdminLeavePage = lazy(() => import("./pages/admin/AdminLeavePage"));
const ImportPage = lazy(() => import("./pages/admin/ImportPage"));
const AdminPayrollPage = lazy(() => import("./pages/admin/AdminPayrollPage"));
const AdminReportsPage = lazy(() => import("./pages/admin/AdminReportsPage"));
const AdminAuditPage = lazy(() => import("./pages/admin/AdminAuditPage"));
const AdminDataExportPage = lazy(() => import("./pages/admin/AdminDataExportPage"));
const CompanySettingsPage = lazy(() => import("./pages/admin/CompanySettingsPage"));

const EmployeeDashboardPage = lazy(() => import("./pages/employee/EmployeeDashboardPage"));
const ProfilePage = lazy(() => import("./pages/employee/ProfilePage"));
const EmployeeAttendancePage = lazy(() => import("./pages/employee/EmployeeAttendancePage"));
const EmployeeLeavePage = lazy(() => import("./pages/employee/EmployeeLeavePage"));
const EmployeePayslipsPage = lazy(() => import("./pages/employee/EmployeePayslipsPage"));

const TeamOverviewPage = lazy(() => import("./pages/team/TeamOverviewPage"));
const TeamLeavePage = lazy(() => import("./pages/team/TeamLeavePage"));
const TeamAttendancePage = lazy(() => import("./pages/team/TeamAttendancePage"));

const PeopleDirectoryPage = lazy(() => import("./pages/people/PeopleDirectoryPage"));
const PersonProfilePage = lazy(() => import("./pages/people/PersonProfilePage"));
const OrgChartPage = lazy(() => import("./pages/people/OrgChartPage"));

function HomeRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <SessionLoader />;
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to={FORCED_PASSWORD_PATH} replace />;

  return <Navigate to={roleDashboard(user.role)} replace />;
}

/**
 * The forced password change route.
 *
 * Rendered outside AppLayout on purpose: there is no sidebar here, so there are
 * no navigation links to click past it. An account that no longer owes a change
 * is bounced back to its dashboard, so the screen cannot be revisited or
 * bookmarked into existence.
 */
function ForcedPasswordChangeRoute() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <SessionLoader />;
  }

  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to={roleDashboard(user.role)} replace />;

  return <ForcedPasswordChangePage />;
}

export default function App() {
  return (
    // The outer boundary only ever covers screens without the app shell
    // (sign-in, the forced change, the 404); pages inside AppLayout suspend
    // on the layout's own boundary, so the sidebar and header stay put.
    <Suspense fallback={<ScreenFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path={FORCED_PASSWORD_PATH} element={<ForcedPasswordChangeRoute />} />
        <Route path="/" element={<HomeRedirect />} />

        <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
          <Route element={<AppLayout />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/employees" element={<EmployeeListPage />} />
            <Route path="/admin/employees/new" element={<EmployeeFormPage />} />
            <Route path="/admin/employees/:id/edit" element={<EmployeeEditPage />} />
            <Route path="/admin/employees/:id" element={<EmployeeDetailsPage />} />
            <Route path="/admin/departments" element={<DepartmentListPage />} />
            <Route path="/admin/departments/new" element={<DepartmentFormPage />} />
            <Route path="/admin/departments/:id/edit" element={<DepartmentEditPage />} />
            <Route path="/admin/departments/:id" element={<DepartmentDetailsPage />} />
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
            <Route path="/employee/dashboard" element={<EmployeeDashboardPage />} />
            <Route path="/employee/profile" element={<ProfilePage />} />
            <Route
              path="/employee/profile/password"
              element={<Navigate to="/employee/profile" replace />}
            />
            <Route path="/employee/attendance" element={<EmployeeAttendancePage />} />
            <Route path="/employee/leave" element={<EmployeeLeavePage />} />
            <Route path="/employee/payroll" element={<EmployeePayslipsPage />} />
          </Route>
        </Route>

        {/* The shared workplace layer: every signed-in account. */}
        <Route element={<ProtectedRoute allowedRoles={["admin", "employee"]} />}>
          <Route element={<AppLayout />}>
            <Route path="/people" element={<PeopleDirectoryPage />} />
            <Route path="/people/:id" element={<PersonProfilePage />} />
            <Route path="/org" element={<OrgChartPage />} />
          </Route>
        </Route>

        {/* The manager's team layer. Either role, as long as someone reports
            to the account's employee right now; the server checks again. */}
        <Route element={<ProtectedRoute allowedRoles={["admin", "employee"]} requires="manager" />}>
          <Route element={<AppLayout />}>
            <Route path="/team" element={<TeamOverviewPage />} />
            <Route path="/team/leave" element={<TeamLeavePage />} />
            <Route path="/team/attendance" element={<TeamAttendancePage />} />
          </Route>
        </Route>

        {/* NotFoundPage repeats HomeRedirect's signed-out and
            must-change-password redirects on purpose - this route used to be
            where those were enforced for an unknown address. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

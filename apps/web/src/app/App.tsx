import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { ConfigurationScreen } from '../features/auth/ConfigurationScreen';
import { LoginPage } from '../features/auth/LoginPage';
import { AppShell } from '../layouts/AppShell';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { AttendancePage } from '../features/attendance/AttendancePage';
import { StudentsPage } from '../features/students/StudentsPage';
import { LeaderboardPage } from '../features/leaderboard/LeaderboardPage';
import { OperationsPage } from '../features/operations/OperationsPage';
import { SetupSchoolPage } from '../features/schools/SetupSchoolPage';
import { PortalPage } from '../features/portals/PortalPage';
import { isCloudConfigured } from '../services/supabase';

function ProtectedRoutes() {
  const auth = useAuth();
  if (auth.loading) return <main className="center-state"><div className="spinner"/><p>กำลังตรวจสอบเซสชัน...</p></main>;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (!auth.active) return <SetupSchoolPage />;
  return (
    <AppShell>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="operations" element={<OperationsPage />} />
        <Route path="assignments" element={<PortalPage kind="assignments" />} />
        <Route path="scores" element={<PortalPage kind="scores" />} />
        <Route path="reports" element={<PortalPage kind="reports" />} />
        <Route path="parents" element={<PortalPage kind="parents" />} />
        <Route path="settings" element={<PortalPage kind="settings" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  if (!isCloudConfigured) return <ConfigurationScreen />;
  return <AuthProvider><Routes><Route path="/login" element={<LoginPage />} /><Route path="/*" element={<ProtectedRoutes />} /></Routes></AuthProvider>;
}

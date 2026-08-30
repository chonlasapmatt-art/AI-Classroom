import { useCallback, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { SessionProvider, type SessionValue } from './SessionContext';
import { RepositoryProvider } from '../data/RepositoryContext';
import { createDexieRepository } from '../data/dexieSchoolRepository';
import { ConfigurationScreen } from '../features/auth/ConfigurationScreen';
import { LoginPage } from '../features/auth/LoginPage';
import { AuthCallbackPage, AwaitingMembershipPage, ForgotPasswordPage, RegisterPage, ResetPasswordPage } from '../features/auth/AccountPages';
import { OwnerAccessPage } from '../features/auth/OwnerAccessPage';
import { StudentFirstTimePage, StudentLoginPage } from '../features/auth/StudentAccessPages';
import { AppShell } from '../layouts/AppShell';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { AttendancePage } from '../features/attendance/AttendancePage';
import { StudentsPage } from '../features/students/StudentsPage';
import { ClassesPage } from '../features/classes/ClassesPage';
import { SubjectsPage } from '../features/subjects/SubjectsPage';
import { GradebookPage } from '../features/grades/GradebookPage';
import { GradeEditorPage } from '../features/grades/GradeEditorPage';
import { ImportPage } from '../features/imports/ImportPage';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { NotificationCenterPage } from '../features/notifications/NotificationCenterPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { TeachersPage } from '../features/teachers/TeachersPage';
import { AssignmentsPage } from '../features/assignments/AssignmentsPage';
import { ScoresPage } from '../features/scores/ScoresPage';
import { LeaderboardPage } from '../features/leaderboard/LeaderboardPage';
import { ParentsPage } from '../features/parents/ParentsPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { OperationsPage } from '../features/operations/OperationsPage';
import { TimetablePage } from '../features/timetable/TimetablePage';
import { AchievementsPage } from '../features/achievements/AchievementsPage';
import { PromotionPage } from '../features/promotion/PromotionPage';
import { AvatarGalleryPage } from '../features/avatars/AvatarGalleryPage';
import { isCloudConfigured } from '../services/supabase';
import { useBackgroundSync } from '../sync/useBackgroundSync';
import { SyncStatusProvider } from '../sync/SyncStatusContext';
import { PreviewProviders } from '../preview/PreviewProviders';
import { disablePreviewMode, enablePreviewMode, isPreviewActive, isPreviewModeAvailable } from '../preview/previewMode';

/** Every screen behind the shell. Identical for the cloud session and for Preview Mode. */
function AppRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="gradebook" element={<GradebookPage />} />
        <Route path="grade-editor" element={<GradeEditorPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="timetable" element={<TimetablePage />} />
        <Route path="achievements" element={<AchievementsPage />} />
        <Route path="promotion" element={<PromotionPage />} />
        <Route path="notifications" element={<NotificationCenterPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="scores" element={<ScoresPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="parents" element={<ParentsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="operations" element={<OperationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {isPreviewModeAvailable && <Route path="avatar-gallery" element={<AvatarGalleryPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function CloudRoutes() {
  const auth = useAuth();
  const schoolId = auth.active?.schoolId ?? '';
  const repository = useMemo(() => createDexieRepository(schoolId), [schoolId]);
  const active = auth.active;
  const { memberships, selectMembership, signOut } = auth;
  const session: SessionValue | null = useMemo(() => (active ? {
    mode: 'cloud', membership: active, memberships, selectMembership, signOut
  } : null), [active, memberships, selectMembership, signOut]);

  if (auth.loading) return <main className="center-state"><div className="spinner" /><p>กำลังตรวจสอบเซสชัน...</p></main>;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (!session) return <AwaitingMembershipPage />;

  return (
    <SessionProvider value={session}>
      <RepositoryProvider repository={repository}>
        <SyncedShell schoolId={schoolId} />
      </RepositoryProvider>
    </SessionProvider>
  );
}

/** Keeps the device in step with the server for as long as a cloud session is on screen. */
function SyncedShell({ schoolId }: { schoolId: string }) {
  const status = useBackgroundSync(schoolId, Boolean(schoolId));
  return <SyncStatusProvider value={status}><AppRoutes /></SyncStatusProvider>;
}

export function App() {
  const [preview, setPreview] = useState(isPreviewActive());
  const enterPreview = useCallback(() => { enablePreviewMode(); setPreview(true); }, []);
  const exitPreview = useCallback(() => { disablePreviewMode(); setPreview(false); }, []);

  if (preview && isPreviewModeAvailable) {
    return <PreviewProviders onExit={exitPreview}><AppRoutes /></PreviewProviders>;
  }

  if (!isCloudConfigured) {
    return <ConfigurationScreen {...(isPreviewModeAvailable ? { onEnterPreview: enterPreview } : {})} />;
  }

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/student" element={<StudentLoginPage />} />
        <Route path="/student/first-time" element={<StudentFirstTimePage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/owner/access" element={<OwnerAccessPage />} />
        <Route path="/*" element={<CloudRoutes />} />
      </Routes>
    </AuthProvider>
  );
}

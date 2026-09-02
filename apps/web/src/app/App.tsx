import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { SessionProvider, type SessionValue, type SupportView } from './SessionContext';
import { RepositoryProvider } from '../data/RepositoryContext';
import { createDexieRepository } from '../data/dexieSchoolRepository';
import { ConfigurationScreen } from '../features/auth/ConfigurationScreen';
import { LoginPage } from '../features/auth/LoginPage';
import { AdminLoginPage } from '../features/auth/AdminLoginPage';
import { AwaitingMembershipPage } from '../features/auth/AccountPages';
import { AdminSchoolSetupPage } from '../features/auth/AdminSchoolSetupPage';
import { OwnerAccessPage } from '../features/auth/OwnerAccessPage';
import { AppShell } from '../layouts/AppShell';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { AttendancePage } from '../features/attendance/AttendancePage';
import { StudentsPage } from '../features/students/StudentsPage';
import { StudentDetailPage } from '../features/students/StudentDetailPage';
import { ClassesPage } from '../features/classes/ClassesPage';
import { SubjectsPage } from '../features/subjects/SubjectsPage';
import { GradebookPage } from '../features/grades/GradebookPage';
import { GradeEditorPage } from '../features/grades/GradeEditorPage';
import { ImportPage } from '../features/imports/ImportPage';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { NotificationCenterPage } from '../features/notifications/NotificationCenterPage';
import { AnnouncementsPage } from '../features/notifications/AnnouncementsPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { TeachersPage } from '../features/teachers/TeachersPage';
import { AssignmentsPage } from '../features/assignments/AssignmentsPage';
import { ScoresPage } from '../features/scores/ScoresPage';
import { LeaderboardPage } from '../features/leaderboard/LeaderboardPage';
import { QuestionBankPage } from '../features/questions/QuestionBankPage';
import { ExamsPage } from '../features/exams/ExamsPage';
import { StudentExamPage } from '../features/exams/StudentExamPage';
import { QuizChallengePage } from '../features/quiz/QuizChallengePage';
import { ParentsPage } from '../features/parents/ParentsPage';
import { MyChildrenPage } from '../features/parents/MyChildrenPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { OperationsPage } from '../features/operations/OperationsPage';
import { TimetablePage } from '../features/timetable/TimetablePage';
import { AchievementsPage } from '../features/achievements/AchievementsPage';
import { PromotionPage } from '../features/promotion/PromotionPage';
import { AvatarGalleryPage } from '../features/avatars/AvatarGalleryPage';
import { PreviewDemoPage } from '../preview/PreviewDemoPage';
import { isCloudConfigured, requireSupabase } from '../services/supabase';
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
        <Route path="students/:studentId" element={<StudentDetailPage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="gradebook" element={<GradebookPage />} />
        <Route path="grade-editor" element={<GradeEditorPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="timetable" element={<TimetablePage />} />
        <Route path="achievements" element={<AchievementsPage />} />
        <Route path="promotion" element={<PromotionPage />} />
        <Route path="notifications" element={<NotificationCenterPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="scores" element={<ScoresPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="question-bank" element={<QuestionBankPage />} />
        <Route path="quiz" element={<QuizChallengePage />} />
        <Route path="exams" element={<ExamsPage />} />
        <Route path="sit-exam" element={<StudentExamPage />} />
        <Route path="parents" element={<ParentsPage />} />
        <Route path="my-children" element={<MyChildrenPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="operations" element={<OperationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {isPreviewModeAvailable && <Route path="avatar-gallery" element={<AvatarGalleryPage />} />}
        {isPreviewModeAvailable && <Route path="preview-demo" element={<PreviewDemoPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function CloudRoutes() {
  const auth = useAuth();
  const active = auth.active;
  const schoolId = active?.schoolId ?? '';
  const supportActive = Boolean(active?.membershipId.startsWith('support:'));
  const [supportView, setSupportView] = useState<SupportView | null>(null);

  useEffect(() => {
    if (!supportActive || !active) {
      setSupportView(null);
      return;
    }
    setSupportView({ role: 'admin', targetProfileId: active.profileId, targetDisplayName: active.displayName });
  }, [active, supportActive]);

  // The repository keeps the real support authority as admin. This selected role is only a
  // troubleshooting perspective and never becomes a different database principal.
  const effectiveActive = useMemo(() => active && supportActive && supportView
    ? { ...active, role: supportView.role, profileId: supportView.targetProfileId, displayName: supportView.targetDisplayName }
    : active, [active, supportActive, supportView]);
  const repository = useMemo(() => createDexieRepository(schoolId, active ? {
    role: active.role,
    profileId: active.profileId
  } : undefined), [active, schoolId]);
  const { memberships, selectMembership, signOut } = auth;
  const endSupport = useCallback(async () => {
    const { error } = await requireSupabase().rpc('end_support_session', { p_session_id: null });
    if (error) throw new Error(error.message);
    setSupportView(null);
    window.location.assign('/platform/#/schools');
  }, []);
  const session: SessionValue | null = useMemo(() => (active ? {
    mode: 'cloud', membership: effectiveActive ?? active, memberships, selectMembership, signOut,
    ...(supportActive && supportView ? { support: { view: supportView, setView: setSupportView, end: endSupport } } : {})
  } : null), [active, effectiveActive, endSupport, memberships, selectMembership, signOut, supportActive, supportView]);

  if (auth.loading) return <main className="center-state"><div className="spinner" /><p>กำลังตรวจสอบเซสชัน...</p></main>;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (!session) {
    const requestedRole = auth.session.user.user_metadata.requested_role;
    if (requestedRole === 'admin') return <AdminSchoolSetupPage />;
    return <AwaitingMembershipPage />;
  }

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
        <Route path="/admin-access" element={<AdminLoginPage />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />
        <Route path="/student" element={<Navigate to="/login" replace />} />
        <Route path="/auth/callback" element={<Navigate to="/login" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
        <Route path="/reset-password" element={<Navigate to="/login" replace />} />
        <Route path="/owner/access" element={<OwnerAccessPage />} />
        <Route path="/*" element={<CloudRoutes />} />
      </Routes>
    </AuthProvider>
  );
}

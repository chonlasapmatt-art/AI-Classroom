import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { SessionProvider, useSession, type SessionValue, type SupportView } from './SessionContext';
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
import { ClassroomLivePage } from '../features/classroom/ClassroomLivePage';
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
import { ChildDetailPage } from '../features/parents/ChildDetailPage';
import { MyChildrenPage } from '../features/parents/MyChildrenPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { OperationsPage } from '../features/operations/OperationsPage';
import { TimetablePage } from '../features/timetable/TimetablePage';
import { AchievementsPage } from '../features/achievements/AchievementsPage';
import { PromotionPage } from '../features/promotion/PromotionPage';
import { AvatarGalleryPage } from '../features/avatars/AvatarGalleryPage';
import { ForbiddenPage } from '../features/errors/ForbiddenPage';
import { NotFoundPage } from '../features/errors/NotFoundPage';
import { isRouteAllowed } from '../layouts/navigation';
import { PreviewDemoPage } from '../preview/PreviewDemoPage';
import { ToastProvider } from '../ui/components';
import { isCloudConfigured, requireSupabase } from '../services/supabase';
import { useBackgroundSync } from '../sync/useBackgroundSync';
import { SyncStatusProvider } from '../sync/SyncStatusContext';
import { PreviewProviders } from '../preview/PreviewProviders';
import { disablePreviewMode, enablePreviewMode, isPreviewActive, isPreviewModeAvailable } from '../preview/previewMode';

/**
 * Every screen behind the shell, as data rather than as thirty hand-written elements.
 *
 * Writing them out lets one wrapper decide access for all of them, instead of each route being
 * trusted to remember. `index` is the dashboard; every other path is relative, because this table
 * is mounted underneath `/*` and an absolute child would not match.
 *
 * `open` marks the two screens that are not in anybody's menu: they exist only in Preview Mode and
 * are mounted only when it is available, so there is nothing for a role check to read.
 */
interface AppRoute { path: string; element: ReactElement; index?: true; open?: true }

const appRoutes: AppRoute[] = [
  { path: '/', index: true, element: <DashboardPage /> },
  { path: 'students', element: <StudentsPage /> },
  { path: 'students/:studentId', element: <StudentDetailPage /> },
  { path: 'classes', element: <ClassesPage /> },
  { path: 'subjects', element: <SubjectsPage /> },
  { path: 'gradebook', element: <GradebookPage /> },
  { path: 'grade-editor', element: <GradeEditorPage /> },
  { path: 'calendar', element: <CalendarPage /> },
  { path: 'timetable', element: <TimetablePage /> },
  { path: 'achievements', element: <AchievementsPage /> },
  { path: 'promotion', element: <PromotionPage /> },
  { path: 'notifications', element: <NotificationCenterPage /> },
  { path: 'announcements', element: <AnnouncementsPage /> },
  { path: 'profile', element: <ProfilePage /> },
  { path: 'import', element: <ImportPage /> },
  { path: 'teachers', element: <TeachersPage /> },
  { path: 'attendance', element: <AttendancePage /> },
  { path: 'classroom', element: <ClassroomLivePage /> },
  { path: 'assignments', element: <AssignmentsPage /> },
  { path: 'scores', element: <ScoresPage /> },
  { path: 'leaderboard', element: <LeaderboardPage /> },
  { path: 'question-bank', element: <QuestionBankPage /> },
  { path: 'quiz', element: <QuizChallengePage /> },
  { path: 'exams', element: <ExamsPage /> },
  { path: 'sit-exam', element: <StudentExamPage /> },
  { path: 'parents', element: <ParentsPage /> },
  { path: 'my-children', element: <MyChildrenPage /> },
  { path: 'my-children/:studentId', element: <ChildDetailPage /> },
  { path: 'reports', element: <ReportsPage /> },
  { path: 'operations', element: <OperationsPage /> },
  { path: 'settings', element: <SettingsPage /> },
  ...(isPreviewModeAvailable ? [
    { path: 'avatar-gallery', element: <AvatarGalleryPage />, open: true as const },
    { path: 'preview-demo', element: <PreviewDemoPage />, open: true as const }
  ] : [])
];

/**
 * The screen a role was not offered says so, rather than rendering.
 *
 * Every route used to be mounted for every role, so the menu was the only thing keeping a student
 * out of the staff roster — and a typed address walked straight past it into a page written for
 * somebody else's job. This is still only a convenience: the database refuses what matters, and
 * this refuses to pretend the door exists.
 */
function Guarded({ children }: { children: ReactElement }) {
  const { membership } = useSession();
  const location = useLocation();
  if (!isRouteAllowed(membership.role, location.pathname)) return <ForbiddenPage />;
  return children;
}

/** Every screen behind the shell. Identical for the cloud session and for Preview Mode. */
function AppRoutes() {
  return (
    <AppShell>
      <Routes>
        {appRoutes.map((route) => {
          const element = route.open ? route.element : <Guarded>{route.element}</Guarded>;
          return route.index
            ? <Route key={route.path} index element={element} />
            : <Route key={route.path} path={route.path} element={element} />;
        })}
        {/* An address that names nothing is a different answer from one this role may not open, and
            conflating the two sent people to support with the wrong question. */}
        <Route path="*" element={<NotFoundPage />} />
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

  // Activating the next school is an act of the account, not of the school the administrator happens
  // to be standing in, so the wizard renders outside the shell — with no sidebar, no sync pill and no
  // repository pointed at the old campus.
  return (
    <Routes>
      <Route path="/schools/new" element={<AdminSchoolSetupPage mode="additional" />} />
      <Route path="/*" element={(
        <SessionProvider value={session}>
          <RepositoryProvider repository={repository}>
            <SyncedShell schoolId={schoolId} />
          </RepositoryProvider>
        </SessionProvider>
      )} />
    </Routes>
  );
}

/** Keeps the device in step with the server for as long as a cloud session is on screen. */
function SyncedShell({ schoolId }: { schoolId: string }) {
  const status = useBackgroundSync(schoolId, Boolean(schoolId));
  return <SyncStatusProvider value={status}><AppRoutes /></SyncStatusProvider>;
}

/**
 * One place that raises a confirmation, for every screen.
 *
 * `ToastProvider` shipped with the component set and was never mounted, so `useToast` threw and
 * twenty screens each grew a floating message element of their own — twenty stacking contexts, twenty
 * dismissal behaviours, and a message that appeared in a different corner depending on which screen
 * you were on. It wraps everything, including the entrance screens, so a screen never has to know
 * whether it is inside a session before it can tell somebody their work was saved.
 */
export function App() {
  return <ToastProvider><AppRoot /></ToastProvider>;
}

function AppRoot() {
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

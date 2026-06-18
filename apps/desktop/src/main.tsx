import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useMe } from "./lib/auth";
import { useRealtime } from "./lib/ws";
import { Shell } from "./app/shell";
import { InviteToasts } from "./features/sessions/invite-toasts";
import { SessionsPage } from "./features/sessions/page";
import { SessionDetailPage } from "./features/sessions/detail";
import { LoginPage } from "./features/auth/login";
import { AcceptInvitePage } from "./features/auth/accept-invite";
import { ResetPasswordPage } from "./features/auth/reset-password";
import { DashboardPage } from "./features/dashboard/page";
import { MembersPage } from "./features/members/page";
import { RandomizerPage } from "./features/randomizer/page";
import { BoardsPage } from "./features/boards/page";
import { TasksPage } from "./features/tasks/page";
import { RepoPage } from "./features/repo/page";
import { RequestsPage } from "./features/requests/page";
import { BoardDetailPage } from "./features/boards/detail";
import { GroupsPage } from "./features/groups/page";
import { OrgStructurePage } from "./features/org/page";
import { AuditPage } from "./features/audit/page";
import { PermissionsPage } from "./features/permissions/page";
import { SettingsPage } from "./features/settings/page";
import { ListsPage } from "./features/lists/page";
import { ListDetailPage } from "./features/lists/detail";
import { SurveysPage } from "./features/surveys/page";
import { SurveyBuilderPage } from "./features/surveys/builder";
import { SurveyRespondPage } from "./features/surveys/respond";
import { SurveyResultsPage } from "./features/surveys/results";
import { QuizzesPage } from "./features/quizzes/page";
import { QuizBuilderPage } from "./features/quizzes/builder";
import { WellnessPage } from "./features/wellness/page";
import { RecognitionPage } from "./features/recognition/page";
import { initTheme } from "./lib/prefs";
import "./index.css";

initTheme(); // apply saved light/dark theme before first paint

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

// Gate: accept-invite is always public; otherwise login when logged out, app when in.
function App() {
  const { data: me, isLoading } = useMe();
  useRealtime(!!me); // one WebSocket while logged in
  const path = window.location.pathname;

  // Public, token-based pages — reachable whether or not you're logged in.
  if (path === "/accept-invite") return <AcceptInvitePage />;
  if (path === "/reset-password") return <ResetPasswordPage />;
  if (isLoading) return <div className="p-8 text-sm text-muted">Loading…</div>;
  if (!me) return <LoginPage />;

  return (
    <>
      <InviteToasts />
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<DashboardPage />} />
          <Route path="randomizer" element={<RandomizerPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="sessions/:id" element={<SessionDetailPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="repository" element={<RepoPage />} />
          <Route path="lists" element={<ListsPage />} />
          <Route path="lists/:id" element={<ListDetailPage />} />
          <Route path="surveys" element={<SurveysPage />} />
          <Route path="surveys/:id" element={<SurveyBuilderPage />} />
          <Route path="surveys/:id/respond" element={<SurveyRespondPage />} />
          <Route path="surveys/:id/results" element={<SurveyResultsPage />} />
          <Route path="quizzes" element={<QuizzesPage />} />
          <Route path="quizzes/:id" element={<QuizBuilderPage />} />
          <Route path="wellness" element={<WellnessPage />} />
          <Route path="recognition" element={<RecognitionPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="boards" element={<BoardsPage />} />
          <Route path="boards/:id" element={<BoardDetailPage />} />
          {me.role === "TENANT_ADMIN" && <Route path="members" element={<MembersPage />} />}
          {me.role === "TENANT_ADMIN" && <Route path="groups" element={<GroupsPage />} />}
          {me.role === "TENANT_ADMIN" && <Route path="org" element={<OrgStructurePage />} />}
          {me.role === "TENANT_ADMIN" && <Route path="audit" element={<AuditPage />} />}
          {me.role === "TENANT_ADMIN" && <Route path="permissions" element={<PermissionsPage />} />}
          {me.role === "TENANT_ADMIN" && <Route path="settings" element={<SettingsPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

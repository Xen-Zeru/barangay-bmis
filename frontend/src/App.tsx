import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import {
  ProtectedRoute,
  PublicOnlyRoute,
  RequireAnyPermission,
  RequirePermission,
} from './auth/RouteGuards';
import { PERMISSIONS } from './auth/permissions';
import { DashboardLayout } from './layouts/DashboardLayout';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { CorrectionDetailPage } from './pages/residents/CorrectionDetailPage';
import { CorrectionsPage } from './pages/residents/CorrectionsPage';
import { DuplicateReviewDetailPage } from './pages/residents/DuplicateReviewDetailPage';
import { DuplicateReviewsPage } from './pages/residents/DuplicateReviewsPage';
import { ResidentFormPage } from './pages/residents/ResidentFormPage';
import { ResidentListPage } from './pages/residents/ResidentListPage';
import { ResidentLookupPage } from './pages/residents/ResidentLookupPage';
import { ResidentProfilePage } from './pages/residents/ResidentProfilePage';
import { HouseholdDetailPage } from './pages/households/HouseholdDetailPage';
import { HouseholdsPage } from './pages/households/HouseholdsPage';
import { PuroksPage } from './pages/puroks/PuroksPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route
                path="/residents"
                element={
                  <RequirePermission permission={PERMISSIONS.RESIDENTS_READ}>
                    <ResidentListPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/residents/new"
                element={
                  <RequirePermission permission={PERMISSIONS.RESIDENTS_WRITE}>
                    <ResidentFormPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/residents/lookup"
                element={
                  <RequirePermission permission={PERMISSIONS.RESIDENTS_LOOKUP}>
                    <ResidentLookupPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/residents/duplicate-reviews"
                element={
                  <RequirePermission
                    permission={PERMISSIONS.RESIDENTS_DUPLICATES_APPROVE}
                  >
                    <DuplicateReviewsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/residents/duplicate-reviews/:id"
                element={
                  <RequirePermission permission={PERMISSIONS.RESIDENTS_WRITE}>
                    <DuplicateReviewDetailPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/residents/corrections"
                element={
                  <RequireAnyPermission
                    permissions={[
                      PERMISSIONS.RESIDENTS_CORRECTIONS_REQUEST,
                      PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE,
                    ]}
                  >
                    <CorrectionsPage />
                  </RequireAnyPermission>
                }
              />
              <Route
                path="/residents/corrections/:id"
                element={
                  <RequireAnyPermission
                    permissions={[
                      PERMISSIONS.RESIDENTS_CORRECTIONS_REQUEST,
                      PERMISSIONS.RESIDENTS_CORRECTIONS_APPROVE,
                    ]}
                  >
                    <CorrectionDetailPage />
                  </RequireAnyPermission>
                }
              />
              <Route
                path="/residents/:id/edit"
                element={
                  <RequirePermission permission={PERMISSIONS.RESIDENTS_WRITE}>
                    <ResidentFormPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/residents/:id"
                element={
                  <RequirePermission permission={PERMISSIONS.RESIDENTS_READ}>
                    <ResidentProfilePage />
                  </RequirePermission>
                }
              />
              <Route
                path="/households"
                element={
                  <RequirePermission permission={PERMISSIONS.HOUSEHOLDS_READ}>
                    <HouseholdsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/households/:id"
                element={
                  <RequirePermission permission={PERMISSIONS.HOUSEHOLDS_READ}>
                    <HouseholdDetailPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/puroks"
                element={
                  <RequirePermission permission={PERMISSIONS.PUROKS_READ}>
                    <PuroksPage />
                  </RequirePermission>
                }
              />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

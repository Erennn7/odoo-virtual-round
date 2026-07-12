import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppLayout } from './layout/AppLayout';
import { PageSpinner } from './components/ui';
import { LEADERSHIP_ROLES, MANAGER_ROLES } from './utils/constants';

const Login = lazy(() => import('./pages/auth/Login'));
const Signup = lazy(() => import('./pages/auth/Signup'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AssetDirectory = lazy(() => import('./pages/assets/AssetDirectory'));
const AssetDetail = lazy(() => import('./pages/assets/AssetDetail'));
const Allocations = lazy(() => import('./pages/Allocations'));
const MyAssets = lazy(() => import('./pages/MyAssets'));
const Transfers = lazy(() => import('./pages/Transfers'));
const Bookings = lazy(() => import('./pages/Bookings'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Audits = lazy(() => import('./pages/audits/Audits'));
const AuditDetail = lazy(() => import('./pages/audits/AuditDetail'));
const Departments = lazy(() => import('./pages/Departments'));
const Categories = lazy(() => import('./pages/Categories'));
const Employees = lazy(() => import('./pages/Employees'));
const Organization = lazy(() => import('./pages/Organization'));
const Reports = lazy(() => import('./pages/Reports'));
const ActivityLogs = lazy(() => import('./pages/ActivityLogs'));

/** Redirects unauthenticated users to login; optionally gates by role. */
function Protected({ roles }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function PublicOnly() {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Suspense fallback={<PageSpinner />}>
            <Routes>
              <Route element={<PublicOnly />}>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
              </Route>

              <Route element={<Protected />}>
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/my-assets" element={<MyAssets />} />
                  <Route path="/assets" element={<AssetDirectory />} />
                  <Route path="/assets/:id" element={<AssetDetail />} />
                  <Route path="/transfers" element={<Transfers />} />
                  <Route path="/bookings" element={<Bookings />} />
                  <Route path="/maintenance" element={<Maintenance />} />

                  <Route element={<Protected roles={LEADERSHIP_ROLES} />}>
                    <Route path="/allocations" element={<Allocations />} />
                    <Route path="/audits" element={<Audits />} />
                    <Route path="/audits/:id" element={<AuditDetail />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/activity" element={<ActivityLogs />} />
                    <Route path="/employees" element={<Employees />} />
                  </Route>

                  <Route element={<Protected roles={MANAGER_ROLES} />}>
                    <Route path="/categories" element={<Categories />} />
                  </Route>

                  <Route element={<Protected roles={['ADMIN']} />}>
                    <Route path="/departments" element={<Departments />} />
                    <Route path="/organization" element={<Organization />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth, UserRole, getRoleDashboardPath } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LanguageProvider } from './context/LanguageContext';
import { FactoryPulseLogo } from './components/BrandLogo';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { ManagerDashboard } from './pages/ManagerDashboard';
import { WorkerDashboard } from './pages/WorkerDashboard';
import { TechnicianDashboard } from './pages/TechnicianDashboard';
import { RecoveryEnginePage } from './pages/RecoveryEnginePage';
import { ScenarioSimulatorPage } from './pages/ScenarioSimulatorPage';
import { CommandCenterPage } from './pages/CommandCenterPage';
import { BottleneckAnalysisPage } from './pages/BottleneckAnalysisPage';
import { ShiftHandoverPage } from './pages/ShiftHandoverPage';
import { DataManagementPage } from './pages/DataManagementPage';
import { DemoEnvironmentPage } from './pages/DemoEnvironmentPage';

const ProtectedRoute: React.FC<{
  allowedRoles: UserRole[];
  children: React.ReactNode;
}> = ({ allowedRoles, children }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#171A21] flex flex-col items-center justify-center gap-4 text-[#F5F6F8]">
        <FactoryPulseLogo size="md" />
        <p className="text-xs text-neutral-400 font-mono">Verifying operational session & role permissions...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-[#171A21] text-[#F5F6F8] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#242A33] border border-[#EF4444]/60 rounded-lg p-6 text-center">
          <ShieldAlert className="w-10 h-10 text-[#EF4444] mx-auto" />
          <h1 className="text-lg font-bold mt-3">Unauthorized Role Route</h1>
          <p className="text-xs text-neutral-300 mt-2 leading-relaxed">
            Your authenticated database role is <span className="font-mono font-semibold text-[#FF8A32]">{user.role}</span>. Direct URL navigation to restricted portals ({allowedRoles.join(', ')}) is blocked by FactoryPulse RBAC policy.
          </p>
          <button
            onClick={() => navigate(getRoleDashboardPath(user.role), { replace: true })}
            className="mt-5 w-full py-2.5 px-4 text-xs font-semibold bg-[#FF8A32] text-[#171A21] rounded-md hover:bg-[#ff9b4f]"
          >
            Return to Your Authorized Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Role 1: Administrator */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/data-management"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <DataManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/demo-environment"
              element={
                <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}>
                  <DemoEnvironmentPage />
                </ProtectedRoute>
              }
            />

            {/* Role 2: Factory Manager + Operational Command Center + Bottlenecks + Handover */}
            <Route
              path="/manager/command-center"
              element={
                <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
                  <CommandCenterPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/bottleneck-analysis"
              element={
                <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
                  <BottleneckAnalysisPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/shift-handover"
              element={
                <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN', 'WORKER']}>
                  <ShiftHandoverPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/dashboard"
              element={
                <ProtectedRoute allowedRoles={['MANAGER']}>
                  <ManagerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/recovery-engine"
              element={
                <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
                  <RecoveryEnginePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/scenario-simulator"
              element={
                <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
                  <ScenarioSimulatorPage />
                </ProtectedRoute>
              }
            />

            {/* Role 3: Floor Worker */}
            <Route
              path="/worker/dashboard"
              element={
                <ProtectedRoute allowedRoles={['WORKER']}>
                  <WorkerDashboard />
                </ProtectedRoute>
              }
            />

            {/* Role 4: Maintenance Technician */}
            <Route
              path="/technician/dashboard"
              element={
                <ProtectedRoute allowedRoles={['TECHNICIAN']}>
                  <TechnicianDashboard />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
    </LanguageProvider>
  );
}

export default App;

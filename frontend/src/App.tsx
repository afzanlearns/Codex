import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Navbar        from './components/Navbar';
import Landing       from './pages/Landing';
import Review       from './pages/Review';
import Dashboard     from './pages/Dashboard';
import AuthPage      from './pages/AuthPage';
import GitHubCallback from './pages/GitHubCallback';
import Repos         from './pages/Repos';
import Chat          from './pages/Chat';
import Refactor      from './pages/Refactor';
import IndexManager  from './pages/IndexManager';
import { ThemeProvider } from './hooks/useTheme';
import { ReactNode } from 'react';

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="loader" />
    </div>
  );
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <>
      <Navbar />
      <Routes>
        {/* Public */}
        <Route path="/"               element={<Landing />} />
        <Route path="/review"        element={<Review />} />
        <Route path="/login"          element={<AuthPage mode="login" />} />
        <Route path="/register"       element={<AuthPage mode="register" />} />
        <Route path="/auth/callback"  element={<GitHubCallback />} />
        <Route path="/repos"          element={<Repos />} />
        <Route path="/repository-browser" element={<Navigate to="/repos" replace />} />

        {/* Public — RAG features no longer require GitHub login */}
        <Route path="/chat"           element={<Chat />} />
        <Route path="/refactor"       element={<Refactor />} />
        <Route path="/index-manager"  element={<IndexManager />} />
        <Route path="/dashboard"      element={<Dashboard />} />

        {/* Catch-all */}
        <Route path="*"               element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

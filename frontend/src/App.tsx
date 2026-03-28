import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Navbar     from './components/Navbar';
import Landing    from './pages/Landing';
import Playground from './pages/Playground';
import Dashboard  from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import AuthPage   from './pages/AuthPage';
import { ReactNode } from 'react';

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return (
    <div className="min-h-[100dvh] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
    </div>
  );
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/"            element={<Landing />} />
        <Route path="/playground"  element={<Playground />} />
        <Route path="/login"       element={<AuthPage mode="login" />} />
        <Route path="/register"    element={<AuthPage mode="register" />} />
        <Route path="/dashboard"   element={<Protected><Dashboard /></Protected>} />
        <Route path="/leaderboard" element={<Protected><Leaderboard /></Protected>} />
        <Route path="*"            element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

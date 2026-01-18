import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppLayout } from './components/AppLayout';

// Lazy loading components
const Login = lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
const Signup = lazy(() => import('./pages/Signup').then(module => ({ default: module.Signup })));
const Onboarding = lazy(() => import('./pages/Onboarding').then(module => ({ default: module.Onboarding })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const Transacciones = lazy(() => import('./pages/Transacciones').then(module => ({ default: module.Transacciones })));
const Presupuestos = lazy(() => import('./pages/Presupuestos').then(module => ({ default: module.Presupuestos })));
const Metas = lazy(() => import('./pages/Metas').then(module => ({ default: module.Metas })));
const Reportes = lazy(() => import('./pages/Reportes').then(module => ({ default: module.Reportes })));
const Asesor = lazy(() => import('./pages/Asesor').then(module => ({ default: module.Asesor })));
const Categorias = lazy(() => import('./pages/Categorias').then(module => ({ default: module.Categorias })));
const Configuracion = lazy(() => import('./pages/Configuracion').then(module => ({ default: module.Configuracion })));

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="loading-spinner"></div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/onboarding" element={<Onboarding />} />

              {/* Protected routes */}
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/transacciones" element={<Transacciones />} />
                <Route path="/presupuestos" element={<Presupuestos />} />
                <Route path="/metas" element={<Metas />} />
                <Route path="/categorias" element={<Categorias />} />
                <Route path="/configuracion" element={<Configuracion />} />
                <Route path="/reportes" element={<Reportes />} />
                <Route path="/asesor" element={<Asesor />} />
              </Route>

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

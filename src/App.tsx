import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
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

const Categorias = lazy(() => import('./pages/Categorias').then(module => ({ default: module.Categorias })));
const Cuentas = lazy(() => import('./pages/Cuentas').then(module => ({ default: module.Cuentas })));
const Deudas = lazy(() => import('./pages/Deudas').then(module => ({ default: module.Deudas })));
const Garantias = lazy(() => import('./pages/Garantias').then(module => ({ default: module.Garantias })));
const Mascotas = lazy(() => import('./pages/Mascotas').then(module => ({ default: module.Mascotas })));
const Compras = lazy(() => import('./pages/Compras').then(module => ({ default: module.Compras })));
const Hogar = lazy(() => import('./pages/Hogar').then(module => ({ default: module.Hogar })));
const Suscripciones = lazy(() => import('./pages/Suscripciones').then(module => ({ default: module.Suscripciones })));
const Patrimonio = lazy(() => import('./pages/Patrimonio').then(module => ({ default: module.Patrimonio })));
const Calendario = lazy(() => import('./pages/Calendario').then(module => ({ default: module.Calendario })));
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
              <Route path="/cuentas" element={<Cuentas />} />
              <Route path="/deudas" element={<Deudas />} />
              <Route path="/garantias" element={<Garantias />} />
              <Route path="/mascotas" element={<Mascotas />} />
              <Route path="/compras" element={<Compras />} />
              <Route path="/hogar" element={<Hogar />} />
              <Route path="/suscripciones" element={<Suscripciones />} />
              <Route path="/patrimonio" element={<Patrimonio />} />
              <Route path="/calendario" element={<Calendario />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="/reportes" element={<Reportes />} />

            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

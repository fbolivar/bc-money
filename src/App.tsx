import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppLayout } from './components/AppLayout';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { Transacciones } from './pages/Transacciones';
import { Presupuestos } from './pages/Presupuestos';
import { Metas } from './pages/Metas';
import { Reportes } from './pages/Reportes';
import { Asesor } from './pages/Asesor';
import { Categorias } from './pages/Categorias';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
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
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/asesor" element={<Asesor />} />
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

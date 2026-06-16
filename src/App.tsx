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
const PlanDeudas = lazy(() => import('./pages/PlanDeudas').then(module => ({ default: module.PlanDeudas })));
const Notas = lazy(() => import('./pages/Notas').then(module => ({ default: module.Notas })));
const ImportarExtractos = lazy(() => import('./pages/ImportarExtractos').then(module => ({ default: module.ImportarExtractos })));
const Inversiones = lazy(() => import('./pages/Inversiones').then(module => ({ default: module.Inversiones })));
const Familia = lazy(() => import('./pages/Familia').then(module => ({ default: module.Familia })));
const VistaFamiliar = lazy(() => import('./pages/VistaFamiliar').then(module => ({ default: module.VistaFamiliar })));
const Configuracion = lazy(() => import('./pages/Configuracion').then(module => ({ default: module.Configuracion })));
const Facturacion = lazy(() => import('./pages/Facturacion').then(module => ({ default: module.Facturacion })));
const AsistenteIA = lazy(() => import('./pages/AsistenteIA').then(module => ({ default: module.AsistenteIA })));
const Declaracion = lazy(() => import('./pages/Declaracion').then(module => ({ default: module.Declaracion })));
const Calculadora = lazy(() => import('./pages/Calculadora').then(module => ({ default: module.Calculadora })));
const Proyeccion = lazy(() => import('./pages/Proyeccion').then(module => ({ default: module.Proyeccion })));
const Prestamos = lazy(() => import('./pages/Prestamos').then(module => ({ default: module.Prestamos })));
const Documentos = lazy(() => import('./pages/Documentos').then(module => ({ default: module.Documentos })));
const ReglasCategorizacion = lazy(() => import('./pages/ReglasCategorizacion').then(module => ({ default: module.ReglasCategorizacion })));
const Nomina = lazy(() => import('./pages/Nomina').then(module => ({ default: module.Nomina })));
const Vencimientos = lazy(() => import('./pages/Vencimientos').then(module => ({ default: module.Vencimientos })));
const Division = lazy(() => import('./pages/Division').then(module => ({ default: module.Division })));
const FondoEmergencia = lazy(() => import('./pages/FondoEmergencia').then(module => ({ default: module.FondoEmergencia })));
const Eventos = lazy(() => import('./pages/Eventos').then(module => ({ default: module.Eventos })));
const SimuladorCredito = lazy(() => import('./pages/SimuladorCredito').then(module => ({ default: module.SimuladorCredito })));
const Recordatorios = lazy(() => import('./pages/Recordatorios').then(module => ({ default: module.Recordatorios })));
const ModoViaje = lazy(() => import('./pages/ModoViaje').then(module => ({ default: module.ModoViaje })));
const Transferencias = lazy(() => import('./pages/Transferencias').then(module => ({ default: module.Transferencias })));
const Retos = lazy(() => import('./pages/Retos').then(module => ({ default: module.Retos })));
const AlcanciaDigital = lazy(() => import('./pages/AlcanciaDigital').then(module => ({ default: module.AlcanciaDigital })));
const Benchmarks = lazy(() => import('./pages/Benchmarks').then(module => ({ default: module.Benchmarks })));
const FlujoCaja = lazy(() => import('./pages/FlujoCaja').then(module => ({ default: module.FlujoCaja })));
const ReglasAhorro = lazy(() => import('./pages/ReglasAhorro').then(module => ({ default: module.ReglasAhorro })));
const Comercios = lazy(() => import('./pages/Comercios').then(module => ({ default: module.Comercios })));
const Seguros = lazy(() => import('./pages/Seguros').then(module => ({ default: module.Seguros })));
const TarjetasCredito = lazy(() => import('./pages/TarjetasCredito').then(module => ({ default: module.TarjetasCredito })));
const InformeAnual = lazy(() => import('./pages/InformeAnual').then(module => ({ default: module.InformeAnual })));
const SeguimientoPrecios = lazy(() => import('./pages/SeguimientoPrecios').then(module => ({ default: module.SeguimientoPrecios })));
const GastosCompartidos = lazy(() => import('./pages/GastosCompartidos').then(module => ({ default: module.GastosCompartidos })));

function LoadingFallback() {
  return (
    <div className="app-loading-fallback">
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
              <Route path="/cuentas" element={<Cuentas />} />
              <Route path="/deudas" element={<Deudas />} />
              <Route path="/garantias" element={<Garantias />} />
              <Route path="/mascotas" element={<Mascotas />} />
              <Route path="/compras" element={<Compras />} />
              <Route path="/hogar" element={<Hogar />} />
              <Route path="/suscripciones" element={<Suscripciones />} />
              <Route path="/patrimonio" element={<Patrimonio />} />
              <Route path="/calendario" element={<Calendario />} />
              <Route path="/plan-deudas" element={<PlanDeudas />} />
              <Route path="/notas" element={<Notas />} />
              <Route path="/importar" element={<ImportarExtractos />} />
              <Route path="/inversiones" element={<Inversiones />} />
              <Route path="/familia" element={<Familia />} />
              <Route path="/vista-familiar" element={<VistaFamiliar />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/facturacion" element={<Facturacion />} />
              <Route path="/asistente-ia" element={<AsistenteIA />} />
              <Route path="/calculadora" element={<Calculadora />} />
              <Route path="/declaracion" element={<Declaracion />} />
              <Route path="/proyeccion" element={<Proyeccion />} />
              <Route path="/documentos" element={<Documentos />} />
              <Route path="/prestamos" element={<Prestamos />} />
              <Route path="/reglas-categorias" element={<ReglasCategorizacion />} />
              <Route path="/nomina" element={<Nomina />} />
              <Route path="/vencimientos" element={<Vencimientos />} />
              <Route path="/division" element={<Division />} />
              <Route path="/fondo-emergencia" element={<FondoEmergencia />} />
              <Route path="/eventos" element={<Eventos />} />
              <Route path="/simulador-credito" element={<SimuladorCredito />} />
              <Route path="/recordatorios" element={<Recordatorios />} />
              <Route path="/modo-viaje" element={<ModoViaje />} />
              <Route path="/transferencias" element={<Transferencias />} />
              <Route path="/retos" element={<Retos />} />
              <Route path="/alcancia" element={<AlcanciaDigital />} />
              <Route path="/benchmarks" element={<Benchmarks />} />
              <Route path="/flujo-caja" element={<FlujoCaja />} />
              <Route path="/reglas-ahorro" element={<ReglasAhorro />} />
              <Route path="/comercios" element={<Comercios />} />
              <Route path="/seguros" element={<Seguros />} />
              <Route path="/tarjetas" element={<TarjetasCredito />} />
              <Route path="/informe-anual" element={<InformeAnual />} />
              <Route path="/precios" element={<SeguimientoPrecios />} />
              <Route path="/gastos-compartidos" element={<GastosCompartidos />} />

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

import { memo, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard, ArrowLeftRight, Wallet, Target, FileText, Settings, LogOut,
    DollarSign, Tags, Landmark, CircleDollarSign, ShieldCheck, PawPrint,
    ShoppingCart, Hammer, Repeat, TrendingUp, CalendarDays, Calculator,
    StickyNote, Upload, BarChart3, Users, Eye, X, Receipt, Bot, ClipboardList,
    Sun, Moon, Bell, BellOff, Activity, Briefcase, Wand2, CalendarClock, Split,
    MapPin, PiggyBank, AlarmClock, Plane, Trophy, Coins, Globe2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../contexts/ThemeContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import './Sidebar.css';

const NAV_SECTIONS = [
    {
        title: 'PRINCIPAL',
        items: [
            { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
            { path: '/transacciones', icon: ArrowLeftRight, label: 'Transacciones' },
            { path: '/cuentas', icon: Landmark, label: 'Cuentas' },
            { path: '/categorias', icon: Tags, label: 'Categorías' },
        ],
    },
    {
        title: 'PLANIFICACIÓN',
        items: [
            { path: '/presupuestos', icon: Wallet, label: 'Presupuestos' },
            { path: '/metas', icon: Target, label: 'Metas' },
            { path: '/fondo-emergencia', icon: ShieldCheck, label: 'Fondo Emergencia' },
            { path: '/deudas', icon: CircleDollarSign, label: 'Deudas' },
            { path: '/suscripciones', icon: Repeat, label: 'Suscripciones' },
            { path: '/plan-deudas', icon: Calculator, label: 'Plan Deudas' },
            { path: '/inversiones', icon: BarChart3, label: 'Inversiones' },
            { path: '/proyeccion', icon: Activity, label: 'Proyección Flujo' },
            { path: '/prestamos', icon: Users, label: 'Préstamos' },
            { path: '/division', icon: Split, label: 'División Gastos' },
            { path: '/simulador-credito', icon: PiggyBank, label: 'Simulador Crédito' },
            { path: '/recordatorios', icon: AlarmClock, label: 'Recordatorios' },
            { path: '/modo-viaje', icon: Plane, label: 'Modo Viaje' },
            { path: '/transferencias', icon: ArrowLeftRight, label: 'Transferencias' },
            { path: '/retos', icon: Trophy, label: 'Retos Financieros' },
            { path: '/alcancia', icon: Coins, label: 'Alcancía Digital' },
        ],
    },
    {
        title: 'SEGUIMIENTO',
        items: [
            { path: '/garantias', icon: ShieldCheck, label: 'Garantías' },
            { path: '/mascotas', icon: PawPrint, label: 'Mascotas' },
            { path: '/compras', icon: ShoppingCart, label: 'Compras' },
            { path: '/hogar', icon: Hammer, label: 'Hogar' },
            { path: '/eventos', icon: MapPin, label: 'Viajes & Eventos' },
        ],
    },
    {
        title: 'INFORMES',
        items: [
            { path: '/patrimonio', icon: TrendingUp, label: 'Patrimonio' },
            { path: '/calendario', icon: CalendarDays, label: 'Calendario' },
            { path: '/vencimientos', icon: CalendarClock, label: 'Vencimientos' },
            { path: '/reportes', icon: FileText, label: 'Reportes' },
            { path: '/notas', icon: StickyNote, label: 'Notas' },
            { path: '/importar', icon: Upload, label: 'Importar' },
            { path: '/benchmarks', icon: Globe2, label: 'Benchmarks' },
            { path: '/familia', icon: Users, label: 'Familia' },
            { path: '/vista-familiar', icon: Eye, label: 'Vista Familiar' },
            { path: '/declaracion', icon: ClipboardList, label: 'Declaración Renta' },
            { path: '/calculadora', icon: Calculator, label: 'Calc. Freelancer' },
            { path: '/asistente-ia', icon: Bot, label: 'BC Asesor IA' },
            { path: '/reglas-categorias', icon: Wand2, label: 'Reglas Auto-Cat.' },
        ],
    },
];

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

const isMobile = () => window.innerWidth <= 768;

export const Sidebar = memo(function Sidebar({ isOpen, onClose }: SidebarProps) {
    const { signOut, profile, isAdmin } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { status: pushStatus, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();
    const showBilling = !!profile?.billing_enabled;

    const handleNavClick = useCallback(() => {
        if (isMobile()) onClose();
    }, [onClose]);

    return (
        <>
            <div
                className={`sidebar-overlay ${isOpen ? 'open' : ''}`}
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
                    zIndex: 90, opacity: isOpen ? 1 : 0,
                    pointerEvents: isOpen ? 'auto' : 'none',
                    transition: 'opacity 0.3s ease', display: 'block',
                }}
            />
            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <DollarSign size={28} />
                        <span>BC MONEY</span>
                    </div>
                    <button className="close-sidebar-btn" title="Cerrar" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {NAV_SECTIONS.map(section => (
                        <div key={section.title} className="nav-section">
                            <span className="nav-section-title">{section.title}</span>
                            {section.items.map(item => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                                    onClick={handleNavClick}
                                >
                                    <item.icon size={18} />
                                    <span>{item.label}</span>
                                </NavLink>
                            ))}
                        </div>
                    ))}
                    {showBilling && (
                        <div className="nav-section">
                            <span className="nav-section-title">NEGOCIOS</span>
                            <NavLink
                                to="/facturacion"
                                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                                onClick={handleNavClick}
                            >
                                <Receipt size={18} />
                                <span>Facturación</span>
                            </NavLink>
                            <NavLink
                                to="/documentos"
                                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                                onClick={handleNavClick}
                            >
                                <Briefcase size={18} />
                                <span>Documentos</span>
                            </NavLink>
                            <NavLink
                                to="/nomina"
                                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                                onClick={handleNavClick}
                            >
                                <Users size={18} />
                                <span>Nómina</span>
                            </NavLink>
                        </div>
                    )}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <NavLink to="/configuracion" className="user-info-link" title="Mi perfil" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: 'inherit', width: '100%' }}>
                            <div className="user-avatar">
                                {profile?.full_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="user-details">
                                <span className="user-name">{profile?.full_name || 'Usuario'}</span>
                                <span className="user-email">{profile?.email}</span>
                            </div>
                        </NavLink>
                    </div>
                    <div className="sidebar-actions">
                        <button type="button" className="nav-link theme-toggle-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                            <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
                        </button>
                        {pushStatus !== 'unsupported' && pushStatus !== 'denied' && (
                            <button
                                type="button"
                                className="nav-link theme-toggle-btn"
                                onClick={pushStatus === 'subscribed' ? pushUnsubscribe : pushSubscribe}
                                disabled={pushStatus === 'loading'}
                                title={pushStatus === 'subscribed' ? 'Desactivar notificaciones' : 'Activar notificaciones'}
                            >
                                {pushStatus === 'subscribed' ? <BellOff size={18} /> : <Bell size={18} />}
                                <span>{pushStatus === 'subscribed' ? 'Notificaciones on' : 'Activar alertas'}</span>
                            </button>
                        )}
                        <NavLink to="/configuracion" className="nav-link" onClick={handleNavClick}>
                            <Settings size={18} />
                            <span>Configuración</span>
                        </NavLink>
                        <button type="button" onClick={signOut} className="nav-link logout-btn">
                            <LogOut size={18} />
                            <span>Cerrar Sesión</span>
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
});
